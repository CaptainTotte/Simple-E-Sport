import { GlobalRole, TeamInvitationStatus, TeamMemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createTeamSchema } from "@/lib/validation";

function isAdminRole(role: GlobalRole) {
  return role === GlobalRole.PLATFORM_ADMIN || role === GlobalRole.TOURNAMENT_ADMIN;
}

export async function GET(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    const isAdmin = isAdminRole(actor.role);

    const teams = await prisma.team.findMany({
      where: isAdmin
        ? {}
        : {
            OR: [
              {
                createdById: actor.id
              },
              {
                members: {
                  some: {
                    userId: actor.id
                  }
                }
              }
            ]
          },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            username: true
          }
        },
        members: {
          orderBy: {
            createdAt: "asc"
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true
              }
            }
          }
        },
        invitations: {
          where: {
            status: TeamInvitationStatus.PENDING
          },
          orderBy: {
            createdAt: "asc"
          },
          include: {
            invitee: {
              select: {
                id: true,
                name: true,
                username: true
              }
            }
          }
        },
        _count: {
          select: {
            registrations: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({
      isAdmin,
      teams: teams.map((team) => {
        const myMembership = team.members.find((member) => member.userId === actor.id);
        return {
          id: team.id,
          name: team.name,
          tag: team.tag,
          logoUrl: team.logoUrl,
          isDummy: team.isDummy,
          createdAt: team.createdAt,
          createdBy: team.createdBy,
          myRole: myMembership?.role ?? null,
          members: team.members.map((member) => ({
            id: member.id,
            role: member.role,
            userId: member.userId,
            name: member.user?.name ?? member.displayName ?? "Unnamed",
            username: member.user?.username ?? null
          })),
          pendingInvites: team.invitations.map((invitation) => ({
            id: invitation.id,
            inviteeUserId: invitation.inviteeUserId,
            inviteeName: invitation.invitee.name,
            inviteeUsername: invitation.invitee.username
          })),
          registrationCount: team._count.registrations
        };
      })
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    const body = await parseJson(req, createTeamSchema);
    const isAdmin = isAdminRole(actor.role);

    if (body.isDummy && !isAdmin) {
      return NextResponse.json({ error: "Only admins can create dummy teams." }, { status: 403 });
    }

    const teamName = body.name.trim();
    if (!teamName) {
      return NextResponse.json({ error: "Team name is required." }, { status: 400 });
    }

    const teamTag = body.tag?.trim() ? body.tag.trim() : null;

    if (body.isDummy) {
      const dummyNames = Array.from(
        new Set((body.dummyPlayerNames ?? []).map((value) => value.trim()).filter(Boolean))
      );

      if (dummyNames.length === 0) {
        return NextResponse.json({ error: "Dummy teams require at least one player name." }, { status: 400 });
      }

      const team = await prisma.$transaction(async (tx) => {
        const created = await tx.team.create({
          data: {
            name: teamName,
            tag: teamTag,
            isDummy: true,
            createdById: actor.id
          }
        });

        await tx.teamMember.createMany({
          data: dummyNames.map((playerName, index) => ({
            teamId: created.id,
            displayName: playerName,
            role: index === 0 ? TeamMemberRole.CAPTAIN : TeamMemberRole.PLAYER
          }))
        });

        return created;
      });

      return NextResponse.json(
        {
          team,
          invitedCount: 0,
          missingUsernames: []
        },
        { status: 201 }
      );
    }

    const inviteUsernames = Array.from(
      new Set(
        (body.inviteUsernames ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const result = await prisma.$transaction(async (tx) => {
      // Prevent concurrent team-join/create races for the same user.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`;

      const existingMembership = await tx.teamMember.findFirst({
        where: {
          userId: actor.id
        },
        include: {
          team: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (existingMembership) {
        return {
          kind: "already_in_team" as const,
          teamName: existingMembership.team.name
        };
      }

      const team = await tx.team.create({
        data: {
          name: teamName,
          tag: teamTag,
          isDummy: false,
          createdById: actor.id
        }
      });

      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: actor.id,
          role: TeamMemberRole.CAPTAIN
        }
      });

      await tx.teamInvitation.updateMany({
        where: {
          inviteeUserId: actor.id,
          status: TeamInvitationStatus.PENDING
        },
        data: {
          status: TeamInvitationStatus.CANCELED,
          respondedAt: new Date()
        }
      });

      if (inviteUsernames.length === 0) {
        return {
          kind: "created" as const,
          team,
          invitedCount: 0,
          missingUsernames: [] as string[]
        };
      }

      const users = await tx.user.findMany({
        where: {
          username: {
            in: inviteUsernames
          }
        },
        select: {
          id: true,
          username: true
        }
      });

      const usersByUsername = new Map(users.map((user) => [user.username ?? "", user]));
      const missingUsernames: string[] = [];
      const invitationRows: Array<{ teamId: string; inviterUserId: string; inviteeUserId: string }> = [];

      for (const username of inviteUsernames) {
        const user = usersByUsername.get(username);
        if (!user) {
          missingUsernames.push(username);
          continue;
        }
        if (user.id === actor.id) {
          continue;
        }
        invitationRows.push({
          teamId: team.id,
          inviterUserId: actor.id,
          inviteeUserId: user.id
        });
      }

      if (invitationRows.length > 0) {
        await tx.teamInvitation.createMany({
          data: invitationRows
        });
      }

      return {
        kind: "created" as const,
        team,
        invitedCount: invitationRows.length,
        missingUsernames
      };
    });

    if (result.kind === "already_in_team") {
      return NextResponse.json({ error: `You are already in team "${result.teamName}".` }, { status: 409 });
    }

    return NextResponse.json(
      {
        team: result.team,
        invitedCount: result.invitedCount,
        missingUsernames: result.missingUsernames
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

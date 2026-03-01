import { NotificationType, TeamInvitationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
import { createNotificationsForUsers } from "@/lib/notifications";
import { requireTeamCaptainOrAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { inviteUserSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const teamId = ctx.params.id;
    const body = await parseJson(req, inviteUserSchema);
    const username = body.username.trim().toLowerCase();

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        tag: true,
        isDummy: true
      }
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (team.isDummy) {
      return NextResponse.json({ error: "Dummy teams do not support player invitations." }, { status: 400 });
    }

    await requireTeamCaptainOrAdmin(prisma, actor, teamId);

    const invitee = await prisma.user.findUnique({
      where: {
        username
      },
      select: {
        id: true,
        username: true,
        name: true
      }
    });

    if (!invitee) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (invitee.id === actor.id) {
      return NextResponse.json({ error: "You are already in this team." }, { status: 400 });
    }

    const existingMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        userId: invitee.id
      },
      select: {
        id: true
      }
    });

    if (existingMember) {
      return NextResponse.json({ error: "User is already a team member." }, { status: 409 });
    }

    const memberInAnotherTeam = await prisma.teamMember.findFirst({
      where: {
        userId: invitee.id
      },
      include: {
        team: {
          select: {
            name: true
          }
        }
      }
    });

    if (memberInAnotherTeam) {
      return NextResponse.json({ error: `User is already in team "${memberInAnotherTeam.team.name}".` }, { status: 409 });
    }

    const existingInvitation = await prisma.teamInvitation.findFirst({
      where: {
        teamId,
        inviteeUserId: invitee.id,
        status: TeamInvitationStatus.PENDING
      },
      select: {
        id: true
      }
    });

    if (existingInvitation) {
      return NextResponse.json({ error: "A pending invitation already exists for this user." }, { status: 409 });
    }

    const invitation = await prisma.$transaction(async (tx) => {
      const created = await tx.teamInvitation.create({
        data: {
          teamId,
          inviterUserId: actor.id,
          inviteeUserId: invitee.id
        },
        include: {
          invitee: {
            select: {
              id: true,
              username: true,
              name: true
            }
          }
        }
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TEAM_INVITE_CREATED",
        entityType: "TeamInvitation",
        entityId: created.id,
        metadata: {
          teamId,
          inviteeUserId: invitee.id,
          inviteeUsername: invitee.username
        }
      });

      await createNotificationsForUsers(tx, [invitee.id], {
        type: NotificationType.TEAM_INVITE,
        title: "Team invitation",
        body: `${actor.name} invited you to ${team.name}${team.tag ? ` [${team.tag}]` : ""}.`,
        actionUrl: "/profile?tab=team",
        teamInvitationId: created.id,
        metadata: {
          teamId: team.id
        }
      });

      return created;
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return errorResponse(error);
  }
}

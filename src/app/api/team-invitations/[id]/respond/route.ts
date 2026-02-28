import { TeamInvitationStatus, TeamMemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { respondTeamInvitationSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const invitationId = ctx.params.id;
    const body = await parseJson(req, respondTeamInvitationSchema);

    const invitation = await prisma.teamInvitation.findUnique({
      where: {
        id: invitationId
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

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }

    if (invitation.inviteeUserId !== actor.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (invitation.status !== TeamInvitationStatus.PENDING) {
      return NextResponse.json({ error: "This invitation has already been processed." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Prevent concurrent invite acceptance races for the same user.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`;

      if (body.accept) {
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

        if (existingMembership && existingMembership.teamId !== invitation.teamId) {
          return {
            kind: "already_in_team" as const,
            teamName: existingMembership.team.name
          };
        }

        if (!existingMembership) {
          await tx.teamMember.create({
            data: {
              teamId: invitation.teamId,
              userId: actor.id,
              role: TeamMemberRole.PLAYER
            }
          });
        }
      }

      const updated = await tx.teamInvitation.update({
        where: {
          id: invitation.id
        },
        data: {
          status: body.accept ? TeamInvitationStatus.ACCEPTED : TeamInvitationStatus.DECLINED,
          respondedAt: new Date()
        }
      });

      await tx.notification.updateMany({
        where: {
          userId: actor.id,
          teamInvitationId: invitation.id,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      if (body.accept) {
        await tx.teamInvitation.updateMany({
          where: {
            inviteeUserId: actor.id,
            status: TeamInvitationStatus.PENDING,
            id: {
              not: invitation.id
            }
          },
          data: {
            status: TeamInvitationStatus.CANCELED,
            respondedAt: new Date()
          }
        });
      }

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: body.accept ? "TEAM_INVITE_ACCEPTED" : "TEAM_INVITE_DECLINED",
        entityType: "TeamInvitation",
        entityId: invitation.id,
        metadata: {
          teamId: invitation.teamId,
          teamName: invitation.team.name
        }
      });

      return {
        kind: "updated" as const,
        invitation: updated
      };
    });

    if (result.kind === "already_in_team") {
      return NextResponse.json({ error: `You are already in team "${result.teamName}".` }, { status: 409 });
    }

    return NextResponse.json({ invitation: result.invitation });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

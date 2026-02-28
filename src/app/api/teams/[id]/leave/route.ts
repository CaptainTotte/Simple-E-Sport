import { TeamInvitationStatus, TeamMemberRole, TournamentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const teamId = ctx.params.id;

    const membership = await prisma.teamMember.findFirst({
      where: {
        teamId,
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

    if (!membership) {
      return NextResponse.json({ error: "You are not a member of this team." }, { status: 404 });
    }

    if (membership.role === TeamMemberRole.CAPTAIN) {
      return NextResponse.json({ error: "Team captain cannot leave. Disband the team instead." }, { status: 409 });
    }

    const lockedRegistration = await prisma.tournamentRegistration.findFirst({
      where: {
        teamId,
        tournament: {
          status: {
            in: [TournamentStatus.LIVE, TournamentStatus.COMPLETED]
          }
        }
      },
      select: {
        id: true
      }
    });

    if (lockedRegistration) {
      return NextResponse.json(
        { error: "Cannot leave a team that is part of a live or completed tournament." },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`;

      await tx.teamMember.delete({
        where: {
          id: membership.id
        }
      });

      await tx.teamInvitation.updateMany({
        where: {
          teamId,
          inviteeUserId: actor.id,
          status: TeamInvitationStatus.PENDING
        },
        data: {
          status: TeamInvitationStatus.CANCELED,
          respondedAt: new Date()
        }
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TEAM_LEFT",
        entityType: "Team",
        entityId: membership.team.id,
        metadata: {
          teamName: membership.team.name
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

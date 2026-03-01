import { GlobalRole, Prisma, TournamentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse } from "@/lib/http";
import { requireTeamCaptainOrAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

function isAdminRole(role: GlobalRole) {
  return role === GlobalRole.PLATFORM_ADMIN || role === GlobalRole.TOURNAMENT_ADMIN;
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const teamId = ctx.params.id;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true
      }
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (!isAdminRole(actor.role)) {
      await requireTeamCaptainOrAdmin(prisma, actor, teamId);
    }

    if (!isAdminRole(actor.role)) {
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
          { error: "Cannot delete a team that is part of a live or completed tournament." },
          { status: 409 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TEAM_DELETED",
        entityType: "Team",
        entityId: team.id,
        metadata: {
          teamName: team.name
        }
      });

      try {
        await tx.team.delete({
          where: {
            id: team.id
          }
        });
      } catch (deleteError) {
        if (!(deleteError instanceof Prisma.PrismaClientKnownRequestError) || deleteError.code !== "P2003") {
          throw deleteError;
        }

        if (!isAdminRole(actor.role)) {
          throw deleteError;
        }

        // Admin fallback for legacy/test data where reports still reference the team.
        await tx.matchReport.deleteMany({
          where: {
            OR: [{ submittingTeamId: team.id }, { claimedWinnerTeamId: team.id }]
          }
        });

        await tx.team.delete({
          where: {
            id: team.id
          }
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete team while it is referenced by historical match reports." },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return errorResponse(error);
  }
}

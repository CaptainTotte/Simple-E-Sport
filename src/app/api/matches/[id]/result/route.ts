import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { adminClearMatchResult, adminSetMatchResult } from "@/lib/bracket";
import { errorResponse, parseJson } from "@/lib/http";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { adminMatchResultSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const matchId = ctx.params.id;
    const body = await parseJson(req, adminMatchResultSchema);

    const existingMatch = await prisma.match.findUnique({
      where: {
        id: matchId
      },
      include: {
        bracket: {
          include: {
            tournament: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        participantATeam: {
          select: {
            id: true,
            name: true
          }
        },
        participantBTeam: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!existingMatch) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    await requireTournamentAdmin(prisma, actor, existingMatch.bracket.tournamentId);

    const beforeState = {
      status: existingMatch.status,
      winnerTeamId: existingMatch.winnerTeamId,
      scoreA: existingMatch.scoreA,
      scoreB: existingMatch.scoreB,
      participantATeamId: existingMatch.participantATeamId,
      participantBTeamId: existingMatch.participantBTeamId
    };

    const result = await prisma.$transaction(async (tx) => {
      const updated = await adminSetMatchResult(tx, {
        actorUserId: actor.id,
        matchId,
        winnerTeamId: body.winnerTeamId,
        scoreA: body.scoreA,
        scoreB: body.scoreB
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "MATCH_RESULT_CORRECTED",
        entityType: "Match",
        entityId: matchId,
        tournamentId: existingMatch.bracket.tournamentId,
        beforeState,
        afterState: {
          winnerTeamId: body.winnerTeamId,
          scoreA: body.scoreA,
          scoreB: body.scoreB
        },
        metadata: {
          resetMatchIds: updated.resetMatchIds,
          invalidatedReportCount: updated.invalidatedReportCount
        }
      });

      return updated;
    });

    return NextResponse.json({
      ok: true,
      matchId,
      resetMatchIds: result.resetMatchIds,
      invalidatedReportCount: result.invalidatedReportCount
    });
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

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const matchId = ctx.params.id;

    const existingMatch = await prisma.match.findUnique({
      where: {
        id: matchId
      },
      include: {
        bracket: {
          include: {
            tournament: {
              select: {
                id: true
              }
            }
          }
        }
      }
    });

    if (!existingMatch) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    await requireTournamentAdmin(prisma, actor, existingMatch.bracket.tournamentId);

    const beforeState = {
      status: existingMatch.status,
      winnerTeamId: existingMatch.winnerTeamId,
      scoreA: existingMatch.scoreA,
      scoreB: existingMatch.scoreB,
      participantATeamId: existingMatch.participantATeamId,
      participantBTeamId: existingMatch.participantBTeamId
    };

    const result = await prisma.$transaction(async (tx) => {
      const updated = await adminClearMatchResult(tx, {
        actorUserId: actor.id,
        matchId
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "MATCH_RESULT_REMOVED",
        entityType: "Match",
        entityId: matchId,
        tournamentId: existingMatch.bracket.tournamentId,
        beforeState,
        afterState: {
          winnerTeamId: null,
          scoreA: null,
          scoreB: null
        },
        metadata: {
          resetMatchIds: updated.resetMatchIds,
          invalidatedReportCount: updated.invalidatedReportCount
        }
      });

      return updated;
    });

    return NextResponse.json({
      ok: true,
      matchId,
      resetMatchIds: result.resetMatchIds,
      invalidatedReportCount: result.invalidatedReportCount
    });
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

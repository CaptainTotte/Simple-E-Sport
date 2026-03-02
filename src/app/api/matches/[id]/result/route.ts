import { NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { adminClearMatchResult, adminSetMatchResult } from "@/lib/bracket";
import { errorResponse, parseJson } from "@/lib/http";
import { createNotificationsForUsers } from "@/lib/notifications";
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

      const shouldNotifyWinner = beforeState.winnerTeamId !== body.winnerTeamId;
      if (shouldNotifyWinner) {
        const loserTeamId =
          body.winnerTeamId === existingMatch.participantATeamId
            ? existingMatch.participantBTeamId
            : existingMatch.participantATeamId;

        const winnerMemberUserIds = (
          await tx.teamMember.findMany({
            where: {
              teamId: body.winnerTeamId,
              userId: {
                not: null
              }
            },
            select: {
              userId: true
            }
          })
        )
          .map((item) => item.userId)
          .filter((userId): userId is string => Boolean(userId));

        await createNotificationsForUsers(tx, winnerMemberUserIds, {
          type: NotificationType.TOURNAMENT_ADVANCEMENT,
          title: existingMatch.nextMatchId ? "Grattis! Ni är vidare" : "Grattis! Ni vann turneringen",
          body: existingMatch.nextMatchId
            ? `Teamet gick vidare i ${existingMatch.bracket.tournament.name}.`
            : `Teamet vann ${existingMatch.bracket.tournament.name}.`,
          actionUrl: `/tournaments/${existingMatch.bracket.tournamentId}`,
          metadata: {
            tournamentId: existingMatch.bracket.tournamentId,
            matchId
          }
        });

        if (loserTeamId) {
          const loserMemberUserIds = (
            await tx.teamMember.findMany({
              where: {
                teamId: loserTeamId,
                userId: {
                  not: null
                }
              },
              select: {
                userId: true
              }
            })
          )
            .map((item) => item.userId)
            .filter((userId): userId is string => Boolean(userId));

          await createNotificationsForUsers(tx, loserMemberUserIds, {
            type: NotificationType.TOURNAMENT_ADVANCEMENT,
            title: existingMatch.nextMatchId ? "Tyvärr, ni gick inte vidare" : "Tyvärr, ni förlorade finalen",
            body: existingMatch.nextMatchId
              ? `Teamet gick inte vidare i ${existingMatch.bracket.tournament.name}.`
              : `Teamet slutade tvåa i ${existingMatch.bracket.tournament.name}.`,
            actionUrl: `/tournaments/${existingMatch.bracket.tournamentId}`,
            metadata: {
              tournamentId: existingMatch.bracket.tournamentId,
              matchId
            }
          });
        }
      }

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

import {
  MatchStatus,
  NotificationType,
  ParticipantSlot,
  RegistrationStatus,
  ReportStatus,
  TournamentStatus,
  type Prisma
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  createNotificationsForUsers,
  markPendingReviewNotificationsResolved
} from "@/lib/notifications";

type Tx = Prisma.TransactionClient;

function buildSeedOrder(bracketSize: number): number[] {
  if (bracketSize === 2) {
    return [1, 2];
  }

  let order = [1, 2];
  while (order.length < bracketSize) {
    const mirror = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(mirror - seed);
    }
    order = next;
  }
  return order;
}

function normalizeScore(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  return value;
}

export async function finalizeMatchAndAdvance(
  tx: Tx,
  params: {
    matchId: string;
    winnerTeamId: string;
    scoreA?: number | null;
    scoreB?: number | null;
    approvedReportId?: string | null;
  }
) {
  const match = await tx.match.findUnique({
    where: { id: params.matchId }
  });

  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.status === MatchStatus.FINALIZED) {
    if (match.winnerTeamId === params.winnerTeamId) {
      return match;
    }
    throw new Error("Match already finalized with a different winner.");
  }

  if (!match.participantATeamId && !match.participantBTeamId) {
    throw new Error("Cannot finalize an empty match.");
  }

  const validWinner =
    params.winnerTeamId === match.participantATeamId || params.winnerTeamId === match.participantBTeamId;
  if (!validWinner) {
    throw new Error("Winner must be one of the match participants.");
  }

  const updated = await tx.match.update({
    where: { id: match.id },
    data: {
      status: MatchStatus.FINALIZED,
      winnerTeamId: params.winnerTeamId,
      finalizedAt: new Date(),
      scoreA: normalizeScore(params.scoreA),
      scoreB: normalizeScore(params.scoreB),
      approvedReportId: params.approvedReportId ?? null
    }
  });

  if (match.nextMatchId) {
    const nextMatch = await tx.match.findUnique({
      where: { id: match.nextMatchId }
    });

    if (!nextMatch) {
      throw new Error("Next match not found.");
    }

    const slotKey = match.winnerToSlot === ParticipantSlot.A ? "participantATeamId" : "participantBTeamId";
    const existingValue = nextMatch[slotKey];
    if (existingValue && existingValue !== params.winnerTeamId) {
      throw new Error("Next match slot already assigned to another team.");
    }

    const patched = await tx.match.update({
      where: { id: nextMatch.id },
      data: {
        [slotKey]: params.winnerTeamId
      }
    });

    if (patched.participantATeamId && patched.participantBTeamId && patched.status === MatchStatus.PENDING) {
      await tx.match.update({
        where: { id: patched.id },
        data: {
          status: MatchStatus.READY
        }
      });
    }
  } else {
    const bracket = await tx.bracket.findUnique({
      where: { id: match.bracketId }
    });

    if (bracket) {
      await tx.tournament.update({
        where: { id: bracket.tournamentId },
        data: {
          status: TournamentStatus.COMPLETED
        }
      });
    }
  }

  return updated;
}

export async function generateSingleEliminationBracket(tournamentId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        ruleset: {
          include: {
            game: true,
            mode: true,
            poolItems: {
              include: {
                contextItem: true
              },
              orderBy: {
                position: "asc"
              }
            }
          }
        },
        registrations: {
          where: { status: RegistrationStatus.APPROVED },
          include: {
            team: {
              include: {
                members: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        bracket: true
      }
    });

    if (!tournament) {
      throw new Error("Tournament not found.");
    }

    if (!tournament.ruleset) {
      throw new Error("Tournament ruleset must be configured before bracket generation.");
    }

    if (tournament.bracket) {
      throw new Error("Bracket has already been generated.");
    }

    if (tournament.registrations.length < 2) {
      throw new Error("At least two approved teams are required.");
    }

    if (![4, 8, 16].includes(tournament.teamLimit)) {
      throw new Error("Tournament team limit must be 4, 8, or 16.");
    }

    const orderedRegistrations = [...tournament.registrations].sort((a, b) => {
      const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
      const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
      if (seedA !== seedB) {
        return seedA - seedB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    if (orderedRegistrations.length > tournament.teamLimit) {
      throw new Error("Too many approved teams for tournament slots.");
    }

    const bracketSize = tournament.teamLimit;
    const roundCount = Math.log2(bracketSize);
    const matchCount = bracketSize - 1;

    const bracket = await tx.bracket.create({
      data: {
        tournamentId: tournament.id,
        matchCount,
        createdById: actorUserId
      }
    });

    const matchesByRound: Array<Array<{ id: string }>> = [];
    for (let round = 1; round <= roundCount; round += 1) {
      const roundMatches: Array<{ id: string }> = [];
      const matchCountInRound = bracketSize / 2 ** round;

      for (let position = 1; position <= matchCountInRound; position += 1) {
        const created = await tx.match.create({
          data: {
            bracketId: bracket.id,
            round,
            position
          },
          select: { id: true }
        });
        roundMatches.push(created);
      }

      matchesByRound.push(roundMatches);
    }

    for (let round = 0; round < matchesByRound.length - 1; round += 1) {
      const currentRound = matchesByRound[round];
      const nextRound = matchesByRound[round + 1];

      for (let index = 0; index < currentRound.length; index += 1) {
        const nextIndex = Math.floor(index / 2);
        const winnerToSlot = index % 2 === 0 ? ParticipantSlot.A : ParticipantSlot.B;

        await tx.match.update({
          where: { id: currentRound[index].id },
          data: {
            nextMatchId: nextRound[nextIndex].id,
            winnerToSlot
          }
        });
      }
    }

    const seedOrder = buildSeedOrder(bracketSize);
    const teamBySeed = seedOrder.map((seedNumber) =>
      seedNumber <= orderedRegistrations.length ? orderedRegistrations[seedNumber - 1].teamId : null
    );

    const roundOne = matchesByRound[0];
    for (let i = 0; i < roundOne.length; i += 1) {
      const participantA = teamBySeed[i * 2] ?? null;
      const participantB = teamBySeed[i * 2 + 1] ?? null;

      await tx.match.update({
        where: { id: roundOne[i].id },
        data: {
          participantATeamId: participantA,
          participantBTeamId: participantB,
          status: participantA && participantB ? MatchStatus.READY : MatchStatus.PENDING
        }
      });

      if (participantA && !participantB) {
        await finalizeMatchAndAdvance(tx, {
          matchId: roundOne[i].id,
          winnerTeamId: participantA
        });
      }

      if (!participantA && participantB) {
        await finalizeMatchAndAdvance(tx, {
          matchId: roundOne[i].id,
          winnerTeamId: participantB
        });
      }
    }

    const frozenConfig = {
      generatedAt: new Date().toISOString(),
      game: {
        id: tournament.ruleset.game.id,
        slug: tournament.ruleset.game.slug,
        name: tournament.ruleset.game.name
      },
      mode: {
        id: tournament.ruleset.mode.id,
        code: tournament.ruleset.mode.code,
        label: tournament.ruleset.mode.label,
        teamSize: tournament.ruleset.mode.teamSize
      },
      poolStrategy: tournament.ruleset.poolStrategy,
      randomPoolSize: tournament.ruleset.randomPoolSize,
      selectedPool: tournament.ruleset.poolItems.map((item) => ({
        id: item.id,
        contextItemId: item.contextItemId,
        name: item.contextItem?.name ?? item.customLabel,
        position: item.position
      }))
    };

    await tx.tournamentRuleset.update({
      where: { id: tournament.ruleset.id },
      data: {
        frozenConfig
      }
    });

    await tx.tournament.update({
      where: { id: tournament.id },
      data: {
        status: TournamentStatus.LIVE
      }
    });

    await writeAuditLog(tx, {
      actorUserId,
      action: "BRACKET_GENERATED",
      entityType: "Bracket",
      entityId: bracket.id,
      tournamentId: tournament.id,
      metadata: {
        bracketSize,
        roundCount,
        matchCount
      }
    });

    return {
      bracketId: bracket.id,
      roundCount,
      matchCount
    };
  });
}

export async function reviewMatchReport(input: {
  reportId: string;
  reviewerUserId: string;
  approve: boolean;
  decisionNote?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.matchReport.findUnique({
      where: { id: input.reportId },
      include: {
        match: {
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
                name: true
              }
            },
            participantBTeam: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!report) {
      throw new Error("Report not found.");
    }

    if (report.status !== ReportStatus.SUBMITTED) {
      throw new Error("Report is no longer pending review.");
    }

    if (!input.approve) {
      await tx.matchReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.REJECTED,
          reviewedById: input.reviewerUserId,
          reviewedAt: new Date(),
          decisionNote: input.decisionNote ?? null
        }
      });

      await tx.match.update({
        where: { id: report.matchId },
        data: {
          status: MatchStatus.READY
        }
      });

      await writeAuditLog(tx, {
        actorUserId: input.reviewerUserId,
        action: "MATCH_REPORT_REJECTED",
        entityType: "MatchReport",
        entityId: report.id,
        tournamentId: report.match.bracket.tournamentId,
        metadata: {
          matchId: report.matchId,
          decisionNote: input.decisionNote
        }
      });

      await markPendingReviewNotificationsResolved(tx, report.id);
      if (report.submittedById !== input.reviewerUserId) {
        const matchLabel = `${report.match.participantATeam?.name ?? "TBD"} vs ${report.match.participantBTeam?.name ?? "TBD"}`;
        await createNotificationsForUsers(tx, [report.submittedById], {
          type: NotificationType.REPORT_REJECTED,
          title: "Result denied",
          body: `${report.match.bracket.tournament.name}: ${matchLabel}`,
          actionUrl: `/tournaments/${report.match.bracket.tournamentId}`,
          matchReportId: report.id,
          metadata: {
            decisionNote: input.decisionNote ?? null
          }
        });
      }

      return { approved: false };
    }

    await tx.matchReport.update({
      where: { id: report.id },
      data: {
        status: ReportStatus.APPROVED,
        reviewedById: input.reviewerUserId,
        reviewedAt: new Date(),
        decisionNote: input.decisionNote ?? null
      }
    });

    await finalizeMatchAndAdvance(tx, {
      matchId: report.matchId,
      winnerTeamId: report.claimedWinnerTeamId,
      scoreA: report.scoreA,
      scoreB: report.scoreB,
      approvedReportId: report.id
    });

    await writeAuditLog(tx, {
      actorUserId: input.reviewerUserId,
      action: "MATCH_REPORT_APPROVED",
      entityType: "MatchReport",
      entityId: report.id,
      tournamentId: report.match.bracket.tournamentId,
      metadata: {
        matchId: report.matchId,
        winnerTeamId: report.claimedWinnerTeamId
      }
    });

    await markPendingReviewNotificationsResolved(tx, report.id);
    if (report.submittedById !== input.reviewerUserId) {
      const matchLabel = `${report.match.participantATeam?.name ?? "TBD"} vs ${report.match.participantBTeam?.name ?? "TBD"}`;
      await createNotificationsForUsers(tx, [report.submittedById], {
        type: NotificationType.REPORT_APPROVED,
        title: "Result approved",
        body: `${report.match.bracket.tournament.name}: ${matchLabel}`,
        actionUrl: `/tournaments/${report.match.bracket.tournamentId}`,
        matchReportId: report.id
      });
    }

    const winnerMemberUserIds = (
      await tx.teamMember.findMany({
        where: {
          teamId: report.claimedWinnerTeamId,
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
      title: report.match.nextMatchId ? "Grattis! Ni är vidare" : "Grattis! Ni vann turneringen",
      body: report.match.nextMatchId
        ? `Teamet gick vidare i ${report.match.bracket.tournament.name}.`
        : `Teamet vann ${report.match.bracket.tournament.name}.`,
      actionUrl: `/tournaments/${report.match.bracket.tournamentId}`,
      matchReportId: report.id,
      metadata: {
        tournamentId: report.match.bracket.tournamentId,
        matchId: report.matchId
      }
    });

    return { approved: true };
  });
}

import { GlobalRole, MatchStatus, NotificationType, ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { finalizeMatchAndAdvance } from "@/lib/bracket";
import { errorResponse, parseJson } from "@/lib/http";
import { createNotificationsForUsers, getTournamentAdminRecipientIds } from "@/lib/notifications";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { reportMatchSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const matchId = ctx.params.id;
    const body = await parseJson(req, reportMatchSchema);

    const match = await prisma.match.findUnique({
      where: { id: matchId },
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
        },
        reports: {
          where: {
            status: ReportStatus.SUBMITTED
          },
          take: 1
        }
      }
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    if (match.status !== MatchStatus.READY) {
      return NextResponse.json({ error: "Match is not ready for reporting." }, { status: 400 });
    }

    const participantIds = [match.participantATeamId, match.participantBTeamId].filter(
      (teamId): teamId is string => Boolean(teamId)
    );
    if (!participantIds.includes(body.winnerTeamId)) {
      return NextResponse.json({ error: "winnerTeamId must be one of the match participants." }, { status: 400 });
    }

    if (match.reports.length > 0) {
      return NextResponse.json({ error: "A pending report already exists for this match." }, { status: 409 });
    }

    let isAdminActor = actor.role === GlobalRole.PLATFORM_ADMIN || actor.role === GlobalRole.TOURNAMENT_ADMIN;
    const providedProofs = body.proofs ?? [];
    let submittingTeamId = body.winnerTeamId;
    const membership = await prisma.teamMember.findFirst({
      where: {
        userId: actor.id,
        teamId: {
          in: participantIds
        }
      }
    });

    if (membership) {
      submittingTeamId = membership.teamId;
    } else {
      try {
        await requireTournamentAdmin(prisma, actor, match.bracket.tournamentId);
        isAdminActor = true;
      } catch {
        return NextResponse.json({ error: "Only match participants or tournament admins can submit reports." }, { status: 403 });
      }
    }

    if (!isAdminActor && providedProofs.length === 0) {
      return NextResponse.json({ error: "Proof is required for player submissions." }, { status: 400 });
    }

    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.matchReport.create({
        data: {
          matchId,
          submittedById: actor.id,
          submittingTeamId,
          claimedWinnerTeamId: body.winnerTeamId,
          scoreA: body.scoreA,
          scoreB: body.scoreB,
          notes: body.notes,
          ...(isAdminActor
            ? {
                status: ReportStatus.APPROVED,
                reviewedById: actor.id,
                reviewedAt: new Date(),
                decisionNote: "Auto-approved via admin submission."
              }
            : {}),
          ...(providedProofs.length > 0
            ? {
                proofAssets: {
                  create: providedProofs.map((proof) => ({
                    publicUrl: proof.publicUrl,
                    storageProvider: proof.storageProvider ?? "manual",
                    objectKey: proof.objectKey ?? proof.publicUrl
                  }))
                }
              }
            : {})
        },
        include: {
          proofAssets: true
        }
      });

      if (isAdminActor) {
        await finalizeMatchAndAdvance(tx, {
          matchId,
          winnerTeamId: body.winnerTeamId,
          scoreA: body.scoreA,
          scoreB: body.scoreB,
          approvedReportId: created.id
        });

        const loserTeamId =
          body.winnerTeamId === match.participantATeamId ? match.participantBTeamId : match.participantATeamId;

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
          title: match.nextMatchId ? "Grattis! Ni är vidare" : "Grattis! Ni vann turneringen",
          body: match.nextMatchId
            ? `Teamet gick vidare i ${match.bracket.tournament.name}.`
            : `Teamet vann ${match.bracket.tournament.name}.`,
          actionUrl: `/tournaments/${match.bracket.tournamentId}`,
          matchReportId: created.id,
          metadata: {
            tournamentId: match.bracket.tournamentId,
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
            title: match.nextMatchId ? "Tyvärr, ni gick inte vidare" : "Tyvärr, ni förlorade finalen",
            body: match.nextMatchId
              ? `Teamet gick inte vidare i ${match.bracket.tournament.name}.`
              : `Teamet slutade tvåa i ${match.bracket.tournament.name}.`,
            actionUrl: `/tournaments/${match.bracket.tournamentId}`,
            matchReportId: created.id,
            metadata: {
              tournamentId: match.bracket.tournamentId,
              matchId
            }
          });
        }
      } else {
        await tx.match.update({
          where: { id: matchId },
          data: {
            status: MatchStatus.REPORTED,
            reportedAt: new Date()
          }
        });

        const adminRecipientIds = (await getTournamentAdminRecipientIds(tx, match.bracket.tournamentId)).filter(
          (userId) => userId !== actor.id
        );
        const matchLabel = `${match.participantATeam?.name ?? "TBD"} vs ${match.participantBTeam?.name ?? "TBD"}`;
        await createNotificationsForUsers(tx, adminRecipientIds, {
          type: NotificationType.REPORT_PENDING_REVIEW,
          title: "Result waiting for review",
          body: `${match.bracket.tournament.name}: ${matchLabel}`,
          actionUrl: "/admin",
          matchReportId: created.id,
          metadata: {
            tournamentId: match.bracket.tournamentId,
            matchId
          }
        });
      }

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "MATCH_REPORTED",
        entityType: "MatchReport",
        entityId: created.id,
        tournamentId: match.bracket.tournamentId,
        metadata: {
          matchId,
          winnerTeamId: body.winnerTeamId
        }
      });

      if (isAdminActor) {
        await writeAuditLog(tx, {
          actorUserId: actor.id,
          action: "MATCH_REPORT_APPROVED",
          entityType: "MatchReport",
          entityId: created.id,
          tournamentId: match.bracket.tournamentId,
          metadata: {
            matchId,
            winnerTeamId: body.winnerTeamId,
            autoApproved: true
          }
        });
      }

      return created;
    });

    return NextResponse.json({ report, autoApproved: isAdminActor }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

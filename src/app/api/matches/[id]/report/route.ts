import { GlobalRole, MatchStatus, ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
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
        bracket: true,
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

    let submittingTeamId = body.winnerTeamId;
    if (actor.role !== GlobalRole.PLATFORM_ADMIN) {
      const membership = await prisma.teamMember.findFirst({
        where: {
          userId: actor.id,
          teamId: {
            in: participantIds
          }
        }
      });

      if (!membership) {
        try {
          await requireTournamentAdmin(prisma, actor, match.bracket.tournamentId);
        } catch {
          return NextResponse.json({ error: "Only match participants or tournament admins can submit reports." }, { status: 403 });
        }
      } else {
        submittingTeamId = membership.teamId;
      }
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
          proofAssets: {
            create: body.proofs.map((proof) => ({
              publicUrl: proof.publicUrl,
              storageProvider: proof.storageProvider ?? "manual",
              objectKey: proof.objectKey ?? proof.publicUrl
            }))
          }
        },
        include: {
          proofAssets: true
        }
      });

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.REPORTED,
          reportedAt: new Date()
        }
      });

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

      return created;
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

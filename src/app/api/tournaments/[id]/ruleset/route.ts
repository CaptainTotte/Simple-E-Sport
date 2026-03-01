import { PoolStrategy, Prisma, TournamentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updateRulesetSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

function suggestedRandomPoolSize(teamLimit: number) {
  if (teamLimit <= 4) {
    return 3;
  }
  if (teamLimit <= 8) {
    return 5;
  }
  return 7;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const tournamentId = ctx.params.id;

    await requireTournamentAdmin(prisma, actor, tournamentId);

    const body = await parseJson(req, updateRulesetSchema);
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId }
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    }

    if (tournament.status === TournamentStatus.LIVE || tournament.status === TournamentStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Ruleset cannot be changed once tournament is live or completed." },
        { status: 400 }
      );
    }

    const game = await prisma.gameDefinition.findUnique({
      where: { id: body.gameId }
    });
    if (!game) {
      return NextResponse.json({ error: "Selected game was not found." }, { status: 400 });
    }
    if (body.poolStrategy === PoolStrategy.RANDOM && !game.randomPoolAllowed) {
      return NextResponse.json({ error: "Selected game supports manual pool only." }, { status: 400 });
    }

    const mode = await prisma.gameModeDefinition.findUnique({
      where: { id: body.modeId }
    });
    if (!mode || mode.gameId !== body.gameId) {
      return NextResponse.json({ error: "Selected mode does not belong to selected game." }, { status: 400 });
    }

    if (body.poolStrategy === PoolStrategy.MANUAL && body.poolItems) {
      for (const item of body.poolItems) {
        if (!item.contextItemId && !item.customLabel) {
          return NextResponse.json(
            { error: "Each manual pool item must include contextItemId or customLabel." },
            { status: 400 }
          );
        }

        if (item.contextItemId) {
          const contextItem = await prisma.gameContextItemDefinition.findUnique({
            where: { id: item.contextItemId }
          });
          if (!contextItem || contextItem.gameId !== body.gameId) {
            return NextResponse.json({ error: "Context item does not belong to selected game." }, { status: 400 });
          }
        }
      }
    }

    let resolvedRandomPoolSize: number | null = null;
    if (body.poolStrategy === PoolStrategy.RANDOM) {
      const availableContextCount = await prisma.gameContextItemDefinition.count({
        where: {
          gameId: body.gameId,
          isActive: true
        }
      });
      if (availableContextCount > 0) {
        const suggested = suggestedRandomPoolSize(tournament.teamLimit);
        const preferred = body.randomPoolSize ?? suggested;
        resolvedRandomPoolSize = Math.max(1, Math.min(preferred, availableContextCount));
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const ruleset = await tx.tournamentRuleset.upsert({
        where: {
          tournamentId
        },
        update: {
          gameId: body.gameId,
          modeId: body.modeId,
          poolStrategy: body.poolStrategy,
          randomPoolSize: body.poolStrategy === PoolStrategy.RANDOM ? resolvedRandomPoolSize : null,
          frozenConfig: Prisma.JsonNull
        },
        create: {
          tournamentId,
          gameId: body.gameId,
          modeId: body.modeId,
          poolStrategy: body.poolStrategy,
          randomPoolSize: body.poolStrategy === PoolStrategy.RANDOM ? resolvedRandomPoolSize : null
        }
      });

      await tx.tournamentContextPoolItem.deleteMany({
        where: {
          rulesetId: ruleset.id
        }
      });

      if (body.poolItems?.length) {
        await tx.tournamentContextPoolItem.createMany({
          data: body.poolItems.map((item, index) => ({
            rulesetId: ruleset.id,
            contextItemId: item.contextItemId,
            customLabel: item.customLabel,
            position: index + 1
          }))
        });
      }

      const updatedTournament = await tx.tournament.update({
        where: { id: tournamentId },
        data: {
          status: tournament.status === TournamentStatus.DRAFT ? TournamentStatus.REGISTRATION_OPEN : tournament.status
        }
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TOURNAMENT_RULESET_UPDATED",
        entityType: "TournamentRuleset",
        entityId: ruleset.id,
        tournamentId,
        afterState: {
          gameId: body.gameId,
          modeId: body.modeId,
          poolStrategy: body.poolStrategy,
          poolItemCount: body.poolItems?.length ?? 0
        }
      });

      return {
        rulesetId: ruleset.id,
        tournamentStatus: updatedTournament.status
      };
    });

    return NextResponse.json(result);
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

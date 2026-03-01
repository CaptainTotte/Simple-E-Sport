import { TournamentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updateTournamentStatusSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

const VALID_TRANSITIONS: Partial<Record<TournamentStatus, TournamentStatus>> = {
  [TournamentStatus.DRAFT]: TournamentStatus.REGISTRATION_OPEN,
  [TournamentStatus.REGISTRATION_OPEN]: TournamentStatus.REGISTRATION_CLOSED,
  [TournamentStatus.REGISTRATION_CLOSED]: TournamentStatus.LIVE,
  [TournamentStatus.LIVE]: TournamentStatus.COMPLETED
};

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const tournamentId = ctx.params.id;
    await requireTournamentAdmin(prisma, actor, tournamentId);

    const body = await parseJson(req, updateTournamentStatusSchema);

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, status: true }
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    }

    const allowedNext = VALID_TRANSITIONS[tournament.status];
    if (!allowedNext || allowedNext !== body.status) {
      return NextResponse.json(
        { error: `Cannot transition from ${tournament.status} to ${body.status}.` },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TOURNAMENT_STATUS_CHANGED",
        entityType: "Tournament",
        entityId: tournamentId,
        tournamentId,
        beforeState: { status: tournament.status },
        afterState: { status: body.status }
      });

      return tx.tournament.update({
        where: { id: tournamentId },
        data: { status: body.status as TournamentStatus },
        select: { id: true, status: true }
      });
    });

    return NextResponse.json({ tournament: updated });
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

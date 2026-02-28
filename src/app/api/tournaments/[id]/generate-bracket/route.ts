import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { generateSingleEliminationBracket } from "@/lib/bracket";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const tournamentId = ctx.params.id;

    await requireTournamentAdmin(prisma, actor, tournamentId);
    const result = await generateSingleEliminationBracket(tournamentId, actor.id);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error."
      },
      { status: 400 }
    );
  }
}

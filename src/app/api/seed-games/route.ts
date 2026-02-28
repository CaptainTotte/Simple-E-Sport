import { GlobalRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { upsertGameCatalog } from "@/lib/game-catalog";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    if (actor.role !== GlobalRole.PLATFORM_ADMIN) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await upsertGameCatalog(prisma);

    await writeAuditLog(prisma, {
      actorUserId: actor.id,
      action: "GAME_CATALOG_RESEEDED",
      entityType: "GameDefinition",
      entityId: "catalog",
      metadata: { triggeredBy: "api" }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error."
      },
      { status: 400 }
    );
  }
}

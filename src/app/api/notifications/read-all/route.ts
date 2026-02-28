import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const actor = await requireActor(prisma, req);

    const result = await prisma.notification.updateMany({
      where: {
        userId: actor.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return NextResponse.json({
      updated: result.count
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

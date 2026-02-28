import { TeamInvitationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const actor = await requireActor(prisma, req);

    const invitations = await prisma.teamInvitation.findMany({
      where: {
        inviteeUserId: actor.id,
        status: TeamInvitationStatus.PENDING
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            tag: true,
            isDummy: true
          }
        },
        inviter: {
          select: {
            id: true,
            name: true,
            username: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

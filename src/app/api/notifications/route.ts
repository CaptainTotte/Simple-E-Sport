import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const actor = await requireActor(prisma, req);

    const [unreadCount, notifications] = await Promise.all([
      prisma.notification.count({
        where: {
          userId: actor.id,
          isRead: false
        }
      }),
      prisma.notification.findMany({
        where: {
          userId: actor.id
        },
        include: {
          teamInvitation: {
            select: {
              id: true,
              status: true,
              team: {
                select: {
                  id: true,
                  name: true,
                  tag: true
                }
              },
              inviter: {
                select: {
                  id: true,
                  name: true,
                  username: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 40
      })
    ]);

    return NextResponse.json({
      unreadCount,
      notifications
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

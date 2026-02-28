import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse } from "@/lib/http";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_req: Request, ctx: RouteContext) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: ctx.params.id },
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
        include: {
          team: {
            include: {
              members: {
                include: {
                  user: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      bracket: {
        include: {
          matches: {
            include: {
              participantATeam: true,
              participantBTeam: true,
              winnerTeam: true,
              reports: {
                include: {
                  proofAssets: true
                }
              }
            },
            orderBy: [{ round: "asc" }, { position: "asc" }]
          }
        }
      },
      auditLogs: {
        orderBy: {
          createdAt: "desc"
        },
        take: 20
      }
    }
  });

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  return NextResponse.json({ tournament });
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const tournamentId = ctx.params.id;

    await requireTournamentAdmin(prisma, actor, tournamentId);

    const deleted = await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
        select: {
          id: true,
          name: true,
          status: true
        }
      });

      if (!tournament) {
        return null;
      }

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TOURNAMENT_DELETED",
        entityType: "Tournament",
        entityId: tournament.id,
        tournamentId: tournament.id,
        beforeState: {
          name: tournament.name,
          status: tournament.status
        }
      });

      await tx.tournament.delete({
        where: {
          id: tournament.id
        }
      });

      return tournament;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
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

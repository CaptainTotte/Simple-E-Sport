import { GlobalRole, TournamentRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createTournamentSchema } from "@/lib/validation";

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    include: {
      ruleset: {
        include: {
          game: true,
          mode: true
        }
      },
      _count: {
        select: {
          registrations: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json({ tournaments });
}

export async function POST(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    if (actor.role !== GlobalRole.PLATFORM_ADMIN && actor.role !== GlobalRole.TOURNAMENT_ADMIN) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await parseJson(req, createTournamentSchema);
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;

    const created = await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name: body.name,
          description: body.description,
          teamLimit: body.teamLimit,
          startsAt,
          endsAt,
          createdById: actor.id
        }
      });

      await tx.tournamentRoleAssignment.create({
        data: {
          tournamentId: tournament.id,
          userId: actor.id,
          role: TournamentRole.ADMIN
        }
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TOURNAMENT_CREATED",
        entityType: "Tournament",
        entityId: tournament.id,
        tournamentId: tournament.id,
        afterState: {
          name: tournament.name,
          status: tournament.status,
          teamLimit: tournament.teamLimit
        }
      });

      return tournament;
    });

    return NextResponse.json({ tournament: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

import { GlobalRole, RegistrationStatus, TeamMemberRole, TournamentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse, parseJson } from "@/lib/http";
import { requireTeamCaptainOrAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { registerTeamSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const tournamentId = ctx.params.id;
    const body = await parseJson(req, registerTeamSchema);

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        ruleset: {
          include: {
            mode: true
          }
        }
      }
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    }

    if (!tournament.ruleset) {
      return NextResponse.json({ error: "Tournament ruleset must be configured first." }, { status: 400 });
    }

    if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
      return NextResponse.json({ error: "Tournament registration is not open." }, { status: 400 });
    }

    const expectedTeamSize = tournament.ruleset.mode.teamSize;
    let teamId = body.teamId;

    if (teamId) {
      const existingTeam = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          members: true
        }
      });

      if (!existingTeam) {
        return NextResponse.json({ error: "Team not found." }, { status: 404 });
      }

      await requireTeamCaptainOrAdmin(prisma, actor, teamId);
      if (existingTeam.members.length !== expectedTeamSize) {
        return NextResponse.json(
          { error: `Team roster size must be exactly ${expectedTeamSize} for selected mode.` },
          { status: 400 }
        );
      }
    } else {
      if (body.playerNames.length !== expectedTeamSize) {
        return NextResponse.json(
          {
            error: `Team roster size must be exactly ${expectedTeamSize} for selected mode.`
          },
          { status: 400 }
        );
      }

      if (!body.teamName) {
        return NextResponse.json({ error: "teamName is required when teamId is not provided." }, { status: 400 });
      }

      const created = await prisma.$transaction(async (tx) => {
        const team = await tx.team.create({
          data: {
            name: body.teamName!,
            tag: body.teamTag,
            createdById: actor.id
          }
        });

        const players = [];
        for (const playerName of body.playerNames) {
          const player = await tx.user.create({
            data: {
              name: playerName,
              globalRole: GlobalRole.PLAYER
            }
          });
          players.push(player);
        }

        await tx.teamMember.createMany({
          data: players.map((player, index) => ({
            teamId: team.id,
            userId: player.id,
            role: index === 0 ? TeamMemberRole.CAPTAIN : TeamMemberRole.PLAYER
          }))
        });

        return team;
      });

      teamId = created.id;
    }

    const registration = await prisma.$transaction(async (tx) => {
      const approvedCount = await tx.tournamentRegistration.count({
        where: {
          tournamentId,
          status: RegistrationStatus.APPROVED
        }
      });

      if (approvedCount >= tournament.teamLimit) {
        throw new Error("Tournament is full.");
      }

      const created = await tx.tournamentRegistration.create({
        data: {
          tournamentId,
          teamId: teamId!,
          status: RegistrationStatus.APPROVED,
          approvedAt: new Date(),
          createdById: actor.id
        }
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TEAM_REGISTERED",
        entityType: "TournamentRegistration",
        entityId: created.id,
        tournamentId,
        metadata: {
          teamId: teamId!,
          registrationStatus: created.status,
          teamSlots: tournament.teamLimit
        }
      });

      return created;
    });

    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Team is already registered for this tournament." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Tournament is full.") {
      return NextResponse.json({ error: "Tournament is full." }, { status: 409 });
    }
    return errorResponse(error);
  }
}

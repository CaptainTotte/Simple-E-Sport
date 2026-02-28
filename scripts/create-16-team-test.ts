import {
  PoolStrategy,
  PrismaClient,
  RegistrationStatus,
  TeamMemberRole,
  TournamentRole,
  TournamentStatus
} from "@prisma/client";
import { generateSingleEliminationBracket } from "../src/lib/bracket";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { username: "admin" } });
  if (!admin) {
    throw new Error("Admin user not found (username=admin).");
  }

  const game = await prisma.gameDefinition.findUnique({
    where: { slug: "counter-strike" },
    include: {
      modes: {
        where: { isActive: true }
      },
      contextItems: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!game) {
    throw new Error("Game 'counter-strike' not found.");
  }

  const mode = game.modes.find((item) => item.code === "5v5");
  if (!mode) {
    throw new Error("Mode '5v5' not found for Counter-Strike.");
  }

  const suffix = Date.now().toString();
  const tournament = await prisma.tournament.create({
    data: {
      name: `16 Team Bracket Test ${suffix}`,
      description: "Auto-created test tournament with full 16-team bracket.",
      teamLimit: 16,
      status: TournamentStatus.DRAFT,
      createdById: admin.id
    }
  });

  await prisma.tournamentRoleAssignment.create({
    data: {
      tournamentId: tournament.id,
      userId: admin.id,
      role: TournamentRole.ADMIN
    }
  });

  await prisma.tournamentRuleset.create({
    data: {
      tournamentId: tournament.id,
      gameId: game.id,
      modeId: mode.id,
      poolStrategy: PoolStrategy.RANDOM,
      randomPoolSize: 7,
      poolItems: {
        create: game.contextItems.slice(0, 7).map((contextItem, index) => ({
          contextItemId: contextItem.id,
          position: index + 1
        }))
      }
    }
  });

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: TournamentStatus.REGISTRATION_OPEN }
  });

  const teamIds: string[] = [];

  for (let i = 1; i <= 16; i += 1) {
    const teamName = `Test Team ${i} ${suffix}`;
    const team = await prisma.team.create({
      data: {
        name: teamName,
        tag: `T${i}`,
        isDummy: true,
        createdById: admin.id,
        members: {
          create: [
            {
              displayName: `${teamName} Captain`,
              role: TeamMemberRole.CAPTAIN
            },
            {
              displayName: `${teamName} Player 2`,
              role: TeamMemberRole.PLAYER
            },
            {
              displayName: `${teamName} Player 3`,
              role: TeamMemberRole.PLAYER
            },
            {
              displayName: `${teamName} Player 4`,
              role: TeamMemberRole.PLAYER
            },
            {
              displayName: `${teamName} Player 5`,
              role: TeamMemberRole.PLAYER
            }
          ]
        }
      }
    });

    teamIds.push(team.id);
  }

  for (let i = 0; i < teamIds.length; i += 1) {
    await prisma.tournamentRegistration.create({
      data: {
        tournamentId: tournament.id,
        teamId: teamIds[i],
        status: RegistrationStatus.APPROVED,
        seed: i + 1,
        approvedAt: new Date(),
        createdById: admin.id
      }
    });
  }

  await generateSingleEliminationBracket(tournament.id, admin.id);

  const created = await prisma.tournament.findUnique({
    where: { id: tournament.id },
    include: {
      _count: {
        select: {
          registrations: true
        }
      },
      bracket: {
        include: {
          matches: {
            select: {
              id: true,
              round: true,
              position: true,
              status: true
            },
            orderBy: [{ round: "asc" }, { position: "asc" }]
          }
        }
      }
    }
  });

  if (!created) {
    throw new Error("Tournament was created but could not be reloaded.");
  }

  const matchesByRound =
    created.bracket?.matches.reduce<Record<number, number>>((acc, match) => {
      acc[match.round] = (acc[match.round] ?? 0) + 1;
      return acc;
    }, {}) ?? {};

  console.log(
    JSON.stringify(
      {
        message: "16-team test tournament created with bracket.",
        tournamentId: created.id,
        name: created.name,
        status: created.status,
        teamLimit: created.teamLimit,
        registrations: created._count.registrations,
        bracketMatchCount: created.bracket?.matches.length ?? 0,
        matchesByRound,
        openUrl: `/tournaments/${created.id}`
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

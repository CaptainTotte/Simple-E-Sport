/**
 * Creates a test tournament for manual testing.
 * Totte's team (2-player Rocket League) + 3 dummy teams in a 4-slot bracket.
 * Run with: docker compose exec app npx tsx scripts/seed-test-tournament.ts
 */
import {
  GlobalRole,
  PrismaClient,
  RegistrationStatus,
  TeamMemberRole,
  TournamentStatus
} from "@prisma/client";

const prisma = new PrismaClient();

const ROCKET_LEAGUE_ID = "cmm6azng6000vqs3nub2bu435";
const RL_2V2_MODE_ID   = "cmm6azng7000wqs3nea96i04i";

async function main() {
  // 1. Find Totte
  const totte = await prisma.user.findFirst({
    where: { username: "totte" }
  });
  if (!totte) throw new Error("User 'totte' not found. Register the account first.");
  console.log(`Found user: ${totte.name} (${totte.username})`);

  // Ensure Totte is at least TEAM_CAPTAIN role
  if (totte.globalRole === GlobalRole.PLAYER) {
    await prisma.user.update({
      where: { id: totte.id },
      data: { globalRole: GlobalRole.TEAM_CAPTAIN }
    });
    console.log("Promoted Totte to TEAM_CAPTAIN");
  }

  // Find admin for audit/created-by fields
  const admin = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.PLATFORM_ADMIN }
  });
  if (!admin) throw new Error("No admin user found. Run db:seed first.");

  // 2. Create Totte's real team (remove from any existing first)
  const existingMembership = await prisma.teamMember.findFirst({
    where: { userId: totte.id }
  });
  if (existingMembership) {
    console.log("Totte already has a team membership — skipping team creation.");
  }

  let totteTeam;
  if (!existingMembership) {
    totteTeam = await prisma.team.create({
      data: {
        name: "Totte's Rockets",
        tag: "TR",
        createdById: totte.id,
        members: {
          create: [
            { userId: totte.id, displayName: totte.name, role: TeamMemberRole.CAPTAIN },
            { displayName: "Wingman Bot", role: TeamMemberRole.PLAYER } // 2nd slot as dummy member
          ]
        }
      }
    });
    console.log(`Created team: ${totteTeam.name}`);
  } else {
    const team = await prisma.team.findUnique({
      where: { id: existingMembership.teamId }
    });
    totteTeam = team!;
    console.log(`Using existing team: ${totteTeam.name}`);
  }

  // 3. Create 3 dummy opponent teams
  const dummyTeamNames = [
    { name: "Alpha Squad",    tag: "ALP", players: ["Alpha1", "Alpha2"] },
    { name: "Beta Force",     tag: "BET", players: ["Beta1",  "Beta2"]  },
    { name: "Gamma Gang",     tag: "GAM", players: ["Gamma1", "Gamma2"] }
  ];

  const dummyTeams = await Promise.all(
    dummyTeamNames.map((t) =>
      prisma.team.create({
        data: {
          name: t.name,
          tag: t.tag,
          isDummy: true,
          createdById: admin.id,
          members: {
            create: t.players.map((name, i) => ({
              displayName: name,
              role: i === 0 ? TeamMemberRole.CAPTAIN : TeamMemberRole.PLAYER
            }))
          }
        }
      })
    )
  );
  console.log(`Created ${dummyTeams.length} dummy teams`);

  // 4. Create the tournament (DRAFT, then open registration)
  const tournament = await prisma.tournament.create({
    data: {
      name: "Test Tournament — Rocket League 2v2",
      description: "Test tournament for development. Open to all.",
      teamLimit: 4,
      status: TournamentStatus.REGISTRATION_OPEN,
      createdById: admin.id
    }
  });
  console.log(`Created tournament: ${tournament.name} (${tournament.id})`);

  // 5. Set ruleset
  await prisma.tournamentRuleset.create({
    data: {
      tournamentId: tournament.id,
      gameId: ROCKET_LEAGUE_ID,
      modeId: RL_2V2_MODE_ID,
      poolStrategy: "RANDOM"
    }
  });
  console.log("Ruleset configured: Rocket League 2v2, random pool");

  // 6. Register all teams
  const allTeams = [totteTeam, ...dummyTeams];
  await prisma.tournamentRegistration.createMany({
    data: allTeams.map((team) => ({
      tournamentId: tournament.id,
      teamId: team.id,
      status: RegistrationStatus.APPROVED,
      approvedAt: new Date(),
      createdById: admin.id
    }))
  });
  console.log(`Registered ${allTeams.length} teams`);

  console.log(`\nDone! Visit: http://localhost:3001/tournaments/${tournament.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

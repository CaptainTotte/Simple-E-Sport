import { GlobalRole, PrismaClient } from "@prisma/client";
import { generateSingleEliminationBracket } from "../src/lib/bracket";

const TOURNAMENT_ID = "cmm87w6k6000imkcw6002gpg4";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirstOrThrow({
    where: { globalRole: GlobalRole.PLATFORM_ADMIN }
  });

  const result = await generateSingleEliminationBracket(TOURNAMENT_ID, admin.id);
  console.log(`Bracket generated with ${result.matchCount} matches.`);
  console.log(`Visit: http://localhost:3001/tournaments/${TOURNAMENT_ID}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

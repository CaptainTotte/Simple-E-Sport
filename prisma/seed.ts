import { GlobalRole, PrismaClient } from "@prisma/client";
import { upsertGameCatalog } from "../src/lib/game-catalog";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function seedDefaultAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "password";
  const name = process.env.ADMIN_NAME ?? "Admin";

  await prisma.user.upsert({
    where: { username },
    update: {
      username,
      name,
      passwordHash: hashPassword(password),
      globalRole: GlobalRole.PLATFORM_ADMIN
    },
    create: {
      username,
      name,
      passwordHash: hashPassword(password),
      globalRole: GlobalRole.PLATFORM_ADMIN
    }
  });
}

async function main() {
  await upsertGameCatalog(prisma);
  await seedDefaultAdmin();
  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

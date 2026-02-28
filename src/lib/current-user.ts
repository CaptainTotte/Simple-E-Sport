import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { readSessionPayloadFromToken, sessionCookieName } from "@/lib/session";

export async function getCurrentUser(prisma: PrismaClient) {
  const store = cookies();
  const token = store.get(sessionCookieName())?.value;
  const payload = readSessionPayloadFromToken(token);
  if (!payload) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: payload.userId
    },
    select: {
      id: true,
      name: true,
      username: true,
      globalRole: true
    }
  });
}

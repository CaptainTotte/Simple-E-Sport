import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";
import { isAccountBlocked } from "@/lib/account-status";
import { readSessionPayloadFromToken, sessionCookieName } from "@/lib/session";

export async function getCurrentUser(prisma: PrismaClient) {
  const store = cookies();
  const token = store.get(sessionCookieName())?.value;
  const payload = readSessionPayloadFromToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: payload.userId
    },
    select: {
      id: true,
      name: true,
      username: true,
      profileImageUrl: true,
      globalRole: true,
      timeoutUntil: true,
      bannedAt: true
    }
  });

  if (!user || isAccountBlocked(user)) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    profileImageUrl: user.profileImageUrl,
    globalRole: user.globalRole
  };
}

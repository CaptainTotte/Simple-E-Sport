import type { GlobalRole, PrismaClient } from "@prisma/client";
import { readSessionPayloadFromToken, readSessionTokenFromRequest } from "@/lib/session";

export type RequestActor = {
  id: string;
  name: string;
  role: GlobalRole;
};

export async function getActorFromRequest(prisma: PrismaClient, req: Request): Promise<RequestActor | null> {
  const token = readSessionTokenFromRequest(req);
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
      globalRole: true
    }
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    role: user.globalRole
  };
}

export async function requireActor(prisma: PrismaClient, req: Request): Promise<RequestActor> {
  const actor = await getActorFromRequest(prisma, req);
  if (!actor) {
    throw new Error("Unauthorized");
  }
  return actor;
}

import { NextResponse } from "next/server";
import { getActorFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(prisma, req);
  if (!actor) {
    return NextResponse.json({ user: null });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: actor.id
    },
    select: {
      id: true,
      username: true,
      name: true,
      globalRole: true
    }
  });

  return NextResponse.json({ user });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const games = await prisma.gameDefinition.findMany({
    include: {
      modes: {
        where: { isActive: true },
        orderBy: {
          teamSize: "asc"
        }
      },
      contextItems: {
        where: { isActive: true },
        orderBy: {
          name: "asc"
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });

  return NextResponse.json({ games });
}

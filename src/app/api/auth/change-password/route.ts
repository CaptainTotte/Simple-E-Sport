import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse, parseJson } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    const body = await parseJson(req, changePasswordSchema);

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        passwordHash: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(body.newPassword)
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}

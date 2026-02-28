import { GlobalRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { errorResponse, parseJson } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieConfig } from "@/lib/session";
import { registerAccountSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, registerAccountSchema);
    const username = body.username.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { username }
    });
    if (existing) {
      return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        username,
        name: body.name,
        passwordHash: hashPassword(body.password),
        globalRole: GlobalRole.PLAYER
      }
    });

    const token = createSessionToken(user.id, user.globalRole);
    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.globalRole
      }
    });
    const session = sessionCookieConfig(token);
    response.cookies.set(session.name, session.value, session.options);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

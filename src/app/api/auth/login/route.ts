import { NextResponse } from "next/server";
import { errorResponse, parseJson } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieConfig } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, loginSchema);
    const username = body.username.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

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

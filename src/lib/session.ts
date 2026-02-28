import { createHmac } from "node:crypto";
import { GlobalRole } from "@prisma/client";

const SESSION_COOKIE = "simple_esport_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  role: GlobalRole;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET ?? "change-me";
}

function sign(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  if (expected !== signature) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.userId || !parsed.role || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readCookieFromHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const session = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!session) {
    return null;
  }
  return decodeURIComponent(session.slice(SESSION_COOKIE.length + 1));
}

export function createSessionToken(userId: string, role: GlobalRole): string {
  return encode({
    userId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  });
}

export function readSessionTokenFromRequest(req: Request): string | null {
  return readCookieFromHeader(req.headers.get("cookie"));
}

export function readSessionPayloadFromToken(token: string | null | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }
  return decode(token);
}

export function sessionCookieConfig(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_TTL_SECONDS
    }
  };
}

export function clearSessionCookieConfig() {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0
    }
  };
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

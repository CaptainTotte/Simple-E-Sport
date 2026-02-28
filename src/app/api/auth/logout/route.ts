import { NextResponse } from "next/server";
import { clearSessionCookieConfig } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const session = clearSessionCookieConfig();
  response.cookies.set(session.name, session.value, session.options);
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "APP_PASSWORD not configured" }, { status: 500 });
  }

  const { password: given } = (await req.json()) as { password?: string };
  const a = Buffer.from(given || "");
  const b = Buffer.from(password);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const session = crypto.createHash("sha256").update(password).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("app_session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}

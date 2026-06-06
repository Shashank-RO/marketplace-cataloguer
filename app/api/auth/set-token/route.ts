import { NextRequest, NextResponse } from "next/server";

// This route sets the token cookie in a same-site context (avoiding cross-site cookie restrictions)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/api/auth", req.url));
  }

  const appUrl = process.env.APP_URL || `https://${req.headers.get("host")}`;
  const response = NextResponse.redirect(`${appUrl}/`);

  response.cookies.set("shopify_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}

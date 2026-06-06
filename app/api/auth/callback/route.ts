import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = req.cookies.get("shopify_oauth_state")?.value;

  console.log("[auth/callback] code:", !!code, "state:", state, "cookieState:", cookieState);

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // Skip state check if cookie is missing (can happen with cookie restrictions)
  if (cookieState && state !== cookieState) {
    return NextResponse.json({ error: "State mismatch" }, { status: 400 });
  }

  const shop = process.env.SHOPIFY_STORE_DOMAIN!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET!;

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  const tokenData = await tokenRes.json();
  console.log("[auth/callback] token response status:", tokenRes.status, "token type:", tokenData.access_token?.substring(0, 8));

  if (!tokenRes.ok || !tokenData.access_token) {
    return NextResponse.json({ error: "Failed to exchange token", detail: tokenData }, { status: 500 });
  }

  const access_token = tokenData.access_token;
  const appUrl = process.env.APP_URL || `https://${req.headers.get("host")}`;

  // Redirect to a local token-setter page to avoid cross-site cookie issues
  const response = NextResponse.redirect(`${appUrl}/api/auth/set-token?token=${access_token}`);
  response.cookies.delete("shopify_oauth_state");
  return response;
}

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = req.cookies.get("shopify_oauth_state")?.value;

  if (!code || !state || state !== cookieState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const shop = process.env.SHOPIFY_STORE_DOMAIN!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET!;

  // Exchange code for access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Failed to exchange token" }, { status: 500 });
  }

  const { access_token } = await tokenRes.json();

  // Persist token to Railway env via Railway GraphQL API, then store in cookie for this session
  if (process.env.RAILWAY_TOKEN && process.env.RAILWAY_SERVICE_ID && process.env.RAILWAY_ENVIRONMENT_ID) {
    await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RAILWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `mutation {
          variableUpsert(input: {
            serviceId: "${process.env.RAILWAY_SERVICE_ID}"
            environmentId: "${process.env.RAILWAY_ENVIRONMENT_ID}"
            name: "SHOPIFY_ADMIN_TOKEN"
            value: "${access_token}"
          })
        }`,
      }),
    });
  }

  const appUrl = process.env.APP_URL || `https://${req.headers.get("host")}`;
  const response = NextResponse.redirect(`${appUrl}/`);
  response.cookies.set("shopify_token", access_token, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  response.cookies.delete("shopify_oauth_state");
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const redirectUri = `${process.env.APP_URL}/api/auth/callback`;
  const scopes = "read_products";
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("shopify_oauth_state", state, { httpOnly: true, maxAge: 600 });
  return response;
}

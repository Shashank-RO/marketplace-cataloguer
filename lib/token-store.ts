// In-memory token store with auto-refresh via client credentials
let cachedToken: string | null = process.env.SHOPIFY_ADMIN_TOKEN || null;
let tokenExpiry: number = Date.now() + 82800000; // 23 hours default

export async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  return refreshToken();
}

export async function refreshToken(): Promise<string> {
  const shop = process.env.SHOPIFY_STORE_DOMAIN!;
  const clientId = process.env.SHOPIFY_CLIENT_ID!;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET!;

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 3600) * 1000; // refresh 1h before expiry
  return cachedToken!;
}

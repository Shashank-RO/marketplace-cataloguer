import { NextRequest, NextResponse } from "next/server";

// In-memory cache — filters almost never change, refresh every 10 minutes
let cachedFilters: { collections: string[]; tags: string[]; types: string[] } | null = null;
let cacheExpiry = 0;

export async function GET(req: NextRequest) {
  const token = req.cookies.get("shopify_token")?.value || process.env.SHOPIFY_ADMIN_TOKEN;
  const domain = process.env.SHOPIFY_STORE_DOMAIN;

  // Serve from cache if still fresh
  if (cachedFilters && Date.now() < cacheExpiry) {
    return NextResponse.json(cachedFilters);
  }

  try {
    const res = await fetch(`https://${domain}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{
          shop {
            productTags(first: 250) {
              edges { node }
            }
          }
          productTypes: shop {
            productTypes(first: 250) {
              edges { node }
            }
          }
        }`,
      }),
    });

    if (!res.ok) throw new Error(`GraphQL error ${res.status}`);
    const { data } = await res.json();

    const tags: string[] = data.shop.productTags.edges.map((e: { node: string }) => e.node);
    const types: string[] = data.productTypes.productTypes.edges
      .map((e: { node: string }) => e.node)
      .filter(Boolean)
      .sort();

    const uniqueTags = Array.from(new Set(tags));
    const collections = uniqueTags
      .filter((t) => /^zkp\d+$/i.test(t))
      .map((t) => t.toUpperCase())
      .sort();
    const otherTags = uniqueTags.filter((t) => !/^zkp\d+$/i.test(t)).sort();

    cachedFilters = { collections, tags: otherTags, types };
    cacheExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    return NextResponse.json(cachedFilters);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

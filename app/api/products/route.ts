import { NextRequest, NextResponse } from "next/server";
import { fetchProducts, fetchProductsFiltered } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("shopify_token")?.value || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = req.nextUrl;
    const cursor = searchParams.get("cursor") || undefined;

    // Server-side filter params (sent when user applies filters)
    const collections = searchParams.getAll("collection"); // e.g. ZKP1174, ZKP1175
    const tags = searchParams.getAll("tag");               // other tags (AND)
    const skus = searchParams.getAll("sku");
    const productType = searchParams.get("type") || "";

    const hasFilters = collections.length > 0 || tags.length > 0 || skus.length > 0 || productType;

    if (hasFilters) {
      const { products, nextCursor } = await fetchProductsFiltered(
        { collections, tags, skus, productType, cursor },
        token,
      );
      return NextResponse.json({ products, nextCursor });
    }

    // No filters — normal paginated browse
    const { products, nextCursor } = await fetchProducts(cursor, 50, token);
    return NextResponse.json({ products, nextCursor });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("401") || message.includes("403")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

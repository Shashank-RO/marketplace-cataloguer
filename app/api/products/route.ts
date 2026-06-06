import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("shopify_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
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

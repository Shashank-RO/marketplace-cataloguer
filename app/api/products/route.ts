import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  try {
    // Use cookie token if available, fall back to env var
    const token = req.cookies.get("shopify_token")?.value || process.env.SHOPIFY_ADMIN_TOKEN;
    const page = Number(req.nextUrl.searchParams.get("page") || "1");
    const products = await fetchProducts(page, 50, token);
    return NextResponse.json({ products });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("401") || message.includes("403") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

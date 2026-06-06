import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("shopify_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized", redirect: "/api/auth" }, { status: 401 });
  }

  try {
    const page = Number(req.nextUrl.searchParams.get("page") || "1");
    const products = await fetchProducts(page, 50, token);
    return NextResponse.json({ products });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("401") || message.includes("403")) {
      return NextResponse.json({ error: "Unauthorized", redirect: "/api/auth" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

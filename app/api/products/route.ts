import { NextRequest, NextResponse } from "next/server";
import { fetchProducts } from "@/lib/shopify";
import { getToken, refreshToken } from "@/lib/token-store";

export async function GET(req: NextRequest) {
  try {
    const page = Number(req.nextUrl.searchParams.get("page") || "1");
    let token = await getToken();
    try {
      const products = await fetchProducts(page, 50, token);
      return NextResponse.json({ products });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("401") || msg.includes("400")) {
        // Token rejected — force refresh and retry once
        token = await refreshToken();
        const products = await fetchProducts(page, 50, token);
        return NextResponse.json({ products });
      }
      throw e;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchProduct } from "@/lib/shopify";
import { buildMyntraWorkbook } from "@/lib/myntra-template";
import { getToken, refreshToken } from "@/lib/token-store";

export async function POST(req: NextRequest) {
  try {
    const { productIds, marketplace } = await req.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "No products selected" }, { status: 400 });
    }

    let token = await getToken();

    const fetchAll = async (t: string) =>
      Promise.all(productIds.map((id: string) => fetchProduct(id, t)));

    let products;
    try {
      products = await fetchAll(token);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("401") || msg.includes("400")) {
        token = await refreshToken();
        products = await fetchAll(token);
      } else throw e;
    }

    if (marketplace === "myntra") {
      const buffer = await buildMyntraWorkbook(products);
      const filename = `myntra-catalog-${Date.now()}.xlsx`;
      return new NextResponse(buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported marketplace" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

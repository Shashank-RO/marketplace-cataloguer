import { NextRequest, NextResponse } from "next/server";
import { fetchProduct } from "@/lib/shopify";
import { buildMyntraWorkbook } from "@/lib/myntra-template";

export async function POST(req: NextRequest) {
  try {
    const { productIds, marketplace } = await req.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "No products selected" }, { status: 400 });
    }

    const products = await Promise.all(productIds.map((id: string) => fetchProduct(id)));

    let buffer: unknown;
    let filename: string;

    if (marketplace === "myntra") {
      buffer = await buildMyntraWorkbook(products);
      filename = `myntra-catalog-${Date.now()}.xlsx`;
    } else {
      return NextResponse.json({ error: "Unsupported marketplace" }, { status: 400 });
    }

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

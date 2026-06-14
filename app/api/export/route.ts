import { NextRequest, NextResponse } from "next/server";
import { fetchProduct } from "@/lib/shopify";
import { buildMyntraWorkbook } from "@/lib/myntra-template";
import { fillMyntraTemplate } from "@/lib/myntra-export";
import { getToken, refreshToken } from "@/lib/token-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productIds, marketplace, templateDataUrl, year, season } = body as {
      productIds: string[];
      marketplace: string;
      templateDataUrl?: string;
      year?: string;
      season?: string;
    };

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
      let buffer: ExcelJS.Buffer;
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const datePfx = `${dd}${mm}${yy}`;

      let filename: string;

      if (templateDataUrl) {
        // Template-based export: fill the uploaded combined Myntra format
        const base64 = templateDataUrl.replace(/^data:[^;]+;base64,/, "");
        const templateBuffer = Buffer.from(base64, "base64");
        buffer = await fillMyntraTemplate(templateBuffer, products, { year, season });
        filename = `${datePfx} Myntra-${Date.now()}.xlsx`;
      } else {
        // Fallback: build a simple workbook (no template uploaded)
        buffer = await buildMyntraWorkbook(products);
        filename = `${datePfx} Myntra-${Date.now()}.xlsx`;
      }

      return new NextResponse(buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported marketplace" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ExcelJS Buffer type needed at module level
import type ExcelJS from "exceljs";

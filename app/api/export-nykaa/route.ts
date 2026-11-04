import { NextRequest, NextResponse } from "next/server";
import { fetchProductsByIds } from "@/lib/shopify";
import { fillNykaaTemplates } from "@/lib/nykaa-export";
import { getToken, refreshToken } from "@/lib/token-store";
import { InsufficientCreditsError } from "@/lib/vision";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productIds, season, templates, priceOverrides, skipVision } = body as {
      productIds: string[];
      season: string;
      templates: {
        kurtis: string;   // base64
        tops: string;
        dresses: string;
        sets: string;
        trousers: string;
      };
      priceOverrides: Record<string, string>;
      skipVision?: boolean;
    };

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "No products selected" }, { status: 400 });
    }
    if (!templates?.kurtis || !templates?.tops || !templates?.dresses || !templates?.sets || !templates?.trousers) {
      return NextResponse.json({ error: "Nykaa templates not uploaded. Please upload them via Marketplace Base Formats." }, { status: 400 });
    }

    let token = await getToken();

    const fetchAll = async (t: string) =>
      fetchProductsByIds(productIds, t);

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

    const toBuffer = (b64: string) => Buffer.from(b64.replace(/^data:[^;]+;base64,/, ""), "base64");

    const { buffer: zipBuffer, categories } = await fillNykaaTemplates(
      {
        kurtis:   toBuffer(templates.kurtis),
        tops:     toBuffer(templates.tops),
        dresses:  toBuffer(templates.dresses),
        sets:     toBuffer(templates.sets),
        trousers: toBuffer(templates.trousers),
      },
      products,
      { season, priceOverrides: priceOverrides || {}, skipVision },
    );

    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC+5:30 IST
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const yy = String(now.getUTCFullYear()).slice(-2);
    const catSuffix = categories.length > 0 ? ` ${categories.join(" ")}` : "";
    const filename = `${dd}${mm}${yy} Nykaa${catSuffix}.zip`;

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e: unknown) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: e.message, code: "insufficient_credits" }, { status: 402 });
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

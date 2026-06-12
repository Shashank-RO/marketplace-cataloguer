import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

// Skip sheets that are metadata, not product category sheets
const SKIP_SHEETS = new Set(["__INSTRUCTIONS", "masterdata", "instructions", "readme", "data"]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(arrayBuffer as any);

    const sheets = wb.worksheets
      .map((ws) => ws.name)
      .filter((name) => !SKIP_SHEETS.has(name.toLowerCase().replace(/\s/g, "")));

    return NextResponse.json({ sheets, fileName: file.name });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parse failed" }, { status: 500 });
  }
}

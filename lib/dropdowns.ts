import type ExcelJS from "exceljs";

// ─── Dropdown validation against the uploaded template ───────────────────────
//
// Each marketplace sheet has its own dropdown lists (Myntra Trousers has no "Daily"
// occasion, Nykaa has "Kota" but not "Kota Doria", etc.). Rather than hard-coding
// every sheet's vocabulary, read the real lists from the uploaded template's
// data-validation rules and snap each value to one the column allows before writing it.

/** Fallbacks for values a column doesn't allow; the first one the column does allow wins. */
export const DROPDOWN_ALIASES: Record<string, string[]> = {
  // Occasion
  "daily": ["Casual"], "casual": ["Daily"], "fusion": ["Casual"],
  "festive": ["Ethnic", "Party"], "wedding": ["Festive", "Ethnic", "Party"], "formal": ["Smart Casual", "Casual"],
  // Sleeve styling
  "flared sleeves": ["Bell Sleeves"], "puff sleeves": ["Puffed Sleeves"], "puffed sleeves": ["Puff Sleeves"],
  // Neck
  "tie-up neck": ["V-Neck"], "keyhole neck": ["Round Neck"], "mock neck": ["High Neck"],
  "high neck": ["Mock Neck"], "scoop neck": ["Round Neck"],
  // Surface styling
  "embroidered": ["Thread Work", "NA"], "embellished": ["NA"], "sequined": ["Embellished", "NA"],
  "gathered or pleated": ["Gathers", "NA"], "smocked": ["Gathers", "NA"], "ruffles": ["Frills", "NA"],
  "tie-ups": ["NA"], "layered": ["NA"],
  // Length (dresses use Midi/Maxi, trousers use Regular/Three-Fourth)
  "ankle length": ["Maxi", "Regular"], "floor length": ["Maxi", "Regular"],
  "calf length": ["Midi", "Three-Fourth Length"], "knee length": ["Cropped"], "above knee": ["Cropped"],
  // Hemline
  "curved": ["Straight"], "asymmetric": ["High-Low"], "angular accents": ["Straight"],
  // Closure
  "na": ["Slip-On"], "none": ["NA", "Slip-On"], "elastic": ["Slip-On"], "zipper": ["Zip"], "button fly": ["Button"],
  // Fabric
  "chanderi cotton": ["Mul Chanderi", "Cotton Blend"], "pure cotton": ["Cotton"], "cotton": ["Pure Cotton"],
  "mulmul": ["Pure Cotton", "Cotton"], "viscose rayon": ["Rayon"], "rayon": ["Viscose Rayon"],
  "shantoon": ["Viscose Rayon"], "santoon": ["Viscose Rayon"],
  // Garment types
  "kurta": ["Tunic", "Top"], "palazzo": ["Palazzos"],
  // Design styling: yoke is print/embroidery placement, not a cut
  "yoke design": ["Regular"],
  // Colour
  "fuschia": ["Fuchsia"], "multi-color": ["Multi"], "multicolour": ["Multi"], "multicolor": ["Multi"],
};

export function colLettersToNumber(letters: string): number {
  return letters.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

/** Resolve a list formula like "masterdata!$X$2:$X$54" or "\"A,B,C\"" to its values. */
export function resolveListFormula(wb: ExcelJS.Workbook, formula: string, cache: Map<string, string[]>): string[] {
  const cached = cache.get(formula);
  if (cached) return cached;
  let vals: string[] = [];
  const inline = formula.match(/^"(.*)"$/);
  if (inline) {
    vals = inline[1].split(",").map((v) => v.trim()).filter(Boolean);
  } else {
    const m = formula.match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
    const src = m ? wb.getWorksheet(m[1]) : undefined;
    if (m && src) {
      const col = colLettersToNumber(m[2]);
      for (let r = Number(m[3]); r <= Number(m[5]); r++) {
        const v = src.getRow(r).getCell(col).value;
        if (v !== null && v !== undefined && String(v).trim()) vals.push(String(v).trim());
      }
    }
  }
  cache.set(formula, vals);
  return vals;
}

/** Map of 1-based column number → allowed dropdown values for that column. */
export function readSheetDropdowns(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, cache: Map<string, string[]>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (ws as any).dataValidations?.model as Record<string, { type?: string; formulae?: string[] }> | undefined;
  if (!model) return out;
  for (const [addr, dv] of Object.entries(model)) {
    if (dv?.type !== "list" || !dv.formulae?.[0]) continue;
    const m = addr.match(/^([A-Z]+)\d+/);
    if (!m) continue;
    const col = colLettersToNumber(m[1]);
    if (out.has(col)) continue;
    const vals = resolveListFormula(wb, dv.formulae[0], cache);
    if (vals.length) out.set(col, vals);
  }
  return out;
}

/** Snap a value to the column's dropdown: exact (any case) → alias → "Regular"↔"Regular Fit" style match. */
export function snapToDropdown(value: string, allowed: string[]): string {
  const lower = value.trim().toLowerCase();
  const byLower = new Map(allowed.map((a) => [a.toLowerCase(), a]));
  const exact = byLower.get(lower);
  if (exact) return exact;
  for (const alt of DROPDOWN_ALIASES[lower] || []) {
    const hit = byLower.get(alt.toLowerCase());
    if (hit) return hit;
  }
  if (lower.length >= 4) {
    const near = allowed
      .filter((a) => { const al = a.toLowerCase(); return al.startsWith(lower + " ") || lower.startsWith(al + " "); })
      .sort((a, b) => a.length - b.length);
    if (near.length) return near[0];
  }
  return value; // no safe match — leave as-is so it's visible rather than silently wrong
}

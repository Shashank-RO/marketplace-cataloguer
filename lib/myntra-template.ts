import ExcelJS from "exceljs";
import { ShopifyProduct } from "./shopify";

// Myntra catalog required/optional columns (Fashion – Apparel & Accessories)
const HEADERS = [
  "Seller SKU ID",
  "Product Name",
  "Brand",
  "Category",
  "Sub Category",
  "Gender",
  "Color",
  "Color Family",
  "Size",
  "MRP",
  "Selling Price",
  "Style Description",
  "Material",
  "Fabric",
  "Fit",
  "Occasion",
  "Pattern",
  "Sleeve",
  "Neck",
  "Closure",
  "Country of Origin",
  "HSN Code",
  "EAN / Barcode",
  "Weight (grams)",
  "Image URL 1",
  "Image URL 2",
  "Image URL 3",
  "Image URL 4",
  "Image URL 5",
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseTagMap(tags: string): Record<string, string> {
  const map: Record<string, string> = {};
  tags.split(",").forEach((t) => {
    const [k, v] = t.trim().split(":");
    if (k && v) map[k.trim().toLowerCase()] = v.trim();
  });
  return map;
}

export async function buildMyntraWorkbook(products: ShopifyProduct[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Myntra Catalog");

  // Header row styling
  ws.addRow(HEADERS);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF3F6C" } }; // Myntra pink
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const product of products) {
    const tagMap = parseTagMap(product.tags);
    const description = stripHtml(product.body_html);
    const imageUrls = product.images.slice(0, 5).map((i) => i.src);

    for (const variant of product.variants) {
      const color = variant.option1 || tagMap["color"] || "";
      const size = variant.option2 || variant.option1 || "";

      const row = [
        variant.sku || `${product.id}-${variant.id}`,
        product.title,
        product.vendor || "",
        product.product_type || tagMap["category"] || "",
        tagMap["sub_category"] || tagMap["subcategory"] || "",
        tagMap["gender"] || "",
        color,
        tagMap["color_family"] || color,
        size,
        variant.compare_at_price || variant.price,
        variant.price,
        description,
        tagMap["material"] || "",
        tagMap["fabric"] || tagMap["material"] || "",
        tagMap["fit"] || "",
        tagMap["occasion"] || "",
        tagMap["pattern"] || "",
        tagMap["sleeve"] || "",
        tagMap["neck"] || "",
        tagMap["closure"] || "",
        tagMap["country_of_origin"] || "India",
        tagMap["hsn"] || tagMap["hsn_code"] || "",
        tagMap["ean"] || tagMap["barcode"] || "",
        variant.weight ? Math.round(variant.weight * (variant.weight_unit === "kg" ? 1000 : 1)) : "",
        imageUrls[0] || "",
        imageUrls[1] || "",
        imageUrls[2] || "",
        imageUrls[3] || "",
        imageUrls[4] || "",
      ];

      ws.addRow(row);
    }
  }

  // Auto-width columns
  ws.columns.forEach((col) => {
    let maxLen = 10;
    if (col.eachCell) {
      col.eachCell({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
    }
    col.width = Math.min(maxLen + 2, 60);
  });

  return wb.xlsx.writeBuffer();
}

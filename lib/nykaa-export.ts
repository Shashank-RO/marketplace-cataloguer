import ExcelJS from "exceljs";
import { analyzeProductImage } from "./vision";
import type { ShopifyProduct } from "./shopify";

// ─── Constants ───────────────────────────────────────────────────────────────

const MANUFACTURER_NAME = "Zakoopi Infotech Pvt Ltd";
const MANUFACTURER_ADDRESS = "Zakoopi Infotech Pvt Ltd, A-46, Sec 57, Noida,Uttar Pradesh 201301";
const SHIPS_IN = "2";
const NET_QTY = "1N";
const MULTIPACK = "Single";
const OCCASION = "Any Occasion";
const GENDER = "Women";
const BRAND = "Rustorange";
const COUNTRY = "India";
const AGE = "16 Years And Above";

// Body measurements per size (to-fit)
// Body measurements (to-fit); garmentMeasurements() adds 2" for ease
const BODY_CHART: Record<string, { bust: number; chest: number; waist: number; hip: number; shoulder: number }> = {
  XS:    { bust: 32, chest: 32, waist: 30, hip: 36, shoulder: 13.5 },
  S:     { bust: 34, chest: 34, waist: 32, hip: 38, shoulder: 14   },
  M:     { bust: 36, chest: 36, waist: 34, hip: 40, shoulder: 14.5 },
  L:     { bust: 38, chest: 38, waist: 36, hip: 42, shoulder: 15   },
  XL:    { bust: 40, chest: 40, waist: 38, hip: 44, shoulder: 15.5 },
  XXL:   { bust: 42, chest: 42, waist: 40, hip: 46, shoulder: 16   },
  "3XL": { bust: 44, chest: 44, waist: 42, hip: 48, shoulder: 17   },
  "4XL": { bust: 46, chest: 46, waist: 44, hip: 50, shoulder: 17   },
  "5XL": { bust: 48, chest: 48, waist: 46, hip: 52, shoulder: 18   },
  "6XL": { bust: 50, chest: 50, waist: 48, hip: 54, shoulder: 18   },
};

// Garment = body + 2 for bust/chest/waist/hip; shoulder same
function garmentMeasurements(size: string) {
  const b = BODY_CHART[size];
  if (!b) throw new Error(`Unknown size "${size}" — no measurements available. Cannot export.`);
  return {
    bust:     b.bust + 2,
    chest:    b.chest + 2,
    waist:    b.waist + 2,
    hip:      b.hip + 2,
    shoulder: b.shoulder,
  };
}

// Vision length category → inches
const LENGTH_TO_INCHES: Record<string, number> = {
  "Above Knee":   40,
  "Knee Length":  42,
  "Calf Length":  46,
  "Ankle Length": 48,
  "Floor Length": 50,
};

// ─── Maps ────────────────────────────────────────────────────────────────────

function snapToMap(raw: string, map: Record<string, string>): string {
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return "";
}

const NYKAA_COLOR_MAP: Record<string, string> = {
  // English names
  "off white": "Off White", "white gold": "White Gold", "rose gold": "Rose Gold",
  "navy blue": "Navy Blue", "multi-color": "Multi-Color", "multicolour": "Multi-Color",
  "multicolor": "Multi-Color", "multi color": "Multi-Color",
  "beige": "Beige", "cream": "Cream", "ivory": "Ivory", "white": "White", "nude": "Nude",
  "black": "Black", "charcoal": "Charcoal",
  "navy": "Navy Blue", "indigo": "Indigo", "teal": "Teal",
  "turquoise": "Turquoise", "aqua": "Aqua", "blue": "Blue",
  "olive": "Olive", "green": "Green",
  "burgundy": "Burgundy", "maroon": "Maroon", "wine": "Wine", "red": "Red",
  "mauve": "Mauve", "magenta": "Magenta", "pink": "Pink",
  "coral": "Coral", "peach": "Peach", "rust": "Rust", "orange": "Orange",
  "mustard": "Mustard", "yellow": "Yellow",
  "lavender": "Lavender", "purple": "Purple",
  "taupe": "Taupe", "tan": "Tan", "brown": "Brown",
  "grey": "Grey", "gray": "Grey",
  "metallic": "Metallic", "silver": "Silver", "copper": "Copper", "bronze": "Bronze",
  "gold": "Gold", "blonde": "Blonde",
  "khaki": "Khaki",
  // Indian colour names
  "haldi": "Mustard", "peela": "Yellow", "peeli": "Yellow",
  "laal": "Red", "surkh": "Red",
  "gulabi": "Pink", "gulab": "Pink",
  "neela": "Blue", "neel": "Blue",
  "hari": "Green", "sabz": "Green", "mehendi": "Green", "mehndi": "Green",
  "safed": "White", "shwet": "White",
  "kala": "Black", "kaala": "Black",
  "narangi": "Orange",
  "jamuni": "Purple", "bainganee": "Purple",
  "sunehra": "Gold", "sona": "Gold",
  "chandi": "Silver",
  "rani pink": "Magenta", "rani": "Magenta",
  "kesari": "Orange",
  "sandalwood": "Beige", "sandal": "Beige",
  "champagne": "Beige",
  "terracotta": "Rust",
  "brick": "Rust",
  "mango": "Mustard",
  "saffron": "Orange",
};

function snapColor(raw: string): string {
  const lower = raw.toLowerCase();
  // Longest-key-first matching
  const sorted = Object.entries(NYKAA_COLOR_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [key, val] of sorted) {
    if (lower.includes(key)) return val;
  }
  return raw; // pass through if unknown
}

const NYKAA_FABRIC_MAP: [string, string][] = [
  ["acrylic blend", "Acrylic"],
  ["acrylic", "Acrylic"],
  ["modal satin", "Modal"],
  ["modal", "Modal"],
  ["pure cotton", "Cotton"],
  ["slub cotton", "Cotton"], ["mul cotton", "Cotton"], ["mulmul", "Cotton"],
  ["cotton blend", "Cotton"], ["cotton", "Cotton"],
  ["viscose rayon", "Viscose"],
  ["rayon", "Rayon"],
  ["georgette", "Georgette"],
  ["chiffon", "Chiffon"],
  ["crepe", "Crepe"],
  ["silk satin", "Silk"], ["silk", "Silk"],
  ["satin", "Satin"],
  ["linen", "Linen"],
  ["polyester", "Polyester"],
  ["nylon", "Nylon"],
  ["lycra", "Lycra"],
  ["elastane", "Elastane"],
  ["wool", "Wool"], ["woollen", "Wool"],
  ["net", "Net"],
  ["velvet", "Velvet"],
  ["denim", "Denim"],
  ["shantoon", "Cotton"],
];

function extractFabric(tagMap: Record<string, string>, description: string, title: string): string {
  const raw = tagMap["fabric"] || tagMap["material"] || tagMap["fabric1"] || "";
  if (raw) {
    const lower = raw.toLowerCase();
    for (const [key, val] of NYKAA_FABRIC_MAP) {
      if (lower.includes(key)) return val;
    }
    return raw;
  }
  const match = description.match(/\bMaterial\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:\.|,|$)/i);
  if (match) {
    const lower = match[1].trim().toLowerCase();
    for (const [key, val] of NYKAA_FABRIC_MAP) {
      if (lower.includes(key)) return val;
    }
    return match[1].trim();
  }
  const titleLower = title.toLowerCase();
  for (const [key, val] of NYKAA_FABRIC_MAP) {
    if (titleLower.includes(key)) return val;
  }
  return "";
}

const NYKAA_CARE_MAP: Record<string, string> = {
  "dry clean": "Dry clean recommended",
  "hand wash": "Hand wash recommended",
  "machine wash": "Regular Machine Wash",
  "machine-wash": "Regular Machine Wash",
};

function extractCare(tagMap: Record<string, string>, description: string): string {
  const raw = tagMap["wash_care"] || tagMap["wash care"] || tagMap["care"] || "";
  const text = (raw || description).toLowerCase();
  if (text.includes("dry clean")) return "Dry clean recommended";
  if (text.includes("hand wash")) return "Hand wash recommended";
  if (text.includes("machine wash")) return "Regular Machine Wash";
  return "Regular Machine Wash";
}

const NYKAA_SLEEVE_MAP: Record<string, string> = {
  "sleeveless": "Sleeveless",
  "cap": "Cap",
  "half sleeve": "Half Sleeves", "short sleeve": "Half Sleeves",
  "three fourth": "Three Fourth Sleeves", "three-fourth": "Three Fourth Sleeves",
  "3/4": "Three Fourth Sleeves", "3/4th": "Three Fourth Sleeves",
  "full sleeve": "Full Sleeves", "long sleeve": "Full Sleeves",
  "bell sleeve": "Bell Sleeves",
  "puff sleeve": "Puff Sleeves",
  "balloon sleeve": "Balloon Sleeve",
  "ruffled": "Ruffled Sleeves",
  "flared sleeve": "Flared Sleeves",
  "raglan": "Raglan Sleeves",
  "trumpet": "Trumpet Sleeves",
};

const NYKAA_NECK_MAP: Record<string, string> = {
  "round neck": "Round Neck", "crew neck": "Crew Neck",
  "v neck": "V-Neck", "v-neck": "V-Neck",
  "scoop neck": "Scoop Neck",
  "boat neck": "Boat Neck",
  "square neck": "Square Neck",
  "high neck": "High Neck", "turtle neck": "Turtle Neck", "mock neck": "Turtle Neck",
  "mandarin": "Mandarin Neck", "chinese collar": "Mandarin Neck",
  "sweetheart": "Sweetheart",
  "halter": "Halter Neck",
  "off shoulder": "Off Shoulder", "off-shoulder": "Off Shoulder",
  "one shoulder": "One Shoulder",
  "cowl": "Cowl Neck",
  "keyhole": "Keyhole Neck",
  "plunging": "Plunging Neck",
  "hooded": "Hooded",
  "collar": "Collar Neck",
  "tie up neck": "Tie Up Neck", "tie-up neck": "Tie Up Neck",
  "asymmetric": "Asymmetrical",
  "ruffled neck": "Ruffled Neck",
  "shoulder strap": "Shoulder Straps",
  "strapless": "Strapless/Tube", "tube": "Strapless/Tube",
  "henley": "Henley Neck",
  "racer back": "Racer Back",
  "open front": "Open Front",
};

const NYKAA_PATTERN_MAP: Record<string, string> = {
  "embroidered": "Embroidered", "embroidery": "Embroidered",
  "floral": "Floral", "flower": "Floral",
  "stripe": "Stripes", "stripes": "Stripes",
  "check": "Checks", "checked": "Checks", "plaid": "Checks",
  "geometric": "Geometric",
  "abstract": "Abstract",
  "solid": "Solid/Plain", "plain": "Solid/Plain",
  "tie dye": "Tie & Dye", "tie & dye": "Tie & Dye", "shibori": "Tie & Dye",
  "animal print": "Animal Print",
  "polka": "Polka Dots",
  "colorblock": "Colorblock", "colourblock": "Colorblock",
  "ethnic": "Ethnic",
  "ombre": "Ombre",
  "graphic": "Graphic",
  "self design": "Self Design",
  "woven": "Woven",
  "textured": "Textured",
  "printed": "Printed", "print": "Printed",
};

const NYKAA_TYPE_OF_WORK_MAP: Record<string, string> = {
  "embroidered": "Embroidered", "embroidery": "Embroidered",
  "block print": "Block Print",
  "hand block": "Hand Block",
  "zari": "Zari",
  "chikankari": "Chikankari",
  "bandhani": "Bandhani",
  "ikat": "Ikat",
  "printed": "Printed", "print": "Printed",
  "woven": "Woven",
  "mirror": "Mirror Work",
  "beads": "Beads and Stones",
  "thread": "Thread Work",
  "tassels": "Tassels",
  "gota": "Gota",
  "kalamkari": "Kalamkari",
  "leheriya": "Leheriya",
  "phulkari": "Phulkari",
  "zardozi": "Zardozi",
  "resham": "Resham Work",
  "patch": "Patch",
  "lace": "Lace Work",
  "stripe": "Stripes",
  "pleated": "Pleated",
  "floral": "Floral",
};

const NYKAA_FIT_MAP: Record<string, string> = {
  "a-line": "A-Line", "anarkali": "A-Line",
  "regular": "Regular",
  "straight": "Straight",
  "flared": "Flared",
  "slim": "Slim",
  "fitted": "Fitted",
  "loose": "Loose",
  "oversized": "Oversized",
  "bodycon": "Bodycon",
  "wrap": "Wrap",
  "peplum": "Peplum",
  "empire": "Empire",
  "relaxed": "Relaxed",
};

const NYKAA_CLOSURE_MAP: Record<string, string> = {
  "none": "None",
  "pull on": "Pull On",
  "button": "Button Fly",
  "zip": "Zip", "zipper": "Zipper",
  "hook": "Hook and Eye",
  "tie": "Tie-Up",
  "lace": "Lace",
  "snap": "Snap Button",
  "elastic": "Elastic",
};

const NYKAA_DRESS_SHAPE_MAP: Record<string, string> = {
  "a-line": "A-Line", "anarkali": "A-Line",
  "wrap": "Wrap",
  "shirt": "Shirt",
  "bodycon": "Bodycon",
  "empire": "Empire",
  "peplum": "Peplum",
  "kaftan": "Kaftan",
  "drop waist": "Drop Waist",
  "pinafore": "Pinafore",
  "flared": "Flared",
  "balloon": "Balloon",
};

const NYKAA_DRESS_SUBCATEGORY_MAP: Record<string, string> = {
  "above knee": "Mini",
  "knee": "Knee Length",
  "midi": "Midi",
  "calf": "Midi",
  "maxi": "Maxi",
  "floor": "Maxi",
  "ankle": "Maxi",
  "kaftan": "Kaftan Dresses",
};

const NYKAA_SETS_SUBCATEGORY_MAP: Record<string, string> = {
  "kurta set": "Kurta Sets",
  "kurta sets": "Kurta Sets",
  "co-ord": "Co-ord Set",
  "coord": "Co-ord Set",
  "salwar": "Salwar Suit Sets",
  "palazzo": "Palazzo sets",
  "sharara": "Sharara Sets",
  "anarkali": "Anarkali Sets",
  "dhoti": "Dhoti Sets",
};

const NYKAA_BOTTOMS_MAP: Record<string, string> = {
  "palazzo": "Palazzos",
  "pant": "Pants", "trouser": "Trousers",
  "salwar": "Salwars",
  "legging": "Leggings",
  "skirt": "Skirts",
  "sharara": "Sharara",
  "churidar": "Churidar",
  "dhoti": "Dhotis",
  "pyjama": "Pyjama",
  "culotte": "Culottes",
};

const NYKAA_LEG_STYLE_MAP: Record<string, string> = {
  "straight": "Straight",
  "flared": "Flared",
  "wide": "Wide",
  "tapered": "Tapered",
  "ankle": "Ankle",
  "skinny": "Skinny",
  "boot cut": "Boot Cut", "bootcut": "Boot Cut",
  "cropped": "Cropped",
  "slim": "Slim",
};

const NYKAA_TOPWEAR_LENGTH_MAP: Record<string, string> = {
  "crop": "Crop",
  "longline": "Longline",
};

const HSN_MAP: Record<string, string> = {
  "wool": "61143010", "acrylic": "61143010", "acrylic blend": "61143010",
  "cotton": "62064000", "rayon": "62064000", "viscose": "62064000",
  "polyester": "62064000", "linen": "62064000", "silk": "62064000",
  "georgette": "62064000", "chiffon": "62064000",
};

function extractHSN(fabric: string): string {
  const lower = fabric.toLowerCase();
  if (lower.includes("wool") || lower.includes("acrylic")) return "61143010";
  return "62064000";
}

function extractTagMap(tags: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tag of tags.split(",")) {
    const t = tag.trim();
    const idx = t.indexOf(":");
    if (idx > 0) {
      const k = t.slice(0, idx).trim().toLowerCase();
      const v = t.slice(idx + 1).trim();
      map[k] = v;
    }
  }
  return map;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractArticleNumber(sku: string): string {
  // ZKP1184BM1674K-S → BM1674K
  const m = sku.match(/(BM\d+[A-Z]?)(?:-|$)/);
  return m ? m[1] : sku;
}

function extractColourFromTitle(title: string): string {
  const m = title.match(/[-–]\s*([A-Za-z][A-Za-z\s]+)$/);
  return m ? m[1].trim() : "";
}

function lengthCategoryToInches(cat: string): number | null {
  const map: Record<string, number> = {
    "Above Knee":   40,
    "Knee Length":  42,
    "Calf Length":  46,
    "Ankle Length": 48,
    "Floor Length": 50,
  };
  return map[cat] ?? null;
}

// ─── Sheet routing ────────────────────────────────────────────────────────────

type NykaaSheet = "Kurtis and Kurtas" | "Ethnic Dresses" | "Salwar Suits Sets Women Girls" | "Tops";

function getSheetForProductType(productType: string): NykaaSheet | null {
  const pt = productType.toLowerCase().trim();
  if (pt.includes("kurta set") || pt.includes("kurta sets") || pt.includes("co-ord") || pt.includes("coord") ||
      pt === "sets" || pt === "set") {
    return "Salwar Suits Sets Women Girls";
  }
  if (pt === "kurtas" || pt === "kurta" || pt === "kurtis" || pt === "kurti") {
    return "Kurtis and Kurtas";
  }
  if (pt.includes("dress")) return "Ethnic Dresses";
  if (pt === "tops" || pt === "top" || pt === "tunic" || pt === "tunics") return "Tops";
  return null;
}

function getSetsSubcategory(productType: string): string {
  const pt = productType.toLowerCase();
  if (pt.includes("co-ord") || pt.includes("coord")) return "Co-ord Set";
  if (pt.includes("palazzo")) return "Palazzo sets";
  if (pt.includes("sharara")) return "Sharara Sets";
  if (pt.includes("anarkali")) return "Anarkali Sets";
  return "Kurta Sets";
}

function getPackContains(productType: string): string {
  const pt = productType.toLowerCase();
  if (pt.includes("set") || pt.includes("co-ord") || pt.includes("coord")) return "1 Kurta 1 Pant";
  if (pt.includes("dress")) return "1 Dress";
  if (pt === "tops" || pt === "top" || pt.includes("tunic")) return "1 Top";
  return "1 Kurta";
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function fillNykaaTemplates(
  templateBuffers: {
    kurtis: Buffer | ArrayBuffer;
    tops: Buffer | ArrayBuffer;
    dresses: Buffer | ArrayBuffer;
    sets: Buffer | ArrayBuffer;
  },
  products: ShopifyProduct[],
  options: { season: string },
): Promise<{ buffer: Buffer; categories: string[] }> {
  // Load all 4 template workbooks
  const workbooks: Record<NykaaSheet, ExcelJS.Workbook> = {
    "Kurtis and Kurtas":            new ExcelJS.Workbook(),
    "Tops":                         new ExcelJS.Workbook(),
    "Ethnic Dresses":               new ExcelJS.Workbook(),
    "Salwar Suits Sets Women Girls": new ExcelJS.Workbook(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadBuf = (wb: ExcelJS.Workbook, b: Buffer | ArrayBuffer) => wb.xlsx.load(b as any);
  await loadBuf(workbooks["Kurtis and Kurtas"], templateBuffers.kurtis);
  await loadBuf(workbooks["Tops"], templateBuffers.tops);
  await loadBuf(workbooks["Ethnic Dresses"], templateBuffers.dresses);
  await loadBuf(workbooks["Salwar Suits Sets Women Girls"], templateBuffers.sets);

  // Track which sheets got data
  const sheetsUsed = new Set<NykaaSheet>();

  // Pre-compute Design Code groups: products sharing the same base title (strip " - Colour" suffix)
  // get the same Design Code — the VAN of the first product in that group.
  const designCodeMap = new Map<string, string>(); // productId → groupVAN
  const baseNameToDesignCode = new Map<string, string>();
  for (const p of products) {
    const baseName = p.title.replace(/\s*-\s*[^-]+$/, "").trim().toLowerCase();
    const van = extractArticleNumber(p.variants[0]?.sku || "");
    if (!baseNameToDesignCode.has(baseName)) baseNameToDesignCode.set(baseName, van);
    designCodeMap.set(p.id, baseNameToDesignCode.get(baseName)!);
  }

  for (const product of products) {
    const sheetName = getSheetForProductType(product.product_type || "");
    if (!sheetName) continue;

    const wb = workbooks[sheetName];
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;

    // Build header→col map from row 3
    const headerRow = ws.getRow(3);
    const colMap: Record<string, number> = {};
    headerRow.eachCell((cell, col) => {
      if (cell.value) colMap[String(cell.value).toLowerCase().trim()] = col;
    });

    const tagMap = extractTagMap(product.tags || "");
    const description = stripHtml(product.body_html || "");
    const productType = product.product_type || "";
    const imageUrls = product.images.map((img) =>
      img.src.replace(/_\d+x\d+(\.[a-z]+(\?.*)?)?$/i, (m, ext) => ext || "")
               .replace(/\.png(\?.*)?$/i, ".jpg$1")
    );

    // Run vision on first image once per product
    const vision = imageUrls[0] ? await analyzeProductImage(imageUrls[0]) : null;

    const fabric = extractFabric(tagMap, description, product.title);
    const hsn = extractHSN(fabric);
    const care = extractCare(tagMap, description);
    // Colour: vision dominantColor is already a valid Nykaa value; fall back to keyword-map matching
    const rawColour = extractColourFromTitle(product.title) || product.variants[0]?.option2 || product.variants[0]?.option1 || "";
    const colour = (vision?.dominantColor && vision.dominantColor.trim()) ? vision.dominantColor.trim() : snapColor(rawColour);
    const van = extractArticleNumber(product.variants[0]?.sku || "");

    // Vision-derived attributes
    const sleeveLength = vision?.sleeveLength
      ? (snapToMap(vision.sleeveLength, NYKAA_SLEEVE_MAP) || vision.sleeveLength)
      : snapToMap(tagMap["sleeve_length"] || tagMap["sleeve"] || description, NYKAA_SLEEVE_MAP);

    const neckline = vision?.neck
      ? (snapToMap(vision.neck, NYKAA_NECK_MAP) || vision.neck)
      : snapToMap(tagMap["neck"] || tagMap["neckline"] || description, NYKAA_NECK_MAP);

    const pattern = snapToMap(
      tagMap["pattern"] || tagMap["print"] || description,
      NYKAA_PATTERN_MAP,
    ) || (vision?.pattern ? (snapToMap(vision.pattern, NYKAA_PATTERN_MAP) || vision.pattern) : "Printed");

    const typeOfWork = snapToMap(
      tagMap["type_of_work"] || tagMap["work"] || tagMap["embellishment"] || description,
      NYKAA_TYPE_OF_WORK_MAP,
    ) || pattern;

    // Per-sheet specific
    const isSet = sheetName === "Salwar Suits Sets Women Girls";
    const isDress = sheetName === "Ethnic Dresses";
    const isTops = sheetName === "Tops";

    const fit = snapToMap(
      tagMap["fit"] || tagMap["silhouette"] || tagMap["shape"] || "",
      NYKAA_FIT_MAP,
    ) || ((!isSet && vision?.shape) ? (snapToMap(vision.shape, NYKAA_FIT_MAP) || "Regular") : "Regular");

    const closure = snapToMap(
      tagMap["closure"] || tagMap["fastening"] || "",
      NYKAA_CLOSURE_MAP,
    ) || "Pull On";

    // Length in inches from vision
    // For sets: use topLength (kurta top hem); for single garments: use overall length
    const lengthCategory = isSet
      ? (vision?.topLength || vision?.length || "")
      : (vision?.length || "");
    const lengthInches = lengthCategoryToInches(lengthCategory);

    // Model details
    const modelDetails = `Model height is 5'5" and is wearing size XS`;

    const packContains = getPackContains(productType);

    const dressShape = isDress
      ? (snapToMap(tagMap["shape"] || tagMap["silhouette"] || description, NYKAA_DRESS_SHAPE_MAP) ||
         (vision?.shape ? snapToMap(vision.shape, NYKAA_DRESS_SHAPE_MAP) : "") || "A-Line")
      : "";

    const dressSubcategory = isDress
      ? (snapToMap(lengthCategory || tagMap["length"] || "", NYKAA_DRESS_SUBCATEGORY_MAP) || "Midi")
      : "";

    const setsSubcategory = isSet ? getSetsSubcategory(productType) : "";

    const bottomsType = isSet ? (() => {
      // 1. Explicit tag
      const explicit = snapToMap(tagMap["bottom_type"] || tagMap["bottom"] || "", NYKAA_BOTTOMS_MAP);
      if (explicit) return explicit;
      // 2. Vision AI bottomType
      const visionBottom = vision?.bottomType ? snapToMap(vision.bottomType, NYKAA_BOTTOMS_MAP) : "";
      if (visionBottom) return visionBottom;
      // 3. Infer from product type string
      const pt = productType.toLowerCase();
      if (pt.includes("palazzo")) return "Palazzos";
      if (pt.includes("sharara")) return "Sharara";
      if (pt.includes("skirt")) return "Skirts";
      if (pt.includes("dhoti")) return "Dhotis";
      if (pt.includes("churidar")) return "Churidar";
      if (pt.includes("pyjama")) return "Pyjama";
      if (pt.includes("salwar")) return "Salwars";
      if (pt.includes("legging")) return "Leggings";
      return "Pants";
    })() : "";

    const legStyle = isSet ? (() => {
      // 1. Explicit tag
      const explicit = snapToMap(tagMap["leg_style"] || "", NYKAA_LEG_STYLE_MAP);
      if (explicit) return explicit;
      // 2. Vision AI bottomType → leg style inference
      const visionBt = (vision?.bottomType || "").toLowerCase();
      if (visionBt) {
        if (visionBt.includes("palazzo") || visionBt.includes("sharara")) return "Flared";
        if (visionBt.includes("salwar")) return "Straight";
        if (visionBt.includes("wide")) return "Wide";
        if (visionBt.includes("slim") || visionBt.includes("skinny")) return "Slim";
        if (visionBt.includes("churidar") || visionBt.includes("tapered")) return "Tapered";
        if (visionBt.includes("cropped")) return "Cropped";
      }
      // 3. Infer from tag / product type string
      const bt = (tagMap["bottom_type"] || tagMap["bottom"] || productType).toLowerCase();
      if (bt.includes("palazzo") || bt.includes("sharara") || bt.includes("flared")) return "Flared";
      if (bt.includes("salwar")) return "Straight";
      if (bt.includes("wide")) return "Wide";
      if (bt.includes("slim") || bt.includes("skinny")) return "Slim";
      if (bt.includes("tapered") || bt.includes("churidar")) return "Tapered";
      if (bt.includes("cropped")) return "Cropped";
      return "Straight";
    })() : "";

    const topwearLength = isTops
      ? (snapToMap(tagMap["length"] || lengthCategory, NYKAA_TOPWEAR_LENGTH_MAP) || "Regular")
      : "";

    sheetsUsed.add(sheetName);

    // ── Write one row per variant ──
    const SIZE_PATTERN = /^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d+)$/i;

    for (const variant of product.variants) {
      const size = (variant.option1 ?? "S").toUpperCase();
      const body = BODY_CHART[size] || BODY_CHART["S"];
      const garment = garmentMeasurements(size);
      const baseSku = variant.sku || `${product.id}-${variant.id}`;
      const hasSizeSuffix = size && new RegExp(`-${size}$`, "i").test(baseSku);
      const sku = hasSizeSuffix ? baseSku : size ? `${baseSku}-${size}` : baseSku;

      const colourFromOption = SIZE_PATTERN.test((variant.option1 ?? "").trim())
        ? (variant.option2 || "")
        : (variant.option1 ?? "");
      const variantColour = colour || snapColor(colourFromOption);

      const nextRow = (ws.lastRow?.number || 3) + 1;
      const row = ws.getRow(nextRow);

      function set(header: string, value: string | number | null) {
        const col = colMap[header.toLowerCase().trim()];
        if (col && value !== null && value !== "") row.getCell(col).value = value;
      }

      set("vendor sku code", sku);
      set("gender", GENDER);
      set("brand name", BRAND);
      set("style code", van);
      set("product name", product.title);
      set("description", description);
      set("price", Number(variant.price) || Number(product.variants[0]?.price) || 0);
      set("color", variantColour);
      set("country of origin", COUNTRY);
      set("manufacturer name", MANUFACTURER_NAME);
      set("manufacturer address", MANUFACTURER_ADDRESS);
      set("brand  size", size);
      set("multipack set", MULTIPACK);
      set("design code", designCodeMap.get(product.id) || van);
      set("occasion", OCCASION);
      set("season", options.season);
      set("care instruction", care);
      set("ships in days", SHIPS_IN);
      set("ships in", SHIPS_IN);
      set("hsn codes", hsn);
      set("pack contains", packContains);
      set("net qty", NET_QTY);
      set("material", fabric);
      set("fit", fit);
      set("closure", closure);
      set("sleeve length type", sleeveLength);
      set("pattern", pattern);
      set("type of work", typeOfWork);
      set("neckline", neckline);
      set("model details", modelDetails);

      // Pocket description
      const hasPocket = description.toLowerCase().includes("pocket") || (tagMap["pockets"] && tagMap["pockets"] !== "0");
      if (hasPocket) set("pocket description", "Slit Pocket");

      // Sheet-specific fields
      if (isDress) {
        set("dress shape", dressShape);
        set("ethnic dresses subcategory", dressSubcategory);
        if (lengthInches) set("length (inches)", lengthInches);
      }

      if (isSet) {
        set("salwar suits &  sets subcategory", setsSubcategory);
        set("bottoms type", bottomsType);
        set("leg style", legStyle);
        set("rise style", "Mid Waist");
        if (lengthInches) set("length (inches)", lengthInches);
        set("inseam for garment (inches)", 27);
        set("inseam for body (inches)", 27);
      }

      if (isTops) {
        set("category classification", "Indianwear");
        set("shirts tops and crop tops subcategory", "Tunics");
        set("topwear length", topwearLength);
        set("style bucket", "Fashion");
      }

      // Garment measurements
      set("bust for garment (inches)", garment.bust);
      set("chest for garment (inches)", garment.chest);
      set("waist for garment (inches)", garment.waist);
      if (!isTops) set("hip for garment (inches)", garment.hip);
      set("shoulder for garment (inches)", garment.shoulder);
      if (sleeveLength && sleeveLength !== "Sleeveless") {
        // Sleeve length inches per size
        const sleeveInches: Record<string, number> = { XS: 13.5, S: 14, M: 14.5, L: 15, XL: 15.5, XXL: 16 };
        set("sleeve length (inches)", sleeveInches[size] || 14);
      }

      // Body measurements
      set("bust for body (inches)", body.bust);
      set("chest for body (inches)", body.chest);
      set("waist for body (inches)", body.waist);
      if (!isTops) set("hip for body (inches)", body.hip);
      set("shoulder for body (inches)", body.shoulder);
      if (lengthInches) {
        set("length (inches)", lengthInches);
        set("length for body (inches)", lengthInches);
      }

      // Images (up to 9 slots: front, back, additional 1–8 → cols front image … additional image 8)
      const imgSlots = ["front image", "back image", "additional image 1", "additional image 2",
        "additional image 3", "additional image 4", "additional image 5", "additional image 6",
        "additional image 7", "additional image 8"];
      imgSlots.forEach((slot, i) => {
        if (imageUrls[i]) set(slot, imageUrls[i]);
      });

      row.commit();
    }
  }

  // Build combined output: one workbook per used sheet, zipped as separate files
  // We return a zip buffer containing all relevant workbooks
  // Since Nykaa expects separate files per category, we pack them into a zip
  const JSZip = require("jszip");
  const zip = new JSZip();

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const datePfx = `${dd}${mm}${yy}`;

  const fileMap: Record<NykaaSheet, string> = {
    "Kurtis and Kurtas": `${datePfx} Nykaa Kurtis.xlsx`,
    "Ethnic Dresses": `${datePfx} Nykaa Dresses.xlsx`,
    "Salwar Suits Sets Women Girls": `${datePfx} Nykaa Sets.xlsx`,
    "Tops": `${datePfx} Nykaa Tops.xlsx`,
  };

  const categoryLabels: Record<NykaaSheet, string> = {
    "Kurtis and Kurtas": "Kurtis",
    "Ethnic Dresses": "Dresses",
    "Salwar Suits Sets Women Girls": "Sets",
    "Tops": "Tops",
  };

  const categories: string[] = [];
  for (const sheetName of sheetsUsed) {
    const buf = await workbooks[sheetName].xlsx.writeBuffer();
    zip.file(fileMap[sheetName], buf);
    categories.push(categoryLabels[sheetName]);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, categories };
}

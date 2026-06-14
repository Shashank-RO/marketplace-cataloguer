import ExcelJS from "exceljs";
import { ShopifyProduct } from "./shopify";
import { analyzeProductImage, VisionAttributes } from "./vision";

// ─── Constants ───────────────────────────────────────────────────────────────

const MANUFACTURER = "Zakoopi Infotech Pvt Ltd, A-46, Sec 57, Noida,Uttar Pradesh 201301";
const BRAND = "Rustorange";

// HSN logic (priority order):
// 1. Winter/woollen fabric (acrylic/woollen) → 62064000
// 2. Sets (Kurta Sets, Co-Ords) → 62114210
// 3. Dresses / Ethnic Dresses → 62044220
// 4. Everything else → 62114290

// Standard garment measurements per size — Rustorange official size chart
// Rule: Garment Bust/Waist/Hips = To Fit + 2. Shoulder = same for both.
// To Fit Hip = To Fit Bust + 4 (consistent across all sizes).
// Lower (pants/palazzos): Outseam=34, Inseam=25, Rise=9 — fixed all sizes (lower length = 39" total).
// Pyjama/Garment Waist (lower) = To Fit Waist + 2.
const SIZE_CHART: Record<string, {
  shoulder: number; bust: number; chest: number; hips: number; waist: number;
  toFitBust: number; toFitHip: number; toFitWaist: number;
  inseam: number; outseam: number; rise: number; pyjama: number;
}> = {
  XS:    { shoulder: 13.5, bust: 34, chest: 34, hips: 38, waist: 32, toFitBust: 32, toFitHip: 36, toFitWaist: 30, inseam: 25, outseam: 34, rise: 9, pyjama: 32 },
  S:     { shoulder: 14,   bust: 36, chest: 36, hips: 40, waist: 34, toFitBust: 34, toFitHip: 38, toFitWaist: 32, inseam: 25, outseam: 34, rise: 9, pyjama: 34 },
  M:     { shoulder: 14.5, bust: 38, chest: 38, hips: 42, waist: 36, toFitBust: 36, toFitHip: 40, toFitWaist: 34, inseam: 25, outseam: 34, rise: 9, pyjama: 36 },
  L:     { shoulder: 15,   bust: 40, chest: 40, hips: 44, waist: 38, toFitBust: 38, toFitHip: 42, toFitWaist: 36, inseam: 25, outseam: 34, rise: 9, pyjama: 38 },
  XL:    { shoulder: 15.5, bust: 42, chest: 42, hips: 46, waist: 40, toFitBust: 40, toFitHip: 44, toFitWaist: 38, inseam: 25, outseam: 34, rise: 9, pyjama: 40 },
  XXL:   { shoulder: 16,   bust: 44, chest: 44, hips: 48, waist: 42, toFitBust: 42, toFitHip: 46, toFitWaist: 40, inseam: 25, outseam: 34, rise: 9, pyjama: 42 },
  "3XL": { shoulder: 17,   bust: 46, chest: 46, hips: 50, waist: 44, toFitBust: 44, toFitHip: 48, toFitWaist: 42, inseam: 25, outseam: 34, rise: 9, pyjama: 44 },
  "4XL": { shoulder: 17,   bust: 48, chest: 48, hips: 52, waist: 46, toFitBust: 46, toFitHip: 50, toFitWaist: 44, inseam: 25, outseam: 34, rise: 9, pyjama: 46 },
  "5XL": { shoulder: 18,   bust: 50, chest: 50, hips: 54, waist: 48, toFitBust: 48, toFitHip: 52, toFitWaist: 46, inseam: 25, outseam: 34, rise: 9, pyjama: 48 },
  "6XL": { shoulder: 18,   bust: 52, chest: 52, hips: 56, waist: 50, toFitBust: 50, toFitHip: 54, toFitWaist: 48, inseam: 25, outseam: 34, rise: 9, pyjama: 50 },
};

// Length text → Front Length inches (user-defined rule)
const LENGTH_INCHES: Record<string, number> = {
  "Above Knee": 42,
  "Knee Length": 44,
  "Calf Length": 46,
  "Ankle Length": 48,
  "Floor Length": 50,
};

// ─── Sheet name matching ──────────────────────────────────────────────────────

// Explicit Shopify product_type → Myntra sheet name overrides (priority-ordered list)
const SHEET_OVERRIDES: Record<string, string[]> = {
  "dresses":      ["Ethnic Dresses", "Dresses"],
  "dress":        ["Ethnic Dresses", "Dresses"],
  "co-ord set":   ["Co-Ords", "Co-ord Sets", "Coord Sets"],
  "co-ord sets":  ["Co-Ords", "Co-ord Sets", "Coord Sets"],
  "coord set":    ["Co-Ords", "Co-ord Sets", "Coord Sets"],
  "coord sets":   ["Co-Ords", "Co-ord Sets", "Coord Sets"],
  "kurta set":    ["Kurta Sets", "Kurta Set"],
  "kurta sets":   ["Kurta Sets", "Kurta Set"],
  "tops":         ["Tunics", "Tops / Tunics", "Tops"],
  "top":          ["Tunics", "Tops / Tunics", "Tops"],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/sets?$/, "set").replace(/s$/, "");
}

export function findMatchingSheet(productType: string, sheetNames: string[]): string | null {
  // 1. Check explicit overrides first (try each candidate in priority order)
  const overrides = SHEET_OVERRIDES[productType.toLowerCase().trim()];
  if (overrides) {
    for (const candidate of overrides) {
      const found = sheetNames.find((s) => s.toLowerCase() === candidate.toLowerCase());
      if (found) return found;
    }
  }

  // 2. Exact normalised match
  const normType = norm(productType);
  let match = sheetNames.find((s) => norm(s) === normType);
  if (match) return match;

  // 3. Contains match (fuzzy fallback)
  match = sheetNames.find((s) => norm(s).includes(normType) || normType.includes(norm(s)));
  return match ?? null;
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Parse Shopify tags into a lowercase key→value map */
function parseTagMap(tags: string): Record<string, string> {
  const map: Record<string, string> = {};
  tags.split(",").forEach((t) => {
    const trimmed = t.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      map[trimmed.slice(0, colonIdx).trim().toLowerCase()] = trimmed.slice(colonIdx + 1).trim();
    } else {
      map[trimmed.toLowerCase()] = trimmed; // tag is also its own value
    }
  });
  return map;
}

/** Extract article number from SKU: "ZKP1181BM1761K-S" → "BM1761K" */
function extractArticleNumber(sku: string): string {
  if (!sku) return "";
  // Remove ZKP prefix + digits
  const withoutZkp = sku.replace(/^ZKP\d+/i, "");
  // Remove trailing -SIZE suffix
  return withoutZkp.replace(/-[A-Z0-9]+$/i, "");
}

/** Extract colour from product title: "Kashmira Kurta - Charcoal" → "Charcoal" */
function extractColourFromTitle(title: string): string {
  const match = title.match(/-\s*(.+)$/);
  return match ? match[1].trim() : "";
}

/** Simplify a colour name for Prominent Colour: "Transformative Teal" → "Teal", "Off White" → "Off White" */
function simplifyColour(colour: string): string {
  const words = colour.split(" ");
  if (words.length > 1) {
    // Keep only the last meaningful word(s) — drop adjectives like "Transformative", "Vibrant" etc.
    const lastWord = words[words.length - 1];
    // Keep "Off White", "Dark Blue" etc as-is if second word is a colour name
    const commonAdjectives = ["transformative","vibrant","electric","bold","rich","deep","light","bright","soft","warm","cool","dusty","muted"];
    if (commonAdjectives.some(a => words[0].toLowerCase() === a)) return words.slice(1).join(" ");
  }
  return colour;
}

/** Determine garment length text from tags/description, snapped to Myntra values */
function extractLength(tagMap: Record<string, string>, description: string): string {
  const allText = Object.values(tagMap).join(" ") + " " + description;
  return snapToMap(allText, LENGTH_MAP);
}

// ─── Colour normalisation ─────────────────────────────────────────────────────

// All allowed Myntra Prominent Colour values — order matters (longer/specific first)
const COLOUR_MAP: [string, string][] = [
  // Multi-word exact phrases first
  ["off white", "Off White"],
  ["rose gold", "Rose Gold"],
  ["navy blue", "Navy Blue"],
  ["sea green", "Sea Green"],
  ["turquoise blue", "Turquoise Blue"],
  ["lime green", "Lime Green"],
  ["fluorescent green", "Fluorescent Green"],
  ["grey melange", "Grey Melange"],
  ["camel brown", "Camel Brown"],
  ["coffee brown", "Coffee Brown"],
  // Reds / Warm
  ["maroon", "Maroon"],
  ["burgundy", "Burgundy"],
  ["rust", "Rust"],
  ["coral", "Coral"],
  ["magenta", "Magenta"],
  ["fuchsia", "Fuchsia"],
  ["red", "Red"],
  // Oranges / Yellows
  ["mustard", "Mustard"],
  ["champagne", "Champagne"],
  ["orange", "Orange"],
  ["peach", "Peach"],
  ["gold", "Gold"],
  ["yellow", "Yellow"],
  // Greens
  ["olive", "Olive"],
  ["khaki", "Khaki"],
  ["teal", "Teal"],
  ["turquoise", "Turquoise Blue"],
  ["aqua", "Turquoise Blue"],
  ["lime", "Lime Green"],
  ["fluorescent", "Fluorescent Green"],
  ["sea", "Sea Green"],
  ["green", "Green"],
  // Blues
  ["navy", "Navy Blue"],
  ["indigo", "Navy Blue"],
  ["ink", "Navy Blue"],
  ["cobalt", "Blue"],
  ["royal blue", "Blue"],
  ["sky blue", "Blue"],
  ["powder blue", "Blue"],
  ["steel blue", "Blue"],
  ["blue", "Blue"],
  // Purples / Pinks
  ["violet", "Violet"],
  ["lavender", "Lavender"],
  ["mauve", "Mauve"],
  ["lilac", "Lavender"],
  ["purple", "Purple"],
  ["berry", "Burgundy"],
  ["wine", "Maroon"],
  ["plum", "Purple"],
  ["orchid", "Mauve"],
  ["rose", "Rose"],
  ["blush", "Pink"],
  ["pink", "Pink"],
  // Whites / Creams / Nudes
  ["ivory", "Cream"],
  ["cream", "Cream"],
  ["off-white", "Off White"],
  ["ecru", "Beige"],
  ["beige", "Beige"],
  ["nude", "Nude"],
  ["taupe", "Taupe"],
  ["white", "White"],
  // Greys / Silvers / Metallics
  ["charcoal", "Charcoal"],
  ["melange", "Grey Melange"],
  ["silver", "Silver"],
  ["metallic", "Metallic"],
  ["grey", "Grey"],
  ["gray", "Grey"],
  ["slate", "Grey"],
  // Blacks
  ["black", "Black"],
  // Browns / Tans
  ["camel", "Camel Brown"],
  ["coffee", "Coffee Brown"],
  ["chocolate", "Brown"],
  ["chestnut", "Brown"],
  ["mocha", "Coffee Brown"],
  ["tan", "Tan"],
  ["brown", "Brown"],
  // Metallics
  ["copper", "Copper"],
  ["bronze", "Bronze"],
  ["steel", "Steel"],
  // Multis
  ["multi", "Multi"],
  ["assorted", "Assorted"],
  ["transparent", "Transparent"],
];

const ALLOWED_COLOURS = new Set([
  "Red","Blue","Green","Black","Purple","White","Pink","Grey","Brown","Yellow","Orange",
  "Navy Blue","Maroon","Cream","Silver","Gold","Tan","Beige","Peach","Multi","Copper",
  "Steel","Olive","Khaki","Rose","Taupe","Off White","Metallic","Charcoal","Grey Melange",
  "Turquoise Blue","Coffee Brown","Sea Green","Lavender","Lime Green","Magenta","Burgundy",
  "Teal","Nude","Bronze","Fluorescent Green","Rust","Mustard","NA","Mauve","Coral",
  "Rose Gold","Assorted","Champagne","Fuchsia","Violet","Camel Brown","Transparent",
]);

function snapColour(raw: string): string {
  // If already a valid Myntra colour, return as-is
  if (ALLOWED_COLOURS.has(raw)) return raw;
  const lower = raw.toLowerCase();
  for (const [key, val] of COLOUR_MAP) {
    if (lower.includes(key)) return val;
  }
  return "Multi"; // safe fallback — always a valid dropdown value
}

function deriveColourFamily(prominentColour: string): string {
  const c = prominentColour.toLowerCase();
  if (["white","off white","cream","ivory","beige","nude","silver","grey","charcoal","black"].some(x => c.includes(x))) return "Monochrome";
  if (["red","coral","orange","peach","rust","brown","camel","tan","coffee","copper","bronze","mustard","gold"].some(x => c.includes(x))) return "Earthy";
  if (["lavender","mauve","pink","rose","peach","lilac","champagne"].some(x => c.includes(x))) return "Pastel";
  if (["teal","turquoise","aqua","sea green"].some(x => c.includes(x))) return "Aqua";
  if (["navy","indigo","ink"].some(x => c.includes(x))) return "Indigo";
  return "Bright";
}

const BOTTOM_TYPE_MAP_SETS: Record<string, string> = {
  "palazzo": "Palazzos", "patiala": "Patiala", "salwar": "Salwar",
  "sharara": "Sharara", "trouser": "Trousers", "pant": "Trousers",
  "harem": "Harem Pants", "dhoti": "Dhoti Pants", "pyjama": "Pyjamas",
  "churidar": "Churidar", "legging": "Leggings", "skirt": "Skirt",
};

const BOTTOM_TYPE_MAP_COORDS: Record<string, string> = {
  "palazzo": "Palazzos", "skirt": "Skirt", "short": "Shorts",
  "jogger": "Joggers", "capri": "Capris", "legging": "Leggings",
  "trouser": "Trousers", "pant": "Trousers",
};

const CLOSURE_MAP: Record<string, string> = {
  "zip": "Zip", "zipper": "Zip", "concealed zip": "Concealed Zip",
  "button": "Button", "hook": "Hook and Eye",
};

// ─── Myntra allowed-value maps ────────────────────────────────────────────────
// Maps free-text fabric/attribute values → exact Myntra dropdown values.
// Keys are lowercase substrings; first match wins (order matters).

const FABRIC_MAP: [string, string][] = [
  ["slub cotton", "Cotton"],
  ["mul cotton", "Cotton"],
  ["mulmul", "Cotton"],
  ["organic cotton", "Organic Cotton"],
  ["pure cotton", "Cotton"],
  ["cotton silk", "Cotton Silk"],
  ["cotton blend", "Cotton"],
  ["cotton wool", "Cotton"],
  ["cotton", "Cotton"],
  ["modal", "Modal"],              // Kurtas sheet allows "Modal"
  ["liva", "Liva"],
  ["livaeco", "Liva"],
  ["viscose rayon", "Viscose Rayon"],
  ["viscose", "Viscose Rayon"],
  ["rayon", "Viscose Rayon"],
  ["chanderi silk", "Chanderi Silk"],
  ["chanderi cotton", "Chanderi Cotton"],
  ["chanderi", "Chanderi Cotton"],
  ["poly georgette", "Poly Georgette"],
  ["silk georgette", "Silk Georgette"],
  ["georgette", "Georgette"],
  ["poly chiffon", "Poly Chiffon"],
  ["silk chiffon", "Silk Chiffon"],
  ["chiffon", "Poly Chiffon"],
  ["poly crepe", "Poly Crepe"],
  ["silk crepe", "Silk Crepe"],
  ["crepe", "Poly Crepe"],
  ["dupion silk", "Dupion Silk"],
  ["tussar silk", "Tussar Silk"],
  ["jute silk", "Jute Silk"],
  ["jute cotton", "Jute Cotton"],
  ["raw silk", "Raw Silk"],
  ["pure silk", "Pure Silk"],
  ["silk blend", "Silk Blend"],
  ["art silk", "Art Silk"],
  ["silk", "Pure Silk"],
  ["satin", "Satin"],
  ["velvet", "Velvet"],
  ["organza", "Organza"],
  ["voile", "Voile"],
  ["net", "Net"],
  ["shantoon", "Shantoon"],
  ["santoon", "Santoon"],
  ["supernet", "Supernet"],
  ["tissue", "Tissue"],
  ["linen", "Linen"],
  ["khadi", "Khadi"],
  ["jacquard", "Jacquard"],
  ["brasso", "Brasso"],
  ["brocade", "Jacquard"],
  ["denim", "Denim"],
  ["polyester", "Polyester"],
  ["poly silk", "Poly Silk"],
  ["poly chanderi", "Poly Chanderi"],
  ["nylon", "Nylon"],
  ["acrylic", "Acrylic"],
  ["wool blend", "Wool Blend"],
  ["pure wool", "Pure Wool"],
  ["cashmere", "Pure Wool"],
  ["wool", "Pure Wool"],
  ["tencel", "Tencel"],
  ["hemp", "Hemp"],
  ["elastane", "Elastane"],
  ["chinon", "Chinon"],
];

// For Kurta Sets/Co-Ords Top Fabric — subset with different names
const FABRIC_MAP_SETS: [string, string][] = [
  ["slub cotton", "Pure Cotton"],
  ["organic cotton", "Organic Cotton"],
  ["pure cotton", "Pure Cotton"],
  ["cotton silk", "Cotton Silk"],
  ["cotton blend", "Pure Cotton"],
  ["cotton", "Pure Cotton"],
  ["modal", "Viscose Rayon"],
  ["liva", "Liva"],
  ["livaeco", "Liva"],
  ["viscose rayon", "Viscose Rayon"],
  ["viscose", "Viscose Rayon"],
  ["rayon", "Viscose Rayon"],
  ["chanderi silk", "Chanderi Silk"],
  ["chanderi cotton", "Chanderi Cotton"],
  ["chanderi", "Chanderi Cotton"],
  ["poly georgette", "Poly Georgette"],
  ["silk georgette", "Silk Georgette"],
  ["georgette", "Georgette"],
  ["poly chiffon", "Poly Chiffon"],
  ["silk chiffon", "Silk Chiffon"],
  ["chiffon", "Poly Chiffon"],
  ["poly crepe", "Poly Crepe"],
  ["silk crepe", "Silk Crepe"],
  ["crepe", "Poly Crepe"],
  ["dupion silk", "Dupion Silk"],
  ["tussar silk", "Tussar Silk"],
  ["jute silk", "Jute Silk"],
  ["jute cotton", "Jute Cotton"],
  ["raw silk", "Raw Silk"],
  ["pure silk", "Pure Silk"],
  ["silk blend", "Silk Blend"],
  ["art silk", "Art Silk"],
  ["silk", "Pure Silk"],
  ["satin", "Satin"],
  ["velvet", "Velvet"],
  ["organza", "Organza"],
  ["voile", "Voile"],
  ["net", "Net"],
  ["shantoon", "Shantoon"],
  ["supernet", "Supernet"],
  ["tissue", "Tissue"],
  ["linen", "Linen"],
  ["polyester", "Polyester"],
  ["poly silk", "Poly Silk"],
  ["poly chanderi", "Poly Chanderi"],
  ["nylon", "Nylon"],
  ["acrylic", "Acrylic"],
  ["wool blend", "Wool Blend"],
  ["pure wool", "Pure Wool"],
  ["wool", "Pure Wool"],
  ["chinon", "Chinon"],
];

// Ethnic Dresses fabric column has a different allowed set (no "Pure Cotton" — just "Cotton")
const FABRIC_MAP_DRESS: [string, string][] = [
  ["organic cotton", "Organic Cotton"],
  ["slub cotton", "Cotton"],
  ["mul cotton", "Cotton"],
  ["mulmul", "Cotton"],
  ["pure cotton", "Cotton"],
  ["cotton blend", "Cotton"],
  ["cotton silk", "Silk"],
  ["cotton", "Cotton"],
  ["modal satin", "Viscose Rayon"],  // Modal Satin → Viscose Rayon (no Modal/Satin in dress sheet)
  ["modal", "Viscose Rayon"],
  ["liva", "Liva"],
  ["livaeco", "Livaeco"],
  ["viscose rayon", "Viscose Rayon"],
  ["viscose", "Viscose Rayon"],
  ["rayon", "Viscose Rayon"],
  ["poly georgette", "Georgette"],
  ["silk georgette", "Georgette"],
  ["georgette", "Georgette"],
  ["poly chiffon", "Poly Silk"],
  ["chiffon", "Poly Silk"],
  ["jacquard", "Jacquard"],
  ["dupion silk", "Silk"],
  ["tussar silk", "Silk"],
  ["raw silk", "Silk"],
  ["pure silk", "Silk"],
  ["silk blend", "Silk"],
  ["art silk", "Poly Silk"],
  ["silk satin", "Silk"],
  ["satin", "Poly Silk"],            // Generic satin → Poly Silk (closest in dress sheet)
  ["silk", "Silk"],
  ["linen blend", "Linen Blend"],
  ["linen", "Linen"],
  ["cashmere", "Cashmere"],
  ["wool blend", "Wool Blend"],
  ["pure wool", "Pure Wool"],
  ["polyester", "Polyester"],
  ["poly silk", "Poly Silk"],
  ["nylon", "Nylon"],
  ["synthetic", "Synthetic"],
];

// Dress fabric type valid values: Chambray, Chiffon, Corduroy, Cotton, Crepe, Denim,
// Velvet, Schiffli, Satin, Dobby, Net, NA, Georgette
const FABRIC_TYPE_MAP: Record<string, string> = {
  "chambray": "Chambray", "chiffon": "Chiffon", "corduroy": "Corduroy",
  "cotton": "Cotton", "crepe": "Crepe", "denim": "Denim", "velvet": "Velvet",
  "schiffli": "Schiffli", "satin": "Satin", "dobby": "Dobby", "net": "Net",
  "georgette": "Georgette",
};

// Dress length: only Above Knee / Knee Length / Maxi / Midi allowed
const DRESS_LENGTH_MAP: Record<string, string> = {
  "above knee": "Above Knee",
  "knee length": "Knee Length", "knee-length": "Knee Length", "till knee": "Knee Length",
  "midi": "Midi", "calf length": "Midi", "calf-length": "Midi",
  "maxi": "Maxi", "ankle length": "Maxi", "ankle-length": "Maxi", "floor length": "Maxi",
};

function normaliseFabric(raw: string, forSets = false, forDress = false): string {
  const lower = raw.toLowerCase();
  const map = forDress ? FABRIC_MAP_DRESS : forSets ? FABRIC_MAP_SETS : FABRIC_MAP;
  for (const [key, val] of map) {
    if (lower.includes(key)) return val;
  }
  return raw; // return as-is if no match (better than blank)
}

// Myntra exact values for other dropdowns
// Sheet-agnostic NECK_MAP — values must be post-snapped per sheet if needed
const NECK_MAP: Record<string, string> = {
  "round neck": "Round Neck", "round": "Round Neck",
  "v neck": "V-Neck", "v-neck": "V-Neck", "v shaped": "V-Neck",
  "scoop neck": "Scoop Neck", "scoop": "Scoop Neck",
  "boat neck": "Boat Neck", "bateau": "Boat Neck",
  "high neck": "High Neck", "band collar": "Mandarin Collar",
  "mandarin collar": "Mandarin Collar", "mandarin": "Mandarin Collar",
  "shirt collar": "Shirt Collar", "collar": "Shirt Collar",
  "sweetheart": "Sweetheart Neck",
  "off shoulder": "Off-Shoulder", "off-shoulder": "Off-Shoulder",
  "square neck": "Square Neck", "square": "Square Neck",
  "keyhole": "Keyhole Neck",
  "cowl": "Cowl Neck",
  "halter": "Halter Neck",
  "tie-up": "Tie-Up Neck", "tie up": "Tie-Up Neck",
  "one shoulder": "One Shoulder",
  "u-neck": "Scoop Neck", "u neck": "Scoop Neck",
};

// Per-sheet neck normalisation: snap "V Neck" → "V-Neck" etc.
function snapNeck(val: string, articleType: string): string {
  const at = articleType.toLowerCase();
  // Dresses don't have Scoop Neck / High Neck / Band Collar — fall back to closest
  if (at.includes("dress")) {
    if (val === "High Neck") return "Mock Neck";
    if (val === "Scoop Neck") return "Round Neck";
  }
  // Tunics don't have Off-Shoulder or Band Collar
  if (at.includes("tunic")) {
    if (val === "Off-Shoulder") return "Halter Neck";
  }
  return val;
}

const SLEEVE_LENGTH_MAP: Record<string, string> = {
  "sleeveless": "Sleeveless", "no sleeve": "Sleeveless",
  "short sleeve": "Short Sleeves", "short-sleeve": "Short Sleeves", "cap sleeve": "Short Sleeves",
  "3/4th": "Three-Quarter Sleeves", "3/4": "Three-Quarter Sleeves", "three-quarter": "Three-Quarter Sleeves", "three quarter": "Three-Quarter Sleeves",
  "long sleeve": "Long Sleeves", "full sleeve": "Long Sleeves", "full-sleeve": "Long Sleeves",
};

const SLEEVE_STYLING_MAP: Record<string, string> = {
  "bell sleeve": "Bell Sleeves", "bell-sleeve": "Bell Sleeves",
  "flared sleeve": "Flared Sleeves",
  "puff sleeve": "Puff Sleeves", "puff-sleeve": "Puff Sleeves", "puffed sleeve": "Puffed Sleeves",
  "regular sleeve": "Regular Sleeves",
  "cold shoulder": "Cold-Shoulder Sleeves", "cold-shoulder": "Cold-Shoulder Sleeves",
  "cap sleeve": "Cap Sleeves",
  "flutter": "Flutter Sleeves",
  "bishop": "Bishop Sleeves",
  "batwing": "Batwing Sleeves",
  "kimono": "Kimono Sleeves",
  "drop shoulder": "Drop-Shoulder Sleeves", "drop-shoulder": "Drop-Shoulder Sleeves",
  "raglan": "Raglan Sleeves",
  "cuffed": "Cuffed Sleeves",
  "layered": "Layered Sleeves",
};

const SHAPE_MAP: Record<string, string> = {
  "anarkali": "Anarkali",
  "a-line": "A-Line", "a line": "A-Line",
  "straight": "Straight",
  "kaftan": "Kaftan",
  "pathani": "Pathani",
  "fit and flare": "A-Line", "fit-and-flare": "A-Line",
  "flared": "Anarkali",
  "bodycon": "Straight",
  "shift": "Straight",
};

// Dress-specific shape map — valid: Wrap/Shirt/Fit and Flare/A-Line/Kaftan/Maxi/Pinafore/Drop-Waist/Empire/Balloon/Gown
const DRESS_SHAPE_MAP: Record<string, string> = {
  "wrap": "Wrap", "shirt": "Shirt",
  "fit and flare": "Fit and Flare", "fit-and-flare": "Fit and Flare",
  "a-line": "A-Line", "a line": "A-Line", "flared": "A-Line",
  "kaftan": "Kaftan",
  "maxi": "Maxi",
  "pinafore": "Pinafore",
  "drop waist": "Drop-Waist", "drop-waist": "Drop-Waist",
  "empire": "Empire",
  "balloon": "Balloon",
  "gown": "Gown",
  "straight": "A-Line",   // no Straight in dress sheet → A-Line closest
  "shift": "Shirt",       // Shift → Shirt closest
  "bodycon": "Shirt",
  "anarkali": "A-Line",
};

const LENGTH_MAP: Record<string, string> = {
  "above knee": "Above Knee",
  "knee length": "Knee Length", "knee-length": "Knee Length", "till knee": "Knee Length",
  "calf length": "Calf Length", "calf-length": "Calf Length", "midi": "Calf Length",
  "ankle length": "Ankle Length", "ankle-length": "Ankle Length", "maxi": "Ankle Length",
  "floor length": "Floor Length", "floor-length": "Floor Length",
};

// "Pattern" column — construction/technique type
// Valid: Embroidered, Solid, Printed, Woven Design, Dyed, Yoke Design, Colourblocked, Striped, Checked, Embellished
const PATTERN_MAP: Record<string, string> = {
  "embroidered": "Embroidered", "embroidery": "Embroidered", "hand embroid": "Embroidered",
  "yoke design": "Yoke Design", "yoke": "Yoke Design",
  "colourblock": "Colourblocked", "colorblock": "Colourblocked",
  "stripe": "Striped", "stripes": "Striped", "striped": "Striped",
  "check": "Checked", "checked": "Checked", "plaid": "Checked",
  "woven": "Woven Design",
  "dyed": "Dyed", "tie and dye": "Dyed", "shibori": "Dyed",
  "embellish": "Embellished", "sequin": "Embellished", "bead": "Embellished",
  "solid": "Solid", "plain": "Solid",
  "printed": "Printed", "print": "Printed",
};

// "Print or Pattern Type" column — visual motif only
// Valid: Striped, Solid, Checked, Woven Design, Animal, Tribal, Bandhani, Floral, Geometric,
//        Paisley, Polka Dots, Abstract, Leheriya, Chevron, Colourblocked, Quirky, Ethnic Motifs, Embellished
// NOTE: "Printed" and "Embroidered" are NOT valid here
const PRINT_MOTIF_MAP: Record<string, string> = {
  "floral": "Floral", "flower": "Floral", "botanical": "Floral", "bloom": "Floral",
  "paisley": "Paisley", "bootaa": "Paisley", "buta": "Paisley",
  "geometric": "Geometric", "aztec": "Geometric", "chevron": "Chevron",
  "abstract": "Abstract",
  "stripe": "Striped", "stripes": "Striped", "striped": "Striped",
  "check": "Checked", "checked": "Checked", "plaid": "Checked", "gingham": "Checked",
  "leopard": "Animal", "zebra": "Animal", "snake print": "Animal",
  "tribal": "Tribal",
  "bandhani": "Bandhani",
  "leheriya": "Leheriya",
  "polka": "Polka Dots",
  "colourblock": "Colourblocked", "colorblock": "Colourblocked", "colour block": "Colourblocked",
  "ethnic motif": "Ethnic Motifs", "ethnic print": "Ethnic Motifs", "motif": "Ethnic Motifs",
  "woven": "Woven Design", "woven design": "Woven Design",
  "embellish": "Embellished", "sequin": "Embellished",
  "solid": "Solid", "plain": "Solid",
  // Embroidered products — Abstract is the accepted motif value in Myntra reference files
  "embroidered": "Abstract", "embroidery": "Abstract",
  "ikat": "Ethnic Motifs", "kantha": "Ethnic Motifs", "block print": "Ethnic Motifs",
  "animal print": "Animal", "animal": "Animal",
  "printed": "Floral", // default motif for printed — overridden if more specific keyword found
};

const OCCASION_MAP: Record<string, string> = {
  "casual": "Daily", "everyday": "Daily", "daily": "Daily",
  "festive": "Festive", "ethnic": "Festive", "wedding": "Festive", "bridal": "Festive", "party": "Festive",
  "fusion": "Fusion",
  "maternity": "Maternity",
  "formal": "Daily", "office": "Daily",
};

const WASH_CARE_MAP: Record<string, string> = {
  "dry clean": "Dry Clean",
  "hand wash": "Hand Wash", "hand-wash": "Hand Wash",
  "machine wash": "Machine Wash", "machine-wash": "Machine Wash",
};

// Kurtas hemline: High-Low | Straight | Curved | Asymmetric | Flared | Angular Accents
const HEMLINE_MAP: Record<string, string> = {
  "high-low": "High-Low", "high low": "High-Low",
  "straight": "Straight",
  "curved": "Curved",
  "asymmetric": "Asymmetric",
  "flared": "Flared",
  "angular": "Angular Accents",
};

// Dress hemline: only Flared | High-Low | Straight allowed
const DRESS_HEMLINE_MAP: Record<string, string> = {
  "flared": "Flared",
  "high-low": "High-Low", "high low": "High-Low",
  "straight": "Straight",
  "curved": "Straight",     // no Curved in dress → Straight
  "asymmetric": "High-Low", // no Asymmetric in dress → High-Low closest
  "angular": "Straight",
};

const DESIGN_STYLING_MAP: Record<string, string> = {
  "angrakha": "Angrakha",
  "empire": "Empire",
  "tiered": "Tiered",
  "regular": "Regular",
  "panelled": "Panelled",
  "pleated": "Pleated",
  "high slit": "High Slit",
  "layered": "Layered",
  "yoke": "Yoke Design",
  "placement print": "Regular",
  "printed": "Regular",
  "embroidered": "Regular",
  "solid": "Regular",
};

function snapToMap(raw: string, map: Record<string, string>): string {
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return "";
}

/** Extract fabric from tags or description text, normalised to Myntra values */
function extractFabric(tagMap: Record<string, string>, description = "", forSets = false, forDress = false, title = ""): string {
  const raw = tagMap["fabric"] || tagMap["material"] || tagMap["fabric1"] || "";
  if (raw) return normaliseFabric(raw, forSets, forDress);
  // Fallback: parse "Material XYZ" from description
  const match = description.match(/\bMaterial\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:\.|,|$)/i);
  if (match) return normaliseFabric(match[1].trim(), forSets, forDress);
  // Last resort: scan title for known fabric keywords (longest match first)
  if (title) {
    const map = forDress ? FABRIC_MAP_DRESS : forSets ? FABRIC_MAP_SETS : FABRIC_MAP;
    const titleLower = title.toLowerCase();
    for (const [key, val] of map) {
      if (titleLower.includes(key)) return val;
    }
  }
  return "";
}

/** Extract wash care, snapped to Myntra values */
function extractWashCare(tagMap: Record<string, string>, description: string): string {
  const allText = tagMap["wash_care"] || tagMap["wash"] || tagMap["care"] || description || "";
  return snapToMap(allText, WASH_CARE_MAP);
}

// Fabrics that need gentle/hand wash care
const PREMIUM_FABRICS = ["modal", "chanderi", "seersucker", "silk", "georgette", "crepe",
  "chiffon", "organza", "velvet", "brocade", "jacquard", "linen blend", "khadi",
  "muslin", "net", "tulle", "satin", "wool", "woollen", "acrylic", "cashmere"];
const REGULAR_FABRICS = ["cotton", "rayon", "viscose", "polyester", "jersey", "lycra",
  "spandex", "denim", "poplin", "cambric", "voile", "mulmul", "dobby", "slub"];

/** Derive materialCareDescription from fabric */
function deriveMaterialCare(tagMap: Record<string, string>, description: string): string {
  const fabric = (tagMap["fabric"] || tagMap["material"] || tagMap["fabric1"] || description || "").toLowerCase();
  if (PREMIUM_FABRICS.some(f => fabric.includes(f))) return "Hand wash separately. Dry clean is ideal.";
  if (REGULAR_FABRICS.some(f => fabric.includes(f))) return "Regular wash in cold water.";
  // Fallback: check description for care instructions
  const allText = (tagMap["wash_care"] || tagMap["care"] || description || "").toLowerCase();
  if (allText.includes("dry clean")) return "Hand wash separately. Dry clean is ideal.";
  if (allText.includes("hand wash")) return "Hand wash separately. Dry clean is ideal.";
  if (allText.includes("machine wash") || allText.includes("regular wash")) return "Regular wash in cold water.";
  return "Regular wash in cold water.";
}

/** Generate marketplace-friendly search tags from product attributes */
function generateMarketplaceTags(
  product: ShopifyProduct,
  tagMap: Record<string, string>,
  articleType: string,
  description: string,
): string {
  const tags = new Set<string>();

  // Brand
  tags.add("Rustorange");

  // Article type / category
  tags.add(articleType);

  // Fabric
  const fabric = extractFabric(tagMap, description);
  if (fabric) tags.add(fabric);

  // Season
  const season = extractSeason(tagMap);
  if (season) { tags.add(season); tags.add(`${season} wear`); }

  // Occasion
  const occasion = extractOccasion(tagMap);
  if (occasion) tags.add(occasion);

  // Colour
  const colour = extractColourFromTitle(product.title);
  if (colour) tags.add(colour);

  // Neck
  const neck = extractNeck(tagMap, description);
  if (neck) tags.add(neck);

  // Sleeve
  const sleeve = extractSleeveLength(tagMap, description);
  if (sleeve) tags.add(sleeve);

  // Shape
  const shape = extractShape(tagMap, description);
  if (shape) tags.add(shape);

  // Length
  const length = extractLength(tagMap, description);
  if (length) tags.add(length);

  // Pattern
  const pattern = extractPattern(tagMap, description);
  if (pattern) tags.add(pattern);

  // Technique from tags
  const technique = tagMap["technique"] || tagMap["embroidery"] || "";
  if (technique) tags.add(technique);

  // Generic useful terms
  tags.add("Women");
  tags.add("Ethnic wear");
  tags.add("Indian wear");
  if (articleType.toLowerCase().includes("set") || articleType.toLowerCase().includes("coord")) {
    tags.add("coord set"); tags.add("matching set");
  }
  if (description.toLowerCase().includes("embroid")) tags.add("Embroidered");
  if (description.toLowerCase().includes("print")) tags.add("Printed");
  if (description.toLowerCase().includes("handcraft") || description.toLowerCase().includes("hand craft")) tags.add("Handcrafted");

  return Array.from(tags).filter(Boolean).join(", ");
}

/** Extract neck type from tags/description/title, snapped to Myntra values */
function extractNeck(tagMap: Record<string, string>, description: string, title = ""): string {
  // Priority: explicit tag > description > title
  const explicit = tagMap["neck"] || tagMap["neckline"] || tagMap["neck_type"] || "";
  if (explicit) return snapToMap(explicit, NECK_MAP);
  const fromDesc = snapToMap(description, NECK_MAP);
  if (fromDesc) return fromDesc;
  return snapToMap(title, NECK_MAP);
}

/** Extract sleeve length from tags/description, snapped to Myntra values */
function extractSleeveLength(tagMap: Record<string, string>, description: string): string {
  const allText = tagMap["sleeve_length"] || tagMap["sleeve"] || description || "";
  return snapToMap(allText, SLEEVE_LENGTH_MAP);
}

/** Extract sleeve styling from tags/description, snapped to Myntra values */
function extractSleeveStyling(tagMap: Record<string, string>, description: string): string {
  const allText = tagMap["sleeve_styling"] || tagMap["sleeve"] || description || "";
  return snapToMap(allText, SLEEVE_STYLING_MAP);
}

/** Extract shape/silhouette from tags/description, snapped to Myntra values */
function extractShape(tagMap: Record<string, string>, description: string): string {
  const allText = tagMap["shape"] || tagMap["silhouette"] || description || "";
  return snapToMap(allText, SHAPE_MAP);
}

/** Extract occasion from tags, snapped to Myntra values */
function extractOccasion(tagMap: Record<string, string>, articleType = ""): string {
  const at = articleType.toLowerCase();
  // Sheets that allow Casual: Tunics, Co-Ords
  const allowsCasual = at.includes("tunic") || at.includes("top") || at.includes("co-ord") || at.includes("coord");
  const val = tagMap["occasion"] || "";
  if (val) {
    const snapped = snapToMap(val, OCCASION_MAP);
    // If snapped to Daily but sheet allows Casual, keep Casual
    if (!snapped && allowsCasual && val.toLowerCase().includes("casual")) return "Casual";
    return snapped || (allowsCasual ? "Casual" : "Daily");
  }
  if (at.includes("kurta set")) return "Fusion";
  if (at.includes("co-ord") || at.includes("coord")) return "Casual";
  if (allowsCasual) return "Casual";
  return "Daily";
}

/** Extract season from tags */
function extractSeason(tagMap: Record<string, string>): string {
  const val = (tagMap["season"] || Object.keys(tagMap).find(k => ["winter","summer","fall","spring","monsoon"].includes(k)) || "").toLowerCase();
  if (val.includes("winter")) return "Winter";
  if (val.includes("summer") || val.includes("spring")) return "Summer";
  if (val.includes("fall") || val.includes("autumn")) return "Fall";
  if (val.includes("monsoon") || val.includes("rainy")) return "Fall";
  return "Summer";
}

/** Extract Pattern column value (construction type: Embroidered, Printed, Solid etc.) */
function extractPattern(tagMap: Record<string, string>, description: string): string {
  const allText = tagMap["pattern"] || tagMap["print"] || tagMap["print_type"] || description || "";
  return snapToMap(allText, PATTERN_MAP) || "Printed";
}

/** Extract Print or Pattern Type column value (visual motif: Floral, Geometric, Paisley etc.) */
function extractPrintMotif(tagMap: Record<string, string>, description: string): string {
  // Check specific motif tags first, then fall back to description
  const allText = tagMap["pattern"] || tagMap["print"] || tagMap["print_type"] || tagMap["motif"] || description || "";
  return snapToMap(allText, PRINT_MOTIF_MAP) || "Abstract";
}

/** Package contains by article type */
function packageContains(articleType: string): string {
  const t = articleType.toLowerCase();
  if (t.includes("kurta set")) return "1 Kurta 1 Pant";
  if (t.includes("co-ord") || t.includes("coord")) return "1 Top 1 Pant";
  if (t.includes("kurta")) return "1 Kurta";
  if (t.includes("dress")) return "1 Dress";
  if (t.includes("tunic") || t.includes("top")) return "1 Top";
  return "1 Piece";
}

/** Number of items by article type */
function numberOfItems(articleType: string): string {
  const t = articleType.toLowerCase();
  if (t.includes("set") || t.includes("co-ord") || t.includes("coord")) return "2";
  return "1";
}

/** Net Quantity Unit */
function netQuantityUnit(articleType: string): string {
  return numberOfItems(articleType) === "2" ? "Pieces" : "Piece";
}

const WINTER_FABRICS = ["acrylic", "woollen", "wool", "cashmere", "angora"];
const SET_TYPES = ["kurta sets", "co-ords", "coord sets", "co-ord sets"];
const DRESS_TYPES = ["dresses", "ethnic dresses", "dress"];

/** HSN based on product type + fabric */
function hsnFor(articleType: string, fabric: string): number {
  const t = articleType.toLowerCase();
  const f = fabric.toLowerCase();
  if (WINTER_FABRICS.some(w => f.includes(w))) return 62064000;
  if (SET_TYPES.some(s => t.includes(s))) return 62114210;
  if (DRESS_TYPES.some(d => t === d)) return 62044220;
  return 62114290;
}

// ─── Main value mapper ────────────────────────────────────────────────────────

function getValue(
  colHeader: string,
  product: ShopifyProduct,
  variant: ShopifyProduct["variants"][0],
  tagMap: Record<string, string>,
  imageUrls: string[],
  styleGroupId: number,
  articleType: string,
  description: string,
  vision: VisionAttributes | null,
  baseMrp: number,
  baseIsp: number,
  colorVariantGroupId: string,
  meta: { year?: string; season?: string } = {},
): string | number | { text: string; hyperlink: string } | null {
  // Helper: vision takes priority (for fields where AI is more reliable than tags)
  function withVision(visionVal: string | undefined, fallback: () => string): string {
    return visionVal || fallback();
  }
  // Helper: text extraction takes priority; AI vision only if text yields nothing
  function withTextFirst(textFn: () => string, visionVal: string | undefined): string {
    return textFn() || visionVal || "";
  }
  const h = colHeader.trim();
  const hl = h.toLowerCase();
  const size = (variant.option1 || "S").toUpperCase();
  const measurements = SIZE_CHART[size] || SIZE_CHART["S"];
  // option1 is always size; option2 is colour when the product has a colour option
  const SIZE_PATTERN = /^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d+)$/i;
  const colourFromOption = SIZE_PATTERN.test((variant.option1 || "").trim()) ? (variant.option2 || "") : (variant.option1 || "");
  const colour = extractColourFromTitle(product.title) || colourFromOption;
  const articleNumber = extractArticleNumber(variant.sku || "");
  const lengthText = extractLength(tagMap, description);
  const frontLength = LENGTH_INCHES[lengthText] || measurements.bust; // fallback

  // ── IDs ──
  if (hl === "styleid") return "";
  if (hl === "stylegroupid") return styleGroupId;
  if (hl === "vendorskucode" || hl === "skucode") {
    const baseSku = variant.sku || `${product.id}-${variant.id}`;
    const sizeOption = variant.option1 || "";
    // Append size if not already present as a suffix
    const hasSizeSuffix = sizeOption && new RegExp(`-${sizeOption}$`, "i").test(baseSku);
    return hasSizeSuffix ? baseSku : sizeOption ? `${baseSku}-${sizeOption}` : baseSku;
  }
  if (hl === "vendorarticlenumber") return articleNumber;
  if (hl === "vendorarticlename") return product.title;
  if (hl === "productdisplayname") return product.title;
  if (hl === "list view name") return buildListViewName(product.title, tagMap, description);
  if (hl === "color variant groupid") return colorVariantGroupId;

  // ── Brand / legal ──
  if (hl === "brand") return BRAND;
  if (hl === "manufacturer name and address with pincode") return MANUFACTURER;
  if (hl === "packer name and address with pincode") return MANUFACTURER;
  if (hl === "importer name and address with pincode") return "";

  // ── Origin ──
  if (hl === "country of origin") return "India";
  if (hl.startsWith("country of origin")) return ""; // 2–5

  // ── Article type ──
  if (hl === "articletype") return articleType;

  // ── Size ──
  if (hl === "brand size" || hl === "standard size") return variant.option1 || "";
  if (hl === "is standard size present on label") return "Yes";

  // ── Colour ──
  if (hl === "brand colour (remarks)") return colour;
  if (hl === "prominent colour") return snapColour(colour);
  if (hl === "second prominent colour" || hl === "third prominent colour") return "NA";
  if (hl === "colour family") return tagMap["colour_family"] || tagMap["color_family"] || "";

  // ── Business ──
  if (hl === "gtin") return "";
  if (hl === "hsn") return hsnFor(articleType, extractFabric(tagMap, description));
  if (hl === "mrp") return baseMrp;
  if (hl === "isp") return baseMrp;
  if (hl === "agegroup") return "Adults-Women";
  if (hl === "fashiontype") return "Fashion";
  if (hl === "usage") {
    if (tagMap["usage"]) return tagMap["usage"];
    const at = articleType.toLowerCase();
    if (at.includes("kurta set") || at.includes("co-ord") || at.includes("dress")) return "";
    return "Casual";
  }
  if (hl === "year") return meta.year || String(new Date().getFullYear());
  if (hl === "season") return meta.season || extractSeason(tagMap);
  if (hl === "addeddate") return "";

  // ── Descriptions ──
  if (hl === "product details") return description;
  if (hl === "stylenote") return tagMap["stylenote"] || tagMap["style_note"] || "";
  if (hl === "materialcaredescription") return deriveMaterialCare(tagMap, description);
  if (hl === "sizeandfitdescription") return tagMap["size_fit"] || tagMap["fit"] ? `${tagMap["fit"] || ""} Fit`.trim() : "Regular Fit";
  if (hl === "tags") return generateMarketplaceTags(product, tagMap, articleType, description);
  if (hl === "ai label") return "";

  // ── Garment attributes ──
  if (hl === "occasion") return withVision(vision?.occasion, () => extractOccasion(tagMap, articleType));
  if (hl === "print or pattern type") {
    const motif = extractPrintMotif(tagMap, description);
    // Vision pattern values (Floral, Geometric etc.) are already valid motif values; snap "Printed"→Floral
    const visionMotif = vision?.pattern ? (snapToMap(vision.pattern, PRINT_MOTIF_MAP) || vision.pattern) : "";
    return visionMotif || motif;
  }
  if (hl === "pattern") return withVision(vision?.pattern, () => extractPattern(tagMap, description));
  if (hl === "fabric") {
    const isDress = articleType.toLowerCase().includes("dress");
    return extractFabric(tagMap, description, false, isDress, product.title);
  }
  if (hl === "fabric 2" || hl === "fabric 3") return "";
  if (hl === "fabric purity") return tagMap["fabric_purity"] || "";
  if (hl === "fabric type") {
    const rawFabricType = tagMap["fabric_type"] || "";
    if (rawFabricType) {
      const snapped = snapToMap(rawFabricType, FABRIC_TYPE_MAP);
      return snapped || "NA";
    }
    // Derive from fabric — only return if it matches valid fabric type values
    const fabricDerived = extractFabric(tagMap, description);
    return snapToMap(fabricDerived, FABRIC_TYPE_MAP) || "NA";
  }
  if (hl === "knit or woven") return tagMap["knit_or_woven"] || tagMap["fabric_type"] || "";
  if (hl === "sleeve length") return withVision(vision?.sleeveLength, () => extractSleeveLength(tagMap, description));
  if (hl === "sleeve styling") return withVision(vision?.sleeveStyling, () => extractSleeveStyling(tagMap, description));
  if (hl === "neck") {
    const neckVal = withTextFirst(() => extractNeck(tagMap, description, product.title), vision?.neck);
    return snapNeck(neckVal, articleType);
  }
  if (hl === "shape") {
    const isDress = articleType.toLowerCase().includes("dress");
    if (isDress) return withVision(vision?.shape, () => snapToMap(tagMap["shape"] || tagMap["silhouette"] || description, DRESS_SHAPE_MAP));
    return withVision(vision?.shape, () => extractShape(tagMap, description));
  }
  if (hl === "length") {
    const isDress = articleType.toLowerCase().includes("dress");
    if (isDress) {
      const allText = tagMap["length"] || tagMap["garment_length"] || "";
      return withVision(vision?.length, () => snapToMap(allText || lengthText, DRESS_LENGTH_MAP));
    }
    // Kurtas/Tunics: vision is most accurate; text fallback only if explicit length tag exists
    const explicitLength = tagMap["length"] || tagMap["garment_length"] || "";
    return vision?.length || (explicitLength ? snapToMap(explicitLength, LENGTH_MAP) : "");
  }
  if (hl === "hemline") {
    const isDress = articleType.toLowerCase().includes("dress");
    const hMap = isDress ? DRESS_HEMLINE_MAP : HEMLINE_MAP;
    return withVision(vision?.hemline, () => snapToMap(tagMap["hemline"] || "", hMap));
  }
  if (hl === "slit detail") return tagMap["slit_detail"] || tagMap["slit"] || "";
  if (hl === "ornamentation") return tagMap["ornamentation"] || "";
  if (hl === "technique") return tagMap["technique"] || "";
  if (hl === "weave pattern") return tagMap["weave_pattern"] || "";
  if (hl === "weave type") return tagMap["weave_type"] || "";
  if (hl === "design styling") return withVision(vision?.designStyling, () => snapToMap(tagMap["design_styling"] || description, DESIGN_STYLING_MAP));
  if (hl === "wash care") {
    const wc = extractWashCare(tagMap, description);
    // Also derive from fabric if no explicit tag
    if (!wc) {
      const mc = deriveMaterialCare(tagMap, description);
      if (mc.includes("Dry clean")) return "Dry Clean";
      if (mc.includes("Hand wash")) return "Hand Wash";
      return "Machine Wash";
    }
    return wc;
  }
  if (hl === "body or garment size") return "To-Fit Denotes Body Measurements in";
  if (hl === "stitch") return "Ready to Wear";
  if (hl === "lining") return "NA";
  if (hl === "transparency") return tagMap["transparency"] || "";
  if (hl === "closure") return snapToMap(tagMap["closure"] || description, CLOSURE_MAP) || "NA";
  if (hl === "main trend") return tagMap["main_trend"] || tagMap["trend"] || "";
  if (hl === "sustainable") return "Regular";
  if (hl === "character") return "NA";
  if (hl === "trends") return tagMap["trends"] || tagMap["trend"] || "";
  if (hl === "add-ons") return "NA";
  if (hl === "multipack set") return "NA";

  // ── Co-Ord / Set specific ──
  if (hl === "top fabric") return extractFabric(tagMap, description, true, false, product.title);
  if (hl === "bottom fabric") return normaliseFabric(tagMap["bottom_fabric"] || "", true) || extractFabric(tagMap, description, true, false, product.title);
  if (hl === "top type") {
    const isCoOrd = articleType.toLowerCase().includes("co-ord") || articleType.toLowerCase().includes("coord");
    const TOP_TYPE_MAP: Record<string, string> = { "kurta": "Kurta", "kurti": "Kurti", "top": "Top" };
    const raw = vision?.topType || (isCoOrd ? "Top" : "Kurta");
    return snapToMap(raw, TOP_TYPE_MAP) || (isCoOrd ? "Top" : "Kurta");
  }
  if (hl === "bottom type") {
    const isCoOrd = articleType.toLowerCase().includes("co-ord") || articleType.toLowerCase().includes("coord");
    const raw = tagMap["bottom_type"] || description;
    const map = isCoOrd ? BOTTOM_TYPE_MAP_COORDS : BOTTOM_TYPE_MAP_SETS;
    return withVision(vision?.bottomType, () => snapToMap(raw, map) || (isCoOrd ? "Trousers" : "Trousers"));
  }
  if (hl === "top pattern") {
    // Valid: Printed | Embroidered | Solid | Dyed | Self Design | Yoke Design | Striped | Colourblocked | Woven Design | Checked
    const TOP_PATTERN_MAP: Record<string, string> = {
      "embroidered": "Embroidered", "embroidery": "Embroidered",
      "yoke design": "Yoke Design", "yoke": "Yoke Design",
      "colourblock": "Colourblocked", "colorblock": "Colourblocked",
      "stripe": "Striped", "striped": "Striped",
      "check": "Checked", "checked": "Checked",
      "woven": "Woven Design",
      "dyed": "Dyed", "tie and dye": "Dyed",
      "solid": "Solid", "plain": "Solid",
    };
    const patternVal = withVision(vision?.pattern, () => extractPattern(tagMap, description));
    return snapToMap(patternVal, TOP_PATTERN_MAP) || "Printed";
  }
  if (hl === "bottom pattern") return tagMap["bottom_pattern"] || "Printed";
  if (hl === "bottom closure") return "Slip-On";
  if (hl === "top closure") return "";
  if (hl === "top hemline") return tagMap["top_hemline"] || "Flared";
  if (hl === "bottom hemline") return tagMap["bottom_hemline"] || "";
  if (hl === "top design styling") return withVision(vision?.designStyling, () => "Regular");
  // Top length (Kurta Sets): physical length of the kurta top only (not the bottom/palazzo)
  if (hl === "top length") {
    const TOP_LENGTH_MAP: Record<string, string> = {
      "above knee": "Above Knee",
      "knee length": "Knee Length", "knee": "Knee Length",
      "calf length": "Calf Length", "calf": "Calf Length", "midi": "Calf Length",
      "ankle length": "Floor Length", "floor length": "Floor Length", "maxi": "Floor Length",
    };
    return snapToMap(vision?.topLength || vision?.length || "", TOP_LENGTH_MAP) || "";
  }
  if (hl === "top shape") return withVision(vision?.shape, () => extractShape(tagMap, description));
  if (hl === "waistband") return "Elasticated";
  if (hl === "pattern coverage") {
    const fromTag = snapToMap(tagMap["pattern_coverage"] || "", { "yoke": "Yoke or Border", "border": "Yoke or Border", "placement": "Placement", "small": "Small", "large": "Large", "none": "None" });
    return fromTag || vision?.patternCoverage || "None";
  }
  if (hl === "collection name") return tagMap["collection"] || "";

  // ── Dupatta ──
  if (hl === "dupatta") return "NA";
  if (hl === "dupatta fabric") return "NA";
  if (hl === "dupatta pattern") return "NA";
  if (hl === "dupatta border") return "NA";

  // ── Counts ──
  if (hl === "number of pockets") return tagMap["pockets"] || tagMap["number_of_pockets"] || "1";
  if (hl === "number of items") return numberOfItems(articleType);
  if (hl === "net quantity unit") return netQuantityUnit(articleType);
  if (hl === "net quantity") return 1;
  if (hl === "package contains") return packageContains(articleType);

  // ── Misc ──
  if (hl === "theme" || hl === "theme 1") return "NA";
  if (hl === "style tip") return tagMap["style_tip"] || "";
  if (hl === "where-to-wear") return tagMap["where_to_wear"] || "";
  if (hl === "care for me") return tagMap["care_for_me"] || extractWashCare(tagMap, description);
  if (hl === "contact brand or retailer for pre-sales product queries") return "";
  if (hl.startsWith("bis")) return "";
  if (hl === "body shape id") return "";
  if (hl === "surface styling") return snapToMap(tagMap["surface_styling"] || description, { "embroid": "Embroidered", "embellish": "Embellished", "lace": "Lace Inserts", "gather": "Gathered or Pleated", "pleat": "Gathered or Pleated", "ruffle": "Ruffles", "smock": "Smocked", "tie": "Tie-Ups", "layered": "Layered", "sequin": "Sequined" }) || "NA";

  // ── Measurements ──
  if (hl === "across shoulder ( inches )") return measurements.shoulder;
  if (hl === "bust ( inches )") return measurements.bust;
  if (hl === "chest ( inches )") return measurements.chest;
  if (hl === "front length ( inches )") return frontLength;
  if (hl === "hips ( inches )") return measurements.hips;
  if (hl === "waist ( inches )") return measurements.waist;
  if (hl === "garment waist ( inches )") return measurements.waist;
  if (hl === "pyjama waist ( inches )") return measurements.pyjama;
  if (hl === "inseam length ( inches )") return measurements.inseam;
  if (hl === "outseam length ( inches )") return measurements.outseam;
  if (hl === "rise ( inches )") return measurements.rise;
  if (hl === "sleeve-length ( inches )") return "";
  if (hl === "to fit bust ( inches )") return measurements.toFitBust;
  if (hl === "to fit hip ( inches )") return measurements.toFitHip;
  if (hl === "to fit waist ( inches )") return measurements.toFitWaist;

  // ── Images (as hyperlinks) ──
  const imgIdx = [
    "front image", "side image", "back image",
    "detail angle", "look shot image", "additional image 1", "additional image 2",
  ].indexOf(hl);
  if (imgIdx >= 0) {
    const url = imageUrls[imgIdx] || "";
    return url ? { text: url, hyperlink: url } : "";
  }

  return "";
}

// Category tail patterns — match at the end of a stripped title (case-insensitive)
const CATEGORY_TAILS: Array<{ pattern: RegExp; tail: string }> = [
  { pattern: /kurta set$/i, tail: "Kurta Set" },
  { pattern: /co-?ord set$/i, tail: "Co-ord Set" },
  { pattern: /co-?ord$/i, tail: "Co-ord" },
  { pattern: /kurta$/i, tail: "Kurta" },
  { pattern: /dress$/i, tail: "Dress" },
  { pattern: /tunic$/i, tail: "Tunic" },
  { pattern: /top$/i, tail: "Top" },
  { pattern: /blouse$/i, tail: "Blouse" },
  { pattern: /skirt$/i, tail: "Skirt" },
  { pattern: /palazzo$/i, tail: "Palazzo" },
  { pattern: /lehenga$/i, tail: "Lehenga" },
  { pattern: /suit set$/i, tail: "Suit Set" },
  { pattern: /suit$/i, tail: "Suit" },
  { pattern: /jumpsuit$/i, tail: "Jumpsuit" },
  { pattern: /sharara set$/i, tail: "Sharara Set" },
  { pattern: /sharara$/i, tail: "Sharara" },
];

// Filler/adjective words that can be dropped when we need to save space
const FILLER_WORDS = new Set([
  "statement", "beautiful", "gorgeous", "elegant", "stunning", "classic",
  "long", "short", "maxi", "mini", "ankle", "length", "style", "look",
  "indo", "boho", "slub", "pure", "hand",
]);

function wordTrim(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  if (!s[maxLen] || s[maxLen] === " ") return s.substring(0, maxLen).trim();
  const cut = s.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.substring(0, lastSpace).trim() : cut.trim();
}

function buildListViewName(
  title: string,
  tagMap: Record<string, string>,
  description: string,
  maxLen = 28,
): string {
  // Strip colour suffix " - Ink Blue" etc.
  const base = title.replace(/\s*-\s*[^-]+$/, "").trim();

  // Detect category tail (e.g. "Kurta", "Kurta Set")
  let categoryTail = "";
  for (const { pattern, tail } of CATEGORY_TAILS) {
    if (pattern.test(base)) { categoryTail = tail; break; }
  }
  const categoryWords = categoryTail ? categoryTail.split(" ") : [];

  // Strip category tail to get descriptor portion
  const baseWithoutCategory = categoryTail
    ? base.replace(new RegExp(`\\s*${categoryTail}\\s*$`, "i"), "").trim()
    : base;

  const descWords = baseWithoutCategory.split(" ");
  const descLower = baseWithoutCategory.toLowerCase();

  // Detect fabric
  const fabric = extractFabric(tagMap, description);
  const fabricWords = fabric ? fabric.split(" ") : [];
  const fabricAlreadyPresent = fabricWords.some((w) => w.length > 3 && descLower.includes(w.toLowerCase()));

  // Helper: join words and check length, always protecting category tail at end
  const tryWords = (words: string[]): string => {
    const tail = categoryTail ? [...categoryWords] : [];
    // Remove any filler words from middle
    const mid = words.filter(w => !categoryWords.map(c=>c.toLowerCase()).includes(w.toLowerCase()));
    return [...mid, ...tail].join(" ");
  };

  // Pass 1: all descriptor words + (fabric if missing) + category
  const pass1Words = [...descWords, ...(fabricAlreadyPresent ? [] : fabricWords)];
  let candidate = tryWords(pass1Words);
  if (candidate.length <= maxLen) return candidate;

  // Pass 2: drop filler words from descriptors
  const pass2Words = descWords.filter(w => !FILLER_WORDS.has(w.toLowerCase()));
  if (!fabricAlreadyPresent) pass2Words.push(...fabricWords);
  candidate = tryWords(pass2Words);
  if (candidate.length <= maxLen) return candidate;

  // Pass 3: drop fabric words too (keep design name + key descriptor + category)
  const pass3Words = descWords.filter(w =>
    !FILLER_WORDS.has(w.toLowerCase()) &&
    !fabricWords.map(f => f.toLowerCase()).includes(w.toLowerCase())
  );
  candidate = tryWords(pass3Words);
  if (candidate.length <= maxLen) return candidate;

  // Pass 4: trim middle words while always keeping first word + category
  // Remove middle words one at a time (from right of middle) until it fits
  const trimWords = [...pass3Words];
  while (trimWords.length > 1 && tryWords(trimWords).length > maxLen) {
    trimWords.splice(trimWords.length - 1, 1); // drop last middle word
  }
  candidate = tryWords(trimWords);
  if (candidate.length <= maxLen) return candidate;

  // Last resort — hard word-trim but protect category
  const withoutCat = candidate.replace(new RegExp(`\\s*${categoryTail}\\s*$`, "i"), "").trim();
  const trimmed = wordTrim(withoutCat, maxLen - categoryTail.length - 1);
  return categoryTail ? `${trimmed} ${categoryTail}` : trimmed;
}

// ─── Main export function ─────────────────────────────────────────────────────

const SKIP_SHEETS = new Set(["__instructions", "masterdata", "instructions", "readme"]);

export async function fillMyntraTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateBuffer: any,
  products: ShopifyProduct[],
  meta: { year?: string; season?: string } = {},
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);

  // Build normalized sheet name map
  const sheetMap = new Map<string, ExcelJS.Worksheet>();
  wb.worksheets.forEach((ws) => {
    if (!SKIP_SHEETS.has(ws.name.toLowerCase().replace(/\s/g, ""))) {
      sheetMap.set(norm(ws.name), ws);
    }
  });

  // Group products by target sheet
  const sheetNames = wb.worksheets.map((ws) => ws.name);
  const bySheet = new Map<string, { ws: ExcelJS.Worksheet; products: ShopifyProduct[]; sheetName: string }>();
  for (const product of products) {
    const matchedSheetName = findMatchingSheet(product.product_type || "", sheetNames);
    if (!matchedSheetName) continue;
    const matchedKey = norm(matchedSheetName);
    if (!bySheet.has(matchedKey)) {
      bySheet.set(matchedKey, { ws: sheetMap.get(matchedKey)!, products: [], sheetName: "" });
    }
    bySheet.get(matchedKey)!.products.push(product);
  }

  // Determine display sheet name (for articleType field)
  wb.worksheets.forEach((ws) => {
    const key = norm(ws.name);
    if (bySheet.has(key)) bySheet.get(key)!.sheetName = ws.name;
  });

  // Remove sheets that have no matching products (keep masterdata/instructions)
  const sheetsToRemove = wb.worksheets.filter((ws) => {
    const key = norm(ws.name);
    const isSkipped = SKIP_SHEETS.has(ws.name.toLowerCase().replace(/\s/g, ""));
    return !isSkipped && !bySheet.has(key);
  });
  for (const ws of sheetsToRemove) {
    wb.removeWorksheet(ws.id);
  }

  for (const { ws, products: unsortedProducts, sheetName } of bySheet.values()) {
    // Sort products by VAN number ascending (BM2065 → BM2066 → BM2067)
    const sheetProducts = [...unsortedProducts].sort((a, b) => {
      const vanA = extractArticleNumber(a.variants[0]?.sku || "");
      const vanB = extractArticleNumber(b.variants[0]?.sku || "");
      const numA = parseInt(vanA.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(vanB.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
    // Read column headers from row 3
    const headers: string[] = [];
    ws.getRow(3).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = cell.value ? String(cell.value) : "";
    });

    // Find first empty data row by scanning vendorSkuCode (col 3).
    // Template has ~300 pre-existing empty validation rows, so ws.rowCount is
    // misleadingly high — we must scan rather than use rowCount + 1.
    let nextRow = 4;
    for (let r = 4; r <= ws.rowCount; r++) {
      const val = ws.getRow(r).getCell(3).value;
      if (val && String(val).trim()) {
        nextRow = r + 1; // advance past existing filled rows
      }
    }

    // Pre-compute color variant group IDs:
    // Products sharing the same base title (minus " - Colour" suffix) get the same group ID,
    // which is the vendorArticleNumber of the first product in that group.
    const colorGroupMap = new Map<string, string>(); // productId → groupArticleNumber
    const baseNameToGroupId = new Map<string, string>(); // baseName → firstArticleNumber
    for (const p of sheetProducts) {
      const baseName = p.title.replace(/\s*-\s*[^-]+$/, "").trim().toLowerCase();
      const firstVariantSku = p.variants[0]?.sku || "";
      const artNum = extractArticleNumber(firstVariantSku);
      if (!baseNameToGroupId.has(baseName)) {
        baseNameToGroupId.set(baseName, artNum);
      }
      colorGroupMap.set(p.id, baseNameToGroupId.get(baseName)!);
    }

    // Pre-fetch all vision calls in parallel (with 8s timeout per product)
    const visionMap = new Map<string, VisionAttributes | null>();
    await Promise.all(sheetProducts.map(async (product) => {
      const primaryImageUrl = product.images[0]?.src
        .replace(/_\d+x\d+(\.[a-z]+(\?.*)?)?$/i, (_, ext) => ext || "") || "";
      if (!primaryImageUrl) { visionMap.set(product.id, null); return; }
      try {
        const result = await Promise.race([
          analyzeProductImage(primaryImageUrl),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
        ]);
        visionMap.set(product.id, result);
      } catch {
        visionMap.set(product.id, null);
      }
    }));

    let styleGroupId = 1;
    for (const product of sheetProducts) {
      const tagMap = parseTagMap(product.tags);
      const description = stripHtml(product.body_html);
      // Use original full-resolution image URLs (strip thumbnail suffix)
      const imageUrls = product.images.map((img) =>
        img.src
          .replace(/_\d+x\d+(\.[a-z]+(\?.*)?)?$/i, (m, ext) => ext || "")
          .replace(/\.png(\?.*)?$/i, ".jpg$1"), // Myntra requires jpg; Shopify CDN serves png as jpg too
      );

      const vision = visionMap.get(product.id) ?? null;

      // Myntra requires the same MRP and ISP across all sizes of a style.
      // Use the minimum MRP/ISP across all variants (XS–XXL price, not 3XL+ premium).
      const baseMrp = Math.min(...product.variants.map(v => parseFloat(v.compare_at_price || v.price || "0")));
      const baseIsp = Math.min(...product.variants.map(v => parseFloat(v.price || "0")));

      for (const variant of product.variants) {
        const row = ws.getRow(nextRow++);
        headers.forEach((h, i) => {
          if (!h) return;
          const val = getValue(h, product, variant, tagMap, imageUrls, styleGroupId, sheetName, description, vision, baseMrp, baseIsp, colorGroupMap.get(product.id) || extractArticleNumber(product.variants[0]?.sku || ""), meta);
          const cell = row.getCell(i + 1);
          if (val !== null && val !== "") {
            if (typeof val === "object" && "hyperlink" in val) {
              cell.value = val as ExcelJS.CellHyperlinkValue;
            } else {
              cell.value = val as ExcelJS.CellValue;
            }
          }
        });
        row.commit();
      }
      styleGroupId++;
    }
  }

  return wb.xlsx.writeBuffer();
}

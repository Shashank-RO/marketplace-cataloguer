import type Anthropic from "@anthropic-ai/sdk";

export interface VisionAttributes {
  neck: string;
  sleeveLength: string;
  sleeveStyling: string;
  shape: string;
  length: string;
  topLength: string;
  pattern: string;
  hemline: string;
  occasion: string;
  topType: string;
  bottomType: string;
  designStyling: string;
  patternCoverage: string;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AnthropicSDK = require("@anthropic-ai/sdk").default;
    _client = new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client!;
}

const PROMPT = `You are a fashion cataloguing expert. Analyse this ethnic Indian women's garment image and return ONLY a JSON object with these fields. Use the exact allowed values listed:

neck: One of — "Round Neck", "V Neck", "High Neck", "Square Neck", "Boat Neck", "Mandarin Collar", "Sweetheart", "Off Shoulder", "Shirt Collar", "Keyhole Neck", "Scoop Neck", "" (if unclear)
sleeveLength: One of — "Sleeveless", "Short Sleeves", "3/4th Sleeve", "Long Sleeves", "Cap Sleeves", "" (if unclear)
sleeveStyling: One of — "Bell Sleeves", "Flared Sleeves", "Puff Sleeves", "Regular Sleeves", "Cold-Shoulder", "" (if unclear)
shape: One of — "A-Line", "Fit and Flare", "Straight", "Flared", "Bodycon", "Shift", "" (if unclear)
length: For sets (kurta + bottom), this is the BOTTOM garment hem length. For single garments, the garment hem length. One of — "Above Knee", "Knee Length", "Calf Length", "Ankle Length", "Floor Length", "" (if unclear)
topLength: For sets (kurta + bottom), this is ONLY the KURTA TOP hem length — where the kurta top ends, ignoring the trouser/palazzo below. One of — "Above Knee", "Knee Length", "Calf Length", "Floor Length", "" (if not a set or unclear). Typical kurta tops in sets end "Above Knee" or "Knee Length"
pattern: One of — "Floral", "Abstract", "Geometric", "Stripes", "Checked", "Animal Print", "Paisley", "Printed", "Embroidered", "Solid", "" (if unclear)
hemline: One of — "Straight", "Asymmetric", "Curved", "High-Low", "Flared", "" (if unclear)
occasion: One of — "Casual", "Daily", "Fusion", "Party", "Formal", "Wedding", "" (if unclear)
topType: One of — "Kurta", "Top", "Tunic", "Blouse", "" (if not a set)
bottomType: One of — "Trousers", "Palazzo", "Skirt", "Salwar", "Pant", "" (if not a set)
designStyling: One of — "Regular", "Printed", "Embroidered", "Yoke Design", "Placement Print", "Solid", "" (if unclear)
patternCoverage: Where is the embroidery/print concentrated? One of — "Yoke or Border" (embroidery/print only at neckline yoke or hem border), "Placement" (small placement print/embroidery at one spot), "Small" (scattered small motifs across less than 30% of garment), "Large" (heavy print/embroidery covering most of garment), "None" (solid/plain garment), "" (if unclear)

Return ONLY the JSON, no explanation.`;

// In-memory cache: image URL → attributes (valid for the process lifetime)
const visionCache = new Map<string, VisionAttributes>();

export async function analyzeProductImage(imageUrl: string): Promise<VisionAttributes | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  if (visionCache.has(imageUrl)) return visionCache.get(imageUrl)!;

  try {
    console.log("[vision] analysing:", imageUrl.substring(0, 80));
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) { console.error("[vision] image fetch failed:", imgRes.status); return null; }

    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = (imgRes.headers.get("content-type") || "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    const message = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: contentType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const attrs = JSON.parse(jsonMatch[0]) as VisionAttributes;
    console.log("[vision] result:", JSON.stringify(attrs));
    visionCache.set(imageUrl, attrs);
    return attrs;
  } catch (e) {
    console.error("[vision] analyzeProductImage error:", e instanceof Error ? e.message : e);
    return null;
  }
}

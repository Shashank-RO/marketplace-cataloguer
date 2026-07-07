export interface ShopifyImage {
  id: string;
  src: string;
  alt: string | null;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  weight: number;
  weight_unit: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  status: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options: { name: string; values: string[] }[];
}

const domain = process.env.SHOPIFY_STORE_DOMAIN;

export function shopifyFetch(path: string, token?: string) {
  const t = token || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !t) throw new Error("Shopify env vars not set");
  return fetch(`https://${domain}/admin/api/2025-01/${path}`, {
    headers: {
      "X-Shopify-Access-Token": t,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

// In-memory product page cache — 30 second TTL per cursor
const productCache = new Map<string, { data: { products: ShopifyProduct[]; nextCursor: string | null }; expiry: number }>();

/** Resize a Shopify CDN image URL to a thumbnail (e.g. 400×400) */
export function thumbSrc(src: string, size = "400x400"): string {
  // Shopify CDN: insert _SIZExSIZE before the extension
  return src.replace(/(\.[a-z]+)(\?.*)?$/i, `_${size}$1$2`);
}

export async function fetchProducts(
  cursor?: string,
  limit = 50,
  token?: string,
): Promise<{ products: ShopifyProduct[]; nextCursor: string | null }> {
  const cacheKey = cursor ?? "__first__";
  const cached = productCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const url = cursor
    ? `products.json?limit=${limit}&page_info=${cursor}`
    : `products.json?limit=${limit}&order=created_at+desc`;
  const res = await shopifyFetch(url, token);
  if (!res.ok) {
    const body = await res.text();
    console.error(`[shopify] products error ${res.status}:`, body.substring(0, 200));
    throw new Error(`Shopify error ${res.status}: ${body.substring(0, 100)}`);
  }
  const raw = await res.json();

  // Downsize thumbnail URLs so the grid loads fast
  const products: ShopifyProduct[] = (raw.products as ShopifyProduct[]).map((p) => ({
    ...p,
    images: p.images.map((img) => ({ ...img, src: thumbSrc(img.src) })),
  }));

  // Extract next page cursor from Link header
  const linkHeader = res.headers.get("link") || "";
  const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  const nextCursor = nextMatch ? nextMatch[1] : null;

  const data = { products, nextCursor };
  productCache.set(cacheKey, { data, expiry: Date.now() + 30_000 }); // 30s
  return data;
}

export interface FilterParams {
  collections: string[]; // ZKP codes — OR logic
  tags: string[];        // other tags — AND logic
  skus: string[];
  productType: string;
  cursor?: string;
}

/**
 * Server-side filtered product fetch using Shopify GraphQL.
 * Builds a query like: (tag:ZKP1174 OR tag:ZKP1175) AND tag:embroidered AND product_type:Kurta
 * Returns up to 50 matching products with cursor pagination.
 */
export async function fetchProductsFiltered(
  filters: FilterParams,
  token?: string,
): Promise<{ products: ShopifyProduct[]; nextCursor: string | null }> {
  const t = token || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !t) throw new Error("Shopify env vars not set");

  // Strip characters that would break out of the GraphQL string literal or the
  // Shopify search syntax (quotes, backslashes, parens, extra colons)
  const clean = (s: string) => s.replace(/["\\():]/g, "").trim();

  // Build Shopify query string
  const parts: string[] = [];

  if (filters.collections.length > 0) {
    const orPart = filters.collections.map((c) => `tag:${clean(c)}`).join(" OR ");
    parts.push(filters.collections.length > 1 ? `(${orPart})` : orPart);
  }
  for (const tag of filters.tags) {
    parts.push(`tag:${clean(tag)}`);
  }
  if (filters.productType) {
    parts.push(`product_type:${clean(filters.productType)}`);
  }
  // SKU search: use Shopify sku: query so we search the whole catalogue, not just first page
  if (filters.skus.length > 0) {
    const skuPart = filters.skus.map((s) => `sku:${clean(s)}*`).join(" OR ");
    parts.push(filters.skus.length > 1 ? `(${skuPart})` : skuPart);
  }

  const queryString = parts.join(" AND ");

  const afterClause = filters.cursor ? `, after: "${clean(filters.cursor)}"` : "";

  const graphqlQuery = `{
    products(first: 50, query: "${queryString}"${afterClause}, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          images(first: 1) {
            edges { node { id url altText } }
          }
          variants(first: 100) {
            edges {
              node {
                id title sku price compareAtPrice
                inventoryQuantity
                selectedOptions { name value }
              }
            }
          }
          options { name values }
        }
      }
    }
  }`;

  const res = await fetch(`https://${domain}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": t, "Content-Type": "application/json" },
    body: JSON.stringify({ query: graphqlQuery }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Shopify GraphQL error ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);

  // Map GraphQL shape → REST-compatible ShopifyProduct shape
  const products: ShopifyProduct[] = data.products.edges
    .map((e: { node: Record<string, unknown> }) => {
      const n = e.node as {
        id: string;
        title: string;
        descriptionHtml: string;
        vendor: string;
        productType: string;
        tags: string[];
        status: string;
        images: { edges: { node: { id: string; url: string; altText: string | null } }[] };
        variants: { edges: { node: { id: string; title: string; sku: string; price: string; compareAtPrice: string | null; inventoryQuantity: number; selectedOptions: { name: string; value: string }[] } }[] };
        options: { name: string; values: string[] }[];
      };

      const id = n.id.replace("gid://shopify/Product/", "");

      const images: ShopifyImage[] = n.images.edges.map((ie) => ({
        id: ie.node.id.replace("gid://shopify/ProductImage/", ""),
        src: thumbSrc(ie.node.url),
        alt: ie.node.altText,
      }));

      const variants: ShopifyVariant[] = n.variants.edges.map((ve) => {
        const v = ve.node;
        return {
          id: v.id.replace("gid://shopify/ProductVariant/", ""),
          title: v.title,
          sku: v.sku,
          price: v.price,
          compare_at_price: v.compareAtPrice,
          inventory_quantity: v.inventoryQuantity,
          option1: v.selectedOptions[0]?.value ?? null,
          option2: v.selectedOptions[1]?.value ?? null,
          option3: v.selectedOptions[2]?.value ?? null,
          weight: 0,
          weight_unit: "kg",
        };
      });

      // Post-filter by SKU if needed (GraphQL doesn't support SKU query natively)
      return {
        id,
        title: n.title,
        body_html: n.descriptionHtml,
        vendor: n.vendor,
        product_type: n.productType,
        tags: n.tags.join(", "),
        status: n.status.toLowerCase(),
        images,
        variants,
        options: n.options,
      } as ShopifyProduct;
    })
    .filter((p: ShopifyProduct) => {
      // SKU filter — exact match or {sku}-{size} suffix only
      if (filters.skus.length === 0) return true;
      const variantSkus = p.variants.map((v) => v.sku?.trim().toLowerCase()).filter(Boolean);
      return filters.skus.some((s) => {
        const sl = s.toLowerCase();
        return variantSkus.some((vs) => vs === sl || vs.startsWith(sl + "-"));
      });
    });

  const pageInfo = data.products.pageInfo;
  const nextCursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;

  return { products, nextCursor };
}

export async function fetchProduct(id: string, token?: string): Promise<ShopifyProduct> {
  const res = await shopifyFetch(`products/${id}.json`, token);
  if (!res.ok) throw new Error(`Shopify error ${res.status}`);
  const data = await res.json();
  return data.product;
}

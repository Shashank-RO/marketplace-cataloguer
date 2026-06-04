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
const token = process.env.SHOPIFY_ADMIN_TOKEN;

function shopifyFetch(path: string) {
  if (!domain || !token) throw new Error("Shopify env vars not set");
  return fetch(`https://${domain}/admin/api/2024-01/${path}`, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

export async function fetchProducts(page = 1, limit = 50): Promise<ShopifyProduct[]> {
  const res = await shopifyFetch(`products.json?limit=${limit}&page=${page}&status=active`);
  if (!res.ok) throw new Error(`Shopify error ${res.status}`);
  const data = await res.json();
  return data.products;
}

export async function fetchProduct(id: string): Promise<ShopifyProduct> {
  const res = await shopifyFetch(`products/${id}.json`);
  if (!res.ok) throw new Error(`Shopify error ${res.status}`);
  const data = await res.json();
  return data.product;
}

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "djrmra08z";

/**
 * Returns a Cloudinary fetch URL that serves the source image cropped to 3:4
 * portrait using face-gravity. Cloudinary fetches and caches on first access.
 */
export function cloudinaryFetchUrl(sourceUrl: string): string {
  const transformation = "c_fill,ar_3:4,g_face";
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/fetch/${transformation}/${encodeURI(sourceUrl)}`;
}

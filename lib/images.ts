import type { Listing, ListingImage } from "./types";

/**
 * Resolve the display URL for one image record.
 * 1) stored copy if the pipeline finished and a CDN base is configured
 * 2) original source URL as a temporary fallback (may be referrer-blocked)
 * 3) null → caller renders a placeholder
 */
export function resolveImageUrl(
  image: ListingImage,
  imageStatus: Listing["image_status"]
): string | null {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;
  if (image.stored_path && imageStatus === "ready" && base) {
    return `${base.replace(/\/$/, "")}/${image.stored_path}`;
  }
  if (image.source_url) return image.source_url;
  return null;
}

/** Main image: is_main flag wins, else lowest position. */
export function pickMainImage(images: ListingImage[]): ListingImage | null {
  if (images.length === 0) return null;
  const main = images.find((i) => i.is_main);
  if (main) return main;
  return [...images].sort((a, b) => a.position - b.position)[0];
}

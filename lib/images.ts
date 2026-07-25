import type { ListingImage } from "./types";

/**
 * Every image is addressed through our own origin. The route behind this path
 * decides whether to serve the stored copy or fetch upstream, so no collection
 * source is ever exposed to the browser.
 */
export function resolveImageUrl(image: ListingImage): string {
  return `/img/${image.listing_id}/${image.position}`;
}

/** Main image: is_main flag wins, else lowest position. */
export function pickMainImage(images: ListingImage[]): ListingImage | null {
  if (images.length === 0) return null;
  const main = images.find((i) => i.is_main);
  if (main) return main;
  return [...images].sort((a, b) => a.position - b.position)[0];
}

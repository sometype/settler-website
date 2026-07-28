import type { ListingImage } from "./types";

/**
 * Every image is addressed through our own origin. The route behind this path
 * decides whether to serve the stored copy or fetch upstream, so no collection
 * source is ever exposed to the browser.
 */
export function resolveImageUrl(image: ListingImage): string {
  return `/img/${image.listing_id}/${image.position}`;
}

/**
 * THE ONE PLACE A COVER IS CHOSEN. Every surface — feed, all three rails, the
 * detail gallery — goes through this. It used to be inlined four more times in
 * lib/listings.ts while this helper sat unused, which is the same defect class
 * as the three-copy rail markup where a fix landed in two places and not the
 * third. If the rule changes, it changes here and nowhere else.
 *
 * Legacy rule: is_main wins, else lowest position.
 *
 * ⚠️ Measured 2026-07-28: `is_main` is true on exactly one row per listing and
 * ALWAYS at position 0 (2,460 of 2,460 listings, 0 exceptions in 24,268 rows).
 * So the flag has never once disagreed with "lowest position" — the legacy rule
 * is really just "first photo", and consolidating it could not change a single
 * cover. Do not read the flag as evidence anyone curated anything.
 */
export function pickMainImage(images: ListingImage[]): ListingImage | null {
  if (images.length === 0) return null;
  let best: ListingImage | null = null;
  for (const img of images) {
    if (best === null || compareForCover(img, best) < 0) best = img;
  }
  return best;
}

/**
 * Cover ordering, lowest sorts first.
 *
 * `serve_rank` is the score-aware order computed in the database (see
 * sql/011). It is a bare integer on purpose: the CLASS behind it
 * (platform_mark, third_party_logo…) names the collection source and must
 * never reach the browser. When the serving view is not in use the field is
 * absent and this falls back to the legacy is_main/position rule, so a single
 * comparator serves both the flag-off and flag-on paths.
 */
function compareForCover(a: ListingImage, b: ListingImage): number {
  if (a.serve_rank !== undefined && b.serve_rank !== undefined) {
    if (a.serve_rank !== b.serve_rank) return a.serve_rank - b.serve_rank;
  }
  if (a.is_main !== b.is_main) return a.is_main ? -1 : 1;
  return a.position - b.position;
}

/**
 * `serve_rank` is an ORDERING INPUT, never an output. Once a cover has been
 * picked or a gallery sorted, the rank has done its whole job, so it is dropped
 * here at the boundary.
 *
 * ⚠️ This is load-bearing, not tidiness. `Gallery` is a client component, so
 * every field on the rows it receives is serialized into the RSC payload in the
 * page HTML — measured 2026-07-28, `"serve_rank":0` appeared 10 times on
 * /listing/2568 before this existed. A rank in the markup invites exactly the
 * question the /img route exists to prevent ("ranked by what?"), and the client
 * has no use for it: the server already applied it.
 */
function toClientImage(img: ListingImage): ListingImage {
  return { listing_id: img.listing_id, position: img.position, is_main: img.is_main };
}

/**
 * Cover per listing for a batch of image rows, in one pass.
 *
 * Every feed and rail query pulls images for many listings at once and needs
 * exactly this map; before consolidation each one rebuilt it inline.
 */
export function indexMainImages(images: ListingImage[]): Map<number, ListingImage> {
  const covers = new Map<number, ListingImage>();
  for (const img of images) {
    const current = covers.get(img.listing_id);
    if (!current || compareForCover(img, current) < 0) {
      covers.set(img.listing_id, img);
    }
  }
  for (const [id, img] of covers) covers.set(id, toClientImage(img));
  return covers;
}

/**
 * Gallery order for a single listing's photos — the detail page. Same rule as
 * the cover, applied to the whole set, so the photo a caller sees first is the
 * photo the card promised. Pure: the caller's array is not mutated.
 */
export function orderForGallery(images: ListingImage[]): ListingImage[] {
  return [...images].sort(compareForCover).map(toClientImage);
}

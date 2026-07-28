/**
 * Best-cover selection: the switch, and nothing else.
 *
 * The classifier scores photos in the database (image_quality.cover_penalty)
 * and sql/011 turns those scores into a per-listing `serve_rank`. This module
 * decides whether the site reads that or the legacy is_main/position order.
 *
 * THREE MODES, and the default is the old behaviour:
 *   off     — read `listing_images`, legacy rule. Identical to before this
 *             feature existed. This is what an unset env var gives you.
 *   shadow  — read `listing_images_served` (so serve_rank is available) but
 *             SERVE the legacy pick, logging where the two disagree. Lets the
 *             disagreement rate be measured on real traffic before anyone sees
 *             a different photo.
 *   on      — read the view and serve its pick.
 *
 * Rollback is setting the variable back to `off` and redeploying — no data
 * migration, no re-scoring, no new R2 objects to unwind.
 *
 * Server-side only. It is NOT NEXT_PUBLIC_: the flag drives a server query and
 * a public var would ship the rollout state to the browser for no reason.
 */
import { indexMainImages } from "./images";
import type { ListingImage } from "./types";

export type CoverSelectMode = "off" | "shadow" | "on";

export function coverSelectMode(): CoverSelectMode {
  const raw = (process.env.COVER_SELECT ?? "").trim().toLowerCase();
  if (raw === "on" || raw === "shadow") return raw;
  return "off";
}

/**
 * Which relation to read image rows from.
 *
 * `listing_images_served` exposes exactly the same client-safe columns plus
 * `serve_rank`; it never exposes the class labels, which name the source site.
 */
export function imageSource(): "listing_images" | "listing_images_served" {
  return coverSelectMode() === "off" ? "listing_images" : "listing_images_served";
}

/** Client-safe image columns: enough to build the /img path, nothing more. */
export function imageColumns(): string {
  return coverSelectMode() === "off"
    ? "listing_id, position, is_main"
    : "listing_id, position, is_main, serve_rank";
}

/**
 * In shadow mode the score-aware pick is computed but not served. Stripping
 * serve_rank makes the shared comparator fall back to the legacy rule on its
 * own — one code path, no parallel "legacy" implementation to drift out of
 * sync with the real one.
 */
function stripServeRank(rows: ListingImage[]): ListingImage[] {
  return rows.map(({ ...row }) => {
    delete row.serve_rank;
    return row;
  });
}

/**
 * Gate every batch of image rows through this before picking covers.
 *
 * `on`     — rows pass through with their ranks, so the pick is score-aware.
 * `shadow` — ranks are stripped (legacy photo is served) after logging how many
 *            listings WOULD have changed cover. That count is the whole point
 *            of the mode: it is the blast radius, measured on real traffic,
 *            before a visitor sees a different photo.
 * `off`    — rows have no ranks to begin with; this is a no-op.
 *
 * Logs to the server console only. It must never become a `site_events` row:
 * that table is the product funnel, and a rollout diagnostic firing on every
 * render is exactly how `filter_apply` came to count page views for weeks.
 */
export function applyCoverMode(rows: ListingImage[], surface: string): ListingImage[] {
  if (coverSelectMode() !== "shadow") return rows;

  const legacyRows = stripServeRank(rows);
  const scored = indexMainImages(rows);
  const legacy = indexMainImages(legacyRows);

  let changed = 0;
  for (const [listingId, pick] of scored) {
    if (legacy.get(listingId)?.position !== pick.position) changed += 1;
  }
  if (changed > 0) {
    console.log(
      `[cover-shadow] surface=${surface} listings=${scored.size} would_change=${changed}`
    );
  }
  return legacyRows;
}

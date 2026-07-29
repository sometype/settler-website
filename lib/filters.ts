import type { FeedFilters } from "./types";
import { isKnownDistrictCode } from "./districts";
import { isFilterAmenity } from "./amenities";

export type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : undefined;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function parseFilters(params: SearchParams): FeedFilters {
  const rooms = str(params.rooms);
  const deal = str(params.deal) ?? str(params.deal_type);
  // Default to rent so the homepage doesn't mix $500/mo with $80k sales.
  const dealType =
    deal === "sale" || deal === "rent" ? deal : deal === "all" ? undefined : "rent";
  let minPrice = num(params.min);
  let maxPrice = num(params.max);
  // Reversed range would silently return nothing; treat it as the intended range.
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  // Amenity chips arrive as ?amen=furniture,elevator — unknown keys dropped,
  // so a crafted URL can't smuggle arbitrary strings into the query.
  const amenities = (str(params.amen) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isFilterAmenity);
  // District is a canonical code from the dropdown. Anything else (old
  // free-text URLs, typos) is ignored rather than silently matching nothing.
  const district = str(params.district);
  // A channel opened full-screen. Named `view`, not folded into the filter
  // params, precisely so nobody later "tidies" it into hasActiveFilters —
  // see the note on FeedFilters.view and hasActiveFilters below.
  const view = str(params.view);
  return {
    district: district && isKnownDistrictCode(district) ? district : undefined,
    minPrice,
    maxPrice,
    rooms: rooms && ["1", "2", "3", "4", "5+"].includes(rooms) ? rooms : undefined,
    dealType,
    amenities: amenities.length > 0 ? amenities : undefined,
    view: view === "intake" || view === "hot" ? view : undefined,
    page: Math.max(1, num(params.page) ?? 1),
  };
}

/**
 * Is a channel open as a full list?
 *
 * Kept as its own predicate rather than a third branch inside the filter
 * helpers, because it answers a different question: "which surface is this?",
 * not "what has the visitor narrowed to?".
 */
export function isChannelView(f: FeedFilters): boolean {
  return f.view !== undefined;
}

/**
 * Filters that NARROW the catalogue, ignoring the deal tab.
 *
 * Rent/sale is a mode switch rather than a filter — each mode has its own
 * arrivals worth surfacing — so the "just added" strip keys off this instead of
 * `hasActiveFilters`, which counts a sale tab as an active filter.
 */
export function hasNarrowingFilters(f: FeedFilters): boolean {
  return Boolean(
    f.district ||
      f.minPrice !== undefined ||
      f.maxPrice !== undefined ||
      f.rooms ||
      (f.amenities && f.amenities.length > 0)
  );
}

/**
 * Has the visitor actually narrowed the catalogue?
 *
 * ⚠️ THIS DRIVES `filter_apply` (via FeedBeacon). Adding anything here that is
 * not a genuine narrowing action re-creates the bug that made every funnel
 * number before 2026-07-27 meaningless: the beacon fired on every feed render,
 * so "filter_apply" was really page views and the funnel compared two different
 * things. `view` (a channel opened full-screen) is therefore deliberately
 * ABSENT — it changes which surface you are on, not what you filtered to.
 * If you add a param to this function, ask first whether a user would call it
 * "I filtered".
 */
export function hasActiveFilters(f: FeedFilters): boolean {
  return Boolean(
    f.district ||
      f.minPrice !== undefined ||
      f.maxPrice !== undefined ||
      f.rooms ||
      (f.amenities && f.amenities.length > 0) ||
      (f.dealType && f.dealType !== "rent")
  );
}

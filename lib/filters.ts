import type { FeedFilters, FeedSort } from "./types";
import { isKnownDistrictCode } from "./districts";
import { isConditionCode } from "./labels";

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
  // Sale is the homepage's default mode. Keep `deal=rent` explicit so old
  // rental links remain stable; `deal=all` is still the only mixed catalogue.
  const dealType =
    deal === "sale" || deal === "rent" ? deal : deal === "all" ? undefined : "sale";
  let minPrice = num(params.min);
  let maxPrice = num(params.max);
  // Reversed range would silently return nothing; treat it as the intended range.
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  let minArea = num(params.mina);
  let maxArea = num(params.maxa);
  // Same swap as price: a reversed range would silently return nothing.
  if (minArea !== undefined && maxArea !== undefined && minArea > maxArea) {
    [minArea, maxArea] = [maxArea, minArea];
  }
  // ⚠️ `?amen=` is deliberately NOT parsed any more (amenity chips removed
  // 2026-07-29 — see lib/amenities.ts for the measurement). Old bookmarks and
  // ad links carrying it now show unfiltered results, which is the right
  // failure: the alternative is a redirect for a parameter nothing produces.
  // FilterBar strips it on the next interaction.
  // კარკასი grade. ⚠️ Gated on sale: 149 of 151 frame listings are sale, the
  // chips only render there, and accepting it on rent would let `?frame=white`
  // narrow the feed with no visible control to explain or clear it.
  const frame = str(params.frame);
  const conditionCode =
    dealType === "sale" && frame && isConditionCode(frame) ? frame : undefined;
  // Districts: multi-select OR. URL forms accepted:
  //   ?district=saburtalo              (legacy single)
  //   ?district=saburtalo,vake         (preferred multi)
  //   ?district=saburtalo&district=vake (array form from some clients)
  // Unknown codes dropped; order preserved; capped so a crafted URL cannot
  // explode PostgREST `.in()` lists.
  const districts = parseDistrictCodes(params.district);
  // A channel opened full-screen. Named `view`, not folded into the filter
  // params, precisely so nobody later "tidies" it into hasActiveFilters —
  // see the note on FeedFilters.view and hasActiveFilters below.
  const view = str(params.view);
  // Sort is a mode, not a filter — see FeedFilters.sort. deal=all must not
  // price-order a mixed rent/sale catalogue (monthly $ vs sale $).
  const rawSort = str(params.sort);
  let sort: FeedSort =
    rawSort === "price_asc" || rawSort === "price_desc" ? rawSort : "new";
  if (dealType === undefined && sort !== "new") {
    sort = "new";
  }
  return {
    districts: districts.length > 0 ? districts : undefined,
    minPrice,
    maxPrice,
    rooms: rooms && ["1", "2", "3", "4", "5+"].includes(rooms) ? rooms : undefined,
    dealType,
    minArea,
    maxArea,
    conditionCode,
    view: view === "intake" || view === "hot" ? view : undefined,
    sort,
    page: Math.max(1, num(params.page) ?? 1),
  };
}

/** Explicit price sort — hides homepage rails (ordered grid must be complete). */
export function isPriceSort(f: FeedFilters): boolean {
  return f.sort === "price_asc" || f.sort === "price_desc";
}

/** Max districts in one filter. Plenty for "Saburtalo + Vake + Vera"; not a dump of the whole city. */
export const MAX_DISTRICTS = 8;

/**
 * Parse district query value(s) into a de-duplicated list of known codes.
 * Shared so FilterBar and the server agree on what a multi-select URL means.
 */
export function parseDistrictCodes(
  raw: string | string[] | undefined
): string[] {
  const parts: string[] = [];
  const push = (s: string) => {
    for (const piece of s.split(",")) {
      const code = piece.trim().toLowerCase();
      if (code) parts.push(code);
    }
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") push(item);
    }
  } else if (typeof raw === "string") {
    push(raw);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of parts) {
    if (!isKnownDistrictCode(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_DISTRICTS) break;
  }
  return out;
}

/** Serialize for the URL (empty string clears the param). */
export function serializeDistricts(codes: string[]): string {
  return parseDistrictCodes(codes).join(",");
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
    (f.districts && f.districts.length > 0) ||
      f.minPrice !== undefined ||
      f.maxPrice !== undefined ||
      f.minArea !== undefined ||
      f.maxArea !== undefined ||
      f.conditionCode ||
      f.rooms
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
    (f.districts && f.districts.length > 0) ||
      f.minPrice !== undefined ||
      f.maxPrice !== undefined ||
      f.minArea !== undefined ||
      f.maxArea !== undefined ||
      f.conditionCode ||
      f.rooms ||
      (f.dealType && f.dealType !== "sale")
  );
}

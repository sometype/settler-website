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
  return {
    district: district && isKnownDistrictCode(district) ? district : undefined,
    minPrice,
    maxPrice,
    rooms: rooms && ["1", "2", "3", "4", "5+"].includes(rooms) ? rooms : undefined,
    dealType,
    amenities: amenities.length > 0 ? amenities : undefined,
    page: Math.max(1, num(params.page) ?? 1),
  };
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

import type { ConditionCode } from "./labels";

export type DealType = "rent" | "sale";

/**
 * Public shape only. Collection-provenance columns (`source`, `source_id`,
 * `url`) are deliberately absent: they are never selected, never serialized to
 * the client, and nothing in the UI may reintroduce them.
 */
/**
 * Facts the description worker extracted from the listing's own text.
 * Enum strings ("yes" | "no" | "unstated") + an integer — no free text.
 */
export interface DescFacts {
  parking?: string;
  furnished?: string;
  min_months?: number;
  metro_nearby?: string;
  pets_allowed?: string;
  deposit_required?: string;
  utilities_included?: string;
}

export interface Listing {
  id: number;
  deal_type: DealType;
  district: string | null;
  /**
   * Canonical district slug — "Saburtalo" and "საბურთალო" are both
   * `saburtalo`. Filtering happens on this; `district` is the display
   * fallback for unmapped codes.
   */
  district_code: string | null;
  rooms: string | null;
  price_usd: number | null;
  /**
   * Previous price when the current price is still a recorded drop
   * (see listings.price_drop_*). Null when no honest old price.
   */
  price_drop_from_usd?: number | null;
  /** When that drop was observed in our DB. */
  price_dropped_at?: string | null;
  area: number | null;
  floor: string | null;
  bathrooms: string | null;
  build_period: string | null;
  condition: string | null;
  status: string | null;
  project_type: string | null;
  balcony: string | null;
  /** Raw source text, exactly as the owner wrote it. Fallback only. */
  description: string | null;
  /**
   * Cleaned Georgian text from the description worker: phone numbers, agent-directed
   * asides and shouting removed, no facts added. Null until the listing is processed,
   * which is why the UI falls back to `description`.
   */
  description_ka: string | null;
  /**
   * pending | empty | clean | held | flagged_agent | fail_open.
   * `flagged_agent` rows never reach the client — the public view filters them out.
   */
  description_status: string | null;
  /**
   * Presence map {key: true} — union of structured source amenities and
   * facts mined from the listing text (merged in the DB view). Absence
   * means UNKNOWN, never "doesn't have".
   */
  amenities: Record<string, boolean>;
  /** Rental-terms facts from the text (deposit, min term, pets…). */
  desc_facts: DescFacts | null;
  views: number | null;
  image_status: "pending" | "ready" | "failed";
  first_seen_at: string;
  /**
   * When the monitor (or a scraper re-observing it) last confirmed this
   * listing still exists at the source. Measured 2026-07-26: median 3.6h,
   * worst 6.0h, zero never-checked. Means "last seen to be real" rather
   * than "independently re-verified" — do not over-promise in UI copy.
   */
  last_checked_at: string | null;
  last_seen_at: string;
  /** Seller phone when available (public by product design). */
  phone: string | null;
  has_phone: boolean;
}

/**
 * Feed-side image row. `source_url` / `stored_path` stay server-side in the
 * /img route; the client only ever receives listing_id + position.
 */
export interface ListingImage {
  listing_id: number;
  position: number;
  is_main: boolean;
  /**
   * Score-aware cover order within the listing, lowest first. Present only when
   * reading through `listing_images_served` (sql/011); absent means the legacy
   * is_main/position rule applies.
   *
   * ⚠️ Deliberately a bare integer. The classes behind it — `platform_mark`,
   * `third_party_logo` — name the site a photo was collected from, and shipping
   * those strings to the browser would leak provenance the whole /img design
   * exists to hide. The rank leaks nothing: it is just an order.
   */
  serve_rank?: number;
}

export interface FeedFilters {
  /**
   * Canonical district codes (lib/districts.ts). Multi-select OR filter —
   * a listing matches if its district_code is any of these.
   *
   * URL: `?district=saburtalo,vake` (comma-separated). A single code still
   * works for old bookmarks and district-rail links. Empty / missing = all
   * districts. Cap is enforced in parseFilters so a crafted URL cannot
   * explode the query.
   */
  districts?: string[];
  minPrice?: number;
  maxPrice?: number;
  rooms?: string;
  /** Default on the feed is sale; rent remains available via `deal=rent`. */
  dealType?: DealType;
  /**
   * Floor area in m², inclusive. Replaced the amenity chips 2026-07-29:
   * measured over 24h, amenity filters were used in 6.8% of filter
   * applications but appeared in 48% of all dead-end searches — the biggest
   * single source of "no results" on the site. `area` is populated on 99.4% of
   * live listings, so this narrows without stranding people.
   *
   * ⚠️ A listing with `area IS NULL` disappears once either bound is set —
   * that is plain SQL, and it matches what `min`/`max` already do to a listing
   * with no price. Do not invent a zero.
   */
  minArea?: number;
  maxArea?: number;
  /**
   * კარკასი grade — an unfinished shell a buyer intends to finish themselves.
   *
   * ⚠️ SALE ONLY. Measured 2026-07-29: 149 of 151 frame listings are sale
   * (rent had exactly 2 green). `parseFilters` refuses this unless the deal is
   * sale, so a crafted `?frame=white` on rent cannot create an invisible filter
   * that narrows results with no chip to explain it.
   */
  conditionCode?: ConditionCode;
  /**
   * A channel opened full-screen ("see all"), NOT a filter.
   *
   * ⚠️ This is a MODE, like the rent/sale tab. It must never be added to
   * `hasActiveFilters` — that predicate drives `filter_apply`, and counting a
   * "see all" tap as a filter application would re-inflate the exact metric
   * that spent weeks measuring page views instead of filtering. It DOES
   * suppress the rails, because the channel and its own rail must not both
   * render. See lib/filters.ts for the two predicates and why they differ.
   */
  view?: ChannelView;
  /**
   * Feed ordering mode — NOT a filter. Must never enter hasActiveFilters /
   * hasNarrowingFilters (would poison filter_apply). Price modes hide browse
   * rails so the ordered grid is the full catalogue (Claude/GPT R1).
   * Requires listings_public.price_sort (sql/015) so display-sane prices sort
   * and garbage «ფასი მოთხოვნით» values null out (NULLS LAST).
   */
  sort: FeedSort;
  page: number;
}

/** Channels that can be opened as a full list. Each channel must retain the
 * ordering that earns its label: intake is newest-first; hot is rolling
 * attention from sql/010. */
export type ChannelView = "intake" | "hot";

/** Catalogue order. Default `new` = first_seen_at DESC. */
export type FeedSort = "new" | "price_asc" | "price_desc";

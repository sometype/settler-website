import { getSupabase } from "./supabase";
import type { FeedFilters, Listing, ListingImage } from "./types";

export const PAGE_SIZE = 24;

const FIVE_PLUS_ROOMS = ["5", "6", "7", "8", "9", "10", "11", "12"];

/**
 * Explicit column list, never `*`. `source`, `source_id` and `url` exist on the
 * table but must not reach the client, and an explicit list keeps that true
 * regardless of what the view happens to expose.
 */
// Kept as one literal (not a joined array) so supabase-js can infer row types.
const LISTING_COLUMNS =
  "id, deal_type, district, district_code, rooms, price_usd, area, floor, bathrooms, build_period, condition, status, project_type, balcony, description, description_ka, description_status, amenities, desc_facts, views, image_status, first_seen_at, last_seen_at, last_checked_at, phone, has_phone";

/** Client-safe image columns: enough to build the /img path, nothing more. */
const IMAGE_COLUMNS = "listing_id, position, is_main";

export interface FeedResult {
  listings: Listing[];
  mainImages: Map<number, ListingImage>;
  total: number;
  page: number;
  pageCount: number;
}

// Applies the shared filter set to either the page query or the count query.
// Structural type instead of PostgrestFilterBuilder: the builder's own generics
// are deep enough that constraining on them trips TS2589.
interface Filterable {
  ilike(column: string, pattern: string): Filterable;
  gte(column: string, value: number): Filterable;
  lte(column: string, value: number): Filterable;
  in(column: string, values: string[]): Filterable;
  eq(column: string, value: string): Filterable;
  contains(column: string, value: Record<string, boolean>): Filterable;
}

function applyFilters<T>(query: T, filters: FeedFilters): T {
  let q = query as unknown as Filterable;
  if (filters.district) {
    // Canonical code (parseFilters validated it) — matches the listing no
    // matter which language the source spelled the district in.
    q = q.eq("district_code", filters.district);
  }
  for (const key of filters.amenities ?? []) {
    // jsonb containment — each selected amenity must be present (AND).
    q = q.contains("amenities", { [key]: true });
  }
  if (filters.minPrice !== undefined) {
    q = q.gte("price_usd", filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    q = q.lte("price_usd", filters.maxPrice);
  }
  if (filters.rooms) {
    q = filters.rooms === "5+" ? q.in("rooms", FIVE_PLUS_ROOMS) : q.eq("rooms", filters.rooms);
  }
  if (filters.dealType) {
    q = q.eq("deal_type", filters.dealType);
  }
  return q as unknown as T;
}

export async function fetchFeed(
  filters: FeedFilters,
  /**
   * Listings already shown in a rail above the feed. Measured on production
   * before this existed: the just-added rail's 8 cards were the feed's first 8,
   * same ids in the same order — the page repeated itself and read as padding.
   * Excluded from the ROWS only; `total` still counts the whole inventory,
   * because "784 განცხადება" should mean what it says.
   */
  excludeIds: number[] = []
): Promise<FeedResult> {
  const supabase = getSupabase();

  let base = applyFilters(
    supabase
      .from("listings_public")
      .select(LISTING_COLUMNS, { count: "exact" })
      .order("first_seen_at", { ascending: false }),
    filters
  );
  if (excludeIds.length > 0) {
    base = base.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const query = base;

  const from = (filters.page - 1) * PAGE_SIZE;
  let { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error?.code === "PGRST103") {
    // ?page= beyond the data: PostgREST rejects the range outright. Recover the
    // real total so the UI can render "page doesn't exist" instead of an error.
    const head = await applyFilters(
      supabase.from("listings_public").select("*", { count: "exact", head: true }),
      filters
    );
    data = [];
    error = head.error;
    count = head.count;
  }
  if (error) throw new Error(`Failed to load listings: ${error.message}`);

  const listings = (data ?? []) as Listing[];
  const total = count ?? 0;

  const mainImages = new Map<number, ListingImage>();
  if (listings.length > 0) {
    const ids = listings.map((l) => l.id);
    const { data: images, error: imgError } = await supabase
      .from("listing_images")
      .select(IMAGE_COLUMNS)
      .in("listing_id", ids)
      .order("position", { ascending: true });
    // Images are non-critical on the feed; cards fall back to placeholders.
    if (!imgError && images) {
      for (const img of images as ListingImage[]) {
        const current = mainImages.get(img.listing_id);
        if (!current || (img.is_main && !current.is_main)) {
          mainImages.set(img.listing_id, img);
        }
      }
    }
  }

  return {
    listings,
    mainImages,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export interface JustAddedResult {
  listings: Listing[];
  mainImages: Map<number, ListingImage>;
}

/**
 * How far back "ახლახან დაემატა" reaches, per deal type.
 *
 * Rent: 12h. Measured against 4 days of intake (2026-07-26): a 6h window
 * bottoms out at 5 live rent listings around 03:00 UTC — too thin for the
 * rail — while 12h never drops below 42. Unbounded is worse in the other
 * direction: a 5-day-old listing under a "just added" heading is a lie.
 * ⚠️ One night of buckets is not eternal law — re-check before treating this
 * as settled (see HANDOFF 2026-07-26).
 *
 * Sale: 48h. Sale intake is roughly half of rent and the sale funnel is
 * consideration, not urgency, so a wider window is honest there.
 */
const JUST_ADDED_WINDOW_H: Record<"rent" | "sale", number> = { rent: 12, sale: 48 };

/**
 * Below this many cards the rail hides entirely — a two-card "rail" reads as
 * a dead marketplace, which is worse than no rail. Never pad with old stock.
 */
export const JUST_ADDED_MIN_CARDS = 4;

/** The newest arrivals inside the freshness window, for the strip above the feed. */
export async function fetchJustAdded(
  dealType: FeedFilters["dealType"],
  limit = 8
): Promise<JustAddedResult> {
  const supabase = getSupabase();

  const windowH = JUST_ADDED_WINDOW_H[dealType === "sale" ? "sale" : "rent"];
  const cutoff = new Date(Date.now() - windowH * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("listings_public")
    .select(LISTING_COLUMNS)
    .gte("first_seen_at", cutoff)
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  // Same reason parseFilters defaults to rent: a $94,000 sale next to a $533
  // rent reads as broken, and the feed below the strip is deal-scoped too.
  if (dealType) query = query.eq("deal_type", dealType);

  const { data, error } = await query;

  // The strip is decoration over the feed — never let it break the page.
  if (error || !data) return { listings: [], mainImages: new Map() };

  const listings = data as Listing[];
  const mainImages = new Map<number, ListingImage>();
  if (listings.length > 0) {
    const { data: images } = await supabase
      .from("listing_images")
      .select(IMAGE_COLUMNS)
      .in(
        "listing_id",
        listings.map((l) => l.id)
      )
      .order("position", { ascending: true });
    for (const img of (images ?? []) as ListingImage[]) {
      const current = mainImages.get(img.listing_id);
      if (!current || (img.is_main && !current.is_main)) {
        mainImages.set(img.listing_id, img);
      }
    }
  }

  return { listings, mainImages };
}

/** Minimum cards before the hot rail renders — same discipline as just-added:
 *  a rail padded with lukewarm listings lies about what it is showing. */
export const HOT_MIN_CARDS = 4;
/** Only the top of each (source × age band) cohort, and only cohorts big enough
 *  for a percentile to mean anything. */
const HOT_MIN_PCT = 90;
const HOT_MIN_BAND_N = 8;

/**
 * "People are looking at this" — a rolling 12h peak from view_samples, ranked
 * inside each source and age band. See sql/010 for why every one of those words
 * matters; the short version is that the obvious implementations produce either
 * an all-myhome list, a list of listings that were hot three days ago, or a
 * duplicate of just-added.
 */
export async function fetchHot(
  dealType: FeedFilters["dealType"],
  limit = 8
): Promise<JustAddedResult> {
  const supabase = getSupabase();

  // Sale is intentionally excluded until the "sales die faster than rentals"
  // anomaly (median 18h vs 39h) is explained — its velocity is not trusted.
  if (dealType === "sale") return { listings: [], mainImages: new Map() };

  const { data: hot, error: hotErr } = await supabase
    .from("listings_hot")
    .select("listing_id, pct_in_band, hot_vph")
    .eq("deal_type", "rent")
    .gte("pct_in_band", HOT_MIN_PCT)
    .gte("band_n", HOT_MIN_BAND_N)
    .order("pct_in_band", { ascending: false })
    .order("hot_vph", { ascending: false })
    .limit(limit * 2);

  if (hotErr || !hot || hot.length === 0) return { listings: [], mainImages: new Map() };

  const ids = (hot as { listing_id: number }[]).map((h) => h.listing_id);

  // Re-fetch through listings_public rather than trusting the ranking view for
  // visibility: that view is the single boundary deciding what anon may see.
  const { data, error } = await supabase
    .from("listings_public")
    .select(LISTING_COLUMNS)
    .in("id", ids)
    .eq("deal_type", "rent")
    .limit(limit);

  if (error || !data) return { listings: [], mainImages: new Map() };

  // Preserve the heat order the ranking gave us; .in() returns arbitrary order.
  const rank = new Map(ids.map((id, i) => [id, i]));
  const listings = (data as Listing[]).sort(
    (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999)
  );

  const mainImages = new Map<number, ListingImage>();
  if (listings.length > 0) {
    const { data: images } = await supabase
      .from("listing_images")
      .select(IMAGE_COLUMNS)
      .in(
        "listing_id",
        listings.map((l) => l.id)
      )
      .order("position", { ascending: true });
    for (const img of (images ?? []) as ListingImage[]) {
      const current = mainImages.get(img.listing_id);
      if (!current || (img.is_main && !current.is_main)) {
        mainImages.set(img.listing_id, img);
      }
    }
  }

  return { listings, mainImages };
}

export interface DistrictPulse {
  code: string;
  live: number;
  new24h: number;
}

/** Districts must have this many arrivals in 24h to earn a chip. Below it the
 *  strip becomes a row of zeros, which reads as a dead site rather than a busy
 *  one. */
const DISTRICT_MIN_NEW_24H = 3;

/**
 * "Where the river is today" — districts ranked by arrivals in the last 24h.
 *
 * Uses district_code, not the raw district string: myhome ships English names
 * and ss ships Georgian, so counting the raw column would split Saburtalo across
 * two chips. Deliberately NOT a map — coordinate coverage is 60-79% and a map is
 * a browsing toy, while these chips are a filter shortcut.
 */
export async function fetchDistrictPulse(
  dealType: FeedFilters["dealType"],
  limit = 8
): Promise<DistrictPulse[]> {
  const supabase = getSupabase();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const deal = dealType === "sale" ? "sale" : "rent";

  // Two head-counts per district would be N round trips; instead pull the ids
  // once and tally locally. The public view is already filtered to what anon may
  // see, so no visibility logic is duplicated here.
  const { data, error } = await supabase
    .from("listings_public")
    .select("district_code, first_seen_at")
    .eq("deal_type", deal)
    .not("district_code", "is", null);

  if (error || !data) return [];

  const tally = new Map<string, DistrictPulse>();
  for (const row of data as { district_code: string; first_seen_at: string }[]) {
    const t = tally.get(row.district_code) ?? {
      code: row.district_code,
      live: 0,
      new24h: 0,
    };
    t.live += 1;
    if (row.first_seen_at >= dayAgo) t.new24h += 1;
    tally.set(row.district_code, t);
  }

  return [...tally.values()]
    .filter((d) => d.new24h >= DISTRICT_MIN_NEW_24H)
    .sort((a, b) => b.new24h - a.new24h)
    .slice(0, limit);
}

/**
 * How many district rails the homepage shows. THIS CONSTANT IS THE WHOLE
 * "how many rails?" debate — set it, look at the page, change it. One rail is
 * relevant-per-scroll; five looks more like a product to someone who landed by
 * accident. Both defensible, so it is a number rather than an argument.
 * Above ~6 the page becomes stacked carousels, which is the failure mode.
 */
export const DISTRICT_RAILS = 3;

/** Same discipline as the other rails: a thin strip lies about what it shows. */
const DISTRICT_RAIL_MIN_CARDS = 4;
const DISTRICT_RAIL_SIZE = 8;

export interface DistrictRailData {
  code: string;
  live: number;
  new24h: number;
  listings: Listing[];
  mainImages: Map<number, ListingImage>;
}

export interface RailPlan {
  justAdded: JustAddedResult;
  hot: JustAddedResult;
  districts: DistrictRailData[];
  /** Everything rendered above the feed, so the feed can skip it. */
  shownIds: number[];
}

/**
 * Plans every rail on the homepage in one place, because the rails have to know
 * about each other.
 *
 * DEDUPE IS THE POINT. A flat appearing in just-added AND hot AND its district
 * rail reads as padding — the exact disease this page already had. Priority is
 * new → hot → district, so each strip shows something the ones above it did not.
 * Verified safe before building: removing the 16 ids that new+hot occupy leaves
 * the top ten districts with 6-42 fresh listings each, so no rail starves.
 *
 * NOT personalised to the visitor's last district. That needs a cookie to be
 * readable server-side, and this site deliberately ships no cookie banner —
 * adding a personalisation cookie quietly would undercut that. Districts are
 * ordered by 24h arrivals instead, so the page still changes daily.
 */
export async function fetchRailPlan(
  dealType: FeedFilters["dealType"],
  railCount: number = DISTRICT_RAILS
): Promise<RailPlan> {
  const supabase = getSupabase();

  const [justAdded, hot, pulse] = await Promise.all([
    fetchJustAdded(dealType, 8),
    fetchHot(dealType, 8),
    fetchDistrictPulse(dealType, 40),
  ]);

  const shown = new Set<number>([
    ...justAdded.listings.map((l) => l.id),
    ...hot.listings.map((l) => l.id),
  ]);

  const deal = dealType === "sale" ? "sale" : "rent";
  const candidates = pulse.slice(0, Math.max(0, railCount));

  const fetched = await Promise.all(
    candidates.map(async (d) => {
      let q = supabase
        .from("listings_public")
        .select(LISTING_COLUMNS)
        .eq("deal_type", deal)
        .eq("district_code", d.code)
        .order("first_seen_at", { ascending: false })
        .limit(DISTRICT_RAIL_SIZE + shown.size);
      const skip = [...shown];
      if (skip.length > 0) q = q.not("id", "in", `(${skip.join(",")})`);
      const { data, error } = await q;
      if (error || !data) return null;
      const listings = (data as Listing[]).slice(0, DISTRICT_RAIL_SIZE);
      if (listings.length < DISTRICT_RAIL_MIN_CARDS) return null;
      return { code: d.code, live: d.live, new24h: d.new24h, listings };
    })
  );

  const rails = fetched.filter((r): r is NonNullable<typeof r> => r !== null);

  // One image query for every district rail rather than one per rail.
  const allIds = rails.flatMap((r) => r.listings.map((l) => l.id));
  const imagesById = new Map<number, ListingImage>();
  if (allIds.length > 0) {
    const { data: images } = await supabase
      .from("listing_images")
      .select(IMAGE_COLUMNS)
      .in("listing_id", allIds)
      .order("position", { ascending: true });
    for (const img of (images ?? []) as ListingImage[]) {
      const current = imagesById.get(img.listing_id);
      if (!current || (img.is_main && !current.is_main)) {
        imagesById.set(img.listing_id, img);
      }
    }
  }

  const districts: DistrictRailData[] = rails.map((r) => ({
    code: r.code,
    live: r.live,
    new24h: r.new24h,
    listings: r.listings,
    mainImages: new Map(
      r.listings
        .map((l) => [l.id, imagesById.get(l.id)] as const)
        .filter((e): e is readonly [number, ListingImage] => Boolean(e[1]))
    ),
  }));

  for (const d of districts) for (const l of d.listings) shown.add(l.id);

  return { justAdded, hot, districts, shownIds: [...shown] };
}

export async function fetchListing(
  id: number
): Promise<{ listing: Listing | null; images: ListingImage[] }> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("listings_public")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load listing: ${error.message}`);
  if (!data) return { listing: null, images: [] };

  const { data: images, error: imgError } = await supabase
    .from("listing_images")
    .select(IMAGE_COLUMNS)
    .eq("listing_id", id)
    .order("position", { ascending: true });
  if (imgError) throw new Error(`Failed to load images: ${imgError.message}`);

  return {
    listing: data as Listing,
    images: (images ?? []) as ListingImage[],
  };
}

/**
 * 12h, matching JUST_ADDED_WINDOW_H.rent — the badge and the "just added"
 * rail must agree on what "new" means. The card's TimeAgo carries the exact
 * age; the badge is only the glanceable version of the same claim, so at 24h
 * it was spending the freshness signal twice with two different definitions.
 */
export function isNew(firstSeenAt: string): boolean {
  return Date.now() - new Date(firstSeenAt).getTime() < 12 * 60 * 60 * 1000;
}

/**
 * Sanity bounds per deal type. The scrapers pass through whatever the source
 * shows, and sources contain garbage ($0 sales, $38 "sales" that are rents,
 * $30 rents). Out-of-range prices render as "ფასი მოთხოვნით" instead of
 * presenting nonsense as fact.
 */
const PRICE_BOUNDS: Record<"rent" | "sale", { min: number; max: number }> = {
  rent: { min: 50, max: 50_000 },
  sale: { min: 5_000, max: 5_000_000 },
};

export function sanePriceUsd(
  priceUsd: number | null | undefined,
  dealType: "rent" | "sale" | null | undefined
): number | null {
  if (priceUsd === null || priceUsd === undefined) return null;
  const bounds = PRICE_BOUNDS[dealType === "sale" ? "sale" : "rent"];
  if (priceUsd < bounds.min || priceUsd > bounds.max) return null;
  return priceUsd;
}

export function formatPrice(
  priceUsd: number | null,
  dealType: "rent" | "sale" | null | undefined = "rent"
): string | null {
  const sane = sanePriceUsd(priceUsd, dealType);
  if (sane === null) return null;
  const amount = `$${sane.toLocaleString("en-US")}`;
  if (dealType === "sale") return amount; // full sale price
  return `${amount} / თვეში`;
}

export interface FeedStats {
  total: number;
  addedToday: number;
  /** Share of live listings re-checked within CHECK_WINDOW_H, 0-100. */
  checkedPct: number;
  /** Minutes since the newest listing arrived — the river, as one number. */
  newestMinutes: number | null;
}

/** Hours behind which we claim listings are re-checked. 99.8% of live
 *  listings sit inside 6h and the worst case measured is 6.0h, so this is
 *  a claim the data actually supports. Widen it, never narrow it, without
 *  re-measuring. */
export const CHECK_WINDOW_H = 6;

// Live trust numbers for the hero — proof the catalog is fresh + curated.
export async function fetchStats(): Promise<FeedStats> {
  const supabase = getSupabase();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const checkCutoff = new Date(
    Date.now() - CHECK_WINDOW_H * 60 * 60 * 1000
  ).toISOString();

  const [{ count: total }, { count: addedToday }, { count: checked }, newest] =
    await Promise.all([
      supabase.from("listings_public").select("*", { count: "exact", head: true }),
      supabase
        .from("listings_public")
        .select("*", { count: "exact", head: true })
        .gte("first_seen_at", dayAgo),
      supabase
        .from("listings_public")
        .select("*", { count: "exact", head: true })
        .gte("last_checked_at", checkCutoff),
      supabase
        .from("listings_public")
        .select("first_seen_at")
        .order("first_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const t = total ?? 0;
  // Floor, never round, and cap at 99: "100%" reads as a fake marketing number
  // even in the moments it is literally true. Understating is the safe error.
  const checkedPct = t > 0 ? Math.min(99, Math.floor(((checked ?? 0) / t) * 100)) : 0;
  const newestIso = (newest.data as { first_seen_at: string } | null)?.first_seen_at;
  const newestMinutes = newestIso
    ? Math.max(0, Math.floor((Date.now() - new Date(newestIso).getTime()) / 60000))
    : null;
  return { total: t, addedToday: addedToday ?? 0, checkedPct, newestMinutes };
}

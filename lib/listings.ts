import { applyCoverMode, imageColumns, imageSource } from "./coverSelect";
import { hasNarrowingFilters } from "./filters";
import { indexMainImages, orderForGallery } from "./images";
import type { ConditionCode } from "./labels";
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
  "id, deal_type, district, district_code, rooms, price_usd, price_drop_from_usd, price_dropped_at, area, floor, bathrooms, build_period, condition, status, project_type, balcony, description, description_ka, description_status, amenities, desc_facts, views, image_status, first_seen_at, last_seen_at, last_checked_at, phone, has_phone";

/**
 * Client-safe image columns: enough to build the /img path, nothing more.
 * Widens to include `serve_rank` when cover selection is enabled — see
 * lib/coverSelect.ts. Read once at module load, like every other env-derived
 * constant here; changing the flag needs a redeploy either way.
 */
const IMAGE_COLUMNS = imageColumns();

/**
 * Covers for a batch of listings — ONE query, ONE pick rule, for every surface.
 *
 * This replaces four near-identical inlined blocks (feed, just-added, hot,
 * district rails). They were identical by accident rather than by construction,
 * which is how this codebase previously shipped a fix to two of three rails.
 *
 * Images are decoration on a card: a failure here returns an empty map and the
 * card renders its placeholder, never an error page.
 */
async function fetchMainImages(
  listingIds: number[],
  surface: string
): Promise<Map<number, ListingImage>> {
  if (listingIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(imageSource())
    .select(IMAGE_COLUMNS)
    .in("listing_id", listingIds)
    .order("position", { ascending: true });
  if (error || !data) return new Map();
  // Double cast: the column list is chosen at runtime by the flag, so
  // supabase-js cannot infer a row shape from a literal any more.
  return indexMainImages(applyCoverMode(data as unknown as ListingImage[], surface));
}

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
}

function applyFilters<T>(query: T, filters: FeedFilters): T {
  let q = query as unknown as Filterable;
  if (filters.districts && filters.districts.length > 0) {
    // Multi-select OR: any of the chosen canonical codes. parseFilters already
    // validated and capped the list. Single-code URLs still land here as length 1.
    q =
      filters.districts.length === 1
        ? q.eq("district_code", filters.districts[0])
        : q.in("district_code", filters.districts);
  }
  if (filters.minPrice !== undefined) {
    q = q.gte("price_usd", filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    q = q.lte("price_usd", filters.maxPrice);
  }
  // Same shape as price, on a column that is populated on 99.4% of live rows.
  if (filters.minArea !== undefined) {
    q = q.gte("area", filters.minArea);
  }
  if (filters.maxArea !== undefined) {
    q = q.lte("area", filters.maxArea);
  }
  // One equality, not a set: the three კარკასი grades are mutually exclusive
  // and the UI is single-select. parseFilters already refused this on rent.
  if (filters.conditionCode) {
    q = q.eq("condition_code", filters.conditionCode);
  }
  if (filters.rooms) {
    q = filters.rooms === "5+" ? q.in("rooms", FIVE_PLUS_ROOMS) : q.eq("rooms", filters.rooms);
  }
  if (filters.dealType) {
    q = q.eq("deal_type", filters.dealType);
  }
  return q as unknown as T;
}

/**
 * Catalogue order for the main feed (not hot).
 *
 * ⚠️ Price modes order `price_sort` (sql/015), NOT raw `price_usd`. Out-of-bound
 * prices display as «ფასი მოთხოვნით» but used to still rank; price_sort is null
 * for those rows. NULLS LAST is mandatory on DESC (Postgres puts nulls first
 * otherwise — measured Claude 2026-07-30). id ASC is a stable page tie-break.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFeedOrder(query: any, filters: FeedFilters) {
  if (filters.sort === "price_asc") {
    return query
      .order("price_sort", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
  }
  if (filters.sort === "price_desc") {
    return query
      .order("price_sort", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });
  }
  return query
    .order("first_seen_at", { ascending: false })
    .order("id", { ascending: true });
}

export async function fetchFeed(
  filters: FeedFilters,
  /**
   * Listings already shown in a rail above the feed. Measured on production
   * before this existed: the just-added rail's 8 cards were the feed's first 8,
   * same ids in the same order — the page repeated itself and read as padding.
   * Excluded from the ROWS only; `total` still counts the whole inventory,
   * because "784 განცხადება" should mean what it says.
   *
   * ⚠️ When price-sorting, callers must pass [] (rails hidden). Rail excludeIds
   * would remove candidates from a list that claims full cheapest/dearest order.
   */
  excludeIds: number[] = []
): Promise<FeedResult> {
  if (filters.view === "hot") return fetchHotFeed(filters);

  const supabase = getSupabase();

  let base = applyFilters(
    applyFeedOrder(
      supabase.from("listings_public").select(LISTING_COLUMNS, { count: "exact" }),
      filters
    ),
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

  const mainImages = await fetchMainImages(
    listings.map((l) => l.id),
    "feed"
  );

  return {
    listings,
    mainImages,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type ConditionCounts = Record<ConditionCode, number>;

/**
 * How many SALE listings carry each კარკასი grade, for the chip labels.
 *
 * ⚠️ Sale-wide, and deliberately NOT recomputed per district/price/area/rooms.
 * Accepted trade (human decision 2026-07-29): filter to Vake and the მწვანე
 * chip may still read 91 while returning 2. Per-combination counts would mean
 * a fresh query on every filter change for a number nobody is promised.
 *
 * Reads the PUBLIC view so the counts match exactly what a visitor can open,
 * and selects only the coded rows — ~250 short values, not the whole catalogue.
 *
 * Returns null on failure: the caller then hides the whole row rather than
 * rendering invented zeros or breaking the feed over a decoration.
 */
export async function fetchConditionCounts(): Promise<ConditionCounts | null> {
  const { data, error } = await getSupabase()
    .from("listings_public")
    .select("condition_code")
    .eq("deal_type", "sale")
    .not("condition_code", "is", null);
  if (error || !data) return null;

  const counts: ConditionCounts = { black: 0, white: 0, green: 0 };
  for (const row of data as { condition_code: ConditionCode }[]) {
    if (row.condition_code in counts) counts[row.condition_code] += 1;
  }
  return counts;
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
  const mainImages = await fetchMainImages(
    listings.map((l) => l.id),
    "just-added"
  );

  return { listings, mainImages };
}

/** Minimum cards before the hot rail renders — same discipline as just-added:
 *  a rail padded with lukewarm listings lies about what it is showing. */
export const HOT_MIN_CARDS = 4;
export const HOT_RAIL_SIZE = 8;
/** Only the top of each (source × age band) cohort, and only cohorts big enough
 *  for a percentile to mean anything. */
const HOT_MIN_PCT = 90;
const HOT_MIN_BAND_N = 8;

export interface HotResult extends JustAddedResult {
  /** Public listings that currently clear the hot thresholds. */
  total: number;
}

interface HotPage {
  listings: Listing[];
  total: number;
}

/**
 * Extra ranked rows pulled beyond the page size on the cheap path.
 *
 * `listings_hot` and `listings_public` apply the same visibility predicate
 * (active, published, not a dedupe alias, not flagged_agent), so a ranked row
 * is essentially always fetchable — measured 2026-07-29: 0 of 47 ranked rows
 * were missing from listings_public. `listings_public` additionally requires
 * `removed_at IS NULL`, so a listing removed between the two queries is the one
 * way a slot can vanish. The overscan absorbs that instead of leaving a hole.
 */
const HOT_OVERSCAN = 6;

/** Ranked ids → full rows, rank order restored, capped at `limit`. */
async function hydrateRankedHot(rankedIds: number[], limit: number): Promise<Listing[]> {
  if (rankedIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("listings_public")
    .select(LISTING_COLUMNS)
    .in("id", rankedIds)
    .eq("deal_type", "rent");
  if (error) throw new Error(`Failed to load hot listings: ${error.message}`);

  // `.in()` does not preserve input order; restore the rolling-attention rank.
  const rank = new Map(rankedIds.map((id, index) => [id, index]));
  return ((data ?? []) as Listing[])
    .sort((a, b) => (rank.get(a.id) ?? rankedIds.length) - (rank.get(b.id) ?? rankedIds.length))
    .slice(0, limit);
}

/**
 * Load one page without losing the ranking from listings_hot.
 *
 * TWO PATHS, because the homepage rail and a filtered channel URL want
 * different things and paying the filtered price on every homepage render cost
 * a measured ~1s.
 *
 *   cheap  — no narrowing filters (the rail, and a plain /?view=hot). The
 *            ranked page and the exact pool total come back in ONE query via
 *            count+range, then one hydrate. Two round trips, and the slice is
 *            bounded by the page size instead of the whole pool.
 *   filtered — district/price/area/rooms present. The total has to reflect
 *            the filter, and only listings_public knows about it, so the ranked
 *            ids are materialised and filtered before slicing. Slower, and rare:
 *            applying a filter normally navigates out of the channel.
 *
 * Both paths share the same thresholds and the same ordering, so "what hot
 * means" cannot drift between the rail and the channel.
 */
async function fetchHotPage(
  filters: FeedFilters,
  page: number,
  pageSize: number
): Promise<HotPage> {
  if (filters.dealType === "sale") return { listings: [], total: 0 };

  const supabase = getSupabase();
  const from = (page - 1) * pageSize;

  // Hot is rent-only even when a crafted URL says deal=all.
  const hotFilters: FeedFilters = { ...filters, dealType: "rent" };

  const rankedQuery = () =>
    supabase
      .from("listings_hot")
      .select("listing_id", { count: "exact" })
      .eq("deal_type", "rent")
      .gte("pct_in_band", HOT_MIN_PCT)
      .gte("band_n", HOT_MIN_BAND_N)
      .order("pct_in_band", { ascending: false })
      .order("hot_vph", { ascending: false })
      // Tie-break so the ranked sequence is STABLE across pages. Without it two
      // listings on the same pct/vph can swap between the page-1 and page-2
      // queries, which shows one listing twice and hides another entirely.
      .order("listing_id", { ascending: true });

  if (!hasNarrowingFilters(hotFilters)) {
    const { data, count, error } = await rankedQuery().range(
      from,
      from + pageSize + HOT_OVERSCAN - 1
    );
    if (error) throw new Error(`Failed to load hot ranking: ${error.message}`);

    const rankedIds = (data as { listing_id: number }[] | null)?.map((r) => r.listing_id) ?? [];
    // The count is exact for the pool: listings_hot already carries the same
    // visibility predicate the site serves from.
    const total = count ?? rankedIds.length;
    if (rankedIds.length === 0) return { listings: [], total };
    return { listings: await hydrateRankedHot(rankedIds, pageSize), total };
  }

  // Filtered path: the whole ranked set, narrowed, then sliced.
  const { data, error } = await rankedQuery();
  if (error) throw new Error(`Failed to load hot ranking: ${error.message}`);
  const rankedIds = (data as { listing_id: number }[] | null)?.map((r) => r.listing_id) ?? [];
  if (rankedIds.length === 0) return { listings: [], total: 0 };

  const { data: visibleRows, error: visibleError } = await applyFilters(
    supabase.from("listings_public").select("id").in("id", rankedIds),
    hotFilters
  );
  if (visibleError) throw new Error(`Failed to filter hot listings: ${visibleError.message}`);

  const visibleIds = new Set((visibleRows as { id: number }[] | null)?.map((r) => r.id) ?? []);
  const eligibleIds = rankedIds.filter((id) => visibleIds.has(id));
  const pageIds = eligibleIds.slice(from, from + pageSize);
  return { listings: await hydrateRankedHot(pageIds, pageSize), total: eligibleIds.length };
}

export async function fetchHotFeed(filters: FeedFilters): Promise<FeedResult> {
  const { listings, total } = await fetchHotPage(filters, filters.page, PAGE_SIZE);
  const mainImages = await fetchMainImages(
    listings.map((listing) => listing.id),
    "hot"
  );
  return {
    listings,
    mainImages,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * "People are looking at this" — a rolling 12h peak from view_samples, ranked
 * inside each source and age band. See sql/010 for why every one of those words
 * matters; the short version is that the obvious implementations produce either
 * an all-myhome list, a list of listings that were hot three days ago, or a
 * duplicate of just-added.
 */
export async function fetchHot(
  dealType: FeedFilters["dealType"],
  limit = HOT_RAIL_SIZE
): Promise<HotResult> {
  // Sale is intentionally excluded until the "sales die faster than rentals"
  // anomaly (median 18h vs 39h) is explained — its velocity is not trusted.
  if (dealType === "sale") return { listings: [], mainImages: new Map(), total: 0 };

  try {
    const { listings, total } = await fetchHotPage(
      { dealType: "rent", page: 1, sort: "new" },
      1,
      limit
    );
    const mainImages = await fetchMainImages(
      listings.map((listing) => listing.id),
      "hot"
    );
    return { listings, mainImages, total };
  } catch {
    // The strip is decoration over the feed — never let it break the page.
    return { listings: [], mainImages: new Map(), total: 0 };
  }
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

/** Sale «ფასი დაეცა» strip — same min/size discipline as other rails. */
export const PRICE_DROP_MIN_CARDS = 4;
export const PRICE_DROP_RAIL_SIZE = 8;
const PRICE_DROP_MIN_USD = 1000;
const PRICE_DROP_MAX_USD = 50_000;
const PRICE_DROP_MIN_PCT = 1;
const PRICE_DROP_MAX_PCT = 25;
const PRICE_DROP_SALE_PRICE_MIN = 5000;
const PRICE_DROP_SALE_PRICE_MAX = 5_000_000;

export interface PriceDropResult {
  listings: Listing[];
  mainImages: Map<number, ListingImage>;
}

function isSanePriceDrop(listing: Listing): boolean {
  const prev = listing.price_drop_from_usd;
  const cur = listing.price_usd;
  if (prev == null || cur == null) return false;
  if (prev <= cur) return false;
  if (
    prev < PRICE_DROP_SALE_PRICE_MIN ||
    prev > PRICE_DROP_SALE_PRICE_MAX ||
    cur < PRICE_DROP_SALE_PRICE_MIN ||
    cur > PRICE_DROP_SALE_PRICE_MAX
  ) {
    return false;
  }
  const dropUsd = prev - cur;
  if (dropUsd < PRICE_DROP_MIN_USD || dropUsd > PRICE_DROP_MAX_USD) return false;
  const dropPct = (100 * dropUsd) / prev;
  if (dropPct < PRICE_DROP_MIN_PCT || dropPct > PRICE_DROP_MAX_PCT) return false;
  if (!listing.price_dropped_at) return false;
  return true;
}

/**
 * Fisher–Yates copy. Keeps the price-drop rail from freezing on the same
 * "8 newest drops" every visit (user: strip felt stale). Homepage is
 * force-dynamic; this is a decoration strip, not a stable channel rank.
 */
function shuffleCopy<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/**
 * Live sale listings with a still-current price drop (old + new on the card).
 * 48h primary window; widen to 7d if fewer than PRICE_DROP_MIN_CARDS after
 * excludeIds. Hide (empty result) if still thin — caller must not render.
 *
 * Within the eligible pool, cards are SHUFFLED then capped — eligibility still
 * prefers 48h when thick enough; order is no longer pure drop-time.
 */
export async function fetchPriceDrops(
  excludeIds: number[] = [],
  limit = PRICE_DROP_RAIL_SIZE
): Promise<PriceDropResult> {
  const supabase = getSupabase();
  const exclude = new Set(excludeIds);
  const day7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const day2 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Bounded 7d candidate set; filter sanity + window in memory so 48h→7d
  // fallback does not need a second round trip.
  const { data, error } = await supabase
    .from("listings_public")
    .select(LISTING_COLUMNS)
    .eq("deal_type", "sale")
    .not("price_drop_from_usd", "is", null)
    .gte("price_dropped_at", day7)
    .order("price_dropped_at", { ascending: false })
    .limit(80);
  if (error || !data) return { listings: [], mainImages: new Map() };

  const eligible = (data as Listing[]).filter(
    (l) => isSanePriceDrop(l) && !exclude.has(l.id)
  );
  const fresh = eligible.filter(
    (l) => (l.price_dropped_at ?? "") >= day2
  );
  const pool = fresh.length >= PRICE_DROP_MIN_CARDS ? fresh : eligible;
  // Shuffle then take 8 — same eligibility, rotating cards each homepage load.
  const listings = shuffleCopy(pool).slice(0, limit);
  if (listings.length < PRICE_DROP_MIN_CARDS) {
    return { listings: [], mainImages: new Map() };
  }

  const mainImages = await fetchMainImages(
    listings.map((l) => l.id),
    "price_drop"
  );
  return { listings, mainImages };
}

export interface RailPlan {
  justAdded: JustAddedResult;
  hot: HotResult;
  priceDrops: PriceDropResult;
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
 * new → price-drop («ფასი დააკლდა», replaces hot) → district.
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
  const deal = dealType === "sale" ? "sale" : "rent";

  // Just-added first so price-drop can exclude those IDs (rendered-only).
  const [justAddedCandidate, pulse] = await Promise.all([
    fetchJustAdded(dealType, 8),
    fetchDistrictPulse(dealType, 40),
  ]);

  // Components hide thin rails; the plan must make the same decision before
  // dedupe or 1–3 invisible cards disappear from every downstream surface.
  const emptyJustAdded: JustAddedResult = {
    listings: [],
    mainImages: new Map(),
  };
  const justAdded =
    justAddedCandidate.listings.length >= JUST_ADDED_MIN_CARDS
      ? justAddedCandidate
      : emptyJustAdded;
  const justIds = justAdded.listings.map((l) => l.id);

  // Homepage second slot is ALWAYS sale price-drops («ფასი დააკლდა»), never
  // the old hot rail. Hot remains only for /?view=hot. Sale inventory is
  // intentional even when the feed tab is rent — same as a sale promo strip.
  const emptyHot: HotResult = { listings: [], mainImages: new Map(), total: 0 };
  const priceDrops = await fetchPriceDrops(justIds, PRICE_DROP_RAIL_SIZE);
  const hot = emptyHot;

  // Only IDs that will actually render (price-drop empty if < min cards).
  const shown = new Set<number>([
    ...justIds,
    ...priceDrops.listings.map((l) => l.id),
  ]);

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
  const imagesById = await fetchMainImages(
    rails.flatMap((r) => r.listings.map((l) => l.id)),
    "district"
  );

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

  return { justAdded, hot, priceDrops, districts, shownIds: [...shown] };
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
    .from(imageSource())
    .select(IMAGE_COLUMNS)
    .eq("listing_id", id)
    .order("position", { ascending: true });
  if (imgError) throw new Error(`Failed to load images: ${imgError.message}`);

  return {
    listing: data as Listing,
    // Ordered, not just position-sorted: the gallery's first photo IS the
    // cover, so if the card promised a clean photo the detail page has to open
    // on the same one. Under the flag's legacy path this is identical to the
    // position order the query already returned.
    images: orderForGallery(
      applyCoverMode((images ?? []) as unknown as ListingImage[], "detail")
    ),
  };
}

/**
 * 12h, matching JUST_ADDED_WINDOW_H.rent — the badge and the "just added"
 * rail must agree on what "new" means. The card's AgeStamp carries the exact
 * age; a binary "new" badge was removed from cards for flattening 7min vs 20h.
 * isNew remains for the listing detail page until that migrates to AgeStamp.
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

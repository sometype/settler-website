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
  "id, deal_type, district, rooms, price_usd, area, floor, bathrooms, build_period, condition, status, project_type, balcony, description, description_ka, description_status, views, image_status, first_seen_at, last_seen_at, phone, has_phone";

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
}

function applyFilters<T>(query: T, filters: FeedFilters): T {
  let q = query as unknown as Filterable;
  if (filters.district) {
    q = q.ilike("district", `%${filters.district}%`);
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

export async function fetchFeed(filters: FeedFilters): Promise<FeedResult> {
  const supabase = getSupabase();

  const query = applyFilters(
    supabase
      .from("listings_public")
      .select(LISTING_COLUMNS, { count: "exact" })
      .order("first_seen_at", { ascending: false }),
    filters
  );

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

export function isNew(firstSeenAt: string): boolean {
  return Date.now() - new Date(firstSeenAt).getTime() < 24 * 60 * 60 * 1000;
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
}

// Live trust numbers for the hero — proof the catalog is fresh + curated.
export async function fetchStats(): Promise<FeedStats> {
  const supabase = getSupabase();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: total }, { count: addedToday }] = await Promise.all([
    supabase.from("listings_public").select("*", { count: "exact", head: true }),
    supabase
      .from("listings_public")
      .select("*", { count: "exact", head: true })
      .gte("first_seen_at", dayAgo),
  ]);

  return { total: total ?? 0, addedToday: addedToday ?? 0 };
}

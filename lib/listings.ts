import { getSupabase } from "./supabase";
import type { FeedFilters, Listing, ListingImage } from "./types";

export const PAGE_SIZE = 24;

const FIVE_PLUS_ROOMS = ["5", "6", "7", "8", "9", "10", "11", "12"];

export interface FeedResult {
  listings: Listing[];
  mainImages: Map<number, ListingImage>;
  total: number;
  page: number;
  pageCount: number;
}

export async function fetchFeed(filters: FeedFilters): Promise<FeedResult> {
  const supabase = getSupabase();

  let query = supabase
    .from("listings_public")
    .select("*", { count: "exact" })
    .order("first_seen_at", { ascending: false });

  if (filters.district) {
    query = query.ilike("district", `%${filters.district}%`);
  }
  if (filters.minPrice !== undefined) {
    query = query.gte("price_usd", filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    query = query.lte("price_usd", filters.maxPrice);
  }
  if (filters.rooms) {
    if (filters.rooms === "5+") {
      query = query.in("rooms", FIVE_PLUS_ROOMS);
    } else {
      query = query.eq("rooms", filters.rooms);
    }
  }
  if (filters.source) {
    query = query.eq("source", filters.source);
  }
  if (filters.dealType) {
    query = query.eq("deal_type", filters.dealType);
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to load listings: ${error.message}`);

  const listings = (data ?? []) as Listing[];
  const total = count ?? 0;

  const mainImages = new Map<number, ListingImage>();
  if (listings.length > 0) {
    const ids = listings.map((l) => l.id);
    const { data: images, error: imgError } = await supabase
      .from("listing_images")
      .select("listing_id, source_url, stored_path, position, is_main")
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
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load listing: ${error.message}`);
  if (!data) return { listing: null, images: [] };

  const { data: images, error: imgError } = await supabase
    .from("listing_images")
    .select("listing_id, source_url, stored_path, position, is_main")
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

export function formatPrice(
  priceUsd: number | null,
  dealType: "rent" | "sale" | null | undefined = "rent"
): string | null {
  if (priceUsd === null || priceUsd === undefined) return null;
  const amount = `$${priceUsd.toLocaleString("en-US")}`;
  if (dealType === "sale") return amount; // full sale price
  return `${amount} / mo`;
}

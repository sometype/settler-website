export type DealType = "rent" | "sale";

/**
 * Public shape only. Collection-provenance columns (`source`, `source_id`,
 * `url`) are deliberately absent: they are never selected, never serialized to
 * the client, and nothing in the UI may reintroduce them.
 */
export interface Listing {
  id: number;
  deal_type: DealType;
  district: string | null;
  rooms: string | null;
  price_usd: number | null;
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
  views: number | null;
  image_status: "pending" | "ready" | "failed";
  first_seen_at: string;
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
}

export interface FeedFilters {
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  rooms?: string;
  /** Default on the feed is rent so sale prices don't mix unlabeled. */
  dealType?: DealType;
  page: number;
}

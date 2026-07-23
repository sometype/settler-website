export type ListingSource = "myhome" | "ss";

export interface Listing {
  id: number;
  source: ListingSource;
  source_id: string;
  url: string;
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
  description: string | null;
  views: number | null;
  image_status: "pending" | "ready" | "failed";
  first_seen_at: string;
  last_seen_at: string;
  /** Seller phone when available (public by product design). */
  phone: string | null;
  has_phone: boolean;
}

export interface ListingImage {
  listing_id: number;
  source_url: string | null;
  stored_path: string | null;
  position: number;
  is_main: boolean;
}

export interface FeedFilters {
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  rooms?: string;
  source?: "myhome" | "ss";
  page: number;
}

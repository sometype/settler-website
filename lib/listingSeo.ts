import { districtLabel } from "./districts";
import { roomsLabelKa } from "./labels";
import { formatPrice } from "./prices";
import type { Listing, ListingImage } from "./types";

const SITE_ORIGIN = "https://mepatrone.com";

type ListingSeoInput = {
  listing: Pick<
    Listing,
    | "id"
    | "deal_type"
    | "district_code"
    | "district"
    | "rooms"
    | "area"
    | "price_usd"
    | "street_display"
  >;
  /** fetchListing already returns the selected cover first. */
  images: Array<Pick<ListingImage, "position">>;
  searchParams?: Record<string, unknown>;
};

export type ListingSeo = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImageUrl: string | null;
  catalogHref: string;
  districtHref: string | null;
};

/** Build crawler-visible facts from the same structured values the page shows. */
export function buildListingSeo({ listing, images }: ListingSeoInput): ListingSeo {
  const dealLabel = listing.deal_type === "sale" ? "იყიდება" : "ქირავდება";
  const district = districtLabel(listing.district_code, listing.district);
  const rooms = roomsLabelKa(listing.rooms);
  const area = listing.area != null && Number.isFinite(listing.area)
    ? `${listing.area} მ²`
    : null;
  const price = formatPrice(listing.price_usd, listing.deal_type);
  const location = listing.street_display?.trim() || null;
  const facts = [rooms, district, location, area, price].filter(
    (value): value is string => Boolean(value)
  );

  // The public-view id is included as a quiet uniqueness guarantee. The useful
  // facts stay first, where search results and people actually see them.
  const title = `${[dealLabel, ...facts].join(" · ")} | Mepatrone #${listing.id}`;
  const description = [
    `${dealLabel} ბინა პირდაპირ პატრონისგან.`,
    facts.length > 0 ? `${facts.join(" · ")}.` : null,
    "ფოტოები და განცხადების დეტალები Mepatrone-ზე.",
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const catalogHref = `/?deal=${listing.deal_type}`;
  const districtHref = listing.district_code
    ? `${catalogHref}&district=${encodeURIComponent(listing.district_code)}`
    : null;
  const cover = images[0];

  return {
    title,
    description,
    canonicalUrl: `${SITE_ORIGIN}/listing/${listing.id}`,
    ogImageUrl: cover
      ? `${SITE_ORIGIN}/img/${listing.id}/${cover.position}`
      : null,
    catalogHref,
    districtHref,
  };
}

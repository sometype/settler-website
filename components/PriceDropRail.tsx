import {
  PRICE_DROP_MIN_CARDS,
  type PriceDropResult,
} from "@/lib/listings";
import { ChannelHeading, ChannelStrip, RailCard } from "./Channel";

/**
 * Sale «ფასი დაეცა» — listings whose price went down, with old + new price.
 *
 * Sale homepage second slot (rent keeps HotRail). Not discovery recency
 * (just-added) and not source-view heat. Eligibility lives in fetchPriceDrops.
 */
export function PriceDropRail({ data }: { data: PriceDropResult }) {
  const { listings, mainImages } = data;
  if (listings.length < PRICE_DROP_MIN_CARDS) return null;

  return (
    <section aria-labelledby="price-drop-heading">
      <ChannelHeading
        id="price-drop-heading"
        label="ფასი დაეცა"
        dot="clay"
        count={listings.length}
      />
      <ChannelStrip>
        {listings.map((listing) => {
          const prev = listing.price_drop_from_usd;
          const cur = listing.price_usd;
          const dropAt = listing.price_dropped_at;
          const priceDrop =
            prev != null && cur != null && dropAt
              ? { prevPriceUsd: prev, priceUsd: cur, dropAt }
              : undefined;
          return (
            <RailCard
              key={listing.id}
              listing={listing}
              image={mainImages.get(listing.id) ?? null}
              src="price_drop"
              priceDrop={priceDrop}
            />
          );
        })}
      </ChannelStrip>
    </section>
  );
}

import { JUST_ADDED_MIN_CARDS, type JustAddedResult } from "@/lib/listings";
import { ChannelHeading, ChannelStrip, RailCard } from "./Channel";

/**
 * The freshness edge, made visible. myhome and ss both bury new owner listings
 * under paid VIP ads; we see them within minutes. That is the one claim the
 * incumbents cannot make, so it gets the position directly above the feed.
 *
 * Card markup lives in Channel.tsx now. It used to be inlined here, in HotRail
 * and in DistrictRail — three copies, which is exactly how this rail ended up
 * being the last surface still cropping photos with object-cover after the fix
 * landed in the other two.
 */
export function JustAddedRail({ data }: { data: JustAddedResult }) {
  const { listings, mainImages } = data;
  // Too few genuinely-fresh cards → no rail. Padding with older stock would
  // put stale listings under a heading that promises the opposite.
  if (listings.length < JUST_ADDED_MIN_CARDS) return null;

  return (
    <section aria-labelledby="just-added-heading">
      <ChannelHeading
        id="just-added-heading"
        label="ახლახან დაემატა"
        dot="moss"
        count={listings.length}
      />
      <ChannelStrip>
        {listings.map((listing) => (
          <RailCard
            key={listing.id}
            listing={listing}
            image={mainImages.get(listing.id) ?? null}
            src="new"
          />
        ))}
      </ChannelStrip>
    </section>
  );
}

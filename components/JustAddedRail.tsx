import Link from "next/link";
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
export function JustAddedRail({
  data,
  dealType,
}: {
  data: JustAddedResult;
  dealType?: string;
}) {
  const { listings, mainImages } = data;
  // "See all" is a MODE (view=intake), not a filter — see lib/filters.ts.
  // Without it these 8 listings were reachable only by swiping sideways: the
  // feed excludes every id the rails show, on every page of the unfiltered
  // homepage. The freshest inventory was the hardest thing on the site to
  // browse, which is the exact opposite of the product's claim.
  const seeAll = `/?view=intake${dealType === "rent" ? "&deal=rent" : ""}`;
  // Too few genuinely-fresh cards → no rail. Padding with older stock would
  // put stale listings under a heading that promises the opposite.
  if (listings.length < JUST_ADDED_MIN_CARDS) return null;

  return (
    <section aria-labelledby="just-added-heading">
      <ChannelHeading
        id="just-added-heading"
        label="ახლახან დაემატა"
        dot="moss"
        href={seeAll}
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
      <div className="mt-1.5">
        <Link
          href={seeAll}
          className="text-[11.5px] font-semibold text-clay-deep underline-offset-2 hover:underline"
        >
          ყველა →
        </Link>
      </div>
    </section>
  );
}

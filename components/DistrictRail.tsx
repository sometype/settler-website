import Link from "next/link";
import type { DistrictRailData } from "@/lib/listings";
import { districtLabel } from "@/lib/districts";
import type { FeedFilters } from "@/lib/types";
import { ChannelHeading, ChannelStrip, RailCard } from "./Channel";

/**
 * One district's newest flats — "anything new in my area?" answered at a glance,
 * without a map and without committing to a filter.
 *
 * District is the axis people actually hunt on, and the strip is a scan rather
 * than a list: the heading carries the counts, so someone can decide whether the
 * area is even worth a tap before swiping a single card.
 *
 * Everything already shown in just-added or hot is excluded upstream by
 * fetchRailPlan — a flat repeated down the page is what made this homepage feel
 * padded in the first place.
 */
export function DistrictRail({
  data,
  dealType,
}: {
  data: DistrictRailData;
  dealType: FeedFilters["dealType"];
}) {
  const deal = dealType === "sale" ? "sale" : "rent";
  const label = districtLabel(data.code, null) ?? data.code;
  const href = `/?deal=${deal}&district=${data.code}`;

  return (
    <section aria-labelledby={`district-${data.code}-heading`}>
      <ChannelHeading
        id={`district-${data.code}-heading`}
        label={label}
        href={href}
        count={data.live.toLocaleString("ka-GE")}
      >
        {/* New-in-24h is the reason to look at this district at all, so it sits
            before the total rather than after it. */}
        {data.new24h > 0 && (
          <span className="num shrink-0 text-[11px] font-bold text-moss">
            +{data.new24h}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-sand-strong" aria-hidden="true">
          /
        </span>
      </ChannelHeading>
      <ChannelStrip>
        {data.listings.map((listing) => (
          <RailCard
            key={listing.id}
            listing={listing}
            image={data.mainImages.get(listing.id) ?? null}
            src="district"
            // The channel heading already names the district; repeating it on
            // every card in the strip is pure noise.
            showDistrict={false}
          />
        ))}
      </ChannelStrip>
      <div className="mt-1.5">
        <Link
          href={href}
          className="text-[11.5px] font-semibold text-clay-deep underline-offset-2 hover:underline"
        >
          ყველა ({data.live.toLocaleString("ka-GE")}) →
        </Link>
      </div>
    </section>
  );
}

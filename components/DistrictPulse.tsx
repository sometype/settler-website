import Link from "next/link";
import { fetchDistrictPulse } from "@/lib/listings";
import { districtLabel } from "@/lib/districts";
import type { FeedFilters } from "@/lib/types";

/** Fewer chips than this and the strip says nothing a visitor could act on. */
const MIN_CHIPS = 4;

/**
 * "Where the river is today" — a one-line row of districts with how many
 * listings arrived in the last 24h, each a shortcut into the filtered feed.
 *
 * This is orientation, not analytics. It uses work already done (district_code
 * normalisation) to answer the question a newcomer actually has — "is there
 * anything in my area right now?" — without a map, whose coordinate coverage is
 * only 60-79% and which would be a browsing toy on a site built around calling
 * fast.
 *
 * One row, horizontally scrollable, no counts of anything a visitor cannot act
 * on. It sits ABOVE the feed but BELOW both rails, so it never pushes listings
 * off the first screen.
 */
export async function DistrictPulse({
  dealType,
}: {
  dealType: FeedFilters["dealType"];
}) {
  const districts = await fetchDistrictPulse(dealType, 8);
  if (districts.length < MIN_CHIPS) return null;

  const deal = dealType === "sale" ? "sale" : "rent";

  return (
    <section aria-labelledby="district-pulse-heading">
      <h2 id="district-pulse-heading" className="sr-only">
        უბნები სადაც დღეს ყველაზე მეტი დაემატა
      </h2>
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {districts.map((d) => (
          <li key={d.code} className="shrink-0 snap-start">
            <Link
              href={`/?deal=${deal}&district=${d.code}`}
              className="inline-flex items-baseline gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-mink ring-1 ring-inset ring-sand transition hover:ring-sand-strong focus-visible:outline-2 focus-visible:outline-moss"
            >
              {districtLabel(d.code, null) ?? d.code}
              <span className="font-bold text-moss">+{d.new24h}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

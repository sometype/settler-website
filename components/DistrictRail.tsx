import Link from "next/link";
import { formatPrice, type DistrictRailData } from "@/lib/listings";
import { resolveImageUrl } from "@/lib/images";
import { districtLabel } from "@/lib/districts";
import { relativeTimeKa } from "@/lib/time";
import type { FeedFilters } from "@/lib/types";
import { ListingImage } from "./ListingImage";

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
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id={`district-${data.code}-heading`}
          className="flex items-baseline gap-2 font-display text-lg font-bold tracking-tight text-ink"
        >
          {label}
          {data.new24h > 0 && (
            <span className="text-sm font-semibold text-moss">+{data.new24h}</span>
          )}
        </h2>
        {/* The escape hatch: the strip is 8 cards, the district has more. */}
        <Link
          href={href}
          className="shrink-0 text-xs font-semibold text-clay-deep underline-offset-2 hover:underline"
        >
          ყველა ({data.live.toLocaleString("ka-GE")}) →
        </Link>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {data.listings.map((listing) => {
          const image = data.mainImages.get(listing.id) ?? null;
          const price = formatPrice(listing.price_usd, listing.deal_type ?? "rent");

          return (
            <li key={listing.id} className="w-44 shrink-0 snap-start">
              <Link
                // ?src=district → listing_open carries meta.rail="district", so
                // these strips are judged by the calls they earn, separately
                // from new and hot.
                href={`/listing/${listing.id}?src=district`}
                className="group block overflow-hidden rounded-xl bg-card ring-1 ring-sand transition hover:ring-sand-strong focus-visible:outline-2 focus-visible:outline-moss"
              >
                {/* contain + blur, same as every other card: owners upload
                    panoramas and screenshots that object-cover destroys. */}
                <div className="relative aspect-[4/3] overflow-hidden bg-sand/50">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element -- see ListingImage
                    <img
                      src={resolveImageUrl(image)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
                    />
                  )}
                  <ListingImage
                    src={image ? resolveImageUrl(image) : null}
                    alt={`${listing.rooms ?? "?"}-ოთახიანი ბინა, ${label}`}
                    className="absolute inset-0 h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    {price ? (
                      <p className="truncate font-display text-sm font-bold text-ink">
                        {price.replace(" / თვეში", "")}
                      </p>
                    ) : (
                      <p className="truncate text-sm font-semibold text-faint">
                        შეთანხმებით
                      </p>
                    )}
                    <span className="shrink-0 text-[11px] text-faint">
                      {relativeTimeKa(listing.first_seen_at)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-mink">
                    {[
                      listing.rooms ? `${listing.rooms} ოთახი` : null,
                      listing.area ? `${listing.area} მ²` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

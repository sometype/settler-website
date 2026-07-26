import Link from "next/link";
import { fetchJustAdded, formatPrice, JUST_ADDED_MIN_CARDS } from "@/lib/listings";
import { resolveImageUrl } from "@/lib/images";
import { districtLabel } from "@/lib/districts";
import { relativeTimeKa, isVeryFresh } from "@/lib/time";
import type { FeedFilters } from "@/lib/types";
import { ListingImage } from "./ListingImage";
import { TimeAgo } from "./TimeAgo";

/**
 * The freshness edge, made visible. myhome and ss both bury new owner listings
 * under paid VIP ads; we see them within minutes. That is the one claim the
 * incumbents cannot make, so it gets the position directly above the feed.
 */
export async function JustAddedRail({
  dealType,
}: {
  dealType: FeedFilters["dealType"];
}) {
  const { listings, mainImages } = await fetchJustAdded(dealType, 8);
  // Too few genuinely-fresh cards → no rail. Padding with older stock would
  // put stale listings under a heading that promises the opposite.
  if (listings.length < JUST_ADDED_MIN_CARDS) return null;

  const now = Date.now();

  return (
    <section aria-labelledby="just-added-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id="just-added-heading"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink"
        >
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-moss"
            aria-hidden="true"
          />
          ახლახან დაემატა
        </h2>
        <p className="text-xs text-mink">პირველი დარეკავს — პირველი ნახავს</p>
      </div>

      {/* Horizontal scroller: the strip is a glance, the feed below is the list. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {listings.map((listing) => {
          const image = mainImages.get(listing.id) ?? null;
          const price = formatPrice(listing.price_usd, listing.deal_type ?? "rent");
          const district = districtLabel(listing.district_code, listing.district);
          const fresh = isVeryFresh(listing.first_seen_at, now);

          return (
            <li key={listing.id} className="w-44 shrink-0 snap-start">
              <Link
                // ?src=new → listing_open lands with meta.rail="new", so each
                // rail's cost of screen space can be judged by the calls it earns.
                href={`/listing/${listing.id}?src=new`}
                className="group block overflow-hidden rounded-xl bg-card ring-1 ring-sand transition hover:ring-sand-strong focus-visible:outline-2 focus-visible:outline-moss"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <ListingImage
                    src={image ? resolveImageUrl(image) : null}
                    alt={`${listing.rooms ?? "?"}-ოთახიანი ბინა, ${district ?? "თბილისი"}`}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
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
                    <TimeAgo
                      iso={listing.first_seen_at}
                      initialLabel={relativeTimeKa(listing.first_seen_at, now)}
                      className={`shrink-0 text-[11px] font-semibold ${
                        fresh ? "text-moss" : "text-faint"
                      }`}
                    />
                  </div>
                  <p className="truncate text-xs text-mink">
                    {[
                      district,
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

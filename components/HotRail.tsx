import Link from "next/link";
import { fetchHot, formatPrice, HOT_MIN_CARDS } from "@/lib/listings";
import { resolveImageUrl } from "@/lib/images";
import { districtLabel } from "@/lib/districts";
import type { FeedFilters } from "@/lib/types";
import { ListingImage } from "./ListingImage";

/**
 * "Others are looking at this" — competition, not freshness.
 *
 * Sits below just-added because it answers a different question: that rail says
 * what is new, this one says where other callers are already going. Ranking is
 * a rolling 12h peak from view_samples, taken within source and age band, so it
 * cannot collapse into "the newest listings again" (see sql/010).
 *
 * The wording is deliberately about ATTENTION, not quality. We know how many
 * people opened a page; we do not know whether the flat is good, and a heading
 * that implied otherwise would be a claim we cannot support.
 */
export async function HotRail({
  dealType,
}: {
  dealType: FeedFilters["dealType"];
}) {
  const { listings, mainImages } = await fetchHot(dealType, 8);

  // Too few genuinely-hot cards → no rail at all. Padding with lukewarm stock
  // would put ordinary listings under a heading promising the opposite, which is
  // exactly how a rail turns into noise.
  if (listings.length < HOT_MIN_CARDS) return null;

  return (
    <section aria-labelledby="hot-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id="hot-heading"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-clay" />
          სხვები უყურებენ
        </h2>
        <p className="text-xs text-mink">ახლა ყველაზე ხშირად ნახული</p>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {listings.map((listing) => {
          const image = mainImages.get(listing.id) ?? null;
          const price = formatPrice(listing.price_usd, listing.deal_type ?? "rent");
          const district = districtLabel(listing.district_code, listing.district);

          return (
            <li key={listing.id} className="w-44 shrink-0 snap-start">
              <Link
                // ?src=hot → listing_open carries meta.rail="hot", so this rail's
                // cost in screen space can be judged against the calls it earns,
                // separately from the just-added rail.
                href={`/listing/${listing.id}?src=hot`}
                className="group block overflow-hidden rounded-xl bg-card ring-1 ring-sand transition hover:ring-sand-strong focus-visible:outline-2 focus-visible:outline-moss"
              >
                {/* contain + blur for the same reason as the feed card: owners
                    upload panoramas and screenshots that object-cover destroys. */}
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
                    alt={`${listing.rooms ?? "?"}-ოთახიანი ბინა, ${district ?? "თბილისი"}`}
                    className="absolute inset-0 h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="space-y-1 p-3">
                  {price ? (
                    <p className="truncate font-display text-sm font-bold text-ink">
                      {price.replace(" / თვეში", "")}
                    </p>
                  ) : (
                    <p className="truncate text-sm font-semibold text-faint">
                      შეთანხმებით
                    </p>
                  )}
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

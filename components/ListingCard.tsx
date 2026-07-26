import Link from "next/link";
import type { Listing, ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { isNew, formatPrice } from "@/lib/listings";
import { districtLabel } from "@/lib/districts";
import { relativeTimeKa } from "@/lib/time";
import { ListingImage } from "./ListingImage";
import { TimeAgo } from "./TimeAgo";
import { DealBadge, NewBadge } from "./Badges";
import { CardCallButton } from "./CardCallButton";

export function ListingCard({
  listing,
  mainImage,
}: {
  listing: Listing;
  mainImage: ListingImageRow | null;
}) {
  const src = mainImage ? resolveImageUrl(mainImage) : null;
  const price = formatPrice(listing.price_usd, listing.deal_type ?? "rent");
  const district = districtLabel(listing.district_code, listing.district);
  // Server-rendered, so it cannot mismatch on hydration; it does not need to
  // tick like the posted-age label because a check time shifts by hours, not
  // minutes. Absent value renders nothing rather than a fake reassurance.
  const checkedLabel = listing.last_checked_at
    ? relativeTimeKa(listing.last_checked_at)
    : null;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group overflow-hidden rounded-2xl bg-card ring-1 ring-sand transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5 hover:ring-sand-strong focus-visible:outline-2 focus-visible:outline-moss"
    >
      {/* Same treatment the gallery got in 5cf8c83, for the same reason: owners
          upload panoramas pasted into portrait canvases and phone screenshots,
          and object-cover crops those to a meaningless slice. Measured over
          13,943 stored photos, 59 listings have a cover with uniform bars — and
          24 of them have no cleaner photo to swap to, so contain+blur fixes
          cases that reordering never could. The blur plate keeps the frame
          filled so the grid does not show letterboxed black holes. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-sand/50">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- same reason as ListingImage: next/image would add a second hop on top of the /img route
          <img
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          />
        )}
        <ListingImage
          src={src}
          alt={`${listing.rooms ?? "?"}-ოთახიანი ბინა, ${district ?? "თბილისი"}`}
          className="absolute inset-0 h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1.5">
          {isNew(listing.first_seen_at) && <NewBadge />}
          <DealBadge dealType={listing.deal_type} />
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        {price ? (
          <p className="font-display text-xl font-bold text-ink">{price}</p>
        ) : (
          <p className="text-xl font-semibold text-faint">ფასი მოთხოვნით</p>
        )}
        <p className="text-sm text-mink">
          {[
            listing.rooms ? `${listing.rooms} ოთახი` : null,
            listing.area ? `${listing.area} მ²` : null,
            listing.floor ? `სართ. ${listing.floor}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          {district ? (
            <p className="truncate text-sm font-medium text-ink">{district}</p>
          ) : (
            <span />
          )}
          {/* Exact age, not just "new": a flat posted 10 minutes ago and one
              posted yesterday are different propositions to a caller. */}
          <TimeAgo
            iso={listing.first_seen_at}
            initialLabel={relativeTimeKa(listing.first_seen_at)}
            className="shrink-0 text-xs text-faint"
          />
        </div>

        {/* Trust + action row. Deliberately at most two signals: the point is to
            answer "is this still real?" and "can I call now?", not to decorate.
            Agent counts and any "verified owner" seal stay off the card — one is
            an ops metric, the other is a claim we cannot back. */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="min-w-0 space-y-0.5">
            {checkedLabel && (
              <p className="flex items-center gap-1 truncate text-xs text-mink">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3 w-3 shrink-0 text-moss"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                შემოწმდა {checkedLabel}
              </p>
            )}
            {listing.description_status === "clean" && (
              <p className="truncate text-xs text-faint">ტექსტი გასუფთავებული</p>
            )}
          </div>
          <CardCallButton listingId={listing.id} hasPhone={listing.has_phone} />
        </div>
      </div>
    </Link>
  );
}

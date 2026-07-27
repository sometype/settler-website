import Link from "next/link";
import type { Listing, ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { formatPrice } from "@/lib/listings";
import { districtLabel } from "@/lib/districts";
import { roomsAltKa, roomsLabelKa } from "@/lib/labels";
import { ageBand, compactAgeKa, relativeTimeKa } from "@/lib/time";
import { ListingImage } from "./ListingImage";
import { AgeStamp } from "./AgeStamp";
import { DealBadge } from "./Badges";
import { CardCallButton } from "./CardCallButton";

/**
 * Card as telemetry: a photo, four readings, one loud control.
 *
 * Structure: outer <article>, <Link> over media+facts only, call <button>
 * OUTSIDE the link. A full-width call button nested inside <a> is invalid HTML
 * and flaky for assistive tech / hit-testing — and we made that worse when the
 * call went full-width. preventDefault on the button was a patch, not a fix.
 */
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
  const checkedLabel = listing.last_checked_at
    ? relativeTimeKa(listing.last_checked_at)
    : null;
  const href = `/listing/${listing.id}`;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-sand bg-card transition duration-150 hover:border-sand-strong">
      <Link
        href={href}
        className="flex min-w-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      >
        {/* Media well: fixed mid-neutral, contain+blur — never page void. */}
        <div className="relative aspect-[4/3] overflow-hidden bg-well">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- see ListingImage
            <img
              src={src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
            />
          )}
          <ListingImage
            src={src}
            alt={roomsAltKa(listing.rooms, district ?? "თბილისი")}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div className="absolute left-1.5 top-1.5 z-10 rounded bg-card/90 px-1.5 py-0.5 backdrop-blur-[2px]">
            <AgeStamp
              iso={listing.first_seen_at}
              initialLabel={compactAgeKa(listing.first_seen_at)}
              initialBand={ageBand(listing.first_seen_at)}
              className="text-[11px]"
            />
          </div>
          <div className="absolute right-1.5 top-1.5 z-10">
            <DealBadge dealType={listing.deal_type} />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-2.5 pb-0">
          {price ? (
            <p className="text-[17px] font-bold leading-none text-ink">
              {price.includes(" / ") ? (
                <>
                  <span className="num">{price.slice(0, price.indexOf(" / "))}</span>
                  <span className="text-[12px] font-semibold text-mink">
                    {price.slice(price.indexOf(" / "))}
                  </span>
                </>
              ) : (
                <span className="num">{price}</span>
              )}
            </p>
          ) : (
            <p className="text-[15px] font-semibold leading-none text-faint">
              ფასი მოთხოვნით
            </p>
          )}
          {district && (
            <p className="mt-1.5 truncate text-[13px] font-medium text-ink">{district}</p>
          )}
          <p className="mt-0.5 min-w-0 truncate text-[12px] text-mink">
            {[
              roomsLabelKa(listing.rooms),
              listing.area != null ? (
                <>
                  <span className="num">{listing.area}</span> მ²
                </>
              ) : null,
              listing.floor ? (
                <>
                  სართ. <span className="num">{listing.floor}</span>
                </>
              ) : null,
            ]
              .filter(Boolean)
              .map((part, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {part}
                </span>
              ))}
          </p>

          {checkedLabel && (
            <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-moss">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3 w-3 shrink-0"
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
        </div>
      </Link>

      {/* Call lives outside the link — valid HTML, no preventDefault gymnastics. */}
      {listing.has_phone && (
        <div className="mt-auto p-2.5 pt-2">
          <CardCallButton listingId={listing.id} hasPhone={listing.has_phone} />
        </div>
      )}
    </article>
  );
}

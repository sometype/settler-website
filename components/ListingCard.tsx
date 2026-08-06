import Link from "next/link";
import type { Listing, ListingImage as ListingImageRow } from "@/lib/types";
import { formatPrice, pricePerSqm } from "@/lib/listings";
import { districtLabel } from "@/lib/districts";
import { locationLine } from "@/lib/location";
import { roomsAltKa, roomsLabelKa } from "@/lib/labels";
import { ageBand, compactAgeKa, relativeTimeKa } from "@/lib/time";
import { CardPhotoPeek } from "./CardPhotoPeek";
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
  images,
  src,
  sort,
}: {
  listing: Listing;
  images: ListingImageRow[];
  /**
   * Channel attribution → `meta.rail` in site_events.
   *
   * ⚠️ `hot_all` and `intake_all` are FULL-PAGE channels, deliberately
   * distinct from their rail surfaces. Collapsing either would make the first
   * question about this feature — "does anyone actually tap ყველა?" —
   * unanswerable, because both surfaces would land in the same bucket.
   * Any value added here must also be added to RAIL_SOURCES in
   * app/listing/[id]/page.tsx, or the beacon records rail:null and the taps
   * are silently lost.
   */
  src?: "hot_all" | "intake_all";
  /**
   * The feed ordering this card was opened FROM, carried into `listing_open`.
   *
   * ⚠️ Without it, "do people who sort by price convert better?" can only be
   * answered by association at session level — a visitor can change mode
   * before opening anything. Carrying it on the link makes the attribution
   * exact. Omitted for the default `new` so ordinary URLs stay clean.
   */
  sort?: string;
}) {
  const price = formatPrice(listing.price_usd, listing.deal_type ?? "rent");
  const unitPrice = pricePerSqm(listing.price_usd, listing.area, listing.deal_type);
  const district = districtLabel(listing.district_code, listing.district);
  // District plus the street when it adds something. Falls back to the district
  // alone — never a placeholder, so a listing without a usable address looks
  // exactly as it did before streets existed.
  const location = locationLine(district, listing.street_display);
  const checkedLabel = listing.last_checked_at
    ? relativeTimeKa(listing.last_checked_at)
    : null;
  const q = new URLSearchParams();
  if (src) q.set("src", src);
  if (sort && sort !== "new") q.set("sort", sort);
  const href = `/listing/${listing.id}${q.size ? `?${q.toString()}` : ""}`;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-sand bg-card transition duration-150 hover:border-sand-strong">
      <CardPhotoPeek
        listingId={listing.id}
        images={images}
        alt={roomsAltKa(listing.rooms, district ?? "თბილისი")}
        href={href}
      >
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
      </CardPhotoPeek>

      <Link
        href={href}
        className="flex min-w-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      >
        <div className="flex flex-1 flex-col p-2.5 pb-0">
          <div className={listing.deal_type === "sale" ? "min-h-9" : undefined}>
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
            {unitPrice !== null && (
              <p className="mt-1 text-[11px] leading-none text-mink">
                <span className="sr-only">
                  {unitPrice.toLocaleString("en-US")} დოლარი ერთ კვადრატულ მეტრზე
                </span>
                <span className="num" aria-hidden="true">
                  ${unitPrice.toLocaleString("en-US")}/მ²
                </span>
              </p>
            )}
          </div>
          {location && (
            <p className="mt-1.5 truncate text-[13px] font-medium text-ink">{location}</p>
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

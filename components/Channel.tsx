import Link from "next/link";
import type { ReactNode } from "react";
import type { Listing, ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { formatPrice } from "@/lib/listings";
import { districtLabel } from "@/lib/districts";
import { roomsAltKa, roomsLabelKa } from "@/lib/labels";
import { ageBand, compactAgeKa } from "@/lib/time";
import { ListingImage } from "./ListingImage";
import { AgeStamp } from "./AgeStamp";

/**
 * The three rails (just-added, hot, district) had three near-identical copies of
 * this markup, which is how the just-added rail ended up being the last surface
 * still cropping photos with object-cover — a fix landed in two places and not
 * the third. One component now, so the next fix lands once.
 *
 * Rails are "channels": a hairline rule, a Georgian label, and a mono count.
 * The rule is what makes the page read as an instrument rather than a magazine
 * with section headings.
 */

export function ChannelHeading({
  id,
  label,
  dot,
  count,
  href,
  children,
}: {
  id: string;
  label: ReactNode;
  /** moss = live/fresh, clay = heat. Omitted for neutral channels. */
  dot?: "moss" | "clay";
  count?: number | string;
  href?: string;
  children?: ReactNode;
}) {
  const heading = (
    <h2 id={id} className="flex shrink-0 items-center gap-1.5 text-[14px] font-bold tracking-tight text-ink">
      {dot && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            dot === "moss" ? "animate-pulse bg-moss" : "bg-clay"
          }`}
          aria-hidden="true"
        />
      )}
      {label}
    </h2>
  );

  return (
    <div className="mb-2 flex items-center gap-2.5">
      {href ? (
        <Link href={href} className="shrink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ink">
          {heading}
        </Link>
      ) : (
        heading
      )}
      {/* The rule. Fills whatever space the label leaves, so channels line up
          down the page regardless of how long the Georgian label is. */}
      <span className="h-px min-w-4 flex-1 bg-sand" aria-hidden="true" />
      {children}
      {count !== undefined && (
        <span className="num shrink-0 text-[11px] text-mink">{count}</span>
      )}
    </div>
  );
}

/**
 * Compact card for a horizontal channel. Same visual grammar as ListingCard —
 * fixed media well, contain+blur, age stamp in the ramp colour, mono figures —
 * at rail density.
 */
export function RailCard({
  listing,
  image,
  src,
  showDistrict = true,
  /** When set, age stamp uses drop time and price shows old (strike) + new. */
  priceDrop,
}: {
  listing: Listing;
  image: ListingImageRow | null;
  /** `?src=` value → `meta.rail` in site_events, so each rail can be judged by
   *  the calls it earns. ⚠️ Any new value must also be added to RAIL_SOURCES in
   *  app/listing/[id]/page.tsx, or every open from this rail records rail:null. */
  src: string;
  showDistrict?: boolean;
  priceDrop?: {
    prevPriceUsd: number;
    priceUsd: number;
    dropAt: string;
  };
}) {
  const price = formatPrice(
    priceDrop?.priceUsd ?? listing.price_usd,
    listing.deal_type ?? "rent"
  );
  const prevPrice = priceDrop
    ? formatPrice(priceDrop.prevPriceUsd, listing.deal_type ?? "rent")
    : null;
  const stampIso = priceDrop?.dropAt ?? listing.first_seen_at;
  const district = districtLabel(listing.district_code, listing.district);
  // ⚠️ NO STREET ON RAIL CARDS — TRIED IT, IT COSTS MORE THAN IT GIVES.
  // The rail fact row is ONE truncating line at 11.5px carrying district +
  // rooms + area. Folding the street into the district slot pushed rooms and m²
  // off the card completely: "ვაკე · ფალიაშვილი ზ. ქ…" with no size at all.
  // A rail is a scan surface — how big and how many rooms beats which street,
  // and the street is one tap away on the card the rail links to. Verified in
  // the browser at 375px before reverting. Feed cards have a separate line for
  // the district and do have room; see ListingCard.
  const url = image ? resolveImageUrl(image) : null;
  const pricePlain = price ? price.replace(" / თვეში", "") : null;
  const prevPlain = prevPrice ? prevPrice.replace(" / თვეში", "") : null;
  const a11yPrice =
    prevPlain && pricePlain
      ? `ფასი იყო ${prevPlain}, ახლა ${pricePlain}`
      : undefined;

  return (
    <li className="w-40 shrink-0 snap-start">
      <Link
        href={`/listing/${listing.id}?src=${src}`}
        className="group block overflow-hidden rounded-lg border border-sand bg-card transition hover:border-sand-strong focus-visible:outline-2 focus-visible:outline-ink"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-well">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- see ListingImage
            <img
              src={url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
            />
          )}
          <ListingImage
            src={url}
            alt={roomsAltKa(listing.rooms, district ?? "თბილისი")}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div className="absolute left-1.5 top-1.5 z-10 rounded bg-card/90 px-1.5 py-0.5 backdrop-blur-[2px]">
            <AgeStamp
              iso={stampIso}
              initialLabel={compactAgeKa(stampIso)}
              initialBand={ageBand(stampIso)}
              className="text-[10.5px]"
            />
          </div>
        </div>
        <div className="p-2">
          {pricePlain ? (
            <div>
              {a11yPrice && <span className="sr-only">{a11yPrice}</span>}
              <p
                className="num leading-none"
                aria-hidden={a11yPrice ? true : undefined}
              >
                {prevPlain && (
                  <span className="mr-1 text-[11px] font-medium text-mink line-through">
                    {prevPlain}
                  </span>
                )}
                <span className="text-[14px] font-bold text-ink">{pricePlain}</span>
              </p>
            </div>
          ) : (
            <p className="truncate text-[13px] font-semibold leading-none text-faint">
              შეთანხმებით
            </p>
          )}
          <p className="mt-1 min-w-0 truncate text-[11.5px] text-mink">
            {[
              showDistrict ? district : null,
              roomsLabelKa(listing.rooms),
              listing.area != null ? (
                <>
                  <span className="num">{listing.area}</span> მ²
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
        </div>
      </Link>
    </li>
  );
}

/**
 * The scroller itself — negative margin so cards bleed to the screen edge.
 *
 * ⚠️ TWO separate bugs, both required:
 *
 * 1. `overscroll-x-contain` — without it, swiping past the end of the strip
 *    CHAINs the gesture to the page (Claude 1d51f27; Gallery already had this).
 *
 * 2. Outer wrapper with `overflow-x-clip` + **`contain: paint`**. Without
 *    paint containment, Chrome still adds the UL's internal scrollWidth
 *    (~1368px of rail cards) to **documentElement.scrollWidth**, so the page
 *    can slide sideways even when body/html use overflow-x:clip (measured live
 *    2026-07-30: html.sw 1201 at vw 390; window.scrollTo(200) moved the header
 *    by −200px). `contain: paint` keeps document width = viewport; the UL still
 *    scrolls. Do not drop this wrapper "to simplify".
 */
export function ChannelStrip({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 max-w-full overflow-x-clip [contain:paint]">
      {/* ⚠️ scroll-px-4 MUST match px-4. A snap target aligns to the SCROLLPORT
          edge, which ignores the scroller's own padding — so `snap-start` on
          the first card snapped scrollLeft past the 16px inset, the `-mx-4`
          full bleed then put that edge under the clip, and the card's left side
          (the price, the age badge) was sliced off on both desktop and mobile.
          The visible symptom is "a tiny cut edge you have to drag right to
          read". scroll-padding is what teaches snap about the inset. */}
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1">
        {children}
      </ul>
    </div>
  );
}

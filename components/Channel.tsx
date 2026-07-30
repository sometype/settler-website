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
 * ⚠️ `overscroll-x-contain` is NOT cosmetic. Without it this rail's horizontal
 * overflow CHAINS: swipe to the end of the strip, keep swiping, and the browser
 * hands the gesture to the page, which slides right and shows blank space beside
 * it. Gallery.tsx already carried this class; the rails did not — the same
 * "fixed in one place, missed in the others" shape as the three-copy rail markup
 * and the five-copy cover pick.
 */
export function ChannelStrip({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1">
      {children}
    </ul>
  );
}

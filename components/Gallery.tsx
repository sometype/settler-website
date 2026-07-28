"use client";

import { useState } from "react";
import type { ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { ListingImage } from "./ListingImage";

/**
 * Fixed-frame gallery. Owners upload every orientation under the sun (phone
 * portraits 770×1712, landscape rooms, video-frame screenshots). The frame
 * size must NEVER depend on the active image's intrinsic dimensions — if the
 * main <img> is in normal flow, swapping a landscape for a tall portrait
 * reflows the page, the vertical scrollbar appears/disappears, and the whole
 * layout wobbles left-right. Both the blur plate and the photo are therefore
 * position:absolute inside a pure aspect-ratio box.
 */
export function Gallery({
  images,
  alt,
}: {
  images: ListingImageRow[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  // Mid-neutral well (never page void). Aspect only — do NOT max-h band-aid.
  // A 905px-tall gallery on phones was the GRID column blowing out to ~1448px
  // (min-width:auto); once the column is minmax(0,1fr)+min-w-0, 4/3 ≈ 257px
  // at 343 content width. Capping height hid the symptom without fixing layout.
  const frame =
    "relative w-full min-w-0 overflow-hidden rounded-lg border border-sand bg-well " +
    "aspect-[4/3] sm:aspect-[16/10]";

  if (images.length === 0) {
    return (
      <div className={frame}>
        <ListingImage
          src={null}
          alt={alt}
          placeholderLabel="ფოტოები ჯერ არ არის"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  const activeImage = images[Math.min(active, images.length - 1)];
  const src = resolveImageUrl(activeImage);

  return (
    <div className="space-y-2">
      <div className={frame}>
        {/* Blur plate — fills letterbox; scale is clipped by overflow-hidden. */}
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`bg-${activeImage.position}`}
            src={src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        <ListingImage
          key={activeImage.position}
          src={src}
          alt={`${alt} — ფოტო ${active + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {images.length > 1 && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-pine/80 px-2 py-0.5 text-[11px] font-medium text-cream">
            <span className="num">{active + 1}</span>
            {" / "}
            <span className="num">{images.length}</span>
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {images.map((img, i) => (
            <button
              key={`${img.position}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`ფოტო ${i + 1}`}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded border transition sm:h-16 sm:w-24 ${
                i === active
                  ? "border-ink ring-1 ring-ink"
                  : "border-sand hover:border-sand-strong"
              }`}
            >
              <ListingImage
                src={resolveImageUrl(img)}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

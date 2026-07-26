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

  if (images.length === 0) {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl ring-1 ring-sand">
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
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-sand/50 ring-1 ring-sand">
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
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-pine/80 px-2.5 py-1 text-xs font-medium text-white">
            {active + 1} / {images.length}
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
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                i === active ? "ring-moss" : "ring-transparent hover:ring-sand-strong"
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

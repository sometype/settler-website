"use client";

import { useEffect, useRef, useState } from "react";
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
  const loadTokenRef = useRef(0);

  useEffect(
    () => () => {
      // Invalidate an in-flight preload if the visitor leaves the detail page.
      loadTokenRef.current += 1;
    },
    []
  );

  function selectImage(index: number) {
    if (index === active) return;
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    const nextSrc = resolveImageUrl(images[index]);
    if (!nextSrc) {
      setActive(index);
      return;
    }

    // Keep the current image painted until the requested file is ready. A
    // direct src swap can blank the stable <img> for hundreds of milliseconds
    // on a cold /img response, which reads as a refresh/flicker on phones.
    const preload = new Image();
    let finished = false;
    const commit = () => {
      if (finished) return;
      finished = true;
      if (loadTokenRef.current === token) setActive(index);
    };
    preload.onload = commit;
    // A failed target should still become active so ListingImage can render
    // its normal clean placeholder instead of trapping the previous photo.
    preload.onerror = commit;
    preload.src = nextSrc;
    if (preload.complete) commit();
  }

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
            src={src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        <ListingImage
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
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1">
          {images.map((img, i) => (
            <button
              key={`${img.position}-${i}`}
              type="button"
              onClick={() => selectImage(i)}
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

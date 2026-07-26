"use client";

import { useState } from "react";
import type { ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { ListingImage } from "./ListingImage";

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
      <div className="aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-stone-200">
        <ListingImage src={null} alt={alt} placeholderLabel="ფოტოები ჯერ არ არის" />
      </div>
    );
  }

  const activeImage = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200">
        {/*
          object-contain, never object-cover: owners upload phone screenshots
          and video frames (770×1669 portraits), and a forced 16:10 cover crop
          shows a random horizontal band of them. The blurred copy underneath
          fills the letterbox so portraits don't float on flat gray.
        */}
        <img
          key={`bg-${activeImage.position}`}
          src={resolveImageUrl(activeImage)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <ListingImage
          key={activeImage.position}
          src={resolveImageUrl(activeImage)}
          alt={`${alt} — ფოტო ${active + 1}`}
          className="relative h-full w-full object-contain"
        />
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-stone-950/70 px-2.5 py-1 text-xs font-medium text-white">
            {active + 1} / {images.length}
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={`${img.position}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`ფოტო ${i + 1}`}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                i === active ? "ring-emerald-600" : "ring-transparent hover:ring-stone-300"
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

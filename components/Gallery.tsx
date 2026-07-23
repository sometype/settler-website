"use client";

import { useState } from "react";
import type { Listing, ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { ListingImage } from "./ListingImage";

export function Gallery({
  images,
  imageStatus,
  alt,
}: {
  images: ListingImageRow[];
  imageStatus: Listing["image_status"];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-stone-200">
        <ListingImage src={null} alt={alt} placeholderLabel="No photos yet" />
      </div>
    );
  }

  const activeImage = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-2">
      <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200">
        <ListingImage
          key={activeImage.position}
          src={resolveImageUrl(activeImage, imageStatus)}
          alt={`${alt} — photo ${active + 1}`}
          className="h-full w-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={`${img.position}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                i === active ? "ring-emerald-600" : "ring-transparent hover:ring-stone-300"
              }`}
            >
              <ListingImage
                src={resolveImageUrl(img, imageStatus)}
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

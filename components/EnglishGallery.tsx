"use client";

import { useState } from "react";
import { EnglishListingImage } from "@/components/EnglishListingImage";
import { resolveImageUrl } from "@/lib/images";
import type { ListingImage } from "@/lib/types";

export function EnglishGallery({ images, alt }: { images: ListingImage[]; alt: string }) {
  const [active, setActive] = useState(0);
  const selected = images[active] ?? images[0];

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-sand bg-well sm:aspect-[16/10]">
        <EnglishListingImage
          src={selected ? resolveImageUrl(selected) : null}
          alt={`${alt}, photo ${active + 1}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Apartment photos">
          {images.map((image, index) => (
            <button
              key={`${image.position}-${index}`}
              type="button"
              aria-label={`Show photo ${index + 1}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              className={`relative aspect-[4/3] min-w-0 cursor-pointer overflow-hidden rounded border bg-well focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${active === index ? "border-ink ring-2 ring-ink" : "border-sand"}`}
            >
              <EnglishListingImage
                src={resolveImageUrl(image)}
                alt={`${alt}, photo ${index + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

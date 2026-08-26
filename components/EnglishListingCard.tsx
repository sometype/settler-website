import Link from "next/link";
import { EnglishContact } from "./EnglishContact";
import { EnglishListingImage } from "./EnglishListingImage";
import { englishListingPresentation } from "@/lib/english-rent";
import { resolveImageUrl } from "@/lib/images";
import type { Listing, ListingImage } from "@/lib/types";

export function EnglishListingCard({
  listing,
  images,
}: {
  listing: Listing;
  images: ListingImage[];
}) {
  const facts = englishListingPresentation(listing);
  if (!facts) return null;
  const href = `/en/listing/${listing.id}`;
  const image = images[0] ?? null;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-sand bg-card">
      <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-ink">
        <div className="relative aspect-[4/3] overflow-hidden bg-well">
          <EnglishListingImage
            src={image ? resolveImageUrl(image) : null}
            alt={facts.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="space-y-1 p-3">
          <p className="text-lg font-bold text-ink">{facts.price ?? "Price on request"}</p>
          <h2 className="font-semibold text-ink">{facts.title}</h2>
          {facts.street && <p className="truncate text-sm text-mink">{facts.street}</p>}
          <p className="text-sm text-mink">
            {[facts.area, facts.floor ? `Floor ${facts.floor}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>
      {listing.has_phone && listing.phone && (
        <div className="mt-auto border-t border-sand p-3">
          <EnglishContact phone={listing.phone} listingId={listing.id} compact />
        </div>
      )}
    </article>
  );
}

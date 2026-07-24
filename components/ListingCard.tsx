import Link from "next/link";
import type { Listing, ListingImage as ListingImageRow } from "@/lib/types";
import { resolveImageUrl } from "@/lib/images";
import { isNew, formatPrice } from "@/lib/listings";
import { ListingImage } from "./ListingImage";
import { SourceBadge, DealBadge, NewBadge } from "./SourceBadge";

export function ListingCard({
  listing,
  mainImage,
}: {
  listing: Listing;
  mainImage: ListingImageRow | null;
}) {
  const src = mainImage ? resolveImageUrl(mainImage, listing.image_status) : null;
  const price = formatPrice(listing.price_usd, listing.deal_type ?? "rent");

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 transition hover:shadow-lg hover:ring-stone-300 focus-visible:outline-2 focus-visible:outline-emerald-600"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <ListingImage
          src={src}
          alt={`${listing.rooms ?? "?"}-ოთახიანი ბინა, ${listing.district ?? "თბილისი"}`}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {isNew(listing.first_seen_at) && <NewBadge />}
          <DealBadge dealType={listing.deal_type} />
        </div>
        <div className="absolute right-2 top-2">
          <SourceBadge source={listing.source} />
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        {price ? (
          <p className="text-xl font-black text-stone-900">{price}</p>
        ) : (
          <p className="text-xl font-semibold text-stone-400">ფასი მოთხოვნით</p>
        )}
        <p className="text-sm text-stone-600">
          {[
            listing.rooms ? `${listing.rooms} ოთახი` : null,
            listing.area ? `${listing.area} მ²` : null,
            listing.floor ? `სართ. ${listing.floor}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {listing.district && (
          <p className="truncate text-sm font-medium text-stone-800">{listing.district}</p>
        )}
      </div>
    </Link>
  );
}

import Link from "next/link";
import { EnglishContact } from "./EnglishContact";
import { EnglishListingImage } from "./EnglishListingImage";
import { getEnglishAgentContact } from "@/lib/english-agent-contact";
import { englishListingPresentation } from "@/lib/english-rent";
import { resolveImageUrl } from "@/lib/images";
import { listingAnchorId, withReturnContext } from "@/lib/returnContext";
import type { Listing, ListingImage } from "@/lib/types";

export function EnglishListingCard({
  listing,
  images,
  returnContext,
}: {
  listing: Listing;
  images: ListingImage[];
  /** The seeker's current English search — see ListingCard's note on this prop. */
  returnContext?: string | null;
}) {
  const facts = englishListingPresentation(listing);
  if (!facts) return null;
  const href = withReturnContext(`/en/listing/${listing.id}`, returnContext);
  const image = images[0] ?? null;
  const agentContact = getEnglishAgentContact(listing.id);

  return (
    // Anchor + focus target for the detail page's back link; see ListingCard.
    <article
      id={listingAnchorId(listing.id)}
      tabIndex={-1}
      className="flex min-w-0 scroll-mt-24 flex-col overflow-hidden rounded-lg border border-sand bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
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
      {agentContact && (
        <div className="mt-auto border-t border-sand p-3">
          <EnglishContact contact={agentContact} listingId={listing.id} compact />
        </div>
      )}
    </article>
  );
}

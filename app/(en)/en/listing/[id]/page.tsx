import Link from "next/link";
import { notFound } from "next/navigation";
import { EnglishContact } from "@/components/EnglishContact";
import { EnglishGallery } from "@/components/EnglishGallery";
import { ListingOpenBeacon } from "@/components/ListingOpenBeacon";
import { getEnglishAgentContact } from "@/lib/english-agent-contact";
import {
  englishAmenities,
  englishListingPresentation,
  englishSafeRenderedText,
} from "@/lib/english-rent";
import { fetchListing } from "@/lib/listings";
import { stripHtml } from "@/lib/text";
import { RETURN_PARAM, returnHref } from "@/lib/returnContext";

export const dynamic = "force-dynamic";

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  const safe = englishSafeRenderedText(value);
  if (!safe) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-sand/70 py-2 text-sm last:border-b-0">
      <dt className="text-mink">{label}</dt>
      <dd className="text-right font-medium text-ink">{safe}</dd>
    </div>
  );
}

export default async function EnglishListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [RETURN_PARAM]?: string | string[] }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // Falls back to "/en/rent". A Georgian context presented here is refused
  // rather than translated — see decodeReturnContext.
  const backHref = returnHref((await searchParams)[RETURN_PARAM], "en", id);

  let data;
  try {
    data = await fetchListing(id);
  } catch {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-ink">Listing could not be loaded</h1>
        <p className="mt-2 text-mink">Please try again in a few minutes.</p>
        <Link href={backHref} className="mt-5 inline-block font-semibold text-ink underline">
          Return to rentals
        </Link>
      </div>
    );
  }

  const { listing, images } = data;
  if (!listing || listing.deal_type !== "rent") notFound();
  const facts = englishListingPresentation({
    ...listing,
    description: stripHtml(listing.description),
  });
  if (!facts) notFound();
  const amenities = englishAmenities(listing.amenities);
  const agentContact = getEnglishAgentContact(listing.id);

  return (
    <article className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <ListingOpenBeacon
        listingId={listing.id}
        meta={{
          deal: "rent",
          district_code: listing.district_code,
          rooms: listing.rooms,
          has_phone: listing.has_phone,
          rail: null,
          sort: "new",
        }}
      />

      <Link href={backHref} className="inline-flex text-sm font-semibold text-mink hover:text-ink">
        ← Back to Tbilisi rentals
      </Link>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div className="min-w-0 space-y-5">
          <EnglishGallery key={listing.id} images={images} alt={facts.title} />

          <header className="space-y-2">
            <p className="text-3xl font-bold text-ink">{facts.price ?? "Price on request"}</p>
            <h1 className="text-2xl font-bold text-ink">{facts.title}</h1>
            <p className="text-sm text-mink">
              {[facts.street, facts.area, facts.floor ? `Floor ${facts.floor}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          <div className="lg:hidden">
            <EnglishContact
              contact={agentContact}
              listingId={listing.id}
            />
          </div>

          <section className="rounded-lg border border-sand bg-card p-4">
            <h2 className="font-semibold text-ink">Apartment facts</h2>
            <dl className="mt-2">
              <Fact label="District" value={facts.district} />
              <Fact label="Location" value={facts.street} />
              <Fact label="Rooms" value={facts.rooms} />
              <Fact label="Area" value={facts.area} />
              <Fact label="Floor" value={facts.floor} />
              <Fact label="Bathrooms" value={facts.bathrooms} />
            </dl>
          </section>

          {amenities.length > 0 && (
            <section className="rounded-lg border border-sand bg-card p-4">
              <h2 className="font-semibold text-ink">Amenities reported by the owner</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-mink sm:grid-cols-3">
                {amenities.map((amenity) => (
                  <li key={amenity} className="rounded bg-paper px-3 py-2">
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {facts.description && (
            <section className="rounded-lg border border-sand bg-card p-4">
              <h2 className="font-semibold text-ink">Owner description</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-mink">
                {facts.description}
              </p>
            </section>
          )}
        </div>

        <aside className="sticky top-20 hidden lg:block">
          <EnglishContact
            contact={agentContact}
            listingId={listing.id}
          />
        </aside>
      </div>
    </article>
  );
}

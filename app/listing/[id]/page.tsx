import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchListing, formatPrice, isNew } from "@/lib/listings";
import { stripHtml } from "@/lib/text";
import { districtLabel } from "@/lib/districts";
import { conditionLabel, statusLabel, projectTypeLabel } from "@/lib/labels";
import { presentAmenities } from "@/lib/amenities";
import { Gallery } from "@/components/Gallery";
import { PhoneBlock } from "@/components/PhoneBlock";
import { StickyContactBar } from "@/components/StickyContactBar";
import { ListingOpenBeacon } from "@/components/ListingOpenBeacon";
import { DealBadge, NewBadge } from "@/components/Badges";
import { AmenityIcon } from "@/components/AmenityIcon";
import type { DescFacts } from "@/lib/types";

/**
 * Rental terms the description worker read out of the owner's own text.
 * Only stated facts render — "unstated" stays silent rather than guessing.
 */
function termsFromFacts(facts: DescFacts | null, isRent: boolean): string[] {
  if (!facts || !isRent) return [];
  const terms: string[] = [];
  if (facts.deposit_required === "yes") terms.push("მოითხოვება დეპოზიტი");
  if (facts.deposit_required === "no") terms.push("დეპოზიტის გარეშე");
  if (facts.utilities_included === "yes") terms.push("კომუნალურები ფასშია");
  if (facts.min_months && facts.min_months > 0)
    terms.push(`მინიმალური ვადა: ${facts.min_months} თვე`);
  if (facts.pets_allowed === "no") terms.push("ცხოველების გარეშე");
  return terms;
}

export const dynamic = "force-dynamic";

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-sand/70 py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-mink">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * Which homepage rail sent the visitor here. Whitelisted so a crafted URL
 * can't write arbitrary strings into site_events; "feed" is implicit (no
 * param) and absent from the set on purpose.
 */
// Every value a rail actually emits must be listed here or the open is
// recorded with rail:null. "district" was missing for the rails' first
// hours — the biggest homepage surface was invisible in analytics.
// "value" is reserved for a rail that does not exist yet.
const RAIL_SOURCES = new Set(["new", "hot", "district", "value"]);

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ src?: string | string[] }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { src } = await searchParams;
  const srcValue = Array.isArray(src) ? src[0] : src;
  const rail = srcValue && RAIL_SOURCES.has(srcValue) ? srcValue : null;

  let data;
  try {
    data = await fetchListing(id);
  } catch (err) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl bg-red-50 p-8 text-center ring-1 ring-red-200">
          <h1 className="text-lg font-semibold text-red-800">განცხადების ჩატვირთვა ვერ მოხერხდა</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
            {err instanceof Error ? err.message : "ბაზასთან კავშირის მოულოდნელი შეცდომა."}
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-red-800 underline">
            მთავარ გვერდზე დაბრუნება
          </Link>
        </div>
      </div>
    );
  }

  const { listing, images } = data;
  if (!listing) notFound();

  const deal = listing.deal_type === "sale" ? "sale" : "rent";
  const dealLabel = deal === "sale" ? "იყიდება" : "ქირავდება";
  const price = formatPrice(listing.price_usd, deal);
  const description = listing.description_ka?.trim() || stripHtml(listing.description);
  const district = districtLabel(listing.district_code, listing.district);
  const title = [
    listing.rooms ? `${listing.rooms}-ოთახიანი ბინა` : "ბინა",
    district ?? "თბილისი",
    dealLabel,
  ].join(", ");
  const amenities = presentAmenities(listing.amenities);
  const terms = termsFromFacts(listing.desc_facts, deal === "rent");
  const balcony =
    listing.balcony === "yes" ? "კი" : listing.balcony === "0" ? null : listing.balcony;
  const buildPeriod =
    listing.build_period && listing.build_period !== listing.status
      ? listing.build_period
      : null;

  const phone = listing.phone?.trim() || null;
  const canCall = Boolean(listing.has_phone && phone);
  // Trust chip only when the description worker actually cleaned this row.
  const textClean = listing.description_status === "clean";
  const ageHours =
    (Date.now() - new Date(listing.first_seen_at).getTime()) / (1000 * 60 * 60);
  const ageLabel =
    ageHours < 24
      ? "დამატებულია დღეს"
      : ageHours < 48
        ? "დამატებულია გუშინ"
        : null;

  return (
    <article
      className={`mx-auto max-w-6xl space-y-5 px-4 py-6 ${canCall ? "pb-28 lg:pb-6" : ""}`}
    >
      <ListingOpenBeacon
        listingId={listing.id}
        meta={{
          deal,
          district_code: listing.district_code,
          rooms: listing.rooms,
          has_phone: listing.has_phone,
          rail,
        }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-mink transition hover:text-ink"
      >
        ← მთავარ გვერდზე
      </Link>

      {/*
        Call-first hierarchy (mobile order):
        gallery → price/title → contact → trust → specs → amenities → description
        Desktop: contact sticks in the right column.
      */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          <Gallery images={images} alt={title} />

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {isNew(listing.first_seen_at) && <NewBadge />}
              <DealBadge dealType={deal} />
            </div>
            {price ? (
              <p className="font-display text-3xl font-bold text-moss-deep">{price}</p>
            ) : (
              <p className="text-2xl font-semibold text-faint">ფასი მოთხოვნით</p>
            )}
            <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
            <p className="text-sm text-mink">
              {[
                listing.rooms ? `${listing.rooms} ოთახი` : null,
                listing.area ? `${listing.area} მ²` : null,
                listing.floor ? `სართ. ${listing.floor}` : null,
                district,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          {/* Contact early on mobile (before long amenity/description walls). */}
          <div className="lg:hidden">
            <PhoneBlock
              hasPhone={listing.has_phone}
              phone={listing.phone}
              listingId={listing.id}
            />
          </div>

          {(textClean || ageLabel) && (
            <div className="flex flex-wrap gap-1.5">
              {textClean && (
                <span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-medium text-moss-deep ring-1 ring-inset ring-moss/25">
                  ტექსტი შემოწმებული
                </span>
              )}
              {ageLabel && (
                <span className="rounded-full bg-sand/50 px-2.5 py-1 text-xs font-medium text-mink">
                  {ageLabel}
                </span>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-card p-4 ring-1 ring-sand lg:hidden">
            <h2 className="text-sm font-semibold text-ink">დეტალები</h2>
            <dl className="mt-2">
              <Fact label="უბანი" value={district} />
              <Fact label="ოთახები" value={listing.rooms} />
              <Fact label="ფართი" value={listing.area ? `${listing.area} მ²` : null} />
              <Fact label="სართული" value={listing.floor} />
              <Fact label="სველი წერტილი" value={listing.bathrooms} />
              <Fact label="მდგომარეობა" value={conditionLabel(listing.condition)} />
              <Fact label="შენობის სტატუსი" value={statusLabel(listing.status)} />
              <Fact label="პროექტის ტიპი" value={projectTypeLabel(listing.project_type)} />
              <Fact label="აივანი" value={balcony} />
              <Fact label="აშენების პერიოდი" value={buildPeriod} />
            </dl>
          </div>

          {amenities.length > 0 && (
            <section className="rounded-2xl bg-card p-4 ring-1 ring-sand">
              <h2 className="text-sm font-semibold text-ink">კეთილმოწყობა</h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                {amenities.map((a) => (
                  <li key={a.key} className="flex items-center gap-2 text-sm text-mink">
                    <AmenityIcon name={a.key} className="h-4.5 w-4.5 shrink-0 text-moss-deep" />
                    {a.ka}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {terms.length > 0 && (
            <section className="rounded-2xl bg-card p-4 ring-1 ring-sand">
              <h2 className="text-sm font-semibold text-ink">პირობები</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {terms.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-sand/50 px-3 py-1 text-xs font-medium text-mink"
                  >
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">
                ამოკითხულია განცხადების ტექსტიდან — გადაამოწმეთ მესაკუთრესთან.
              </p>
            </section>
          )}

          {description && (
            <section className="rounded-2xl bg-card p-4 ring-1 ring-sand">
              <h2 className="text-sm font-semibold text-ink">აღწერა</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-mink">
                {description}
              </p>
            </section>
          )}
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block">
          <PhoneBlock
            hasPhone={listing.has_phone}
            phone={listing.phone}
            listingId={listing.id}
          />
          <div className="rounded-2xl bg-card p-4 ring-1 ring-sand">
            <h2 className="text-sm font-semibold text-ink">დეტალები</h2>
            <dl className="mt-2">
              <Fact label="უბანი" value={district} />
              <Fact label="ოთახები" value={listing.rooms} />
              <Fact label="ფართი" value={listing.area ? `${listing.area} მ²` : null} />
              <Fact label="სართული" value={listing.floor} />
              <Fact label="სველი წერტილი" value={listing.bathrooms} />
              <Fact label="მდგომარეობა" value={conditionLabel(listing.condition)} />
              <Fact label="შენობის სტატუსი" value={statusLabel(listing.status)} />
              <Fact label="პროექტის ტიპი" value={projectTypeLabel(listing.project_type)} />
              <Fact label="აივანი" value={balcony} />
              <Fact label="აშენების პერიოდი" value={buildPeriod} />
            </dl>
          </div>
        </aside>
      </div>

      {canCall && phone && (
        <StickyContactBar phone={phone} listingId={listing.id} />
      )}
    </article>
  );
}

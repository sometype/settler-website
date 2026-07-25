import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchListing, formatPrice, isNew } from "@/lib/listings";
import { stripHtml } from "@/lib/text";
import { districtLabel } from "@/lib/districts";
import { conditionLabel, statusLabel, projectTypeLabel } from "@/lib/labels";
import { presentAmenities } from "@/lib/amenities";
import { Gallery } from "@/components/Gallery";
import { PhoneBlock } from "@/components/PhoneBlock";
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
  // pets "yes" already shows as an amenity; an explicit "no" is a term.
  if (facts.pets_allowed === "no") terms.push("ცხოველების გარეშე");
  return terms;
}

export const dynamic = "force-dynamic";

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-stone-100 py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-800">{value}</dd>
    </div>
  );
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

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
  // Prefer the worker's cleaned Georgian text; the raw source fallback carries
  // literal HTML (<br /> etc.) and must be stripped before display.
  const description = listing.description_ka?.trim() || stripHtml(listing.description);
  const district = districtLabel(listing.district_code, listing.district);
  const title = [
    listing.rooms ? `${listing.rooms}-ოთახიანი ბინა` : "ბინა",
    district ?? "თბილისი",
    dealLabel,
  ].join(", ");
  const amenities = presentAmenities(listing.amenities);
  const terms = termsFromFacts(listing.desc_facts, deal === "rent");
  // ss stores balcony as "yes" / "0" / a count — georgianize the enum-ish ones.
  const balcony =
    listing.balcony === "yes" ? "კი" : listing.balcony === "0" ? null : listing.balcony;
  // ss has no build year — its status string doubles as build_period, which
  // would render the same value twice. Show it only when it adds information.
  const buildPeriod =
    listing.build_period && listing.build_period !== listing.status
      ? listing.build_period
      : null;

  return (
    <article className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 transition hover:text-stone-800"
      >
        ← მთავარ გვერდზე
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Gallery images={images} alt={title} />

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {isNew(listing.first_seen_at) && <NewBadge />}
              <DealBadge dealType={deal} />
            </div>
            <h1 className="text-2xl font-black text-stone-900">{title}</h1>
            {price ? (
              <p className="text-3xl font-black text-emerald-700">{price}</p>
            ) : (
              <p className="text-2xl font-semibold text-stone-400">ფასი მოთხოვნით</p>
            )}
          </header>

          {amenities.length > 0 && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <h2 className="text-sm font-semibold text-stone-900">კეთილმოწყობა</h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                {amenities.map((a) => (
                  <li key={a.key} className="flex items-center gap-2 text-sm text-stone-700">
                    <AmenityIcon name={a.key} className="h-4.5 w-4.5 shrink-0 text-emerald-700" />
                    {a.ka}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {terms.length > 0 && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <h2 className="text-sm font-semibold text-stone-900">პირობები</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {terms.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700"
                  >
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-400">
                ამოკითხულია განცხადების ტექსტიდან — გადაამოწმეთ მესაკუთრესთან.
              </p>
            </section>
          )}

          {description && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <h2 className="text-sm font-semibold text-stone-900">აღწერა</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                {description}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-sm font-semibold text-stone-900">დეტალები</h2>
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

          <PhoneBlock hasPhone={listing.has_phone} phone={listing.phone} />
        </aside>
      </div>
    </article>
  );
}

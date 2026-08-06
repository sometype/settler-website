import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchListing, formatPrice, pricePerSqm } from "@/lib/listings";
import { stripHtml } from "@/lib/text";
import { districtLabel } from "@/lib/districts";
import { trimDistrictFromLocation } from "@/lib/location";
import {
  conditionLabel,
  statusLabel,
  projectTypeLabel,
  roomsLabelKa,
  roomsAltKa,
} from "@/lib/labels";
import { ageBand, compactAgeKa } from "@/lib/time";
import { presentAmenities } from "@/lib/amenities";
import { Gallery } from "@/components/Gallery";
import { PhoneBlock } from "@/components/PhoneBlock";
import { StickyContactBar } from "@/components/StickyContactBar";
import { ListingOpenBeacon } from "@/components/ListingOpenBeacon";
import { DealBadge } from "@/components/Badges";
import { AgeStamp } from "@/components/AgeStamp";
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
// `hot` is the homepage strip; `hot_all` and `intake_all` are full-screen
// ყველა channels.
// They are separate on purpose — see the note on ListingCard's `src` prop.
// A value missing from this set records rail:null and the taps vanish.
const RAIL_SOURCES = new Set([
  "new",
  "hot",
  "hot_all",
  "intake_all",
  "district",
  "price_drop",
  "value",
]);

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ src?: string | string[]; sort?: string | string[] }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { src, sort } = await searchParams;
  const srcValue = Array.isArray(src) ? src[0] : src;
  const rail = srcValue && RAIL_SOURCES.has(srcValue) ? srcValue : null;
  // The ordering the visitor opened this from. Whitelisted like `rail` — an
  // unknown value records `null` rather than passing a stranger's string into
  // analytics. Absent means the default newest-first feed.
  const sortValue = Array.isArray(sort) ? sort[0] : sort;
  const openSort =
    sortValue === "price_asc" || sortValue === "price_desc" ? sortValue : "new";

  let data;
  try {
    data = await fetchListing(id);
  } catch (err) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-lg border border-sand bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">განცხადების ჩატვირთვა ვერ მოხერხდა</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-mink">
            {err instanceof Error ? err.message : "ბაზასთან კავშირის მოულოდნელი შეცდომა."}
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-ink underline">
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
  const unitPrice = pricePerSqm(listing.price_usd, listing.area, deal);
  const description = listing.description_ka?.trim() || stripHtml(listing.description);
  const district = districtLabel(listing.district_code, listing.district);
  // ⚠️ LABELLED `მდებარეობა` (location), NOT `ქუჩა` (street). street_display
  // deliberately carries microdistricts and settlements as well as streets —
  // `დიღომი 8`, `თემქა - ზღვისუბანი X კვარტ.` — and measured 2026-08-05 that is
  // ~14% of live values, so a "street" label would be false on one card in
  // seven. The district's own name is trimmed out so the two rows do not stutter
  // ("უბანი: დიღმის მასივი" above "მდებარეობა: დიღმის მასივი - III კვარტალი").
  const locationFact = listing.street_display
    ? trimDistrictFromLocation(listing.street_display, district)
    : null;
  // roomsAltKa maps studio → სტუდიო; the old `${rooms}-ოთახიანი` left English
  // "studio" in the H1 and every gallery alt on detail (card surfaces were fixed
  // earlier; this string was the remaining leak).
  const place = district ?? "თბილისი";
  const title = listing.rooms
    ? `${roomsAltKa(listing.rooms, place)}, ${dealLabel}`
    : `ბინა, ${place}, ${dealLabel}`;
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
  // Exact age via AgeStamp instead of "დღეს"/"გუშინ" buckets: the ramp is the
  // product rule, and bucketing threw away the difference between 7 minutes and
  // 20 hours. Also removes a Date.now() call during render (react-hooks/purity).

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
          // ⚠️ NEW FIELD 2026-07-30 — this creates a before/after boundary in
          // listing_open, the same class as the 2026-07-29 area/condition break
          // and the 2026-07-27 beacon break. Do not compare meta.sort across it.
          sort: openSort,
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
      {/* minmax(0,...) + min-w-0 are load-bearing, not cosmetic. A grid item
          defaults to min-width:auto, so this column sized to its widest child
          and measured 1448px inside a 375px viewport. The gallery frame is
          `aspect-[16/10] w-full`, so that produced a 905px-tall gallery on a
          phone and pushed the price to y=1145 and the call button to y=1358 —
          past the fold on the page where calls actually happen.
          It never LOOKED broken because body has overflow-x:hidden, which hides
          the scrollbar while leaving the blown-out layout in place.
          Measured before: scrollWidth 1464 at vw 375. After: 375. */}
      {/* Single-column mobile is still a grid track with min-width:auto — the
          1448px blowout happened at vw 375, not only at lg. minmax on lg +
          min-w-0 on the column covers both. */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Gallery images={images} alt={title} />

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <DealBadge dealType={deal} />
              <AgeStamp
                iso={listing.first_seen_at}
                initialLabel={compactAgeKa(listing.first_seen_at)}
                initialBand={ageBand(listing.first_seen_at)}
                className="text-[12px]"
              />
            </div>
            {/* Price is ink, not moss. moss means "checked/alive" everywhere in
                this system; a green price diluted the one signal that matters. */}
            {price ? (
              <p className="text-3xl font-bold text-ink">
                {/* .num goes on the FIGURE only, never the parent — a child span
                    inherits font-family, which is how "თვეში" ended up rendering
                    through JetBrains Mono (no Georgian coverage). */}
                <span className="num">{price.replace(" / თვეში", "")}</span>
                {price.includes(" / თვეში") && (
                  <span className="ml-1.5 text-base font-medium text-mink">/ თვეში</span>
                )}
              </p>
            ) : (
              <p className="text-2xl font-semibold text-faint">ფასი მოთხოვნით</p>
            )}
            {unitPrice !== null && (
              <p className="text-sm text-mink">
                <span className="sr-only">
                  {unitPrice.toLocaleString("en-US")} დოლარი ერთ კვადრატულ მეტრზე
                </span>
                <span className="num" aria-hidden="true">
                  ${unitPrice.toLocaleString("en-US")}/მ²
                </span>
              </p>
            )}
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            <p className="text-sm text-mink">
              {[
                roomsLabelKa(listing.rooms),
                listing.area != null ? (
                  <>
                    <span className="num">{listing.area}</span> მ²
                  </>
                ) : null,
                listing.floor ? (
                  <>
                    სართ. <span className="num">{listing.floor}</span>
                  </>
                ) : null,
                district,
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {part}
                  </span>
                ))}
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

          {textClean && (
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded bg-moss/10 px-2 py-1 text-xs font-medium text-moss-deep">
                ტექსტი შემოწმებული
              </span>
            </div>
          )}

          <div className="rounded-lg border border-sand bg-card p-4 lg:hidden">
            <h2 className="text-sm font-semibold text-ink">დეტალები</h2>
            <dl className="mt-2">
              <Fact label="უბანი" value={district} />
              <Fact label="მდებარეობა" value={locationFact} />
              <Fact label="ოთახები" value={roomsLabelKa(listing.rooms)} />
              <Fact
                label="ფართი"
                value={listing.area != null ? `${listing.area} მ²` : null}
              />
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
            <section className="rounded-lg border border-sand bg-card p-4">
              <h2 className="text-sm font-semibold text-ink">კეთილმოწყობა</h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                {amenities.map((a) => (
                  <li key={a.key} className="flex items-center gap-2 text-sm text-mink">
                    <AmenityIcon name={a.key} className="h-4.5 w-4.5 shrink-0 text-moss" />
                    {a.ka}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {terms.length > 0 && (
            <section className="rounded-lg border border-sand bg-card p-4">
              <h2 className="text-sm font-semibold text-ink">პირობები</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {terms.map((t) => (
                  <li
                    key={t}
                    className="rounded bg-paper px-2.5 py-1 text-xs font-medium text-mink"
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
            <section className="rounded-lg border border-sand bg-card p-4">
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
          <div className="rounded-lg border border-sand bg-card p-4">
            <h2 className="text-sm font-semibold text-ink">დეტალები</h2>
            <dl className="mt-2">
              <Fact label="უბანი" value={district} />
              <Fact label="მდებარეობა" value={locationFact} />
              <Fact label="ოთახები" value={roomsLabelKa(listing.rooms)} />
              <Fact
                label="ფართი"
                value={listing.area != null ? `${listing.area} მ²` : null}
              />
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

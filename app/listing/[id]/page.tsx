import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchListing, formatPrice, isNew } from "@/lib/listings";
import { Gallery } from "@/components/Gallery";
import { PhoneBlock } from "@/components/PhoneBlock";
import { SourceBadge, DealBadge, NewBadge } from "@/components/SourceBadge";

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
  const title = [
    listing.rooms ? `${listing.rooms}-ოთახიანი ბინა` : "ბინა",
    listing.district ?? "თბილისი",
    dealLabel,
  ].join(", ");

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
          <Gallery images={images} imageStatus={listing.image_status} alt={title} />

          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {isNew(listing.first_seen_at) && <NewBadge />}
              <DealBadge dealType={deal} />
              <SourceBadge source={listing.source} />
            </div>
            <h1 className="text-2xl font-black text-stone-900">{title}</h1>
            {price ? (
              <p className="text-3xl font-black text-emerald-700">{price}</p>
            ) : (
              <p className="text-2xl font-semibold text-stone-400">ფასი მოთხოვნით</p>
            )}
          </header>

          {listing.description && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <h2 className="text-sm font-semibold text-stone-900">აღწერა</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                {listing.description}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-sm font-semibold text-stone-900">დეტალები</h2>
            <dl className="mt-2">
              <Fact label="უბანი" value={listing.district} />
              <Fact label="ოთახები" value={listing.rooms} />
              <Fact label="ფართი" value={listing.area ? `${listing.area} მ²` : null} />
              <Fact label="სართული" value={listing.floor} />
              <Fact label="სველი წერტილი" value={listing.bathrooms} />
              <Fact label="მდგომარეობა" value={listing.condition} />
              <Fact label="შენობის სტატუსი" value={listing.status} />
              <Fact label="პროექტის ტიპი" value={listing.project_type} />
              <Fact label="აივანი" value={listing.balcony} />
              <Fact label="აშენების პერიოდი" value={listing.build_period} />
            </dl>
          </div>

          <PhoneBlock hasPhone={listing.has_phone} phone={listing.phone} />

          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl bg-white p-4 text-center text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:ring-stone-400"
          >
            ორიგინალი განცხადება ↗
          </a>
        </aside>
      </div>
    </article>
  );
}

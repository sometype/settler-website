import { Suspense } from "react";
import Link from "next/link";
import { fetchFeed } from "@/lib/listings";
import { parseFilters, hasActiveFilters, type SearchParams } from "@/lib/filters";
import { Hero } from "@/components/Hero";
import { FilterBar } from "@/components/FilterBar";
import { ListingCard } from "@/components/ListingCard";
import { Pagination } from "@/components/Pagination";
import { FeedSkeleton } from "@/components/Skeletons";
import { FeedBeacon } from "@/components/FeedBeacon";

export const dynamic = "force-dynamic";

function filterMeta(filters: ReturnType<typeof parseFilters>) {
  return {
    deal: filters.dealType ?? "rent",
    district: filters.district ?? null,
    rooms: filters.rooms ?? null,
    min: filters.minPrice ?? null,
    max: filters.maxPrice ?? null,
    amenities: filters.amenities ?? [],
    page: filters.page,
    has_filters: hasActiveFilters(filters),
  };
}

async function Feed({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  const meta = filterMeta(filters);

  let result;
  try {
    result = await fetchFeed(filters);
  } catch (err) {
    return (
      <div className="rounded-2xl bg-red-50 p-8 text-center ring-1 ring-red-200">
        <h2 className="text-lg font-semibold text-red-800">
          განცხადებების ჩატვირთვა ვერ მოხერხდა
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
          {err instanceof Error ? err.message : "ბაზასთან კავშირის მოულოდნელი შეცდომა."}
        </p>
        <p className="mt-2 text-sm text-red-600">გთხოვთ, სცადოთ ცოტა ხანში.</p>
      </div>
    );
  }

  // page= beyond the last page: results exist, the page number doesn't.
  if (result.listings.length === 0 && result.total > 0 && filters.page > result.pageCount) {
    const backParams = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      const v = Array.isArray(value) ? value[0] : value;
      if (v && key !== "page") backParams.set(key, v);
    }
    const backHref = backParams.size ? `/?${backParams.toString()}` : "/";
    return (
      <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-stone-200">
        <FeedBeacon empty meta={{ ...meta, reason: "page_out_of_range", total: result.total }} />
        <h2 className="text-lg font-semibold text-stone-800">ასეთი გვერდი არ არსებობს</h2>
        <p className="mt-2 text-sm text-stone-500">
          სულ {result.pageCount.toLocaleString("ka-GE")} გვერდია.
        </p>
        <Link
          href={backHref}
          className="mt-4 inline-block text-sm font-semibold text-emerald-700 underline underline-offset-2"
        >
          პირველ გვერდზე დაბრუნება
        </Link>
      </div>
    );
  }

  if (result.listings.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-stone-200">
        <FeedBeacon empty meta={{ ...meta, total: 0 }} />
        <h2 className="text-lg font-semibold text-stone-800">
          {hasActiveFilters(filters) ? "ფილტრს არაფერი ემთხვევა" : "ჯერ არ არის განცხადებები"}
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          {hasActiveFilters(filters)
            ? "სცადე ფასის დიაპაზონის გაფართოება ან ფილტრების გასუფთავება."
            : "ახალი განცხადებები აქ გამოჩნდება, როგორც კი გაიფილტრება. შემოგვიარე მალე."}
        </p>
      </div>
    );
  }

  return (
    <>
      <FeedBeacon empty={false} meta={{ ...meta, total: result.total }} />
      <p className="mb-3 text-sm text-stone-500">
        {result.total.toLocaleString("ka-GE")} განცხადება
        {hasActiveFilters(filters) ? " შენს ფილტრს ემთხვევა" : ""}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            mainImage={result.mainImages.get(listing.id) ?? null}
          />
        ))}
      </div>
      <Pagination page={result.page} pageCount={result.pageCount} searchParams={searchParams} />
    </>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterKey = ["district", "min", "max"]
    .map((k) => `${k}=${params[k] ?? ""}`)
    .join("&");

  return (
    <>
      <Suspense fallback={<div className="h-72 bg-stone-950 sm:h-96" />}>
        <Hero />
      </Suspense>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
        <FilterBar key={filterKey} />
        <Suspense key={JSON.stringify(params)} fallback={<FeedSkeleton />}>
          <Feed searchParams={params} />
        </Suspense>
      </div>
    </>
  );
}

import { Suspense } from "react";
import { fetchFeed } from "@/lib/listings";
import { parseFilters, hasActiveFilters, type SearchParams } from "@/lib/filters";
import { FilterBar } from "@/components/FilterBar";
import { ListingCard } from "@/components/ListingCard";
import { Pagination } from "@/components/Pagination";
import { FeedSkeleton } from "@/components/Skeletons";

export const dynamic = "force-dynamic";

async function Feed({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);

  let result;
  try {
    result = await fetchFeed(filters);
  } catch (err) {
    return (
      <div className="rounded-2xl bg-red-50 p-8 text-center ring-1 ring-red-200">
        <h2 className="text-lg font-semibold text-red-800">Couldn&apos;t load listings</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
          {err instanceof Error ? err.message : "Unexpected error talking to the database."}
        </p>
        <p className="mt-2 text-sm text-red-600">Please try again in a moment.</p>
      </div>
    );
  }

  if (result.listings.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-stone-200">
        <h2 className="text-lg font-semibold text-stone-800">
          {hasActiveFilters(filters) ? "No listings match" : "No listings yet"}
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          {hasActiveFilters(filters)
            ? "Try widening your price range or clearing the filters."
            : "Fresh listings land here as soon as they're curated. Check back soon."}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-stone-500">
        {result.total} listing{result.total === 1 ? "" : "s"}
        {hasActiveFilters(filters) ? " match your filters" : ""}
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
  // Keyed so typed-but-unapplied input resets when the URL's filters change
  // (Clear button, back/forward navigation).
  const filterKey = ["district", "min", "max"]
    .map((k) => `${k}=${params[k] ?? ""}`)
    .join("&");

  return (
    <div className="space-y-5">
      <FilterBar key={filterKey} />
      <Suspense key={JSON.stringify(params)} fallback={<FeedSkeleton />}>
        <Feed searchParams={params} />
      </Suspense>
    </div>
  );
}

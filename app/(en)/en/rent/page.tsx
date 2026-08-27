import type { Metadata } from "next";
import Link from "next/link";
import { EnglishListingCard } from "@/components/EnglishListingCard";
import { DISTRICTS, isKnownDistrictCode } from "@/lib/districts";
import { fetchDistrictCounts, fetchFeed } from "@/lib/listings";
import type { FeedFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apartments for rent in Tbilisi",
  description:
    "Browse current long-term rentals in Tbilisi with help from an English-speaking Mepatrone agent.",
  alternates: { canonical: "/en/rent" },
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInt(value: string | undefined, min: number, max: number): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : undefined;
}

function parseEnglishFilters(params: SearchParams): FeedFilters {
  const district = one(params.district);
  const rooms = one(params.rooms);
  const minPrice = boundedInt(one(params.min), 50, 50_000);
  const maxPrice = boundedInt(one(params.max), 50, 50_000);
  const page = boundedInt(one(params.page), 1, 999) ?? 1;
  return {
    dealType: "rent",
    districts: district && isKnownDistrictCode(district) ? [district] : undefined,
    rooms: rooms && /^(?:1|2|3|4|5\+)$/u.test(rooms) ? rooms : undefined,
    minPrice,
    maxPrice,
    sort: "new",
    page,
  };
}

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const key of ["district", "rooms", "min", "max"]) {
    const value = one(params[key]);
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  return query.size ? `/en/rent?${query}` : "/en/rent";
}

export default async function EnglishRentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = parseEnglishFilters(params);

  let result;
  let districtCounts;
  try {
    [result, districtCounts] = await Promise.all([
      fetchFeed(filters),
      fetchDistrictCounts("rent"),
    ]);
  } catch {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-ink">Listings could not be loaded</h1>
        <p className="mt-2 text-mink">Please try again in a few minutes.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-clay">Long-term rentals</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Apartments for rent in Tbilisi
        </h1>
        <p className="mt-3 text-base leading-7 text-mink">
          Browse current listings and speak with an English-speaking Mepatrone agent who can contact the owner, confirm availability, and help arrange a viewing.
        </p>
      </section>

      <form
        action="/en/rent"
        className="mt-6 grid gap-3 rounded-lg border border-sand bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="text-xs font-semibold text-mink">
          District
          <select
            name="district"
            defaultValue={filters.districts?.[0] ?? ""}
            className="mt-1 block min-h-11 w-full rounded border border-sand-strong bg-card px-3 text-sm text-ink"
          >
            <option value="">All districts</option>
            {DISTRICTS.filter((district) => (districtCounts?.[district.code] ?? 0) > 0).map(
              (district) => (
                <option key={district.code} value={district.code}>
                  {district.en} ({districtCounts?.[district.code] ?? 0})
                </option>
              )
            )}
          </select>
        </label>
        <label className="text-xs font-semibold text-mink">
          Rooms
          <select
            name="rooms"
            defaultValue={filters.rooms ?? ""}
            className="mt-1 block min-h-11 w-full rounded border border-sand-strong bg-card px-3 text-sm text-ink"
          >
            <option value="">Any rooms</option>
            <option value="1">1 room</option>
            <option value="2">2 rooms</option>
            <option value="3">3 rooms</option>
            <option value="4">4 rooms</option>
            <option value="5+">5+ rooms</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-mink">
          Minimum monthly price
          <input
            name="min"
            inputMode="numeric"
            defaultValue={filters.minPrice ?? ""}
            placeholder="$ min"
            className="mt-1 block min-h-11 w-full rounded border border-sand-strong bg-card px-3 text-sm text-ink"
          />
        </label>
        <label className="text-xs font-semibold text-mink">
          Maximum monthly price
          <input
            name="max"
            inputMode="numeric"
            defaultValue={filters.maxPrice ?? ""}
            placeholder="$ max"
            className="mt-1 block min-h-11 w-full rounded border border-sand-strong bg-card px-3 text-sm text-ink"
          />
        </label>
        <div className="flex items-end gap-2">
          <button className="min-h-11 flex-1 rounded bg-ink px-4 text-sm font-bold text-card">
            Search
          </button>
          <Link
            href="/en/rent"
            className="flex min-h-11 items-center rounded border border-sand-strong px-3 text-sm font-semibold text-ink"
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-mink">
          {result.total.toLocaleString("en-US")} current rental listings
        </p>
        <p className="text-xs text-faint">
          Page {result.page} of {result.pageCount}
        </p>
      </div>

      {result.listings.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.listings.map((listing) => (
            <EnglishListingCard
              key={listing.id}
              listing={listing}
              images={result.cardImages.get(listing.id) ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-sand bg-card p-10 text-center">
          <h2 className="text-lg font-semibold text-ink">No matching rentals</h2>
          <p className="mt-2 text-sm text-mink">Try removing one or more filters.</p>
        </div>
      )}

      <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Catalog pages">
        {result.page > 1 && (
          <Link
            href={pageHref(params, result.page - 1)}
            className="rounded border border-sand-strong bg-card px-4 py-2 text-sm font-semibold text-ink"
          >
            Previous
          </Link>
        )}
        {result.page < result.pageCount && (
          <Link
            href={pageHref(params, result.page + 1)}
            className="rounded bg-ink px-4 py-2 text-sm font-bold text-card"
          >
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { fetchFeed, fetchRailPlan, type RailPlan } from "@/lib/listings";
import {
  parseFilters,
  hasActiveFilters,
  hasNarrowingFilters,
  isChannelView,
  type SearchParams,
} from "@/lib/filters";
import { Hero } from "@/components/Hero";
import { FilterBar } from "@/components/FilterBar";
import { ChannelHeading } from "@/components/Channel";
import { ListingCard } from "@/components/ListingCard";
import { JustAddedRail } from "@/components/JustAddedRail";
import { HotRail } from "@/components/HotRail";
import { DistrictPulse } from "@/components/DistrictPulse";
import { DistrictRail } from "@/components/DistrictRail";
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

async function Feed({
  searchParams,
  excludeIds = [],
}: {
  searchParams: SearchParams;
  excludeIds?: number[];
}) {
  const filters = parseFilters(searchParams);
  const meta = filterMeta(filters);

  let result;
  try {
    result = await fetchFeed(filters, excludeIds);
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
      <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-sand">
        <FeedBeacon
          empty
          hasFilters={hasActiveFilters(filters)}
          meta={{ ...meta, reason: "page_out_of_range", total: result.total }}
        />
        <h2 className="text-lg font-semibold text-ink">ასეთი გვერდი არ არსებობს</h2>
        <p className="mt-2 text-sm text-mink">
          სულ {result.pageCount.toLocaleString("ka-GE")} გვერდია.
        </p>
        <Link
          href={backHref}
          className="mt-4 inline-block text-sm font-semibold text-moss-deep underline underline-offset-2"
        >
          პირველ გვერდზე დაბრუნება
        </Link>
      </div>
    );
  }

  if (result.listings.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-sand">
        <FeedBeacon empty hasFilters={hasActiveFilters(filters)} meta={{ ...meta, total: 0 }} />
        <h2 className="text-lg font-semibold text-ink">
          {hasActiveFilters(filters) ? "ფილტრს არაფერი ემთხვევა" : "ჯერ არ არის განცხადებები"}
        </h2>
        <p className="mt-2 text-sm text-mink">
          {hasActiveFilters(filters)
            ? "სცადე ფასის დიაპაზონის გაფართოება ან ფილტრების გასუფთავება."
            : "ახალი განცხადებები აქ გამოჩნდება, როგორც კი გაიფილტრება. შემოგვიარე მალე."}
        </p>
      </div>
    );
  }

  return (
    <>
      <FeedBeacon
        empty={false}
        hasFilters={hasActiveFilters(filters)}
        meta={{ ...meta, total: result.total }}
      />
      <p className="mb-3 text-sm text-mink">
        {result.total.toLocaleString("ka-GE")} განცხადება
        {hasActiveFilters(filters) ? " შენს ფილტრს ემთხვევა" : ""}
      </p>
      {/* minmax(0,1fr): same trap as the detail page — auto min-width lets a
          card's nowrap facts line blow the column past the viewport. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
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

/**
 * Plans and renders everything above the feed, plus the feed itself — they share
 * one component because the feed needs to know which listings the rails already
 * used. Under a narrowing filter the rails disappear and the feed is unmodified.
 */
async function Rails({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  // Rails are hidden when a channel is open full-screen: the channel IS the
  // rail, expanded. That also lifts excludeIds (the !showRails branch passes
  // none), which is the whole point — those listings were reachable ONLY by
  // swiping the rail sideways, on every page of the unfiltered homepage.
  const showRails = !hasNarrowingFilters(filters) && !isChannelView(filters);

  if (!showRails) {
    // A channel opened full-screen gets a heading and a way back; a plain
    // filtered feed does not (the filter bar already says what is applied).
    if (isChannelView(filters)) {
      return (
        <div className="space-y-3">
          <ChannelHeading id="channel-heading" label="ახლახან დაემატა" dot="moss" />
          <Feed searchParams={searchParams} />
        </div>
      );
    }
    return <Feed searchParams={searchParams} />;
  }

  let plan: RailPlan | null = null;
  try {
    plan = await fetchRailPlan(filters.dealType);
  } catch {
    // Rails are decoration over the feed — never let them break the page.
    plan = null;
  }

  return (
    <div className="space-y-5">
      {plan && plan.justAdded.listings.length > 0 && (
        <JustAddedRail data={plan.justAdded} dealType={filters.dealType} />
      )}
      {/* Below just-added on purpose: freshness is the product's claim, and
          attention is the second-order signal. */}
      {plan && plan.hot.listings.length > 0 && <HotRail data={plan.hot} />}
      {/* District strips: the axis people actually hunt on. Count is one
          constant (DISTRICT_RAILS) — see lib/listings.ts. */}
      {plan?.districts.map((d) => (
        <DistrictRail key={d.code} data={d} dealType={filters.dealType} />
      ))}
      {/* Chips are the way into the other ~40 districts that have no rail. */}
      <DistrictPulse dealType={filters.dealType} />
      <Feed searchParams={searchParams} excludeIds={plan?.shownIds ?? []} />
    </div>
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

  // The strip is a browse aid for someone with no stated intent. Once a filter
  // is on, unfiltered arrivals would contradict the list right below them.
  const homeFilters = parseFilters(params);

  return (
    <>
      {/* Instrument chrome is short; a 288–384px pine block was leftover from
          the old magazine hero and flashed a dark void on every load. */}
      <Suspense fallback={<div className="h-[7.5rem] border-b border-sand bg-card sm:h-40" />}>
        <Hero />
      </Suspense>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-6 pt-0">
        <FilterBar key={filterKey} />
        {/* All rails are planned together (fetchRailPlan) rather than fetching
            independently, because they must not repeat each other's listings —
            and the feed must not repeat any of them. */}
        <Suspense key={`rails-${homeFilters.dealType ?? "rent"}-${JSON.stringify(params)}`} fallback={<FeedSkeleton />}>
          <Rails searchParams={params} />
        </Suspense>
      </div>
    </>
  );
}

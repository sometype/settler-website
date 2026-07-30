import { Suspense } from "react";
import Link from "next/link";
import {
  fetchConditionCounts,
  fetchFeed,
  fetchRailPlan,
  type RailPlan,
} from "@/lib/listings";
import {
  parseFilters,
  hasActiveFilters,
  hasNarrowingFilters,
  isChannelView,
  isPriceSort,
  parseDistrictCodes,
  serializeDistricts,
  type SearchParams,
} from "@/lib/filters";
import { Hero } from "@/components/Hero";
import { FilterBar } from "@/components/FilterBar";
import { ChannelHeading } from "@/components/Channel";
import { ListingCard } from "@/components/ListingCard";
import { JustAddedRail } from "@/components/JustAddedRail";
import { PriceDropRail } from "@/components/PriceDropRail";
import { DistrictPulse } from "@/components/DistrictPulse";
import { DistrictRail } from "@/components/DistrictRail";
import { Pagination } from "@/components/Pagination";
import { SortBar } from "@/components/SortBar";
import { FeedSkeleton } from "@/components/Skeletons";
import { FeedBeacon } from "@/components/FeedBeacon";

export const dynamic = "force-dynamic";

function filterMeta(filters: ReturnType<typeof parseFilters>) {
  const districts = filters.districts ?? [];
  return {
    deal: filters.dealType ?? "rent",
    // Multi-district (2026-07-30). Keep singular `district` as first code for
    // old queries; `districts` is always the authoritative array (length
    // 0–MAX), never JSON null, so jsonb_array_length remains safe.
    district: districts[0] ?? null,
    districts,
    rooms: filters.rooms ?? null,
    min: filters.minPrice ?? null,
    max: filters.maxPrice ?? null,
    // Schema break from 2026-07-29: events before it carry `amenities`, events
    // after carry area bounds. Same kind of discontinuity as the hot/hot_all
    // split — do not compare the two windows on these fields.
    condition_code: filters.conditionCode ?? null,
    min_area: filters.minArea ?? null,
    max_area: filters.maxArea ?? null,
    // Sort is always present in meta; alone it does not fire filter_apply.
    sort: filters.sort,
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
      // Preserve every district when recovering from an out-of-range page;
      // repeated-key input is normalized to the preferred one-key CSV form.
      const v = key === "district"
        ? serializeDistricts(parseDistrictCodes(value))
        : Array.isArray(value) ? value[0] : value;
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
    const emptyHot = filters.view === "hot";
    const hotSale = filters.view === "hot" && filters.dealType === "sale";
    const title = hotSale
      ? "ეს არხი ჯერ მხოლოდ ქირისთვისაა"
      : emptyHot
        ? "ახლა საკმარისი აქტივობა არ არის"
        : hasActiveFilters(filters)
          ? "ფილტრს არაფერი ემთხვევა"
          : "ჯერ არ არის განცხადებები";
    const detail = hotSale
      ? "გაყიდვის განცხადებებისთვის სანდო ცხელი რეიტინგი ჯერ არ გვაქვს."
      : emptyHot
        ? "აქ მხოლოდ ის ქირის განცხადებები ჩნდება, რომლებიც ცხელი რეიტინგის ზღვარს გადიან."
        : hasActiveFilters(filters)
          ? "სცადე ფასის ან ფართის დიაპაზონის გაფართოება, ან ფილტრების გასუფთავება."
          : "ახალი განცხადებები აქ გამოჩნდება, როგორც კი გაიფილტრება. შემოგვიარე მალე.";
    return (
      <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-sand">
        <FeedBeacon empty hasFilters={hasActiveFilters(filters)} meta={{ ...meta, total: 0 }} />
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-mink">{detail}</p>
        {hotSale && (
          <Link
            href="/?view=hot"
            className="mt-4 inline-block text-sm font-semibold text-clay-deep underline underline-offset-2"
          >
            ქირის არხის ნახვა
          </Link>
        )}
      </div>
    );
  }

  // Hot keeps rolling-attention order — price chips would lie. Hide SortBar.
  const showSort = filters.view !== "hot" && filters.dealType !== undefined;

  return (
    <>
      <FeedBeacon
        empty={false}
        hasFilters={hasActiveFilters(filters)}
        meta={{ ...meta, total: result.total }}
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-mink">
          {result.total.toLocaleString("ka-GE")} განცხადება
          {hasActiveFilters(filters) ? " შენს ფილტრს ემთხვევა" : ""}
        </p>
        {showSort && <SortBar active={filters.sort} />}
      </div>
      {/* minmax(0,1fr): same trap as the detail page — auto min-width lets a
          card's nowrap facts line blow the column past the viewport. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        {result.listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            mainImage={result.mainImages.get(listing.id) ?? null}
            src={
              filters.view === "hot"
                ? "hot_all"
                : filters.view === "intake"
                  ? "intake_all"
                  : undefined
            }
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
  // Rails are hidden when a channel is open full-screen, when the visitor has
  // narrowed the catalogue, OR when they price-sort (Claude/GPT R1): rail
  // excludeIds would remove candidates from a grid that claims full cheapest/
  // dearest order. That also lifts excludeIds (no-rails branches pass none).
  const showRails =
    !hasNarrowingFilters(filters) &&
    !isChannelView(filters) &&
    !isPriceSort(filters);

  if (!showRails) {
    // A channel opened full-screen gets a heading and a way back; a plain
    // filtered feed does not (the filter bar already says what is applied).
    if (isChannelView(filters)) {
      const isHot = filters.view === "hot";
      return (
        <div className="space-y-3">
          {/* Intake honestly expands to the whole newest-first catalogue. Hot
              keeps its threshold and rolling-attention order, so its heading
              can keep the attention claim without relabelling a newest feed.
              ⚠️ Intake ALLOWS price sort (it is the full catalogue, reordered),
              so the heading must drop "ახლიდან" when it is no longer newest —
              a channel heading that outlives its ordering is the same false
              claim that kept hot out of ChannelView until it could paginate
              honestly. Caught by GPT's sort audit. */}
          <ChannelHeading
            id="channel-heading"
            label={
              isHot
                ? "რასაც ახლა სხვები უყურებენ"
                : isPriceSort(filters)
                  ? "ყველა განცხადება"
                  : "ყველა განცხადება, ახლიდან"
            }
            dot={isHot ? "clay" : undefined}
          />
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
      {/* Second rail: price drops only — replaces «სხვები უყურებენ» on the
          homepage. Label «ფასი დააკლდა». Hot channel remains at /?view=hot. */}
      {plan && plan.priceDrops.listings.length > 0 && (
        <PriceDropRail data={plan.priceDrops} />
      )}
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
  // Typed controls keep local state and remount when their URL values change.
  // District has its own guarded URL sync in FilterBar so the multi-select can
  // stay open while each checkbox immediately navigates.
  // Chips (rooms, deal) drive straight off the URL and need no key.
  const filterKey = ["min", "max", "mina", "maxa"]
    .map((k) => `${k}=${params[k] ?? ""}`)
    .join("&");

  // The strip is a browse aid for someone with no stated intent. Once a filter
  // is on, unfiltered arrivals would contradict the list right below them.
  const homeFilters = parseFilters(params);
  // Sale only, so the rent homepage — the common case — pays nothing for a
  // control it never renders. ~250 short rows; null on failure hides the row.
  const frameCounts =
    homeFilters.dealType === "sale" ? await fetchConditionCounts() : null;

  return (
    <>
      {/* Instrument chrome is short; a 288–384px pine block was leftover from
          the old magazine hero and flashed a dark void on every load. */}
      <Suspense fallback={<div className="h-[7.5rem] border-b border-sand bg-card sm:h-40" />}>
        <Hero />
      </Suspense>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-6 pt-0">
        <FilterBar key={filterKey} frameCounts={frameCounts} />
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

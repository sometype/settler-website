import Link from "next/link";
import type { ReactNode } from "react";

import { hasActiveFilters, type SearchParams } from "@/lib/filters";
import type { FeedFilters } from "@/lib/types";

/**
 * The screen a visitor sees when a feed comes back with nothing.
 *
 * ⚠️ THIS IS PRESENTATIONAL ONLY. `FeedBeacon` stays in `app/page.tsx` and is
 * passed in as `children`, because a zero IS an inventory event and the
 * analytics contract (`empty_result`, `hasFilters`, `meta`) must keep living
 * next to the rest of the beacon wiring. Do not move the beacon in here to
 * "tidy up" — `empty_result` firing from a presentational component is how a
 * heading and its telemetry drift apart.
 *
 * ⚠️ WHY THE FILTERED PATH IS A RECOVERY SURFACE, NOT A SHRUG. Measured 24h on
 * 2026-07-30: 405 sessions hit at least one zero, and **100 had it as their
 * last recorded event**. The other 298 refined and carried on, so this screen
 * is not a catastrophe — but it is the last thing a fifth of them ever saw.
 * The old copy ("try widening price or area") named the wrong axes and offered
 * no way to act.
 *
 * ⚠️ THE WHY-LINE ORDER IS DATA, NOT TASTE. One-axis recovery measured against
 * live inventory: **district 285 > price 222 > rooms 142 > area 63 >
 * condition 52** (of 405 first zeros). An earlier plan led with m² because a
 * one-hour sample made it look like the top driver; the 24h replay put it
 * FOURTH. Do not reorder these without re-running that measurement.
 */
export type EmptyReason = "no_match" | "hot" | "page_out_of_range";

/** Params that narrow the catalogue, grouped by the axis a visitor thinks in. */
const AXIS_PARAMS = {
  district: ["district"],
  price: ["min", "max"],
  rooms: ["rooms"],
  area: ["mina", "maxa"],
  frame: ["frame"],
} as const;

type Axis = keyof typeof AXIS_PARAMS;

/** Every narrowing param, for the "clear everything but the deal" CTA. */
const ALL_NARROWING = [
  ...Object.values(AXIS_PARAMS).flat(),
  "page",
  "view",
  "sort",
  "amen",
];

function toParams(searchParams: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) out.set(key, v);
  }
  return out;
}

function href(params: URLSearchParams): string {
  return params.size ? `/?${params.toString()}` : "/";
}

/**
 * Drop ONE axis, keep the deal and every other choice.
 *
 * ⚠️ Keeping the rest is the whole point: a visitor who picked three districts,
 * a price band and 3 rooms should not be punished back to an empty homepage for
 * having been specific. `page` always resets — the old page number cannot
 * survive a wider result set.
 */
function withoutAxis(searchParams: SearchParams, axis: Axis): string {
  const p = toParams(searchParams);
  for (const key of AXIS_PARAMS[axis]) p.delete(key);
  p.delete("page");
  return href(p);
}

/** Clear every filter but stay on the deal the visitor chose. */
function clearedHref(searchParams: SearchParams): string {
  const p = toParams(searchParams);
  for (const key of ALL_NARROWING) p.delete(key);
  return href(p);
}

/**
 * "Looks like they typed thousands" — sale only, and only when EVERY price
 * bound present is 1–999.
 *
 * ⚠️ A HINT, NEVER A REWRITE. 117 sessions/day type `30–40` on sale meaning
 * $30k–$40k and get zero every time. But the evidence is a signature, not proof
 * of intent — 78 of those sessions went on to open a listing — so we explain
 * and let them retype. Silently multiplying by 1000 would be wrong invisibly,
 * which is worse than the bug. The input-side fix is a separate change.
 * If either bound is ≥1000 the visitor is already speaking dollars: skip.
 */
function looksLikeThousands(filters: FeedFilters): boolean {
  if (filters.dealType !== "sale") return false;
  const bounds = [filters.minPrice, filters.maxPrice].filter(
    (v): v is number => v !== undefined && v !== null
  );
  if (bounds.length === 0) return false;
  return bounds.every((v) => v >= 1 && v <= 999);
}

export function EmptyState({
  filters,
  searchParams,
  reason,
  pageCount,
  backHref,
  children,
}: {
  filters: FeedFilters;
  /** Raw query, so recovery links can drop one axis and keep the rest. */
  searchParams?: SearchParams;
  reason: EmptyReason;
  /** `page_out_of_range` only — total pages that DO exist. */
  pageCount?: number;
  /** `page_out_of_range` only — same filters, page 1. */
  backHref?: string;
  /** The FeedBeacon for this render. Kept in the page, not built here. */
  children?: ReactNode;
}) {
  const shell =
    "rounded-2xl bg-card p-10 text-center ring-1 ring-sand";

  if (reason === "page_out_of_range") {
    return (
      <div className={shell}>
        {children}
        <h2 className="text-lg font-semibold text-ink">ასეთი გვერდი არ არსებობს</h2>
        <p className="mt-2 text-sm text-mink">
          სულ {(pageCount ?? 1).toLocaleString("ka-GE")} გვერდია.
        </p>
        <Link
          href={backHref ?? "/"}
          className="mt-4 inline-block text-sm font-semibold text-moss-deep underline underline-offset-2"
        >
          პირველ გვერდზე დაბრუნება
        </Link>
      </div>
    );
  }

  const emptyHot = filters.view === "hot";
  const hotSale = emptyHot && filters.dealType === "sale";
  const filtered = hasActiveFilters(filters);

  // ── The recovery path: a filtered search that found nothing. ──────────────
  // Everything else (hot, hot+sale, genuinely empty inventory) keeps the copy
  // it had — those are not the visitor's fault and there is nothing to undo.
  if (!emptyHot && filtered && searchParams) {
    const districts = filters.districts ?? [];
    const hasDistrict = districts.length > 0;
    const hasPrice =
      filters.minPrice !== undefined || filters.maxPrice !== undefined;
    const hasRooms = Boolean(filters.rooms);
    const hasArea =
      filters.minArea !== undefined || filters.maxArea !== undefined;
    const hasFrame = Boolean(filters.conditionCode);

    // First match wins, in measured recovery order.
    const why = looksLikeThousands(filters)
      ? "ფასი ჩაწერე ათასებში — მაგ. 80 ნიშნავს $80,000"
      : hasDistrict
        ? "ამ უბანში (ან კომბინაციაში) ახლა ცოტაა — სცადე უბნის მოხსნა"
        : hasPrice
          ? "ფასის დიაპაზონი ძალიან ვიწროა — გააფართოვე ან მოხსენი"
          : hasRooms
            ? "ამ ოთახების რაოდენობით აქ ცოტაა"
            : hasArea
              ? "ფართის დიაპაზონი ძალიან ვიწროა"
              : hasFrame
                ? "სცადე კარკასის ფილტრის მოხსნა"
                : "სცადე უბნის ან ფასის გაფართოება";

    // At most two, same order. More than two turns a recovery into a menu.
    const escapes: { axis: Axis; label: string }[] = [];
    if (hasDistrict) escapes.push({ axis: "district", label: "უბნის მოხსნა" });
    if (hasPrice) escapes.push({ axis: "price", label: "ფასის მოხსნა" });
    if (hasRooms) escapes.push({ axis: "rooms", label: "ოთახების მოხსნა" });
    if (hasArea) escapes.push({ axis: "area", label: "ფართის მოხსნა" });
    if (hasFrame) escapes.push({ axis: "frame", label: "კარკასის მოხსნა" });

    // ⚠️ Drop any escape that lands on the same URL as the primary clear. With
    // exactly one axis active, "ფასის მოხსნა" and "ფილტრების გასუფთავება" are
    // the same navigation — offering both is two buttons for one action, which
    // reads as a choice and isn't one.
    const cleared = clearedHref(searchParams);
    const secondary = escapes
      .filter((e) => withoutAxis(searchParams, e.axis) !== cleared)
      .slice(0, 2);

    return (
      <div className={shell}>
        {children}
        <h2 className="text-lg font-semibold text-ink">
          ამ ფილტრებით განცხადება არ არის
        </h2>
        <p className="mt-2 text-sm text-mink">{why}</p>
        <Link
          href={clearedHref(searchParams)}
          className="mt-4 inline-block rounded bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink/90"
        >
          ფილტრების გასუფთავება
        </Link>
        {secondary.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {secondary.map((s) => (
              <Link
                key={s.axis}
                href={withoutAxis(searchParams, s.axis)}
                className="text-sm font-medium text-moss-deep underline underline-offset-2"
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  const title = hotSale
    ? "ეს არხი ჯერ მხოლოდ ქირისთვისაა"
    : emptyHot
      ? "ახლა საკმარისი აქტივობა არ არის"
      : filtered
        ? "ფილტრს არაფერი ემთხვევა"
        : "ჯერ არ არის განცხადებები";
  const detail = hotSale
    ? "გაყიდვის განცხადებებისთვის სანდო ცხელი რეიტინგი ჯერ არ გვაქვს."
    : emptyHot
      ? "აქ მხოლოდ ის ქირის განცხადებები ჩნდება, რომლებიც ცხელი რეიტინგის ზღვარს გადიან."
      : filtered
        ? "სცადე ფასის ან ფართის დიაპაზონის გაფართოება, ან ფილტრების გასუფთავება."
        : "ახალი განცხადებები აქ გამოჩნდება, როგორც კი გაიფილტრება. შემოგვიარე მალე.";

  return (
    <div className={shell}>
      {children}
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

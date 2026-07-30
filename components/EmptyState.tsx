import Link from "next/link";
import type { ReactNode } from "react";

import { hasActiveFilters } from "@/lib/filters";
import type { FeedFilters } from "@/lib/types";

/**
 * The screen a visitor sees when a feed comes back with nothing.
 *
 * Extracted verbatim out of `app/page.tsx` (Phase 0, 2026-07-30) so the
 * zero-result work has a file of its own — the copy used to be inlined in the
 * page, which meant every agent touching an empty-state string collided with
 * every agent touching the feed. Behaviour here is byte-identical to what it
 * replaced; the redesign lands separately.
 *
 * ⚠️ THIS IS PRESENTATIONAL ONLY. `FeedBeacon` stays in `app/page.tsx` and is
 * passed in as `children`, because a zero IS an inventory event and the
 * analytics contract (`empty_result`, `hasFilters`, `meta`) must keep living
 * next to the rest of the beacon wiring. Do not move the beacon in here to
 * "tidy up" — `empty_result` firing from a presentational component is how a
 * heading and its telemetry drift apart.
 *
 * ⚠️ Why 100 sessions/day make this worth redesigning: measured 24h on
 * 2026-07-30, 405 sessions hit at least one zero and 100 had it as their last
 * recorded event. But 298 of 405 recovered on their own — so this screen is a
 * recovery surface, not a catastrophe. See § GPT diagnosis in AITALKS.
 */
export type EmptyReason = "no_match" | "hot" | "page_out_of_range";

export function EmptyState({
  filters,
  reason,
  pageCount,
  backHref,
  children,
}: {
  filters: FeedFilters;
  reason: EmptyReason;
  /** `page_out_of_range` only — total pages that DO exist. */
  pageCount?: number;
  /** `page_out_of_range` only — same filters, page 1. */
  backHref?: string;
  /** The FeedBeacon for this render. Kept in the page, not built here. */
  children?: ReactNode;
}) {
  if (reason === "page_out_of_range") {
    return (
      <div className="rounded-2xl bg-card p-10 text-center ring-1 ring-sand">
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

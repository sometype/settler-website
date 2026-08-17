import Link from "next/link";
import {
  CURSOR_AFTER_PARAM,
  CURSOR_BEFORE_PARAM,
  parseDistrictCodes,
  serializeDistricts,
  type SearchParams,
} from "@/lib/filters";
import { encodeCursor, type Cursor } from "@/lib/pagination";

/**
 * A page link carries the KEYSET BOUNDARY, not just a page number.
 *
 * `page` stays in the URL because it is what the visitor is told they are on
 * ("გვერდი 2 / 33") and what analytics records — but it no longer decides which
 * rows load. The cursor does. Both cursor parameters are cleared first so a
 * forward link can never inherit the previous page's backward boundary.
 */
function pageHref(
  params: SearchParams,
  page: number,
  cursor: Cursor | null,
  direction: "after" | "before"
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === CURSOR_AFTER_PARAM || key === CURSOR_BEFORE_PARAM) continue;
    // Next exposes repeated query keys as string[]. Canonicalize district to
    // the one-key CSV contract so page 2 cannot silently lose selections.
    const v = key === "district"
      ? serializeDistricts(parseDistrictCodes(value))
      : Array.isArray(value) ? value[0] : value;
    if (v) next.set(key, v);
  }
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  // Page 1 is the top of the order by definition and needs no boundary.
  if (cursor && page > 1) {
    // A boundary that cannot be encoded safely (a row whose sort key this
    // ordering cannot express) yields no parameter at all, and the link falls
    // back to the offset path rather than carrying something unvalidatable.
    const token = encodeCursor(cursor);
    if (token) {
      next.set(
        direction === "after" ? CURSOR_AFTER_PARAM : CURSOR_BEFORE_PARAM,
        token
      );
    }
  }
  const qs = next.toString();
  return qs ? `/?${qs}` : "/";
}

export function Pagination({
  page,
  pageCount,
  searchParams,
  nextCursor = null,
  prevCursor = null,
}: {
  page: number;
  pageCount: number;
  searchParams: SearchParams;
  /** Boundary rows of the page being rendered (lib/pagination.ts). */
  nextCursor?: Cursor | null;
  prevCursor?: Cursor | null;
}) {
  if (pageCount <= 1) return null;

  const linkClass =
    "rounded bg-card px-4 py-2 text-sm font-medium text-mink ring-1 ring-sand-strong transition hover:ring-sand-strong";
  const disabledClass =
    "rounded px-4 py-2 text-sm font-medium text-sand-strong ring-1 ring-sand";

  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="გვერდები">
      {page > 1 ? (
        <Link
          href={pageHref(searchParams, page - 1, prevCursor, "before")}
          className={linkClass}
        >
          ← წინა
        </Link>
      ) : (
        <span className={disabledClass}>← წინა</span>
      )}
      <span className="text-sm text-mink">
        გვერდი <span className="num">{page}</span> / <span className="num">{pageCount}</span>
      </span>
      {page < pageCount ? (
        <Link
          href={pageHref(searchParams, page + 1, nextCursor, "after")}
          className={linkClass}
        >
          შემდეგი →
        </Link>
      ) : (
        <span className={disabledClass}>შემდეგი →</span>
      )}
    </nav>
  );
}

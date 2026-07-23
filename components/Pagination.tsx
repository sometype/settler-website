import Link from "next/link";
import type { SearchParams } from "@/lib/filters";

function pageHref(params: SearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) next.set(key, v);
  }
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  const qs = next.toString();
  return qs ? `/?${qs}` : "/";
}

export function Pagination({
  page,
  pageCount,
  searchParams,
}: {
  page: number;
  pageCount: number;
  searchParams: SearchParams;
}) {
  if (pageCount <= 1) return null;

  const linkClass =
    "rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 transition hover:ring-stone-400";
  const disabledClass =
    "rounded-lg px-4 py-2 text-sm font-medium text-stone-300 ring-1 ring-stone-200";

  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      {page > 1 ? (
        <Link href={pageHref(searchParams, page - 1)} className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span className={disabledClass}>← Previous</span>
      )}
      <span className="text-sm text-stone-500">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={pageHref(searchParams, page + 1)} className={linkClass}>
          Next →
        </Link>
      ) : (
        <span className={disabledClass}>Next →</span>
      )}
    </nav>
  );
}

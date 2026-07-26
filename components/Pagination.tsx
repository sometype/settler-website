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
    "rounded-lg bg-card px-4 py-2 text-sm font-medium text-mink ring-1 ring-sand-strong transition hover:ring-sand-strong";
  const disabledClass =
    "rounded-lg px-4 py-2 text-sm font-medium text-sand-strong ring-1 ring-sand";

  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="გვერდები">
      {page > 1 ? (
        <Link href={pageHref(searchParams, page - 1)} className={linkClass}>
          ← წინა
        </Link>
      ) : (
        <span className={disabledClass}>← წინა</span>
      )}
      <span className="text-sm text-mink">
        გვერდი {page} / {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={pageHref(searchParams, page + 1)} className={linkClass}>
          შემდეგი →
        </Link>
      ) : (
        <span className={disabledClass}>შემდეგი →</span>
      )}
    </nav>
  );
}

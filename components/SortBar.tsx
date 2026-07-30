"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { FeedSort } from "@/lib/types";

const OPTIONS: { value: FeedSort; label: string }[] = [
  { value: "new", label: "ახალი" },
  { value: "price_asc", label: "იაფი → ძვირი" },
  { value: "price_desc", label: "ძვირი → იაფი" },
];

/**
 * Feed-header sort chips. URL-driven, not local state.
 *
 * ⚠️ Sort is a MODE, not a filter — never write it into hasActiveFilters.
 * Changing sort resets `page` to 1. `new` deletes the param so default URLs stay clean.
 */
export function SortBar({ active }: { active: FeedSort }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function go(next: FeedSort) {
    const sp = new URLSearchParams(params.toString());
    if (next === "new") sp.delete("sort");
    else sp.set("sort", next);
    sp.delete("page");
    startTransition(() => {
      router.push(sp.size ? `/?${sp.toString()}` : "/");
    });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="დალაგება"
    >
      <span className="mr-0.5 text-xs font-medium text-mink">დალაგება:</span>
      {OPTIONS.map((o) => {
        const isOn = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={isOn}
            onClick={() => go(o.value)}
            className={`min-h-11 rounded px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition sm:min-h-0 ${
              isOn
                ? "bg-ink text-white ring-ink"
                : "bg-card text-mink ring-sand-strong hover:ring-sand-strong"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

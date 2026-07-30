"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { FeedSort } from "@/lib/types";
import { trackEvent } from "@/lib/events";

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
    // ⚠️ Sort is NOT a filter, so it never fires `filter_apply` — which means
    // that on the default rent feed, choosing a sort currently records
    // NOTHING. Sort adoption has only ever been visible where sale happened
    // to be active, i.e. biased, and "should we drop «ძვირი → იაფი»?" cannot
    // be answered from it. This event is that blind spot closed; it must stay
    // out of hasActiveFilters (AITALKS frozen contract, tripwire 6).
    if (next !== active) {
      trackEvent("sort_apply", {
        meta: {
          from: active,
          to: next,
          deal: params.get("deal") ?? "rent",
          has_filters: Boolean(
            params.get("district") || params.get("min") || params.get("max") ||
            params.get("mina") || params.get("maxa") || params.get("rooms") ||
            params.get("frame") || (params.get("deal") && params.get("deal") !== "rent")
          ),
          view: params.get("view"),
        },
      });
    }
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

"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/events";

/**
 * Records filter_apply / empty_result for the current URL once per param set.
 * Server Feed can't beacon; this client island sits next to the results.
 *
 * ⚠️ `filter_apply` FIRES ONLY WHEN A FILTER IS ACTUALLY APPLIED.
 *
 * It used to fire on every feed render, including the bare homepage with no
 * filters at all — so the metric counted PAGE VIEWS, not filter usage, and the
 * funnel built on it ("filter_apply → listing_open → call_tap") was not a
 * funnel. It read as a catastrophic drop-off when the first number was simply
 * measuring something else. Found 2026-07-27.
 *
 * `empty_result` still fires whenever the feed is empty, filtered or not: an
 * empty homepage is a genuine inventory event worth knowing about, which is a
 * different question from "did anyone use the filters".
 *
 * ⚠️ Events before 2026-07-27 are NOT comparable to events after it. Any
 * analysis spanning that boundary has to treat the change as a break.
 */
export function FeedBeacon({
  empty,
  meta,
  hasFilters,
}: {
  empty: boolean;
  meta: Record<string, unknown>;
  /** Whether the visitor actually narrowed anything. No filters → no event. */
  hasFilters: boolean;
}) {
  const key = JSON.stringify(meta) + (empty ? ":empty" : ":ok");
  const last = useRef<string>("");

  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (empty) {
      trackEvent("empty_result", { meta });
    } else if (hasFilters) {
      trackEvent("filter_apply", { meta });
    }
  }, [key, empty, hasFilters, meta]);

  return null;
}

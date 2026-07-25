"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/events";

/**
 * Records filter_apply / empty_result for the current URL once per param set.
 * Server Feed can't beacon; this client island sits next to the results.
 */
export function FeedBeacon({
  empty,
  meta,
}: {
  empty: boolean;
  meta: Record<string, unknown>;
}) {
  const key = JSON.stringify(meta) + (empty ? ":empty" : ":ok");
  const last = useRef<string>("");

  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (empty) {
      trackEvent("empty_result", { meta });
    } else {
      trackEvent("filter_apply", { meta });
    }
  }, [key, empty, meta]);

  return null;
}

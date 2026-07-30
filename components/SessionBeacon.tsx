"use client";

import { useEffect } from "react";
import { markSessionStart } from "@/lib/events";

/**
 * Records one `session_start` per tab, from the root layout.
 *
 * ⚠️ IT LIVES IN THE LAYOUT ON PURPOSE. A visitor can arrive on a listing
 * detail page from a shared WhatsApp link and never touch the feed — mounting
 * this next to the results would miss exactly the arrivals we cannot currently
 * see. The layout is the only place every entry passes through.
 *
 * ⚠️ The once-per-tab guard is inside `markSessionStart`, not here. This
 * component remounts on nothing, but StrictMode double-invokes effects in
 * development and a future layout change could remount it — the guard has to
 * be where the write is.
 *
 * Renders nothing. Fires nothing in development (`lib/events.ts` returns
 * early) and preview traffic is stamped `meta.env="preview"` server-side.
 */
export function SessionBeacon() {
  useEffect(() => {
    markSessionStart();
  }, []);
  return null;
}

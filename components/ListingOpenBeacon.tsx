"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/events";

const OPEN_RELOAD_PREFIX = "mp_listing_open_reload:";
let reloadSuppressionAvailable = true;

function isDocumentReload(): boolean {
  try {
    const navigation = performance.getEntriesByType("navigation")[0];
    return navigation instanceof PerformanceNavigationTiming && navigation.type === "reload";
  } catch {
    return false;
  }
}

/**
 * A reload remounts this component and used to emit the same open again. Keep a
 * tab-scoped marker only for that case; a later real navigation to the same
 * listing is still a new open and remains measurable. Storage failure preserves
 * the event instead of silently losing it.
 */
function claimListingOpen(listingId: number): boolean {
  const key = `${OPEN_RELOAD_PREFIX}${listingId}`;
  try {
    // NavigationTiming describes the whole document, so after a reload it keeps
    // saying "reload" even after later client-side route changes. Consume this
    // exemption once: the initial remount is suppressed, but a genuine later
    // reopen in the same document is still counted.
    if (isDocumentReload() && reloadSuppressionAvailable) {
      reloadSuppressionAvailable = false;
      if (sessionStorage.getItem(key) === "1") return false;
    }
    sessionStorage.setItem(key, "1");
  } catch {
    // A blocked store cannot safely prove duplication, so keep the event.
  }
  return true;
}

/** Fires once per listing id mount — not on every parent re-render with a new meta object. */
export function ListingOpenBeacon({
  listingId,
  meta,
}: {
  listingId: number;
  meta?: Record<string, unknown>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!claimListingOpen(listingId)) return;
    trackEvent("listing_open", { listingId, meta });
  }, [listingId, meta]);

  return null;
}

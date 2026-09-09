"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/events";

const OPEN_HISTORY_KEY = "__mp_listing_open_id";

/**
 * Count one open per detail history entry. Reload and browser Forward revisit
 * the same entry, whose state survives; clicking the listing again creates a
 * new entry and therefore remains measurable. A history API failure preserves
 * the event instead of silently losing it.
 */
function claimListingOpen(listingId: number): boolean {
  try {
    const state = window.history.state;
    if (state?.[OPEN_HISTORY_KEY] === listingId) return false;
    const nextState = state && typeof state === "object" ? { ...state } : {};
    nextState[OPEN_HISTORY_KEY] = listingId;
    window.history.replaceState(nextState, "", window.location.href);
  } catch {
    // A blocked history API cannot safely prove duplication, so keep the event.
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

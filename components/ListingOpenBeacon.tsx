"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/events";

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
    trackEvent("listing_open", { listingId, meta });
  }, [listingId, meta]);

  return null;
}

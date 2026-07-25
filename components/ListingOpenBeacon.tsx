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
  const metaRef = useRef(meta);
  metaRef.current = meta;

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("listing_open", { listingId, meta: metaRef.current });
  }, [listingId]);

  return null;
}

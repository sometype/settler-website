"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/events";

/** Fires once per mount when a listing detail is viewed. */
export function ListingOpenBeacon({
  listingId,
  meta,
}: {
  listingId: number;
  meta?: Record<string, unknown>;
}) {
  useEffect(() => {
    trackEvent("listing_open", { listingId, meta });
  }, [listingId, meta]);
  return null;
}

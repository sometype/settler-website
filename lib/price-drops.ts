/**
 * One visitor-facing definition of an honest recent sale price drop.
 *
 * Keep this module pure so the rail and feed card can share the predicate and
 * its trust boundaries can run under the lightweight unit-test suite without
 * importing Supabase or the rest of the listing data layer.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 7;
const SALE_PRICE_MIN = 5_000;
const SALE_PRICE_MAX = 5_000_000;
const DROP_USD_MIN = 1_000;
const DROP_USD_MAX = 50_000;
const DROP_PCT_MIN = 1;
const DROP_PCT_MAX = 25;

type PriceDropCandidate = {
  deal_type?: string | null;
  price_usd?: number | null;
  price_drop_from_usd?: number | null;
  price_dropped_at?: string | null;
};

export function isHonestRecentSaleDrop(
  listing: PriceDropCandidate,
  nowMs = Date.now()
): boolean {
  if (listing.deal_type !== "sale") return false;

  const droppedMs = Date.parse(listing.price_dropped_at ?? "");
  if (!Number.isFinite(droppedMs)) return false;
  // A malformed/future timestamp must never turn into a visitor-facing trust
  // claim. Database timestamps normally make this impossible; the pure guard
  // keeps every caller honest even with crafted or partially migrated data.
  if (droppedMs > nowMs || droppedMs < nowMs - RECENT_DAYS * DAY_MS) return false;

  const previous = listing.price_drop_from_usd;
  const current = listing.price_usd;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
  if (previous == null || current == null || previous <= current) return false;
  if (
    previous < SALE_PRICE_MIN ||
    previous > SALE_PRICE_MAX ||
    current < SALE_PRICE_MIN ||
    current > SALE_PRICE_MAX
  ) {
    return false;
  }

  const dropUsd = previous - current;
  if (dropUsd < DROP_USD_MIN || dropUsd > DROP_USD_MAX) return false;
  const dropPct = (100 * dropUsd) / previous;
  return dropPct >= DROP_PCT_MIN && dropPct <= DROP_PCT_MAX;
}

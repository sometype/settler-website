/**
 * Freshness is the product's whole edge, so it has to be legible to the minute.
 * A binary "new in the last 24h" badge flattens a listing posted 7 minutes ago
 * into the same thing as one posted yesterday — those are very different flats
 * to a caller who is racing other callers.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Georgian relative time. `now` is injectable so the server and the client tick
 * can agree, and so tests don't depend on wall time.
 */
export function relativeTimeKa(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  // Clock skew between the DB and the renderer can produce a small negative
  // age. Treat anything in the future as "just now" rather than "-2 minutes".
  const age = Math.max(0, now - then);

  if (age < MINUTE) return "ახლახან";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} წუთის წინ`;
  if (age < DAY) return `${Math.floor(age / HOUR)} საათის წინ`;
  if (age < WEEK) return `${Math.floor(age / DAY)} დღის წინ`;
  return `${Math.floor(age / WEEK)} კვირის წინ`;
}

/** Under an hour old — worth calling right now. */
export function isVeryFresh(iso: string, now: number = Date.now()): boolean {
  const then = new Date(iso).getTime();
  return !Number.isNaN(then) && now - then < HOUR;
}

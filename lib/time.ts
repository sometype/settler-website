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

/**
 * Compact age for the card stamp: "3 წთ", "2 სთ", "3 დღე".
 *
 * Separate from `relativeTimeKa` on purpose. That one is a sentence ("7 წუთის
 * წინ") and reads correctly in prose; this one is a READING on an instrument,
 * so it drops the "წინ" and keeps the figure first, where the mono/tabular
 * digits line up down the feed.
 */
export function compactAgeKa(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const age = Math.max(0, now - then);
  if (age < MINUTE) return "ახლახან";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} წთ`;
  if (age < DAY) return `${Math.floor(age / HOUR)} სთ`;
  return `${Math.floor(age / DAY)} დღე`;
}

/**
 * Which stop of the age ramp a listing sits on — the product rule as one
 * number. Freshness is the moat, so age is the loudest signal on a card.
 *
 * The ramp shifts HUE (warm amber -> cool grey), never brightness: all five
 * stops measure between 4.79:1 and 6.49:1, so an old listing is cooler but
 * never harder to read. Values live in globals.css as --age1..--age5.
 */
export type AgeBand = 1 | 2 | 3 | 4 | 5;

export function ageBand(iso: string, now: number = Date.now()): AgeBand {
  const then = new Date(iso).getTime();
  // Unparseable date sorts to the coolest stop rather than the hottest: an
  // unknown age must never masquerade as "posted seconds ago".
  if (Number.isNaN(then)) return 5;
  const age = Math.max(0, now - then);
  if (age < 15 * MINUTE) return 1;
  if (age < HOUR) return 2;
  if (age < 6 * HOUR) return 3;
  if (age < DAY) return 4;
  return 5;
}

/** Tailwind text colour for a band. Explicit map — Tailwind cannot see
 *  interpolated class names, so `text-age${n}` would be purged. */
export const AGE_BAND_CLASS: Record<AgeBand, string> = {
  1: "text-age1",
  2: "text-age2",
  3: "text-age3",
  4: "text-age4",
  5: "text-age5",
};

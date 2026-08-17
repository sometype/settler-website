import type { FeedSort } from "./types";

/**
 * THE CATALOGUE PAGINATION CONTRACT — one place, one rule.
 *
 * ⚠️ WHY THIS FILE EXISTS. Measured 2026-08-17: live listings 11757 and 11759
 * rendered on BOTH page 1 and page 2. The cause was not a bad ORDER BY. It was
 * that page 1 and page 2 paginated *different sets*:
 *
 *   1. `fetchRailPlan()` picked its price-drop cards with `Math.random()`, and
 *      the homepage is `force-dynamic`, so every request produced a different
 *      rail set;
 *   2. the district rails then excluded that changing set, so THEY changed too;
 *   3. `shownIds` (rails ∪ price drops ∪ districts) was handed to `fetchFeed()`
 *      as `excludeIds` BEFORE `(page-1)*24` was applied.
 *
 * Offsets into two different ordered sets do not tile. A listing that was
 * excluded while page 1 was built and NOT excluded while page 2 was built shifts
 * every row after it by one, which shows some listings twice and hides others
 * entirely. Two independent defects had to be closed, and either one alone would
 * have left the other producing the same symptom:
 *
 *   A. the excluded set must be identical for every page of one browsing
 *      session — hence the seeded rail plan (`seededShuffle` + `rs` token);
 *   B. the page window must not be an OFFSET into a set that can change between
 *      two requests at all — hence keyset (cursor) pagination below. A listing
 *      arriving or being removed between page 1 and page 2 shifts an offset
 *      window exactly the same way a changing exclusion set does.
 *
 * ⚠️ AN IN-PAGE `Set` OF ALREADY-SEEN IDS IS NOT A FIX. It hides the repeat on
 * the page where you happen to look and silently converts it into a SKIP — the
 * listing that got pushed out of the window is then never rendered on any page.
 * De-duplicating output cannot repair an unstable input ordering.
 *
 * ⚠️ IDENTITY IS THE `id` COLUMN AND NOTHING ELSE. Nothing here may compare
 * phones, addresses, rooms, area, floor, price or images to decide that two rows
 * are "the same listing". Apartment identity is the backend's law (S3/S4,
 * `dedupe_*`), it is already applied upstream through `canonical_id`, and a
 * second opinion in the website layer would be a competing implementation of a
 * rule that must have exactly one (Article V).
 */

/** Rows per catalogue page. */
export const PAGE_SIZE = 24;

/* ----------------------------------------------------------------- ordering */

/**
 * The ordered key for each sort mode.
 *
 * `column` is the primary key column; `id` is ALWAYS the tie-break, ascending,
 * because a keyset comparison needs a total order — two rows sharing a
 * timestamp or a price must have exactly one correct successor, or the cursor
 * can land between them and repeat or skip one.
 *
 * ⚠️ `price_sort` (sql/015), never raw `price_usd`: out-of-bound prices display
 * as «ფასი მოთხოვნით» but used to still rank. NULLS LAST is mandatory —
 * Postgres puts nulls FIRST on DESC (measured 2026-07-30).
 */
export interface OrderSpec {
  column: "first_seen_at" | "price_sort";
  ascending: boolean;
  /** Whether the key column can be null (drives the NULLS LAST keyset terms). */
  nullable: boolean;
}

export const ORDER_SPECS: Record<FeedSort, OrderSpec> = {
  new: { column: "first_seen_at", ascending: false, nullable: false },
  price_asc: { column: "price_sort", ascending: true, nullable: true },
  price_desc: { column: "price_sort", ascending: false, nullable: true },
};

export function orderSpecFor(sort: FeedSort): OrderSpec {
  return ORDER_SPECS[sort] ?? ORDER_SPECS.new;
}

/* ------------------------------------------------------------------ cursors */

/**
 * Where one page stopped: the sort key of a boundary row plus its id.
 *
 * `key` is null ONLY for a row in the NULLS-LAST tail of a price sort. That is
 * a real position in the order, not "unknown", and it needs its own predicate.
 */
export interface Cursor {
  key: string | number | null;
  id: number;
}

/** Which side of a boundary row the requested page lies on. */
export type CursorDirection = "after" | "before";

const CURSOR_VERSION = 1;

/**
 * Cursors travel in the URL, so they are encoded rather than raw — not for
 * secrecy (they carry a public timestamp or price and a public id) but so a
 * hand-edited value fails the decode and falls back to the top of the feed
 * instead of half-parsing into a window nobody can reproduce.
 */
export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify([CURSOR_VERSION, cursor.key, cursor.id]);
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Total: anything malformed yields null and the caller starts from the top. */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [version, key, id] = parsed as [unknown, unknown, unknown];
  if (version !== CURSOR_VERSION) return null;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  if (key !== null && typeof key !== "string" && typeof key !== "number") return null;
  if (typeof key === "number" && !Number.isFinite(key)) return null;
  return { key: key as Cursor["key"], id };
}

/** The cursor for a boundary row of a rendered page. */
export function cursorForRow(
  row: { id: number; first_seen_at?: string | null; price_sort?: number | null },
  sort: FeedSort
): Cursor {
  const spec = orderSpecFor(sort);
  const raw =
    spec.column === "price_sort"
      ? (row.price_sort ?? null)
      : (row.first_seen_at ?? null);
  return { key: raw, id: row.id };
}

/* --------------------------------------------------- keyset predicate build */

/**
 * PostgREST value literal. Strings are double-quoted because a timestamp
 * carries `:` and `+`, which are structural characters in a filter expression —
 * unquoted, `2026-08-16T10:00:00+00:00` would be parsed as garbage rather than
 * rejected, which is the silent-wrongness class this codebase treats as a
 * defect rather than a formatting nit.
 */
function literal(value: string | number): string {
  return typeof value === "number" ? String(value) : `"${value}"`;
}

/**
 * The `or=` expression selecting every row strictly after (or before) the
 * cursor row IN THE SORT'S OWN ORDER.
 *
 * Returned as a string rather than applied here so it can be unit-tested
 * without a database and asserted against the fake PostgREST in the behavioural
 * suite — the instrument and the implementation must be able to disagree.
 *
 * Null handling assumes NULLS LAST, matching `applyFeedOrder`: on a forward
 * page from a non-null key, the null tail is still ahead of us and must be
 * included; on a forward page from inside the null tail, only the tail's own
 * higher ids remain.
 */
export function keysetExpression(
  sort: FeedSort,
  cursor: Cursor,
  direction: CursorDirection
): string {
  const spec = orderSpecFor(sort);
  const col = spec.column;
  const forward = direction === "after";
  // Which way the key column moves as we advance through the page sequence.
  const advancingUp = spec.ascending === forward;
  const keyOp = advancingUp ? "gt" : "lt";
  const idOp = forward ? "gt" : "lt";

  if (spec.nullable && cursor.key === null) {
    // The cursor row sits in the NULLS-LAST tail.
    return forward
      ? `and(${col}.is.null,id.${idOp}.${cursor.id})`
      : `${col}.not.is.null,and(${col}.is.null,id.${idOp}.${cursor.id})`;
  }

  const key = literal(cursor.key as string | number);
  const terms = [`${col}.${keyOp}.${key}`, `and(${col}.eq.${key},id.${idOp}.${cursor.id})`];
  // Forward from a non-null key: the whole null tail is still to come.
  if (spec.nullable && forward) terms.push(`${col}.is.null`);
  return terms.join(",");
}

/* --------------------------------------------------------- seeded rail plan */

/**
 * Deterministic 32-bit PRNG (mulberry32).
 *
 * The price-drop rail rotates on purpose — freezing it made the strip feel
 * stale (user report) — so the fix is NOT to stop shuffling. It is to make the
 * shuffle a function of a seed that every page of one browsing session shares,
 * so page 2 excludes exactly the rail page 1 rendered.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates against a seeded stream: same seed, same permutation, always. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** URL parameter carrying the rail seed across pages. */
export const RAIL_SEED_PARAM = "rs";

const MAX_SEED = 0xffffffff;

/** A fresh rail arrangement — minted once per entry, then carried in the URL. */
export function mintRailSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1)) >>> 0;
}

/** Total: a crafted or truncated `rs` yields null and the caller mints a fresh
 *  one, which is self-consistent for that request rather than half-applied. */
export function parseRailSeed(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string" || !/^[0-9]{1,10}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_SEED ? n : null;
}

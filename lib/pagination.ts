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
 * Where one page stopped: the sort key of a boundary row, its id, AND the sort
 * mode that key belongs to.
 *
 * ⚠️ THE `sort` FIELD IS A SAFETY PROPERTY, NOT BOOKKEEPING. A key only means
 * something inside the ordering it came from: a timestamp is a position in the
 * newest-first feed and pure nonsense against `price_sort`, which is a number.
 * Carrying the mode inside the cursor makes "this cursor belongs to a different
 * ordering" a decode failure instead of a comparison between a text literal and
 * a numeric column.
 *
 * `key` is null ONLY for a row in the NULLS-LAST tail of a price sort. That is
 * a real position in the order, not "unknown", and it needs its own predicate.
 */
export interface Cursor {
  sort: FeedSort;
  key: string | number | null;
  id: number;
}

/** Which side of a boundary row the requested page lies on. */
export type CursorDirection = "after" | "before";

/** Bumped whenever the payload shape or the key rules change, so an old link
 *  fails closed rather than being reinterpreted under new rules. */
const CURSOR_VERSION = 2;

/**
 * The ONLY timestamp shape a cursor may carry.
 *
 * ⚠️ CHARACTER CLASS IS THE SECURITY PROPERTY. Cursor keys are interpolated
 * into a PostgREST `or=` expression, whose grammar is delimited by `"`, `,`,
 * `(` and `)`. Before this was enforced, `decodeCursor` accepted any string, so
 * the key `x"),id.gt.0` produced
 *
 *   first_seen_at.lt."x"),id.gt.0",and(first_seen_at.eq."x"),id.gt.0",id.gt.1)
 *
 * — the `")` closes the quoted literal and `id.gt.0` becomes an extra OR term,
 * widening the result set from a value the URL controls. This pattern admits
 * digits, `-`, `T`, `:`, `.`, `+` and `Z` and nothing else, so no delimiter or
 * operator can survive validation.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT RE-CANONICALIZED THROUGH `Date`. Postgres
 * timestamptz keeps MICROseconds; a JS Date keeps milliseconds. Round-tripping
 * 10:00:00.123456 through `toISOString()` yields 10:00:00.123, and the keyset
 * comparison `first_seen_at < 10:00:00.123` then excludes rows between .123 and
 * .123456 — silently skipping listings, which is the exact failure class this
 * whole module exists to prevent. Validate the shape; never rewrite the value.
 */
const TIMESTAMP_KEY_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Numeric keys reach the expression unquoted, so the rendered form is checked
 *  too: exponent notation (`1e+21`) would put a `+` into the filter grammar. */
const NUMERIC_KEY_RE = /^-?\d+(\.\d+)?$/;

/**
 * Is this key a legal position in this ordering?
 *
 * Used at BOTH ends — the decode boundary and the point of interpolation — so
 * a value can never reach the query by some path that skipped validation.
 */
export function isSafeCursorKey(sort: FeedSort, key: unknown): boolean {
  const spec = orderSpecFor(sort);
  if (key === null) return spec.nullable;
  if (spec.column === "first_seen_at") {
    return (
      typeof key === "string" &&
      TIMESTAMP_KEY_RE.test(key) &&
      Number.isFinite(Date.parse(key))
    );
  }
  // price_sort: a finite number whose rendered literal is plain decimal.
  return (
    typeof key === "number" &&
    Number.isFinite(key) &&
    NUMERIC_KEY_RE.test(String(key))
  );
}

/**
 * Cursors travel in the URL, so they are encoded rather than raw — not for
 * secrecy (they carry a public timestamp or price and a public id) but so a
 * hand-edited value fails the decode and falls back to the top of the feed
 * instead of half-parsing into a window nobody can reproduce.
 *
 * Returns null for anything that would not survive its own decode, so an
 * unusable boundary degrades to "no cursor" at the point it is minted rather
 * than at the point it is used.
 */
export function encodeCursor(cursor: Cursor): string | null {
  if (!isValidCursor(cursor)) return null;
  const json = JSON.stringify([CURSOR_VERSION, cursor.sort, cursor.key, cursor.id]);
  return Buffer.from(json, "utf8").toString("base64url");
}

function isValidCursor(cursor: Cursor | null | undefined): cursor is Cursor {
  if (!cursor) return false;
  if (!Object.prototype.hasOwnProperty.call(ORDER_SPECS, cursor.sort)) return false;
  if (!Number.isSafeInteger(cursor.id) || cursor.id <= 0) return false;
  return isSafeCursorKey(cursor.sort, cursor.key);
}

/**
 * Total: anything malformed, stale, or belonging to a different ordering yields
 * null and the caller starts from the top.
 *
 * `expectedSort` is the ordering the request will actually run under, so a
 * cursor minted while browsing newest-first is refused the moment the visitor
 * switches to a price sort.
 */
export function decodeCursor(
  raw: string | undefined | null,
  expectedSort: FeedSort
): Cursor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) return null;
  const [version, sort, key, id] = parsed as [unknown, unknown, unknown, unknown];
  if (version !== CURSOR_VERSION) return null;
  if (sort !== expectedSort) return null;
  const candidate = { sort, key, id } as Cursor;
  return isValidCursor(candidate) ? candidate : null;
}

/** The cursor for a boundary row of a rendered page, or null when the row
 *  carries no position this ordering can express. */
export function cursorForRow(
  row: { id: number; first_seen_at?: string | null; price_sort?: number | null },
  sort: FeedSort
): Cursor | null {
  const spec = orderSpecFor(sort);
  const key =
    spec.column === "price_sort"
      ? (row.price_sort ?? null)
      : (row.first_seen_at ?? null);
  const candidate: Cursor = { sort, key, id: row.id };
  return isValidCursor(candidate) ? candidate : null;
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
  cursor: Cursor,
  direction: CursorDirection
): string {
  // ⚠️ VALIDATED AGAIN HERE, ON PURPOSE. `decodeCursor` is the boundary, but it
  // is not the only way a Cursor can be constructed — `cursorForRow` builds one
  // from a database row, and future callers may build one directly. A value
  // that reaches the `or=` grammar unchecked is the whole vulnerability, so the
  // check lives at the point of interpolation as well as at the door. Throwing
  // is correct: an unrepresentable boundary is a defect in the caller, and a
  // page rendered from a silently-dropped predicate would return the wrong rows
  // rather than an error.
  if (!isValidCursor(cursor)) {
    throw new Error("unsafe cursor rejected before reaching the query");
  }
  const spec = orderSpecFor(cursor.sort);
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

import { parseDistrictCodes, serializeDistricts } from "./filters";
import { CURSOR_AFTER_PARAM, CURSOR_BEFORE_PARAM, type SearchParams } from "./filters";

/**
 * THE RETURN-CONTEXT CONTRACT — carrying a search across the catalogue→detail
 * boundary, and nothing else.
 *
 * ⚠️ WHY THIS FILE EXISTS. Measured on production commit 5794001 (2026-09-08):
 * `FilterBar` writes the whole search into the catalogue URL correctly, but
 * `ListingCard` built its detail href from `src` and `sort` only and
 * `EnglishListingCard` from the id alone, while both detail pages rendered a
 * back link hard-coded to `/` and `/en/rent`. So a seeker who narrowed to
 * "Saburtalo + Vake, ≤ $600, 2 rooms, price ascending, page 3", opened a flat
 * and pressed the visible back control landed on the unfiltered homepage at the
 * top. The state was never lost — it was deliberately dropped at one boundary.
 *
 * ⚠️ THIS IS NOT A SECOND FILTER MODEL. The catalogue URL remains the only
 * search law and `parseFilters()` remains its only interpreter. This module is
 * a TRANSPORT GATE: it guarantees that what comes back out is (a) one of the two
 * known catalogue routes and (b) a query string carrying only allowlisted keys
 * with bounded, syntactically inert values. It never decides what a filter
 * MEANS. If you find yourself reading a price or comparing a district here,
 * you are writing the second implementation of a rule that must have exactly
 * one (Article V) — stop.
 *
 * ⚠️ THE ROUTE IS AN ENUM, NOT A STRING. The single most dangerous thing a
 * "return to where I was" parameter can do is let a URL name its own
 * destination — the open-redirect class, and the reason `?returnTo=` is
 * refused outright. Here the payload carries a small integer index into
 * CATALOGUE_PATHS, so no character supplied by the request ever reaches a path.
 * An attacker cannot craft a value that resolves to `//evil.example`,
 * `https://evil.example`, `/upload`, or an encoded traversal, because there is
 * no code path from request text to path text at all. Validating a string
 * against an allowlist would be weaker: it fails open the day someone adds a
 * clever normalization step in front of it.
 */

/** The one query parameter carrying return context. Never read by anything else. */
export const RETURN_PARAM = "rc";

/** Bumped when the payload shape or the key rules change, so an old link fails
 *  closed to the catalogue root rather than being reinterpreted under new rules. */
const RETURN_VERSION = 1;

/** The catalogues a seeker can browse. Index order is the wire format — append
 *  only, never reorder, or old links silently point at the other language. */
export const CATALOGUE_ROUTES = ["ka", "en"] as const;
export type CatalogueRoute = (typeof CATALOGUE_ROUTES)[number];

/** The ONLY paths this module can ever produce. */
export const CATALOGUE_PATHS: Record<CatalogueRoute, string> = {
  ka: "/",
  en: "/en/rent",
};

/**
 * Exactly the application-state keys the catalogue routes interpret.
 *
 * ⚠️ ACQUISITION AND TRACKING KEYS ARE DELIBERATELY ABSENT. `fbclid`, `gclid`,
 * `utm_*` and the retired `amen` describe how a visitor arrived or a control
 * that no longer exists; round-tripping them through a detail page would
 * re-attribute a return as a fresh ad click and resurrect a dead filter.
 * Anything not on this list is dropped silently — that is the correct failure:
 * the visitor gets their search back minus a key nothing reads anyway.
 *
 * ⚠️ WIDENING THIS LIST IS AN AMENDMENT, NOT AN EDIT. The list is the frozen
 * acceptance contract (SEEKEREXPERIENCEDISCUSSION §4.2). Known consequence, left
 * in deliberately: `deal_type`, the legacy alias `parseFilters` still accepts,
 * is NOT here, so a return from a legacy `?deal_type=rent` link restores the
 * default sale tab. Raise it with the contract owner; do not fix it here.
 */
const ALLOWED_KEYS = [
  "deal",
  "district",
  "min",
  "max",
  "mina",
  "maxa",
  "rooms",
  "frame",
  "sort",
  "page",
  CURSOR_AFTER_PARAM,
  CURSOR_BEFORE_PARAM,
  "view",
  "rs",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const ALLOWED_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_KEYS);

/**
 * The character class every carried value must satisfy.
 *
 * ⚠️ CHARACTER CLASS IS THE SECURITY PROPERTY, exactly as in `lib/pagination.ts`.
 * Admitted: letters and digits (district codes, `price_asc`, `new`, `sale`,
 * `hot`, condition codes, page and seed digits), `,` (the district CSV form),
 * `_` and `-` (base64url cursors, multi-word district codes) and `+` (the `5+`
 * rooms value). Absent, and therefore unable to survive validation: `/`, `\`,
 * `:`, `.`, `%`, `?`, `#`, `&`, `=`, whitespace and every control character.
 * No path, scheme, traversal, percent-encoding or query delimiter can be
 * expressed in a value that passes this test — which is the second lock behind
 * the route enum, not a substitute for it.
 */
const VALUE_RE = /^[A-Za-z0-9,_+-]+$/;

/**
 * Bounds. Derived, not guessed: the longest legitimate value is a full district
 * CSV — MAX_DISTRICTS (8) codes of up to ~20 characters plus separators — and
 * the longest single value overall is a base64url cursor carrying a microsecond
 * timestamp (~90 characters). 256 clears both with room and still refuses a
 * payload built to be pasted somewhere expensive. The encoded bound caps the
 * whole parameter so a crafted link cannot make a detail URL unbounded.
 */
const MAX_VALUE_LENGTH = 256;
const MAX_ENCODED_LENGTH = 1024;

/** Wire form: [version, routeIndex, [[key, value], ...]]. */
type ReturnPayload = [number, number, [string, string][]];

function firstValue(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return undefined;
  const trimmed = s.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Collapse a catalogue's search params into the canonical carried entry list,
 * or null when there is nothing safe to carry.
 *
 * Emission order follows ALLOWED_KEYS, so the same search always produces the
 * same `rc` regardless of how the visitor's URL happened to be ordered. A
 * stable encoding is what makes two return links comparable in a test and in a
 * log, and it keeps the detail URL cacheable.
 */
function collectEntries(params: SearchParams): [string, string][] | null {
  const entries: [string, string][] = [];
  for (const key of ALLOWED_KEYS) {
    const raw = params[key];
    // Districts are normalized through the ONE district law, so the repeated-key
    // form (?district=vake&district=saburtalo) and the CSV form collapse to the
    // same carried value and unknown codes are dropped at the door.
    const value =
      key === "district"
        ? serializeDistricts(parseDistrictCodes(raw)) || undefined
        : firstValue(raw);
    if (value === undefined) continue;
    if (value.length > MAX_VALUE_LENGTH || !VALUE_RE.test(value)) return null;
    entries.push([key, value]);
  }
  // ⚠️ Both cursor directions at once describes two different windows.
  // `parseFilters` already fails such a URL closed to the top of the collection;
  // refusing it here as well means we never MINT a return link whose restored
  // page would disagree with the URL the visitor can see.
  if (hasBothCursors(entries)) return null;
  return entries;
}

function hasBothCursors(entries: readonly [string, string][]): boolean {
  let after = false;
  let before = false;
  for (const [key] of entries) {
    if (key === CURSOR_AFTER_PARAM) after = true;
    if (key === CURSOR_BEFORE_PARAM) before = true;
  }
  return after && before;
}

/**
 * Mint the return context for a card rendered on `route` under `params`.
 *
 * Returns null when the search cannot be carried honestly (an oversized or
 * syntactically impossible value). Callers then emit a plain detail link, and
 * the detail page falls back to the catalogue root — a seeker who loses the
 * scroll position is a smaller failure than one sent somewhere unexplainable.
 */
export function encodeReturnContext(
  route: CatalogueRoute,
  params: SearchParams
): string | null {
  const entries = collectEntries(params);
  if (entries === null) return null;
  const routeIndex = CATALOGUE_ROUTES.indexOf(route);
  if (routeIndex < 0) return null;
  const payload: ReturnPayload = [RETURN_VERSION, routeIndex, entries];
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  // A context that would not survive its own decode is no context at all —
  // refuse it where it is minted rather than where it is used.
  return encoded.length > MAX_ENCODED_LENGTH ? null : encoded;
}

/**
 * Total: anything malformed, stale, oversized, cross-language or belonging to
 * an unknown route yields null and the caller falls back to the catalogue root.
 *
 * `expectedRoute` is the language of the page asking. A Georgian context
 * presented to `/en/listing/...` is refused rather than translated: the two
 * catalogues do not accept the same parameters, and silently switching a
 * seeker's language is precisely the kind of confident wrongness this codebase
 * treats as a defect.
 */
export function decodeReturnContext(
  raw: string | string[] | undefined,
  expectedRoute: CatalogueRoute
): string | null {
  const value = firstValue(raw);
  if (value === undefined || value.length > MAX_ENCODED_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [version, routeIndex, rawEntries] = parsed as [unknown, unknown, unknown];
  if (version !== RETURN_VERSION) return null;
  if (typeof routeIndex !== "number" || !Number.isInteger(routeIndex)) return null;
  const route = CATALOGUE_ROUTES[routeIndex];
  if (route === undefined || route !== expectedRoute) return null;
  if (!Array.isArray(rawEntries)) return null;

  const search = new URLSearchParams();
  const seen = new Set<string>();
  const accepted: [string, string][] = [];
  for (const entry of rawEntries) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [key, val] = entry as [unknown, unknown];
    if (typeof key !== "string" || typeof val !== "string") return null;
    // Unknown or repeated keys are a crafted payload, not a stale link: this
    // module is the only thing that mints them and it emits each key at most
    // once, in a fixed order. Fail the whole context rather than half-applying
    // a search the visitor cannot see in their own URL.
    if (!ALLOWED_KEY_SET.has(key) || seen.has(key)) return null;
    if (val.length > MAX_VALUE_LENGTH || !VALUE_RE.test(val)) return null;
    seen.add(key);
    accepted.push([key as AllowedKey, val]);
  }
  if (hasBothCursors(accepted)) return null;
  for (const [key, val] of accepted) search.set(key, val);

  const path = CATALOGUE_PATHS[route];
  return search.size > 0 ? `${path}?${search.toString()}` : path;
}

/** The stable anchor a result card carries and a return link aims at. */
export function listingAnchorId(listingId: number): string {
  return `listing-${listingId}`;
}

/**
 * The href for a detail page's visible "back to results" control. Total: always
 * an internal catalogue path.
 *
 * ⚠️ NOT `router.back()`. The previous history entry may be Google, Facebook,
 * WhatsApp, or the visitor's own bookmarks — a back CTA that sometimes leaves
 * the site is worse than one that always lands on the catalogue. Browser Back
 * remains the seeker's own affordance and is untouched by any of this; the two
 * paths are tested separately for exactly that reason.
 *
 * The `#listing-N` fragment restores the originating card without JavaScript or
 * storage: the browser scrolls it into view, and because the card carries
 * `tabIndex={-1}` the fragment also becomes the keyboard focus target. When the
 * card is gone from the restored results — sold, hidden, or reordered past the
 * window — the fragment simply matches nothing and the seeker lands at the top
 * of their exact search. That is the intended degradation: restore the query,
 * never fabricate the old inventory order.
 */
export function returnHref(
  raw: string | string[] | undefined,
  expectedRoute: CatalogueRoute,
  listingId?: number
): string {
  const restored = decodeReturnContext(raw, expectedRoute);
  if (restored === null) return CATALOGUE_PATHS[expectedRoute];
  const anchorable =
    typeof listingId === "number" && Number.isSafeInteger(listingId) && listingId > 0;
  return anchorable ? `${restored}#${listingAnchorId(listingId)}` : restored;
}

/**
 * Append return context to a detail href built by a card.
 *
 * Accepts `undefined` as well as `null` so a card rendered by a surface that has
 * no search to carry — a rail, a future embed — links to the detail page
 * unchanged instead of forcing every call site to pass an explicit null.
 */
export function withReturnContext(href: string, context: string | null | undefined): string {
  if (!context) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${RETURN_PARAM}=${context}`;
}

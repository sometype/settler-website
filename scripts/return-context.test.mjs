/**
 * WAVE 0 — RESULTS-CONTEXT RESTORATION.
 *
 * THE APPROVED WRONG STATE is production commit 5794001, measured 2026-09-08:
 * `FilterBar` wrote the whole search into the catalogue URL, `ListingCard` built
 * its detail href from `src`/`sort` only, `EnglishListingCard` from the id
 * alone, and both detail pages rendered a back link hard-coded to `/` and
 * `/en/rent`. A seeker who narrowed to "Saburtalo + Vake, ≤ $600, 2 rooms,
 * price ascending, page 3", opened a flat and pressed back landed on the
 * unfiltered homepage at the top of the list.
 *
 * ⚠️ THE STRUCTURAL BLOCK BELOW IS THE NEGATIVE CONTROL. It is written against
 * the source files, not against this module's exports, so running this file on
 * an unrepaired tree turns it RED. A test that only exercised
 * `lib/returnContext.ts` would pass on 5794001 with the defect fully intact —
 * the module would simply be unused — which is the "gate that cannot fail"
 * class Article III-B exists to refuse. Both halves must run.
 *
 * ⚠️ THE OPEN-REDIRECT PROPERTY IS THE OTHER REASON THIS FILE EXISTS. A "return
 * to where I was" parameter is an attacker's favourite shape. The design makes
 * the escape structurally impossible — the route is an integer index into a
 * two-entry table, so no request character ever reaches a path — and
 * `hostileContexts` asserts that property directly rather than trusting the
 * argument.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CATALOGUE_PATHS,
  RETURN_PARAM,
  decodeReturnContext,
  encodeReturnContext,
  listingAnchorId,
  returnHref,
  withReturnContext,
} from "../lib/returnContext.ts";

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");

/**
 * The file with its comments removed.
 *
 * ⚠️ THIS EXISTS BECAUSE THE FIRST VERSION OF THE `router.back()` CHECK FIRED
 * FALSELY. It matched the repaired detail page, whose comment explains WHY the
 * back control must not delegate to browser history — a check that cannot tell
 * a documented anti-pattern from a use of it protects nothing and trains
 * everyone to override it. A false red is the same class of defect as a missed
 * red and is repaired in the instrument, never by softening the rule: a real
 * `router.back()` call still turns this file red.
 *
 * Block spans and whole-line `//` comments only. A trailing comment after code
 * on the same line survives, which is the conservative direction — this helper
 * may never make the check weaker than a plain substring scan, only narrower in
 * the one place it was wrong.
 */
const codeOf = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const KA_LISTING = "app/(ka)/listing/[id]/page.tsx";
const EN_LISTING = "app/(en)/en/listing/[id]/page.tsx";
const KA_CATALOGUE = "app/(ka)/page.tsx";
const EN_CATALOGUE = "app/(en)/en/rent/page.tsx";

/* ------------------------------------------------- the reproduced defect */

test("STRUCTURAL: neither detail page hard-codes the catalogue back link", () => {
  // The exact bytes measured on 5794001. Their presence IS the defect.
  assert.ok(
    !codeOf(KA_LISTING).includes('href="/"'),
    "Georgian detail page still sends the visitor to the unfiltered homepage"
  );
  assert.ok(
    !codeOf(EN_LISTING).includes('href="/en/rent"'),
    "English detail page still sends the visitor to the unfiltered rent catalogue"
  );
});

test("STRUCTURAL: both detail pages resolve their back link through the shared parser", () => {
  for (const file of [KA_LISTING, EN_LISTING]) {
    const src = codeOf(file);
    assert.match(src, /returnHref\(/, `${file} does not call returnHref`);
    assert.match(src, /backHref/, `${file} has no resolved back target`);
  }
});

test("STRUCTURAL: result cards carry the search and a stable anchor", () => {
  for (const file of ["components/ListingCard.tsx", "components/EnglishListingCard.tsx"]) {
    const src = codeOf(file);
    assert.match(src, /returnContext/, `${file} does not accept the return context`);
    assert.match(src, /withReturnContext\(/, `${file} does not attach it to the detail href`);
    assert.match(src, /listingAnchorId\(listing\.id\)/, `${file} has no stable card anchor`);
    assert.match(src, /tabIndex=\{-1\}/, `${file} anchor cannot receive keyboard focus`);
  }
});

test("STRUCTURAL: both catalogues mint and pass the context", () => {
  for (const file of [KA_CATALOGUE, EN_CATALOGUE]) {
    const src = codeOf(file);
    assert.match(src, /encodeReturnContext\(/, `${file} never mints a return context`);
    assert.match(src, /returnContext=\{returnContext\}/, `${file} never passes it to its cards`);
  }
});

test("STRUCTURAL: the visible control never delegates to browser history", () => {
  // The previous history entry may be Google, Facebook or WhatsApp. A back CTA
  // that sometimes leaves the site is a different defect, not a repair.
  for (const file of [KA_LISTING, EN_LISTING, "lib/returnContext.ts"]) {
    assert.ok(!codeOf(file).includes("router.back()"), `${file} delegates to history`);
  }
});

test("STRUCTURAL: return context is inert for analytics and adds no query", () => {
  // trackEvent transports pathname and drops the query; acquisitionMeta reads
  // only four named acquisition keys. Neither can therefore see `rc`. Asserted
  // so a later edit cannot quietly start recording the seeker's search.
  const events = codeOf("lib/events.ts");
  assert.match(events, /path: window\.location\.pathname/);
  assert.ok(!events.includes(`"${RETURN_PARAM}"`), "events read the return param by name");
  for (const file of ["lib/events.ts", "lib/event-contract.ts"]) {
    assert.ok(
      !codeOf(file).includes("returnContext"),
      `${file} couples analytics to navigation state`
    );
  }
  // No database, no network, no image: the module is pure string work.
  const mod = codeOf("lib/returnContext.ts");
  for (const forbidden of ["supabase", "fetch(", "lib/listings", "next/"]) {
    assert.ok(!mod.includes(forbidden), `returnContext reaches for ${forbidden}`);
  }
});

/* ------------------------------------------------------ honest round trip */

test("a full Georgian search survives the boundary exactly", () => {
  const search = {
    deal: "rent",
    district: "saburtalo,vake",
    min: "300",
    max: "600",
    mina: "40",
    maxa: "90",
    rooms: "2",
    sort: "price_asc",
    page: "3",
    after: "eyJhIjoxfQ",
    view: "hot",
    rs: "42",
  };
  const context = encodeReturnContext("ka", search);
  assert.ok(context, "a legitimate search must be carryable");
  const restored = decodeReturnContext(context, "ka");
  const params = new URLSearchParams(restored.slice(restored.indexOf("?") + 1));
  assert.ok(restored.startsWith("/?"));
  for (const [key, value] of Object.entries(search)) {
    assert.equal(params.get(key), value, `${key} did not survive the round trip`);
  }
});

test("the English catalogue's every parameter survives", () => {
  // Measured against parseEnglishFilters: district, rooms, min, max, page.
  const search = { district: "vake", rooms: "5+", min: "400", max: "1200", page: "2" };
  const restored = decodeReturnContext(encodeReturnContext("en", search), "en");
  assert.ok(restored.startsWith("/en/rent?"));
  const params = new URLSearchParams(restored.slice(restored.indexOf("?") + 1));
  for (const [key, value] of Object.entries(search)) {
    assert.equal(params.get(key), value, `${key} did not survive the round trip`);
  }
});

test("the repeated-key district form collapses to the one canonical spelling", () => {
  const repeated = encodeReturnContext("ka", { district: ["vake", "saburtalo"] });
  const csv = encodeReturnContext("ka", { district: "vake,saburtalo" });
  assert.equal(repeated, csv, "two spellings of one search must encode identically");
  assert.equal(decodeReturnContext(repeated, "ka"), "/?district=vake%2Csaburtalo");
});

test("unknown district codes are dropped by the one district law, not re-implemented", () => {
  assert.equal(decodeReturnContext(encodeReturnContext("ka", { district: "atlantis" }), "ka"), "/");
});

test("an empty search still returns a usable catalogue root", () => {
  assert.equal(decodeReturnContext(encodeReturnContext("ka", {}), "ka"), "/");
  assert.equal(decodeReturnContext(encodeReturnContext("en", {}), "en"), "/en/rent");
});

test("acquisition, tracking and retired keys never cross the boundary", () => {
  const restored = decodeReturnContext(
    encodeReturnContext("ka", {
      district: "vake",
      utm_source: "facebook",
      utm_medium: "cpc",
      fbclid: "IwAR0",
      gclid: "Cj0KCQ",
      amen: "parking",
      unknown: "x",
    }),
    "ka"
  );
  assert.equal(restored, "/?district=vake");
});

/* --------------------------------------------------------- hostile inputs */

const hostileContexts = [
  "",
  "   ",
  "not-base64!!",
  "eyJhIjoxfQ", // valid base64url, wrong shape
  Buffer.from(JSON.stringify([1, 0]), "utf8").toString("base64url"), // wrong arity
  Buffer.from(JSON.stringify([99, 0, []]), "utf8").toString("base64url"), // future version
  Buffer.from(JSON.stringify([1, 7, []]), "utf8").toString("base64url"), // unknown route
  Buffer.from(JSON.stringify([1, -1, []]), "utf8").toString("base64url"), // negative index
  Buffer.from(JSON.stringify([1, 1.5, []]), "utf8").toString("base64url"), // non-integer index
  Buffer.from(JSON.stringify([1, 0, "nope"]), "utf8").toString("base64url"), // entries not a list
  Buffer.from(JSON.stringify([1, 0, [["page"]]]), "utf8").toString("base64url"), // short tuple
  Buffer.from(JSON.stringify([1, 0, [["page", 3]]]), "utf8").toString("base64url"), // non-string
  // The whole point: a payload trying to name its own destination.
  Buffer.from(JSON.stringify([1, 0, [["district", "//evil.example"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["district", "https://evil.example"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["district", "..%2f..%2fupload"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["district", "vake#x"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["district", "vake&admin=1"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["__proto__", "x"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["utm_source", "facebook"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["page", "1"], ["page", "2"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["after", "a"], ["before", "b"]]]), "utf8").toString("base64url"),
  Buffer.from(JSON.stringify([1, 0, [["district", "v".repeat(300)]]]), "utf8").toString("base64url"),
  "A".repeat(5000),
];

/**
 * Wrong SPELLINGS of a real token, as opposed to wrong CONTENTS. Kept beside
 * hostileContexts so the totality property below covers both classes.
 */
const malformedTokens = (() => {
  const t = encodeReturnContext("ka", { district: "vake", page: "2" });
  return [t + "!!", t + "=", t + "==", " " + t, t + " ", "\t" + t, t + "\n", t + "*", t.slice(0, -1) + "%"];
})();

test("every crafted context is refused", () => {
  for (const raw of hostileContexts) {
    assert.equal(
      decodeReturnContext(raw, "ka"),
      null,
      `crafted context was accepted: ${raw.slice(0, 60)}`
    );
  }
});

test("PROPERTY: returnHref is total and can only ever produce an internal catalogue path", () => {
  const inputs = [
    ...hostileContexts,
    ...malformedTokens,
    undefined, null, [], ["a", "b"], {}, 5, true,
  ];
  for (const route of ["ka", "en"]) {
    const prefix = CATALOGUE_PATHS[route];
    for (const raw of inputs) {
      const href = returnHref(raw, route, 123);
      assert.equal(typeof href, "string");
      assert.ok(href.startsWith(prefix), `escaped the catalogue: ${href}`);
      assert.ok(!href.startsWith("//"), `protocol-relative escape: ${href}`);
      assert.ok(!href.includes("://"), `absolute URL escape: ${href}`);
      assert.ok(!href.includes(".."), `traversal in href: ${href}`);
    }
  }
});

test("a context minted in one language is refused by the other", () => {
  const ka = encodeReturnContext("ka", { district: "vake" });
  const en = encodeReturnContext("en", { district: "vake" });
  assert.equal(decodeReturnContext(ka, "en"), null, "Georgian search leaked into English");
  assert.equal(decodeReturnContext(en, "ka"), null, "English search leaked into Georgian");
  assert.equal(returnHref(ka, "en", 12), "/en/rent");
  assert.equal(returnHref(en, "ka", 12), "/");
});

test("a search that cannot be carried honestly is not carried at all", () => {
  assert.equal(encodeReturnContext("ka", { district: "vake", rooms: "x".repeat(300) }), null);
  assert.equal(encodeReturnContext("ka", { sort: "price asc" }), null, "space is not admissible");
  assert.equal(encodeReturnContext("ka", { after: "a", before: "b" }), null, "two windows");
});

/* ------------------------------------------- token canonicality (rc spelling) */

/**
 * ⚠️ THE APPROVED WRONG STATE FOR THIS BLOCK is candidate ecd03b56, where the
 * token went straight into `Buffer.from(value, "base64url")`. Node's decoder
 * discards out-of-alphabet characters and tolerates padding, so `<token>`,
 * `<token>=`, `<token>!!` and a token with altered trailing bits all decoded to
 * the same bytes and all restored the same search. One search had unboundedly
 * many spellings, and every one of them was input this module never minted.
 */

/** A canonical token this module actually mints. */
const CANONICAL = encodeReturnContext("ka", {
  deal: "rent",
  district: "saburtalo,vake",
  min: "300",
  rooms: "2",
  sort: "price_asc",
  page: "3",
});

/**
 * A different spelling of CANONICAL's own bytes, found by search rather than
 * hard-coded, so this test cannot rot into a constant that no longer decodes to
 * anything. The final character carries spare low bits in any token whose
 * length is not a multiple of 4; another character sharing those high bits
 * decodes identically.
 */
function nonCanonicalTwin(token) {
  const bytes = Buffer.from(token, "base64url");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (const ch of alphabet) {
    if (ch === token[token.length - 1]) continue;
    const twin = token.slice(0, -1) + ch;
    if (Buffer.from(twin, "base64url").equals(bytes)) return twin;
  }
  return null;
}

test("the canonical token this module mints is accepted", () => {
  assert.ok(CANONICAL, "encode must produce a token");
  assert.match(CANONICAL, /^[A-Za-z0-9_-]+$/, "minted tokens must already be canonical");
  assert.equal(
    decodeReturnContext(CANONICAL, "ka"),
    "/?deal=rent&district=saburtalo%2Cvake&min=300&rooms=2&sort=price_asc&page=3"
  );
});

test("a token carrying characters outside the alphabet is refused", () => {
  for (const suffix of ["!!", "=", "==", "*", "%3D", "+", "/", "."]) {
    assert.equal(
      decodeReturnContext(CANONICAL + suffix, "ka"),
      null,
      `token + ${JSON.stringify(suffix)} was accepted`
    );
  }
});

test("whitespace anywhere in the token is refused, including at the edges", () => {
  // ⚠️ NOT TRIMMED FIRST. A space-wrapped token is not canonical base64url, and
  // nothing this module mints or any browser emits can contain whitespace, so
  // the only source of one is a hand-built link.
  const mid = Math.floor(CANONICAL.length / 2);
  const variants = [
    " " + CANONICAL,
    CANONICAL + " ",
    " " + CANONICAL + " ",
    "\t" + CANONICAL,
    CANONICAL + "\n",
    CANONICAL.slice(0, mid) + " " + CANONICAL.slice(mid),
    "",
    "   ",
  ];
  for (const raw of variants) {
    assert.equal(
      decodeReturnContext(raw, "ka"),
      null,
      `whitespace variant was accepted: ${JSON.stringify(raw)}`
    );
  }
});

test("a non-canonical spelling of the same bytes is refused", () => {
  const twin = nonCanonicalTwin(CANONICAL);
  // The test must not pass by failing to construct its own wrong case.
  assert.ok(twin, "could not construct a non-canonical twin — the case went untested");
  assert.notEqual(twin, CANONICAL);
  assert.ok(
    Buffer.from(twin, "base64url").equals(Buffer.from(CANONICAL, "base64url")),
    "the twin must decode to identical bytes, or it proves nothing"
  );
  assert.equal(decodeReturnContext(twin, "ka"), null, "non-canonical spelling was accepted");
  // And the old, lenient behaviour is what made it dangerous: it round-tripped.
  assert.equal(decodeReturnContext(CANONICAL, "ka") !== null, true);
});

test("one search has exactly one spelling", () => {
  const again = encodeReturnContext("ka", {
    deal: "rent",
    district: "saburtalo,vake",
    min: "300",
    rooms: "2",
    sort: "price_asc",
    page: "3",
  });
  assert.equal(again, CANONICAL, "encoding must be stable");
});

test("tightening the token did not narrow honest restoration", () => {
  // Byte-exact, both languages, asserted here as well as above so a future
  // tightening cannot quietly start refusing a legitimate search.
  const ka = encodeReturnContext("ka", {
    deal: "rent", district: "saburtalo,vake", min: "300", max: "600", mina: "40",
    maxa: "90", rooms: "2", sort: "price_asc", page: "3", after: "eyJhIjoxfQ",
    view: "hot", rs: "42",
  });
  assert.equal(
    decodeReturnContext(ka, "ka"),
    "/?deal=rent&district=saburtalo%2Cvake&min=300&max=600&mina=40&maxa=90" +
      "&rooms=2&sort=price_asc&page=3&after=eyJhIjoxfQ&view=hot&rs=42"
  );
  const en = encodeReturnContext("en", {
    district: "vake", rooms: "5+", min: "400", max: "1200", page: "2",
  });
  assert.equal(
    decodeReturnContext(en, "en"),
    "/en/rent?district=vake&min=400&max=1200&rooms=5%2B&page=2"
  );
  assert.equal(returnHref(ka, "ka", 19095).endsWith("#listing-19095"), true);
  assert.equal(returnHref(en, "en", 19095).endsWith("#listing-19095"), true);
});

/* -------------------------------------------------- anchor, focus, fallback */

test("the originating card is the return target, and only with a real id", () => {
  const context = encodeReturnContext("ka", { district: "vake" });
  assert.equal(returnHref(context, "ka", 19095), "/?district=vake#listing-19095");
  assert.equal(returnHref(context, "ka"), "/?district=vake");
  for (const bad of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(returnHref(context, "ka", bad), "/?district=vake", `id ${bad} produced an anchor`);
  }
});

test("a direct or shared entry lands on the catalogue root, never elsewhere", () => {
  assert.equal(returnHref(undefined, "ka", 19095), "/");
  assert.equal(returnHref(undefined, "en", 19095), "/en/rent");
});

test("the anchor a card renders is the anchor a return link aims at", () => {
  // One helper, both ends — a card and a link that disagree restore nothing.
  assert.equal(listingAnchorId(19095), "listing-19095");
  assert.ok(returnHref(encodeReturnContext("ka", {}), "ka", 19095).endsWith(`#${listingAnchorId(19095)}`));
});

test("withReturnContext preserves existing analytics parameters", () => {
  const context = encodeReturnContext("ka", { district: "vake" });
  assert.equal(withReturnContext("/listing/5", null), "/listing/5");
  assert.equal(withReturnContext("/listing/5", context), `/listing/5?${RETURN_PARAM}=${context}`);
  assert.equal(
    withReturnContext("/listing/5?src=hot_all&sort=price_asc", context),
    `/listing/5?src=hot_all&sort=price_asc&${RETURN_PARAM}=${context}`
  );
});

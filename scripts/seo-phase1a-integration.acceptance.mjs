#!/usr/bin/env node

/**
 * H3 — frozen transaction-bound acceptance for integrating SEO Phase 1A
 * (candidate 8437574, built on old baseline 5794001) onto the exact production
 * source capture f19b6c4 (mepatrone.com, deployment dpl_BPSBdmP4EfVbf8Rb8SUiBaEu1iKg).
 *
 * THE APPROVED WRONG STATES this gate must reject:
 *   - the SEO candidate taken as-is (8437574): rolls back production's
 *     return-to-results navigation, English gallery/image bridge and English
 *     filter repair;
 *   - a naive cherry-pick of the SEO implementation (7ca2015) onto f19b6c4 that
 *     accepts SEO's listing page: replaces the S9-approved back control
 *     ("← მთავარ გვერდზე", return-context href) with catalog links and sends the
 *     database-error branch to a hard-coded "/";
 *   - return-context.test.mjs left reading the pre-move catalog path, or
 *     "repaired" by anything other than the one path substitution.
 *
 * Invocation (the loader is required; bare `node` cannot resolve the
 * extensionless TypeScript imports the real helpers use):
 *   node --import ./scripts/ts-resolve.mjs scripts/seo-phase1a-integration.acceptance.mjs
 *
 * Authority class (S17): transaction-bound acceptance. It carries a verdict only
 * for the named integration transaction (baseline f19b6c4 + SEO candidate
 * 8437574). Offline; no network, no production, no spend.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROD = "f19b6c472ee152ebbaf0746d7de30c5513c93c97";
const SEO_CANDIDATE = "8437574d4216069e60054b41598c1f211ee39101";

const KA_LISTING = "app/(ka)/listing/[id]/page.tsx";
const OLD_CATALOG = "app/(ka)/page.tsx";
const NEW_CATALOG = "app/(ka)/(catalog)/page.tsx";
const OLD_LOADING = "app/(ka)/loading.tsx";
const NEW_LOADING = "app/(ka)/(catalog)/loading.tsx";
const BACK_LABEL = "← მთავარ გვერდზე";
const ERROR_BACK_LABEL = "მთავარ გვერდზე დაბრუნება";

const H1_FROZEN = {
  "scripts/seo-phase1a-acceptance.mjs": "e65fb3948c7bb7661e0d1e11e21bd4feeab46c5164a26e8aaf962b4f10a34670",
  "tasks/TASK-SEO-PHASE-1A-V1.json": "97fc798b27fee916ad2ad4c79356759f66f7969b176cee0c7719f8b1840fe91c",
  "tasks/TASK-SEO-PHASE-1A-V1.freeze.json": "42bad54808448f2ddfce8918ec41ca4b753047cdfe9a0ed8e07cf08b44576442",
  "tasks/TASK-SEO-PHASE-1A-V1.baseline-red.txt": "4b7b766f42fce0d47946694acad4d1ccfb2c7aa1f0531db844439d2f3693822d",
};
const H2_FROZEN = {
  "scripts/seo-phase1a-route-move-tests.acceptance.mjs": "ff876200ea3d1adba6316e8136296c108d6813baacbdb5a04829995ab5fcc958",
  "tasks/TASK-SEO-PHASE-1A-H2-V1.json": "9701f0f359448f042fc38df9e3e44eb0bb4d83a236e7f185cf1699085cbd8c4c",
  "tasks/TASK-SEO-PHASE-1A-H2-V1.freeze.json": "c7a9bcb547dbc8e8a68fa3d132ab5f987b95c81bf67090d6f318cb003ab79bde",
  "tasks/TASK-SEO-PHASE-1A-H2-V1.baseline-red.txt": "c6cd1aa460745a8909a97281d54632825c9edc9ed4dd34ba8e9a13782a87c605",
};
const H3_ARTIFACTS = [
  "scripts/seo-phase1a-integration.acceptance.mjs",
  "tasks/TASK-SEO-PHASE-1A-H3-V1.json",
];
/** Source-reading tests that name the catalog path; each gets exactly one substitution. */
const ROUTE_READERS = [
  "scripts/return-context.test.mjs",
  "scripts/pagination-hardening.test.mjs",
  "scripts/pagination.test.mjs",
  "scripts/tracking-phase-a.test.mjs",
];
/** Production files the SEO patch does not own. Byte-identical to f19b6c4. */
const PRODUCTION_ONLY = [
  "app/(en)/en/listing/[id]/page.tsx",
  "app/(en)/en/rent/page.tsx",
  "app/img/[id]/[pos]/route.ts",
  "components/EnglishGallery.tsx",
  "components/EnglishRentFilterForm.tsx",
  "components/EnglishListingCard.tsx",
  "components/ListingCard.tsx",
  "components/CardPhotoPeek.tsx",
  "components/ListingOpenBeacon.tsx",
  "components/ResultDetailLink.tsx",
  "components/ResultFocusRestorer.tsx",
  "lib/returnContext.ts",
  "lib/filters.ts",
  "lib/events.ts",
  "lib/event-contract.ts",
  "lib/listings.ts",
];
/** Every path the integration may differ from f19b6c4 in. */
const INTEGRATION_ALLOWED = new Set([
  KA_LISTING,
  "app/(ka)/listing/[id]/loading.tsx",
  OLD_CATALOG,
  NEW_CATALOG,
  OLD_LOADING,
  NEW_LOADING,
  "app/robots.ts",
  "lib/listingPageData.ts",
  "lib/listingSeo.ts",
  "scripts/seo-phase1a.test.mjs",
  ...ROUTE_READERS,
  ...Object.keys(H1_FROZEN),
  ...Object.keys(H2_FROZEN),
  ...H3_ARTIFACTS,
]);

const rel = (name) => path.join(ROOT, name);
const read = (name) => readFileSync(rel(name), "utf8");
const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const gitBytes = (rev, file) => execFileSync("git", ["show", `${rev}:${file}`], { cwd: ROOT, maxBuffer: 64 << 20 });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
/** Block comments and whole-line `//` comments removed (same rule as return-context.test.mjs). */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
const squash = (value) => value.replace(/\s+/g, " ").trim();
const count = (haystack, needle) => haystack.split(needle).length - 1;

const results = [];
async function check(id, title, fn) {
  try {
    await fn();
    results.push({ id, title, ok: true, finding: "PASS" });
  } catch (error) {
    results.push({ id, title, ok: false, finding: String(error?.message || error).replace(/\s+/g, " ").trim() });
  }
}

async function importTs(name) {
  return import(pathToFileURL(rel(name)).href);
}

/** The listing page split into the parts the checks reason about. */
function listingParts(source) {
  const code = stripComments(source);
  const catchStart = code.search(/catch\s*\(\s*\w*\s*\)\s*\{/);
  assert.ok(catchStart >= 0, "LISTING_DB_ERROR_BRANCH_MISSING");
  const afterCatch = code.slice(catchStart);
  const endRel = afterCatch.search(/if\s*\(\s*!\s*(?:data\.)?listing\s*\)\s*notFound\s*\(\s*\)/);
  assert.ok(endRel >= 0, "LISTING_MISSING_404_AFTER_DB_BRANCH_NOT_FOUND");
  const catchBlock = afterCatch.slice(0, endRel);
  const body = afterCatch.slice(endRel);
  const metaStart = code.search(/export\s+async\s+function\s+generateMetadata/);
  const pageStart = code.search(/export\s+default\s+async\s+function\s+ListingPage/);
  let metadataBlock = null;
  if (metaStart >= 0) {
    // Up to the next top-level function declaration, wherever the builder puts it.
    const rest = code.slice(metaStart + 1);
    const next = rest.search(/\n(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s/);
    metadataBlock = code.slice(metaStart, next >= 0 ? metaStart + 1 + next : code.length);
  }
  return { code, catchBlock, body, metadataBlock, pageCode: pageStart >= 0 ? code.slice(pageStart) : code };
}

/** Attribution-bearing fragments of the listing page, whitespace-normalized. */
function attributionFragments(source) {
  const code = stripComments(source);
  const grab = (label, re) => {
    const match = code.match(re);
    assert.ok(match, `ATTRIBUTION_FRAGMENT_MISSING:${label}`);
    return squash(match[0]);
  };
  return {
    railSources: grab("RAIL_SOURCES", /const RAIL_SOURCES[^;]*;/),
    srcValue: grab("srcValue", /const srcValue[^;]*;/),
    rail: grab("rail", /const rail\b[^;]*;/),
    sortValue: grab("sortValue", /const sortValue[^;]*;/),
    openSort: grab("openSort", /const openSort[^;]*;/),
    contactAttribution: grab("contactAttribution", /const contactAttribution[\s\S]*?\};/),
    beacon: grab("ListingOpenBeacon", /<ListingOpenBeacon[\s\S]*?\/>/),
    attributionProps: String(count(code, "attribution={contactAttribution}")),
  };
}

const SEARCH = { deal: "rent", district: "saburtalo,vake", max: "600", rooms: "2", sort: "price_asc", page: "3" };
let token = "UNAVAILABLE_RETURN_CONTEXT_MODULE";
try {
  token = (await importTs("lib/returnContext.ts")).encodeReturnContext("ka", SEARCH) ?? token;
} catch {
  /* every check that needs the module reports it RED on its own */
}
/** A back target restores the exact search and aims at the originating card. */
function assertRestoresSearch(href, listingId) {
  assert.equal(typeof href, "string", "RETURN_HREF_NOT_STRING");
  const url = new URL(href, "https://mepatrone.com");
  assert.equal(url.origin, "https://mepatrone.com", `RETURN_HREF_LEAVES_SITE:${href}`);
  assert.equal(url.pathname, "/", `RETURN_HREF_WRONG_CATALOG:${href}`);
  assert.equal(url.hash, `#listing-${listingId}`, `RETURN_HREF_NO_CARD_ANCHOR:${href}`);
  for (const [key, value] of Object.entries(SEARCH)) {
    assert.equal(url.searchParams.get(key), value, `RETURN_HREF_LOST_${key}:${href}`);
  }
}

// ---------------------------------------------------------------- I0 subject

await check("I0", "integration is built on the exact production capture and the named SEO candidate", () => {
  git(["cat-file", "-e", `${SEO_CANDIDATE}^{commit}`]);
  try {
    git(["merge-base", "--is-ancestor", PROD, "HEAD"]);
  } catch {
    assert.fail(`PRODUCTION_CAPTURE_NOT_ANCESTOR_OF_HEAD:${PROD}`);
  }
});

// ------------------------------------------------ I1 the approved back control

await check("I1", "listing back control keeps the return-context href and the exact S9-approved label; DB-error link uses it too", async () => {
  const { code, catchBlock, pageCode } = listingParts(read(KA_LISTING));
  assert.match(code, /import\s*\{[^}]*\bRETURN_PARAM\b[^}]*\breturnHref\b[^}]*\}\s*from\s*["']@\/lib\/returnContext["']|import\s*\{[^}]*\breturnHref\b[^}]*\bRETURN_PARAM\b[^}]*\}\s*from\s*["']@\/lib\/returnContext["']/,
    "RETURN_CONTEXT_IMPORT_MISSING");
  assert.match(pageCode, /const backHref\s*=\s*returnHref\(\s*[\w.]+\[\s*RETURN_PARAM\s*\]\s*,\s*"ka"\s*,\s*id\s*\)/,
    "BACK_HREF_NOT_RESOLVED_THROUGH_RETURN_CONTEXT");
  assert.equal(code.includes('href="/"'), false, "HARD_CODED_HOMEPAGE_HREF_REINTRODUCED");
  assert.equal(count(code, BACK_LABEL), 1, `APPROVED_BACK_LABEL_COUNT:${count(code, BACK_LABEL)}`);
  const backLinks = code.match(/<Link\s+href=\{backHref\}[^>]*>\s*([^<]*?)\s*<\/Link>/g) || [];
  const labels = backLinks.map((link) => squash(link.replace(/^[\s\S]*?>/, "").replace(/<\/Link>$/, "")));
  assert.ok(labels.includes(BACK_LABEL), `BACK_CONTROL_RELABELLED_OR_REHREFED:${JSON.stringify(labels)}`);
  assert.match(catchBlock, /<Link\s+href=\{backHref\}[^>]*>\s*მთავარ გვერდზე დაბრუნება\s*<\/Link>/,
    "DB_ERROR_LINK_DOES_NOT_USE_RETURN_HREF");
  assert.ok(catchBlock.includes(ERROR_BACK_LABEL), "DB_ERROR_LABEL_CHANGED");
  // The real helper: the href the page computes returns to the exact search.
  const { returnHref, RETURN_PARAM } = await importTs("lib/returnContext.ts");
  assert.equal(RETURN_PARAM, "rc", "RETURN_PARAM_DRIFT");
  assertRestoresSearch(returnHref(token, "ka", 101), 101);
  assert.equal(returnHref(undefined, "ka", 101), "/", "RETURN_HREF_FALLBACK_NOT_ROOT");
});

// ------------------------------------------ I2 SEO links are additional

await check("I2", "SEO catalog and district links are additional plain-href anchors alongside the back control", async () => {
  const { body } = listingParts(read(KA_LISTING));
  assert.match(body, /<Link\s+href=\{backHref\}/, "BACK_CONTROL_ABSENT_FROM_RENDERED_LISTING");
  for (const [name, re] of [
    ["catalog", /<(?:Link|a)\s[^>]*href=\{seo\.catalogHref\}[^>]*>/],
    ["district", /<(?:Link|a)\s[^>]*href=\{seo\.districtHref\}[^>]*>/],
  ]) {
    const match = body.match(re);
    assert.ok(match, `SEO_${name.toUpperCase()}_LINK_MISSING`);
    assert.doesNotMatch(match[0], /onClick|router\.|ResultDetailLink|prefetch=\{?false/,
      `SEO_${name.toUpperCase()}_LINK_NOT_PLAIN_ANCHOR`);
  }
  const { buildListingSeo } = await importTs("lib/listingSeo.ts");
  const seo = buildListingSeo({
    listing: { id: 101, deal_type: "rent", district_code: "saburtalo", district: "საბურთალო",
      rooms: 2, area: 70, price_usd: 800, street_display: "პეკინის გამზირი" },
    images: [{ position: 7 }],
  });
  for (const href of [seo.catalogHref, seo.districtHref]) {
    assert.equal(typeof href, "string", "SEO_HREF_NOT_STRING");
    assert.match(href, /^\/(?!\/)/, `SEO_HREF_NOT_INTERNAL_PATH:${href}`);
    assert.equal(href.includes(token) || /[?&]rc=/.test(href), false, `SEO_LINK_CARRIES_RETURN_CONTEXT:${href}`);
  }
});

// ------------------------------------------ I3 route readers follow the move

for (const [index, file] of ROUTE_READERS.entries()) {
  await check(`I3.${index + 1}`, `${file} = f19b6c4 bytes with exactly one catalog path substitution`, () => {
    const original = gitBytes(PROD, file).toString("utf8");
    assert.equal(count(original, OLD_CATALOG), 1, `PRODUCTION_PATH_COUNT_DRIFT:${file}:${count(original, OLD_CATALOG)}`);
    const expected = original.split(OLD_CATALOG).join(NEW_CATALOG);
    assert.ok(existsSync(rel(file)), `ROUTE_READER_DELETED:${file}`);
    const actual = read(file);
    assert.equal(actual.includes(OLD_CATALOG), false, `STALE_CATALOG_PATH:${file}`);
    assert.equal(actual, expected, `ROUTE_READER_DRIFT_BEYOND_PATH_SUBSTITUTION:${file}`);
  });
}

await check("I3.5", "return-context and tracking suites pass on the integrated tree", () => {
  for (const file of ["scripts/return-context.test.mjs", "scripts/tracking-phase-a.test.mjs"]) {
    try {
      execFileSync(process.execPath, ["--import", "./scripts/ts-resolve.mjs", "--test", file],
        { cwd: ROOT, encoding: "utf8", stdio: "pipe", maxBuffer: 64 << 20, timeout: 120_000 });
    } catch (error) {
      const lines = `${error.stdout || ""}`.split("\n");
      const cut = lines.findIndex((l) => l.startsWith("✖ failing tests:"));
      const out = (cut >= 0 ? lines.slice(0, cut) : lines)
        .filter((l) => /^✖ |^not ok|^ℹ fail|^# fail/.test(l.trim()))
        .map((l) => l.trim().replace(/ \([\d.]+ms\)$/, ""))
        .join(" | ");
      assert.fail(`SUITE_RED:${file}:${out || error.message}`);
    }
  }
});

// ------------------------------------ I4 return context vs analytics/canonical

await check("I4.1", "SEO output (canonical, title, links) is identical with and without return/tracking params", async () => {
  const { buildListingSeo } = await importTs("lib/listingSeo.ts");
  const input = {
    listing: { id: 101, deal_type: "rent", district_code: "saburtalo", district: "საბურთალო",
      rooms: 2, area: 70, price_usd: 800, street_display: "პეკინის გამზირი" },
    images: [{ position: 7 }, { position: 1 }],
  };
  const clean = buildListingSeo(input);
  assert.equal(clean.canonicalUrl, "https://mepatrone.com/listing/101", "CANONICAL_NOT_CLEAN_LISTING_URL");
  for (const searchParams of [
    { rc: token },
    { rc: token, src: "hot", sort: "price_asc", utm_source: "google", utm_medium: "cpc", gclid: "Cj0", fbclid: "IwA", page: "9" },
    { rc: [token, "x"], src: ["district"] },
  ]) {
    const polluted = buildListingSeo({ ...input, searchParams });
    assert.deepEqual(polluted, clean, `SEO_OUTPUT_DEPENDS_ON_QUERY:${Object.keys(searchParams).join(",")}`);
  }
  const serialized = JSON.stringify(clean);
  assert.equal(serialized.includes(token), false, "RETURN_TOKEN_IN_SEO_OUTPUT");
  assert.equal(/[?&]rc=/.test(serialized), false, "RETURN_PARAM_IN_SEO_OUTPUT");
});

await check("I4.2", "generateMetadata reads no return context and emits the helper canonical", () => {
  const { metadataBlock } = listingParts(read(KA_LISTING));
  assert.ok(metadataBlock, "GENERATE_METADATA_MISSING");
  for (const forbidden of ["RETURN_PARAM", "returnHref", "backHref", "searchParams", '"rc"', "'rc'"]) {
    assert.equal(metadataBlock.includes(forbidden), false, `METADATA_READS_QUERY_OR_RETURN:${forbidden}`);
  }
  assert.match(metadataBlock, /canonical:\s*seo\.canonicalUrl/, "METADATA_CANONICAL_NOT_FROM_HELPER");
});

await check("I4.3", "beacon meta, rail, openSort and contact attribution are unchanged from f19b6c4 and never read the return param", () => {
  const prod = attributionFragments(gitBytes(PROD, KA_LISTING).toString("utf8"));
  const now = attributionFragments(read(KA_LISTING));
  for (const key of Object.keys(prod)) {
    assert.equal(now[key], prod[key], `ANALYTICS_ATTRIBUTION_DRIFT:${key}`);
    assert.doesNotMatch(now[key], /RETURN_PARAM|backHref|returnHref|\brc\b|seo\./, `RETURN_OR_SEO_IN_ATTRIBUTION:${key}`);
  }
});

await check("I4.4", "real trackEvent transport drops the return param from a listing open", async () => {
  const { trackEvent, acquisitionMeta } = await importTs("lib/events.ts");
  const sent = [];
  const saved = { window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
  const href = `https://mepatrone.com/listing/101?src=hot&sort=price_asc&rc=${token}`;
  globalThis.window = { location: new URL(href), history: {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; } },
  });
  try {
    trackEvent("listing_open", { listingId: 101, meta: { deal: "rent", rail: "hot", sort: "price_asc" } });
  } finally {
    globalThis.window = saved.window;
    if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
  }
  assert.equal(sent.length, 1, `BEACON_NOT_SENT:${sent.length}`);
  const body = await sent[0].blob.text();
  assert.equal(body.includes(token), false, "RETURN_TOKEN_IN_ANALYTICS_PAYLOAD");
  assert.equal(/[?&]rc=|"rc"/.test(body), false, "RETURN_PARAM_IN_ANALYTICS_PAYLOAD");
  assert.equal(JSON.parse(body).path, "/listing/101", "ANALYTICS_PATH_CARRIES_QUERY");
  const acq = JSON.stringify(acquisitionMeta("/listing/101", `?rc=${token}&utm_source=google`, "", "mepatrone.com"));
  assert.equal(acq.includes(token), false, "RETURN_TOKEN_IN_ACQUISITION_META");
});

// -------------------------------------------- I5 production-only files intact

await check("I5", "production-only files are byte-identical to f19b6c4", () => {
  const drift = [];
  for (const file of PRODUCTION_ONLY) {
    const expected = sha256(gitBytes(PROD, file));
    const actual = existsSync(rel(file)) ? sha256(readFileSync(rel(file))) : "MISSING";
    if (actual !== expected) drift.push(`${file}(${actual.slice(0, 12)})`);
  }
  assert.deepEqual(drift, [], `PRODUCTION_FILE_ROLLBACK_OR_DRIFT:${drift.join(",")}`);
});

// ------------------------------- I6 the moved catalog is production's catalog

await check("I6", "moved catalog page/loading are f19b6c4's bytes and still restore results focus", () => {
  assert.equal(existsSync(rel(OLD_CATALOG)), false, "OLD_CATALOG_PATH_STILL_PRESENT");
  assert.equal(existsSync(rel(OLD_LOADING)), false, "OLD_CATALOG_LOADING_STILL_PRESENT");
  for (const [from, to] of [[OLD_CATALOG, NEW_CATALOG], [OLD_LOADING, NEW_LOADING]]) {
    assert.ok(existsSync(rel(to)), `MOVED_FILE_MISSING:${to}`);
    assert.equal(sha256(readFileSync(rel(to))), sha256(gitBytes(PROD, from)), `MOVED_FILE_NOT_PRODUCTION_BYTES:${to}`);
  }
  const catalog = stripComments(read(NEW_CATALOG));
  assert.match(catalog, /<ResultFocusRestorer \/>/, "CATALOG_FOCUS_RESTORER_LOST");
  assert.match(catalog, /encodeReturnContext\("ka",/, "CATALOG_RETURN_CONTEXT_NOT_MINTED");
  assert.match(catalog, /returnContext=\{returnContext\}/, "CATALOG_RETURN_CONTEXT_NOT_PASSED");
  assert.match(stripComments(read("components/ListingCard.tsx")), /<ResultDetailLink/, "CARD_DETAIL_LINK_LOST");
});

// ------------------------------------------ I7 earlier frozen gates preserved

await check("I7", "H1 and H2 frozen artifacts are present and byte-identical to their freezes", () => {
  const drift = [];
  for (const [file, expected] of Object.entries({ ...H1_FROZEN, ...H2_FROZEN })) {
    const actual = existsSync(rel(file)) ? sha256(readFileSync(rel(file))) : "MISSING";
    if (actual !== expected) drift.push(`${file}(${actual.slice(0, 12)})`);
    if (actual !== "MISSING" && actual !== sha256(gitBytes(SEO_CANDIDATE, file))) drift.push(`${file}(!=candidate)`);
  }
  assert.deepEqual(drift, [], `FROZEN_GATE_DRIFT:${drift.join(",")}`);
});

// ------------------------------------------ I8 integration scope vs production

await check("I8", "integration differs from f19b6c4 only in SEO-owned paths, route readers and frozen artifacts", () => {
  const changed = new Set([
    ...git(["diff", "--name-only", "--no-renames", `${PROD}..HEAD`]).split("\n").filter(Boolean),
    ...git(["diff", "--name-only", "--no-renames", "HEAD"]).split("\n").filter(Boolean),
    ...git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean),
  ]);
  const outside = [...changed].filter((name) => !INTEGRATION_ALLOWED.has(name));
  assert.deepEqual(outside, [], `OUT_OF_SCOPE_OR_ROLLED_BACK:${outside.slice(0, 20).join(",")}${outside.length > 20 ? `,+${outside.length - 20}` : ""}`);
  const forbidden = [...changed].filter((name) => /sitemap|search.?console|\/district(?:\/|\[)/i.test(name));
  assert.deepEqual(forbidden, [], `PHASE_1B_OR_EXTERNAL_WORK_PRESENT:${forbidden.join(",")}`);
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "RED"} ${result.id} ${result.title} :: ${result.finding}`);
}
const red = results.filter((result) => !result.ok).length;
console.log(`SUMMARY pass=${results.length - red} red=${red} total=${results.length}`);
process.exitCode = red;

#!/usr/bin/env node

/** Frozen transaction-bound acceptance for the Georgian listing SEO Phase 1A repair. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "5794001270e0f31e3adddcd9753e0b532b96f911";
const rel = (name) => path.join(ROOT, name);
const read = (name) => readFileSync(rel(name), "utf8");
const pagePath = "app/(ka)/listing/[id]/page.tsx";
const cachePath = "lib/listingPageData.ts";
const seoPath = "lib/listingSeo.ts";
const robotsPath = "app/robots.ts";
const frozenFiles = new Set([
  "scripts/seo-phase1a-acceptance.mjs",
  "tasks/TASK-SEO-PHASE-1A-V1.json",
  "tasks/TASK-SEO-PHASE-1A-V1.freeze.json",
  "tasks/TASK-SEO-PHASE-1A-V1.baseline-red.txt",
]);
const allowed = new Set([
  pagePath,
  "app/(ka)/listing/[id]/loading.tsx",
  "app/(ka)/loading.tsx",
  "app/(ka)/page.tsx",
  "app/(ka)/(catalog)/page.tsx",
  "app/(ka)/(catalog)/loading.tsx",
  robotsPath,
  cachePath,
  seoPath,
  "scripts/seo-phase1a.test.mjs",
  ...frozenFiles,
]);

const results = [];
function check(id, title, fn) {
  try {
    fn();
    results.push({ id, title, ok: true, finding: "PASS" });
  } catch (error) {
    results.push({
      id,
      title,
      ok: false,
      finding: String(error?.message || error).replace(/\s+/g, " ").trim(),
    });
  }
}

let seo = null;
let seoLoadError = null;
try {
  seo = await import("../lib/listingSeo.ts");
} catch (error) {
  seoLoadError = error;
}
const requireSeo = () => {
  assert.ok(seo, `SEO_HELPER_MISSING_OR_INVALID:${String(seoLoadError?.message || seoLoadError || "unknown")}`);
  assert.equal(typeof seo.buildListingSeo, "function", "BUILD_LISTING_SEO_EXPORT_MISSING");
  return seo.buildListingSeo;
};
const rentFixture = {
  listing: {
    id: 101,
    deal_type: "rent",
    district_code: "saburtalo",
    district: "საბურთალო",
    rooms: 2,
    area: 70,
    price_usd: 800,
    street_display: "პეკინის გამზირი",
  },
  images: [
    { position: 7, source_url: "https://evil.invalid/upstream-cover.jpg", stored_path: "portal/raw.jpg" },
    { position: 1, source_url: "https://evil.invalid/position-one.jpg", stored_path: "portal/one.jpg" },
  ],
};
const saleFixture = {
  listing: {
    id: 202,
    deal_type: "sale",
    district_code: "vake",
    district: "ვაკე",
    rooms: 4,
    area: 140,
    price_usd: 310000,
    street_display: "ჭავჭავაძის გამზირი",
  },
  images: [{ position: 3, source_url: "https://evil.invalid/sale.jpg" }],
};

check("S1", "metadata is unique and made from truthful listing facts", () => {
  const build = requireSeo();
  const rent = build(rentFixture);
  const sale = build(saleFixture);
  for (const value of [rent.title, rent.description, sale.title, sale.description]) {
    assert.equal(typeof value, "string", "GENERIC_SHARED_METADATA");
    assert.ok(value.trim().length >= 20, "GENERIC_SHARED_METADATA");
  }
  assert.notEqual(rent.title, sale.title, "GENERIC_SHARED_TITLES");
  assert.notEqual(rent.description, sale.description, "GENERIC_SHARED_DESCRIPTIONS");
  assert.match(rent.title + rent.description, /800|\$800/,
    "LISTING_PRICE_FACT_MISSING");
  assert.match(rent.title + rent.description, /70/,
    "LISTING_AREA_FACT_MISSING");
  assert.match(rent.title + rent.description, /საბურთალო/,
    "LISTING_DISTRICT_FACT_MISSING");
  assert.match(sale.title + sale.description, /310[,.]?000|\$310[,.]?000/,
    "SALE_PRICE_FACT_MISSING");
});

check("S2", "Georgian metadata stays Georgian and does not drift to English or Gujarati", () => {
  const build = requireSeo();
  const output = build(rentFixture);
  const text = `${output.title} ${output.description}`;
  assert.match(text, /[\u10A0-\u10FF]/, "GEORGIAN_METADATA_HAS_NO_MKHEDRULI");
  assert.doesNotMatch(text, /[\u0A80-\u0AFF]/, "GUJARATI_SCRIPT_LEAK");
  assert.doesNotMatch(text, /\b(?:apartment|flat|for rent|for sale)\b/i,
    "ENGLISH_METADATA_DRIFT_ON_GEORGIAN_ROUTE");
});

check("S3", "canonical is the clean production listing URL and ignores query state", () => {
  const build = requireSeo();
  const output = build({ ...rentFixture, searchParams: { src: "hot", utm_source: "ads", page: "9" } });
  assert.equal(output.canonicalUrl, "https://mepatrone.com/listing/101",
    "QUERY_CANONICAL_POLLUTION");
  assert.equal(output.canonicalUrl.includes("?"), false, "QUERY_CANONICAL_POLLUTION");
});

check("S4", "Open Graph uses the selected first-party cover and never an upstream URL", () => {
  const build = requireSeo();
  const output = build(rentFixture);
  assert.equal(output.ogImageUrl, "https://mepatrone.com/img/101/7",
    "FAKE_OR_UPSTREAM_OG_IMAGE");
  assert.doesNotMatch(output.ogImageUrl, /evil\.invalid|b-cdn\.net|myhome|ss\.ge/i,
    "FAKE_OR_UPSTREAM_OG_IMAGE");
});

check("S5", "metadata and page share one React-cached listing read", () => {
  assert.ok(existsSync(rel(cachePath)), "SHARED_CACHED_READ_MISSING");
  const cacheSource = read(cachePath);
  const page = read(pagePath);
  assert.match(cacheSource, /import\s*\{\s*cache\s*\}\s*from\s*["']react["']/,
    "REACT_CACHE_NOT_USED");
  assert.match(cacheSource, /cache\s*\(\s*fetchListing\s*\)/,
    "FETCH_LISTING_NOT_WRAPPED_ONCE");
  assert.equal((page.match(/await\s+getListingPageData\s*\(/g) || []).length, 2,
    "DOUBLED_OR_UNSHARED_DB_READS");
  assert.equal(/await\s+fetchListing\s*\(/.test(page), false,
    "DIRECT_DUPLICATE_DB_READ_REMAINS");
});

check("S6", "listing 404 resolves before any inherited streaming loading boundary", () => {
  assert.equal(existsSync(rel("app/(ka)/listing/[id]/loading.tsx")), false,
    "LISTING_STREAMING_SOFT_404_BOUNDARY_REMAINS");
  assert.equal(existsSync(rel("app/(ka)/loading.tsx")), false,
    "INHERITED_STREAMING_SOFT_404_BOUNDARY_REMAINS");
  assert.ok(existsSync(rel("app/(ka)/(catalog)/loading.tsx")),
    "CATALOG_LOADING_BEHAVIOR_NOT_PRESERVED");
  assert.ok(existsSync(rel("app/(ka)/(catalog)/page.tsx")),
    "CATALOG_ROUTE_NOT_PRESERVED");
});

check("S7", "invalid and unpublished/missing listings 404; database errors do not masquerade as 404", () => {
  const page = read(pagePath);
  assert.match(page, /!Number\.isInteger\(id\)\s*\|\|\s*id\s*<=\s*0\)\s*notFound\(\)/,
    "INVALID_ID_NOT_MAPPED_TO_404");
  assert.match(page, /if\s*\(\s*!\s*(?:data\.)?listing\s*\)\s*notFound\(\)/,
    "MISSING_OR_UNPUBLISHED_NOT_MAPPED_TO_404");
  assert.doesNotMatch(page, /catch\s*\([^)]*\)\s*\{[^}]*notFound\s*\(/s,
    "DB_ERROR_MISLABELED_404");
  assert.match(page, /ჩატვირთვა ვერ მოხერხდა|throw\s+err|throw\s+error/s,
    "DB_ERROR_PATH_WAS_ERASED");
});

check("S8", "a valid listing is not rejected by a blanket notFound path", () => {
  const page = read(pagePath);
  const notFoundCalls = page.match(/notFound\s*\(\s*\)/g) || [];
  assert.equal(notFoundCalls.length, 2, "VALID_LISTING_FALSE_404_RISK");
  assert.doesNotMatch(page, /finally\s*\{[^}]*notFound\s*\(/s,
    "VALID_LISTING_FALSE_404_RISK");
});

check("S9", "robots endpoint exists and does not advertise the absent sitemap", () => {
  assert.ok(existsSync(rel(robotsPath)), "ROBOTS_ENDPOINT_MISSING");
  const robots = read(robotsPath);
  assert.match(robots, /MetadataRoute\.Robots|robots\s*\(/,
    "ROBOTS_ENDPOINT_INVALID");
  assert.doesNotMatch(robots, /sitemap/i,
    "ROBOTS_ADVERTISES_NONEXISTENT_SITEMAP");
});

check("S10", "listing renders crawlable catalog and district links", () => {
  const page = read(pagePath);
  assert.match(page, /href=\{?[^\n]*(?:catalogHref|\?deal=)/,
    "CRAWLABLE_CATALOG_LINK_MISSING");
  assert.match(page, /href=\{?[^\n]*(?:districtHref|district=)/,
    "CRAWLABLE_DISTRICT_LINK_MISSING");
});

check("S11", "existing Georgian contact/product behavior remains present", () => {
  const page = read(pagePath);
  for (const marker of ["PhoneBlock", "StickyContactBar", "ListingOpenBeacon", "Gallery"]) {
    assert.ok(page.includes(marker), `GEORGIAN_PRODUCT_BEHAVIOR_REMOVED:${marker}`);
  }
});

check("S12", "Phase 1A does not create sitemap, district pages, Search Console, or unrelated drift", () => {
  const run = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const changed = new Set([
    ...run(["diff", "--name-only", `${BASELINE}..HEAD`]).split("\n").filter(Boolean),
    ...run(["diff", "--name-only"]).split("\n").filter(Boolean),
    ...run(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean),
  ]);
  const outside = [...changed].filter((name) => !allowed.has(name));
  assert.deepEqual(outside, [], `OUT_OF_SCOPE_FILES:${outside.join(",")}`);
  const forbidden = [...changed].filter((name) =>
    /sitemap|search.?console|\/district(?:\/|\[)/i.test(name));
  assert.deepEqual(forbidden, [], `PHASE_1B_OR_EXTERNAL_WORK_PRESENT:${forbidden.join(",")}`);
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "RED"} ${result.id} ${result.title} :: ${result.finding}`);
}
const red = results.filter((result) => !result.ok).length;
console.log(`SUMMARY pass=${results.length - red} red=${red} total=${results.length}`);
process.exitCode = red;

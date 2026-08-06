import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acquisitionMeta,
} from "../lib/events.ts";
import { validatePhaseAEvent } from "../lib/event-contract.ts";

test("acquisition meta stores bounded categories, never raw campaign identifiers", () => {
  assert.deepEqual(
    acquisitionMeta(
      "/listing/42",
      "?utm_source=instagram&utm_medium=paid-social&utm_campaign=owners&fbclid=SECRET",
      "https://l.instagram.com/path?private=yes",
      "mepatrone.com"
    ),
    {
      entry: "/listing/42",
      acq_source: "instagram",
      paid_click: true,
      utm_medium: "paid_social",
      referrer_host: "l.instagram.com",
    }
  );
});

test("acquisition classification uses honest unattributed, referral and click-id buckets", () => {
  assert.equal(acquisitionMeta("/", "", "", "mepatrone.com").acq_source, "unattributed");
  assert.equal(
    acquisitionMeta("/", "", "https://www.mepatrone.com/listing/1", "mepatrone.com")
      .referrer_host,
    null
  );
  assert.equal(
    acquisitionMeta("/", "", "https://example.org/story", "mepatrone.com").acq_source,
    "referral"
  );
  assert.equal(acquisitionMeta("/", "?gclid=x", "", "mepatrone.com").acq_source, "google");
  assert.equal(
    acquisitionMeta(
      "/",
      "?fbclid=shared-meta-id",
      "https://l.instagram.com/redirect",
      "mepatrone.com"
    ).acq_source,
    "instagram"
  );
});

test("contact contract preserves the row while dropping unsafe attribution", () => {
  const valid = {
    surface: "sticky_bar",
    rail: "price_drop",
    sort: "new",
    deal: "sale",
  };
  assert.deepEqual(validatePhaseAEvent("call_tap", 42, valid), {
    meta: valid,
    error: null,
    notices: [],
  });

  const unsafe = validatePhaseAEvent("call_tap", 42, {
    ...valid,
    rail: "crafted",
    sort: "random",
    phone: "555123456",
  });
  assert.equal(unsafe.error, null);
  assert.deepEqual(unsafe.meta, {
    surface: "sticky_bar",
    rail: null,
    sort: null,
    deal: "sale",
  });
  assert.deepEqual(unsafe.notices, [
    { reason: "unknown_contact_key", key: "phone" },
    { reason: "bad_rail", key: "rail" },
    { reason: "bad_sort", key: "sort" },
  ]);
  assert.ok(!JSON.stringify(unsafe).includes("555123456"));
});

test("contact contract hard-rejects only missing listing and unknown surface", () => {
  const valid = { surface: "card" };
  assert.deepEqual(validatePhaseAEvent("wa_tap", null, valid).error, {
    reason: "missing_listing",
    key: "listing_id",
  });
  assert.deepEqual(
    validatePhaseAEvent("call_tap", 42, { ...valid, surface: "modal" }).error,
    { reason: "bad_surface", key: "surface" }
  );
  assert.deepEqual(validatePhaseAEvent("call_tap", 42, valid).meta, {
    surface: "card",
    rail: null,
    sort: null,
    deal: null,
  });
});

// Added at reconciliation (Claude): both of these are fail-soft consequences
// that the original Phase A hardening did not cover. See TRACKINGDISCUSSION.md
// § Claude reconciliation, R1 and R2.
test("a pathological contact payload is bounded, logged once, and still written", () => {
  const junk = { surface: "sticky_bar", rail: "new", sort: "new", deal: "sale" };
  for (let i = 0; i < 500; i += 1) junk[`junk_${i}`] = "x".repeat(64);

  const result = validatePhaseAEvent("call_tap", 6455, junk);

  // R1: the conversion survives — the row is written with clean attribution.
  assert.equal(result.error, null);
  assert.deepEqual(result.meta, {
    surface: "sticky_bar",
    rail: "new",
    sort: "new",
    deal: "sale",
  });
  // R2: notices are capped, so 500 unknown keys cannot become 500 log lines
  // reachable by an anonymous POST.
  assert.ok(
    result.notices.length <= 6,
    `notices must stay bounded, got ${result.notices.length}`
  );
  assert.equal(
    result.notices.at(-1).reason,
    "unknown_contact_key_truncated",
    "truncation must be visible, not silent"
  );
  // The sanitized meta is small by construction, which is why the route can
  // safely skip the raw 2,048-byte gate for contacts.
  assert.ok(JSON.stringify(result.meta).length < 2048);
});

test("session contract accepts legacy meta but rejects query and unbounded values", () => {
  assert.equal(validatePhaseAEvent("session_start", null, { entry: "/" }).error, null);
  assert.deepEqual(
    validatePhaseAEvent("session_start", null, { entry: "/?phone=555123456" }).error,
    { reason: "bad_entry", key: "entry" }
  );
  assert.deepEqual(
    validatePhaseAEvent("session_start", null, {
      entry: "/",
      acq_source: "facebook",
      paid_click: true,
      utm_medium: "cpc",
      referrer_host: "facebook.com/private/path",
    }).error,
    { reason: "bad_referrer_host", key: "referrer_host" }
  );
});

test("every event path is pathname-only in both client and API", async () => {
  const [client, route] = await Promise.all([
    readFile(new URL("../lib/events.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /path: window\.location\.pathname/);
  assert.doesNotMatch(client, /window\.location\.pathname \+ window\.location\.search/);
  assert.match(route, /const path = rawPath \? rawPath\.split\(\/\[\?\#\]\//);
  assert.doesNotMatch(route, /eventType === "session_start" && rawPath/);
  assert.match(route, /JSON\.stringify\(meta\)\.length > 2048/);
  assert.doesNotMatch(client, /utm_campaign\s*:/);
});

test("card-photo and sort contexts are bounded and legacy photo rows survive rollout", () => {
  const exposure = {
    n: 3,
    surface: "feed",
    deal: "sale",
    page: 5,
    has_filters: true,
  };
  assert.equal(
    validatePhaseAEvent("card_photo_exposure", 42, exposure).error,
    null
  );
  assert.equal(
    validatePhaseAEvent("card_photo_exposure", 42, { n: 3, surface: "feed" }).error,
    null
  );
  assert.equal(
    validatePhaseAEvent("card_photo_exposure", 42, { ...exposure, page: 1000 }).error
      ?.reason,
    "bad_page"
  );
  assert.equal(
    validatePhaseAEvent("card_photo_swipe", 42, {
      ...exposure,
      from: 0,
      to: 2,
    }).error,
    null
  );
  assert.equal(
    validatePhaseAEvent("sort_apply", null, {
      from: "new",
      to: "price_asc",
      deal: "sale",
      has_filters: true,
      view: null,
      district_count: 8,
    }).error,
    null
  );
  assert.equal(
    validatePhaseAEvent("sort_apply", null, {
      from: "new",
      to: "price_asc",
      deal: "sale",
      has_filters: true,
      view: null,
      district_count: 9,
    }).error?.reason,
    "bad_district_count"
  );
});

test("owned emitters carry compensating bounded context", async () => {
  const [photo, card, page, sort, route] = await Promise.all([
    readFile(new URL("../components/CardPhotoPeek.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ListingCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SortBar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(photo, /surface: "feed", \.\.\.eventContext/);
  assert.match(card, /deal:[\s\S]*page:[\s\S]*has_filters:/);
  assert.match(page, /page=\{result\.page\}[\s\S]*hasFilters=\{hasFilters\}/);
  assert.match(sort, /district_count: parseDistrictCodes/);
  assert.match(route, /console\.warn\("\[events\] sanitized", notice\.reason, notice\.key\)/);
  assert.doesNotMatch(route, /console\.warn\([^\n]*meta/);
});

test("compatibility SQL never guesses direct acquisition for legacy starts", async () => {
  const sql = await readFile(
    new URL("../sql/analysis_tracking_phase_a.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /facebook_legacy/);
  assert.match(sql, /google_legacy/);
  assert.match(sql, /unknown_legacy/);
  assert.match(sql, /NOT DEPLOYED YET/);
  assert.doesNotMatch(sql, /else 'direct'/i);
});

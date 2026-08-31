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
    { reason: "bad_rail", key: "rail" },
    { reason: "bad_sort", key: "sort" },
    { reason: "unknown_contact_key", key: "phone" },
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

// Added after the first 3h of live Phase A data exposed two classification
// defects. See TRACKINGDISCUSSION.md § Claude post-cutover findings, D1 and D2.
test("paid_click needs real paid evidence — fbclid alone is not it", () => {
  // D1. Meta appends fbclid to organic outbound links, so 204/209 live Facebook
  // sessions were flagged paid. Source classification still uses it; spend does not.
  const organicMeta = acquisitionMeta("/", "?fbclid=abc", "", "mepatrone.com");
  assert.equal(organicMeta.acq_source, "facebook", "fbclid still identifies the channel");
  assert.equal(organicMeta.paid_click, false, "but it must not imply ad spend");

  // gclid is set only by Google Ads auto-tagging, so it does imply a paid click.
  assert.equal(acquisitionMeta("/", "?gclid=abc", "", "mepatrone.com").paid_click, true);

  // Explicit campaign tagging remains the reliable signal, including on Meta.
  assert.equal(
    acquisitionMeta("/", "?fbclid=abc&utm_medium=paid_social", "", "mepatrone.com").paid_click,
    true
  );
  assert.equal(acquisitionMeta("/", "?utm_medium=cpc", "", "mepatrone.com").paid_click, true);
});

test("the Android Google app is Google, not a referral", () => {
  // D2. Android sends a package id instead of a hostname; this was understating
  // Google by ~46% (22 of 48 sessions) in the first 3h after cutover.
  const m = acquisitionMeta(
    "/",
    "",
    "android-app://com.google.android.googlequicksearchbox/",
    "mepatrone.com"
  );
  assert.equal(m.acq_source, "google");
  assert.equal(m.referrer_host, "com.google.android.googlequicksearchbox");
  assert.equal(m.paid_click, false, "organic app search is not paid");
  // Other engines stay `referral` — documented, not an oversight.
  assert.equal(acquisitionMeta("/", "", "https://bing.com/s", "mepatrone.com").acq_source, "referral");
});

// Added at reconciliation (Claude): both of these are fail-soft consequences
// that the original Phase A hardening did not cover. See TRACKINGDISCUSSION.md
// § Claude reconciliation, R1 and R2.
test("a pathological contact payload has globally bounded safe notices and is still written", () => {
  const privateKey = `phone_${"5".repeat(5000)}`;
  const junk = {
    surface: "sticky_bar",
    rail: "crafted",
    sort: "random",
    deal: "unknown",
    [privateKey]: "private",
  };
  for (let i = 0; i < 500; i += 1) junk[`junk_${i}`] = "x".repeat(64);

  const result = validatePhaseAEvent("call_tap", 6455, junk);

  // R1: the conversion survives — the row is written with clean attribution.
  assert.equal(result.error, null);
  assert.deepEqual(result.meta, {
    surface: "sticky_bar",
    rail: null,
    sort: null,
    deal: null,
  });
  // R2: every notice category shares one hard cap, so invalid enums plus 500
  // unknown keys still cannot become an anonymous log flood.
  assert.equal(result.notices.length, 6);
  assert.equal(
    result.notices.at(-1).reason,
    "sanitization_notices_truncated",
    "truncation must be visible, not silent"
  );
  assert.ok(!JSON.stringify(result.notices).includes(privateKey));
  assert.ok(result.notices.some((notice) => notice.key === "invalid_key"));
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
    readFile(new URL("../app/(ka)/(catalog)/page.tsx", import.meta.url), "utf8"),
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
  assert.match(sql, /Phase A cutover: DEPLOYED 2026-08-06/);
  assert.match(sql, /2026-08-06T13:28:15Z/);
  assert.match(sql, /session_id not in \('claude_deploy_probe', 'claude_probe'\)/);
  assert.doesNotMatch(sql, /NOT DEPLOYED YET/);
  assert.doesNotMatch(sql, /else 'direct'/i);
});

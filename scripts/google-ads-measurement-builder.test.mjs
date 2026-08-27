import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const core = fs.readFileSync("lib/google-ads-measurement-core.ts", "utf8");
const component = fs.readFileSync("components/EnglishGoogleAdsMeasurement.tsx", "utf8");
const englishLayout = fs.readFileSync("app/(en)/layout.tsx", "utf8");
const georgianLayout = fs.readFileSync("app/(ka)/layout.tsx", "utf8");

test("the exact Google Ads base tag is limited to the English route", () => {
  assert.match(core, /AW-16798915501/);
  assert.match(englishLayout, /<EnglishGoogleAdsMeasurement \/>/);
  assert.doesNotMatch(georgianLayout, /EnglishGoogleAdsMeasurement|AW-16798915501/);
});

test("all consent categories default to denied before the single tag config", () => {
  for (const key of ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]) {
    assert.match(core, new RegExp(`${key}: "denied"`));
  }
  assert.ok(component.indexOf("gtag('consent', 'default'") < component.indexOf("googletagmanager.com/gtag/js"));
  assert.equal(component.match(/gtag\('config'/g)?.length, 1);
  assert.doesNotMatch(component, /['"]granted['"]|gtag\('event', 'conversion'|send_to/);
});

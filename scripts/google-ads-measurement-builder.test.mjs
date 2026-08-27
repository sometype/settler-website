import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { ENGLISH_GOOGLE_ADS_BOOTSTRAP } from "../lib/google-ads-measurement-core.ts";

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
  const context = { Date };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(ENGLISH_GOOGLE_ADS_BOOTSTRAP, context);

  const calls = context.dataLayer.map((entry) => Array.from(entry));
  const consentIndex = calls.findIndex((entry) => entry[0] === "consent");
  const configIndex = calls.findIndex((entry) => entry[0] === "config");
  assert.ok(consentIndex >= 0 && configIndex > consentIndex);
  assert.deepEqual({ ...calls[consentIndex][2] }, {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.deepEqual(calls[configIndex], ["config", "AW-16798915501"]);

  const headStart = englishLayout.indexOf("<head>");
  const nativeMount = englishLayout.indexOf("<EnglishGoogleAdsMeasurement />");
  const headEnd = englishLayout.indexOf("</head>");
  assert.ok(headStart >= 0 && nativeMount > headStart && headEnd > nativeMount);
  assert.match(component, /<script>/);
  assert.doesNotMatch(component, /next\/script|['"]granted['"]|send_to/);
});

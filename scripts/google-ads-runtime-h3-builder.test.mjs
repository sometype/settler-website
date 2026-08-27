import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { ENGLISH_GOOGLE_ADS_BOOTSTRAP } from "../lib/google-ads-measurement-core.ts";

test("the native English bootstrap executes denied consent before config", () => {
  const context = { Date };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(ENGLISH_GOOGLE_ADS_BOOTSTRAP, context);
  const calls = context.dataLayer.map((entry) => Array.from(entry));
  const consent = calls.findIndex((entry) => entry[0] === "consent");
  const config = calls.findIndex((entry) => entry[0] === "config");
  assert.ok(consent >= 0 && config > consent);
  assert.deepEqual({ ...calls[consent][2] }, {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.deepEqual(calls[config], ["config", "AW-16798915501"]);
});

test("the native scripts are in the English head only", () => {
  const layout = fs.readFileSync("app/(en)/layout.tsx", "utf8");
  const georgian = fs.readFileSync("app/(ka)/layout.tsx", "utf8");
  assert.ok(layout.indexOf("<head>") < layout.indexOf("<EnglishGoogleAdsMeasurement />"));
  assert.ok(layout.indexOf("<EnglishGoogleAdsMeasurement />") < layout.indexOf("</head>"));
  assert.doesNotMatch(georgian, /EnglishGoogleAdsMeasurement|AW-16798915501/);
});

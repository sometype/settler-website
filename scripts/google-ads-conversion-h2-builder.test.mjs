import assert from "node:assert/strict";
import test from "node:test";

import { sendGoogleAdsConversion } from "../lib/google-ads-conversion-client.ts";

test("WhatsApp and Call use distinct exact Google Ads destinations", () => {
  const calls = [];
  const gtag = (...args) => calls.push(args);

  assert.equal(sendGoogleAdsConversion("wa_tap", gtag), true);
  assert.equal(sendGoogleAdsConversion("call_tap", gtag), true);
  assert.deepEqual(calls, [
    ["event", "conversion", { send_to: "AW-16798915501/gaeICL3T6OgcEK23rMo-" }],
    ["event", "conversion", { send_to: "AW-16798915501/-vmrCLjU6OgcEK23rMo-" }],
  ]);
});

test("unknown actions and unavailable or throwing gtag fail safe", () => {
  assert.equal(sendGoogleAdsConversion("page_view"), false);
  assert.equal(sendGoogleAdsConversion("wa_tap"), false);
  assert.equal(
    sendGoogleAdsConversion("call_tap", () => {
      throw new Error("blocked");
    }),
    false
  );
});

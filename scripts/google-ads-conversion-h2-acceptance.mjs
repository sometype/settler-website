import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const gateRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const rootFlag = args.indexOf("--subject-root");
const subjectRoot = path.resolve(rootFlag >= 0 ? args[rootFlag + 1] : process.cwd());
const baseline = "9ed4f5e889968acaa41cb8846d66342d982a2dc4";
const freeze = JSON.parse(
  fs.readFileSync(path.join(gateRoot, "tasks/TASK-GOOGLE-ADS-CONVERSION-H2-V1.freeze.json"), "utf8")
);
const fixtures = JSON.parse(
  fs.readFileSync(path.join(gateRoot, "scripts/fixtures/google-ads-conversion-h2-v1.json"), "utf8")
).fixtures;
const failures = [];
let passed = 0;

function sha256File(absolute) {
  return crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
}

function readSubject(relative) {
  return fs.readFileSync(path.join(subjectRoot, relative), "utf8");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function anchorContaining(source, needle) {
  const needleIndex = source.indexOf(needle);
  assert.notEqual(needleIndex, -1, `ANCHOR_HREF_MISSING:${needle}`);
  const start = source.lastIndexOf("<a", needleIndex);
  const end = source.indexOf("</a>", needleIndex);
  assert.ok(start >= 0 && end > needleIndex, `ANCHOR_BOUNDARY_MISSING:${needle}`);
  return source.slice(start, end + 4);
}

function collectSourceFiles(relative) {
  const start = path.join(subjectRoot, relative);
  if (!fs.existsSync(start)) return [];
  const found = [];
  const walk = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (/\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) found.push(child);
    }
  };
  walk(start);
  return found.sort();
}

function assertModel(model) {
  assert.equal(
    model.whatsapp_destination,
    "AW-16798915501/gaeICL3T6OgcEK23rMo-",
    "WHATSAPP_DESTINATION_WRONG"
  );
  assert.equal(
    model.call_destination,
    "AW-16798915501/-vmrCLjU6OgcEK23rMo-",
    "CALL_DESTINATION_WRONG"
  );
  assert.equal(model.whatsapp_click_calls, 1, `WHATSAPP_CLICK_CALLS:${String(model.whatsapp_click_calls)}`);
  assert.equal(model.call_click_calls, 1, `CALL_CLICK_CALLS:${String(model.call_click_calls)}`);
  assert.equal(
    model.render_or_page_load_calls,
    0,
    `RENDER_OR_PAGE_LOAD_CONVERSION:${String(model.render_or_page_load_calls)}`
  );
  assert.equal(model.georgian_calls, 0, `GEORGIAN_CONVERSION_WIRING:${String(model.georgian_calls)}`);
  assert.equal(model.blocks_navigation, false, "NAVIGATION_BLOCKED");
  assert.equal(model.gtag_unavailable_throws, false, "GTAG_UNAVAILABLE_THROWS");
  assert.deepEqual(model.payload_keys, ["send_to"], `CONVERSION_PAYLOAD_KEYS:${model.payload_keys.join(",")}`);
  assert.equal(model.first_party_attribution_preserved, true, "FIRST_PARTY_ATTRIBUTION_DRIFT");
}

async function check(id, label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`${id}:PASS:${label}`);
  } catch (error) {
    const finding = error instanceof Error ? error.message : String(error);
    failures.push(`${id}:${finding}`);
    console.log(`${id}:FAIL:${label}:${finding}`);
  }
}

await check("H0", "H2 verifier artifacts are intact and approved wrong states are observed red", () => {
  for (const [relative, expected] of Object.entries(freeze.verifier_artifacts)) {
    const absolute = path.join(gateRoot, relative);
    assert.ok(fs.existsSync(absolute), `VERIFIER_ARTIFACT_MISSING:${relative}`);
    assert.equal(sha256File(absolute), expected, `VERIFIER_ARTIFACT_DRIFT:${relative}`);
  }
  for (const fixture of fixtures) {
    let finding = null;
    try {
      assertModel(fixture.model);
    } catch (error) {
      finding = (error instanceof Error ? error.message : String(error)).split("\n", 1)[0];
    }
    if (fixture.expect === "PASS") {
      assert.equal(finding, null, `HONEST_FIXTURE_RED:${fixture.id}:${String(finding)}`);
      console.log(`FIXTURE:${fixture.id}:OBSERVED_GREEN`);
    } else {
      assert.equal(finding, fixture.finding, `WRONG_FIXTURE_FINDING_DRIFT:${fixture.id}:${String(finding)}`);
      console.log(`FIXTURE:${fixture.id}:OBSERVED_RED:${finding}`);
    }
  }
});

let conversionCore = null;
await check("H1", "exact distinct WhatsApp and Call conversion destinations", async () => {
  const relative = "lib/google-ads-conversion-core.ts";
  assert.ok(fs.existsSync(path.join(subjectRoot, relative)), `MISSING:${relative}`);
  conversionCore = await import(`${pathToFileURL(path.join(subjectRoot, relative)).href}?gate=${Date.now()}`);
  assert.equal(typeof conversionCore.googleAdsConversionDestination, "function", "DESTINATION_RESOLVER_MISSING");
  assert.equal(
    conversionCore.googleAdsConversionDestination("wa_tap"),
    "AW-16798915501/gaeICL3T6OgcEK23rMo-"
  );
  assert.equal(
    conversionCore.googleAdsConversionDestination("call_tap"),
    "AW-16798915501/-vmrCLjU6OgcEK23rMo-"
  );
  assert.equal(conversionCore.googleAdsConversionDestination("page_view"), null, "UNKNOWN_ACTION_MINTED_CONVERSION");
});

await check("H2", "client dispatch is synchronous, exact, minimal, and fail-safe without gtag", async () => {
  const relative = "lib/google-ads-conversion-client.ts";
  assert.ok(fs.existsSync(path.join(subjectRoot, relative)), `MISSING:${relative}`);
  const client = await import(`${pathToFileURL(path.join(subjectRoot, relative)).href}?gate=${Date.now()}`);
  assert.equal(typeof client.sendGoogleAdsConversion, "function", "CONVERSION_SENDER_MISSING");
  assert.equal(client.sendGoogleAdsConversion("wa_tap"), false, "MISSING_GTAG_DID_NOT_FAIL_SAFE");
  assert.equal(client.sendGoogleAdsConversion("call_tap"), false, "MISSING_GTAG_DID_NOT_FAIL_SAFE");
  const calls = [];
  const fake = (...call) => calls.push(call);
  assert.equal(client.sendGoogleAdsConversion("wa_tap", fake), true, "WA_SEND_DID_NOT_SUCCEED");
  assert.equal(client.sendGoogleAdsConversion("call_tap", fake), true, "CALL_SEND_DID_NOT_SUCCEED");
  assert.equal(client.sendGoogleAdsConversion("page_view", fake), false, "PAGE_VIEW_MINTED_CONVERSION");
  assert.deepEqual(calls, [
    ["event", "conversion", { send_to: "AW-16798915501/gaeICL3T6OgcEK23rMo-" }],
    ["event", "conversion", { send_to: "AW-16798915501/-vmrCLjU6OgcEK23rMo-" }],
  ]);
  assert.equal(client.sendGoogleAdsConversion("wa_tap", () => { throw new Error("gtag down"); }), false);
});

await check("H3", "English click handlers preserve first-party attribution and add one distinct conversion each", () => {
  const source = readSubject("components/EnglishContact.tsx");
  const whatsapp = anchorContaining(source, "href={contact.whatsappHref}");
  const call = anchorContaining(source, "href={contact.callHref}");
  assert.match(whatsapp, /trackEvent\(["']wa_tap["']\s*,\s*\{[\s\S]*?listingId/u, "WA_FIRST_PARTY_ATTRIBUTION_MISSING");
  assert.match(call, /trackEvent\(["']call_tap["']\s*,\s*\{[\s\S]*?listingId/u, "CALL_FIRST_PARTY_ATTRIBUTION_MISSING");
  assert.equal(countMatches(whatsapp, /sendGoogleAdsConversion\(["']wa_tap["']\)/gu), 1, "WA_CONVERSION_CLICK_COUNT");
  assert.equal(countMatches(call, /sendGoogleAdsConversion\(["']call_tap["']\)/gu), 1, "CALL_CONVERSION_CLICK_COUNT");
  assert.ok(whatsapp.indexOf("trackEvent") < whatsapp.indexOf("sendGoogleAdsConversion"), "WA_FIRST_PARTY_NOT_FIRST");
  assert.ok(call.indexOf("trackEvent") < call.indexOf("sendGoogleAdsConversion"), "CALL_FIRST_PARTY_NOT_FIRST");
});

await check("H4", "conversion wiring exists only inside the two English click handlers", () => {
  const contact = readSubject("components/EnglishContact.tsx");
  assert.equal(countMatches(contact, /sendGoogleAdsConversion\(["']wa_tap["']\)/gu), 1, "WA_CALL_SITE_COUNT");
  assert.equal(countMatches(contact, /sendGoogleAdsConversion\(["']call_tap["']\)/gu), 1, "CALL_CALL_SITE_COUNT");
  assert.doesNotMatch(contact, /preventDefault\s*\(|return\s+false|await\s+sendGoogleAdsConversion|onClick=\{\s*async/u, "NAVIGATION_BLOCKING_WIRING");
  const forbiddenFiles = [
    ...collectSourceFiles("app"),
    ...collectSourceFiles("components").filter((absolute) => !absolute.endsWith("/EnglishContact.tsx")),
  ];
  const forbidden = forbiddenFiles.map((absolute) => fs.readFileSync(absolute, "utf8")).join("\n");
  assert.doesNotMatch(forbidden, /sendGoogleAdsConversion|google-ads-conversion|gtag\s*\(\s*["']event["']\s*,\s*["']conversion["']/u, "NON_CLICK_OR_GEORGIAN_CONVERSION_WIRING");
});

await check("H5", "labels are exact, occur once each, and dispatch carries no invented data", () => {
  const runtimeFiles = [
    ...collectSourceFiles("app"),
    ...collectSourceFiles("components"),
    ...collectSourceFiles("lib"),
  ];
  const combined = runtimeFiles.map((absolute) => fs.readFileSync(absolute, "utf8")).join("\n");
  assert.equal(countMatches(combined, /AW-16798915501\/gaeICL3T6OgcEK23rMo-/gu), 1, "WA_LABEL_OCCURRENCE_COUNT");
  assert.equal(countMatches(combined, /AW-16798915501\/-vmrCLjU6OgcEK23rMo-/gu), 1, "CALL_LABEL_OCCURRENCE_COUNT");
  const client = readSubject("lib/google-ads-conversion-client.ts");
  assert.doesNotMatch(client, /listingId|surface|phone|href|value\s*:|currency\s*:|transaction_id|fetch\s*\(|navigator\.sendBeacon/u, "INVENTED_OR_EXTRA_CONVERSION_DATA");
});

await check("H6", "H1 artifacts remain unchanged and prior English-agent gate remains green", () => {
  for (const [relative, expected] of Object.entries(freeze.protected_h1_artifacts)) {
    const absolute = path.join(subjectRoot, relative);
    assert.ok(fs.existsSync(absolute), `H1_ARTIFACT_MISSING:${relative}`);
    assert.equal(sha256File(absolute), expected, `H1_ARTIFACT_DRIFT:${relative}`);
  }
  const priorGate = spawnSync(
    process.execPath,
    ["--import", "./scripts/ts-resolve.mjs", path.join(gateRoot, "scripts/english-rent-agent-acceptance.mjs"), "--subject-root", subjectRoot],
    { cwd: subjectRoot, encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(priorGate.status, 0, `PRIOR_AGENT_GATE_RED:${(priorGate.stderr || priorGate.stdout).slice(0, 800)}`);
  assert.match(priorGate.stdout, /RESULT:PASS:12\/12/u, "PRIOR_AGENT_GATE_RESULT_DRIFT");
});

await check("H7", "complete unit suite remains green", () => {
  const unit = spawnSync("npm", ["run", "test:unit"], {
    cwd: subjectRoot,
    encoding: "utf8",
    timeout: 90_000,
    env: { ...process.env, CI: "1" },
  });
  assert.equal(unit.status, 0, `UNIT_SUITE_RED:${(unit.stderr || unit.stdout).slice(0, 1000)}`);
});

await check("H8", "H2 diff is limited to verifier artifacts and click-conversion integration", () => {
  const diff = spawnSync("git", ["diff", "--name-only", `${baseline}...HEAD`], {
    cwd: subjectRoot,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(diff.status, 0, `DIFF_ENUMERATION_ERROR:${diff.stderr.trim()}`);
  const allowedExact = new Set([
    "components/EnglishContact.tsx",
    "lib/google-ads-conversion-client.ts",
    "lib/google-ads-conversion-core.ts",
    "scripts/fixtures/google-ads-conversion-h2-v1.json",
    "scripts/google-ads-conversion-h2-acceptance.mjs",
    "tasks/TASK-GOOGLE-ADS-CONVERSION-H2-V1.baseline-red.txt",
    "tasks/TASK-GOOGLE-ADS-CONVERSION-H2-V1.freeze.json",
    "tasks/TASK-GOOGLE-ADS-CONVERSION-H2-V1.json"
  ]);
  const changed = diff.stdout.trim() ? diff.stdout.trim().split("\n") : [];
  const forbidden = changed.filter(
    (relative) => !allowedExact.has(relative) && !/^scripts\/google-ads-conversion-h2-[a-z0-9-]+\.test\.mjs$/u.test(relative)
  );
  assert.deepEqual(forbidden, [], `OUT_OF_SCOPE_DIFF:${forbidden.join(",")}`);
});

const total = 9;
console.log(`RESULT:${failures.length === 0 ? "PASS" : "FAIL"}:${passed}/${total}`);
for (const failure of failures) console.log(`FINDING:${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;

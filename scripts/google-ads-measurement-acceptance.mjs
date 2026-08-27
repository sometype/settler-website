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
const baseline = "97035d0a007d29dd58000e56ddcd1c42bb8796c0";
const freeze = JSON.parse(
  fs.readFileSync(path.join(gateRoot, "tasks/TASK-GOOGLE-ADS-MEASUREMENT-V1.freeze.json"), "utf8")
);
const fixtures = JSON.parse(
  fs.readFileSync(path.join(gateRoot, "scripts/fixtures/google-ads-measurement-v1.json"), "utf8")
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
  assert.equal(model.tag_id, "AW-16798915501", `TAG_ID:${String(model.tag_id)}`);
  assert.equal(model.tag_occurrences, 1, `TAG_OCCURRENCES:${String(model.tag_occurrences)}`);
  assert.deepEqual(model.tag_routes, ["en"], `TAG_ROUTE_SCOPE:${model.tag_routes.join(",")}`);
  for (const key of ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]) {
    assert.equal(
      model.consent_default?.[key],
      "denied",
      `CONSENT_DEFAULT_NOT_DENIED:${key}=${String(model.consent_default?.[key])}`
    );
  }
  assert.equal(model.consent_before_config, true, "CONSENT_NOT_BEFORE_CONFIG");
  assert.equal(
    model.consent_update_calls,
    0,
    `CONSENT_UPDATE_WITHOUT_CHOICE:${String(model.consent_update_calls)}`
  );
  assert.equal(
    model.conversion_dispatch_claims,
    0,
    `BASE_TAG_FALSE_CONVERSION_CLAIM:${String(model.conversion_dispatch_claims)}`
  );
  assert.equal(model.existing_contact_attribution_preserved, true, "CONTACT_ATTRIBUTION_DRIFT");
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

await check("G0", "frozen artifacts are intact and approved wrong states are observed red", () => {
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

await check("G1", "exact tag ID and four denied Consent Mode defaults come from one tested core", async () => {
  const relative = "lib/google-ads-measurement-core.ts";
  assert.ok(fs.existsSync(path.join(subjectRoot, relative)), `MISSING:${relative}`);
  const core = await import(`${pathToFileURL(path.join(subjectRoot, relative)).href}?gate=${Date.now()}`);
  assert.equal(core.GOOGLE_ADS_ID, "AW-16798915501", "GOOGLE_ADS_ID_WRONG");
  assert.deepEqual(core.GOOGLE_CONSENT_DEFAULT, {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
});

await check("G2", "no consent update or conversion claim exists before a separate consent/label task", () => {
  const measurementPaths = [
    "app/(en)/layout.tsx",
    "components/EnglishGoogleAdsMeasurement.tsx",
    "lib/google-ads-measurement-core.ts",
  ];
  const combined = measurementPaths
    .filter((relative) => fs.existsSync(path.join(subjectRoot, relative)))
    .map(readSubject)
    .join("\n");
  assert.doesNotMatch(combined, /gtag\s*\(\s*["']consent["']\s*,\s*["']update["']/u, "CONSENT_UPDATE_WITHOUT_CHOICE");
  assert.doesNotMatch(combined, /["']granted["']/u, "UNCONDITIONAL_CONSENT_GRANTED");
  assert.doesNotMatch(combined, /gtag\s*\(\s*["']event["']\s*,\s*["']conversion["']/u, "CONVERSION_EVENT_WITHOUT_LABELS");
  assert.doesNotMatch(combined, /send_to\s*:|GOOGLE_ADS_(?:WHATSAPP|CALL)_CONVERSION_LABEL|trackGoogleAdsConversion/u, "CONVERSION_CLAIM_WITHOUT_LABELS");
});

await check("G3", "denied consent executes before one Next-compatible English tag config", () => {
  const relative = "components/EnglishGoogleAdsMeasurement.tsx";
  const source = readSubject(relative);
  assert.match(source, /from\s+["']next\/script["']/u, "NEXT_SCRIPT_NOT_USED");
  assert.match(source, /strategy=["']beforeInteractive["']/u, "CONSENT_NOT_BEFORE_INTERACTIVE");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|eval\s*\(|new\s+Function|document\.createElement\s*\(\s*["']script/u, "CSP_UNSAFE_SCRIPT_MECHANISM");
  const consent = source.search(/gtag\s*\(\s*["']consent["']\s*,\s*["']default["']/u);
  const external = source.search(/googletagmanager\.com\/gtag\/js/u);
  const config = source.search(/gtag\s*\(\s*["']config["']/u);
  assert.ok(consent >= 0, "CONSENT_DEFAULT_CALL_MISSING");
  assert.ok(external >= 0, "GOOGLE_TAG_LOADER_MISSING");
  assert.ok(config >= 0, "GOOGLE_TAG_CONFIG_MISSING");
  assert.ok(consent < external && consent < config, "CONSENT_NOT_ORDERED_BEFORE_TAG_CONFIG");
  assert.equal(countMatches(source, /gtag\s*\(\s*["']config["']/gu), 1, "CONFIG_CALL_NOT_EXACTLY_ONE");
  assert.match(source, /GOOGLE_CONSENT_DEFAULT/u, "CONSENT_DEFAULT_NOT_FROM_TESTED_CORE");
  assert.match(source, /GOOGLE_ADS_ID/u, "TAG_ID_NOT_FROM_TESTED_CORE");
});

await check("G4", "tag is mounted exactly once on English routes and never on Georgian routes", () => {
  const routeMounts = [];
  for (const absolute of collectSourceFiles("app")) {
    const relative = path.relative(subjectRoot, absolute);
    const source = fs.readFileSync(absolute, "utf8");
    if (/EnglishGoogleAdsMeasurement|googletagmanager\.com\/gtag\/js|AW-16798915501/u.test(source)) {
      routeMounts.push(relative);
    }
  }
  assert.deepEqual(routeMounts, ["app/(en)/layout.tsx"], `TAG_ROUTE_FILES:${routeMounts.join(",")}`);
  const enLayout = readSubject("app/(en)/layout.tsx");
  assert.equal(countMatches(enLayout, /<EnglishGoogleAdsMeasurement\b/gu), 1, "ENGLISH_TAG_MOUNT_COUNT_WRONG");
  assert.doesNotMatch(enLayout, /NEXT_PUBLIC_GOOGLE/u, "PUBLIC_ENV_AUTHORITY_FORBIDDEN");
});

await check("G5", "runtime has one tag loader, one exact ID literal, and no duplicate authority", () => {
  const runtimeFiles = [
    ...collectSourceFiles("app"),
    ...collectSourceFiles("components"),
    ...collectSourceFiles("lib"),
  ];
  const combined = runtimeFiles.map((absolute) => fs.readFileSync(absolute, "utf8")).join("\n");
  assert.equal(countMatches(combined, /googletagmanager\.com\/gtag\/js/gu), 1, "TAG_LOADER_NOT_EXACTLY_ONE");
  assert.equal(countMatches(combined, /AW-16798915501/gu), 1, "GOOGLE_ADS_ID_LITERAL_NOT_EXACTLY_ONE");
  assert.doesNotMatch(combined, /AW-(?!16798915501)\d{6,}/u, "ALTERNATE_GOOGLE_ADS_ID_PRESENT");
  const measurementCombined = [
    "components/EnglishGoogleAdsMeasurement.tsx",
    "lib/google-ads-measurement-core.ts",
  ].map(readSubject).join("\n");
  assert.doesNotMatch(measurementCombined, /console\.(?:log|info|debug)\s*\(/u, "MEASUREMENT_DEBUG_LOG_PRESENT");
});

await check("G6", "existing contact attribution, URLs, and English/Georgian contracts remain frozen", () => {
  for (const [relative, expected] of Object.entries(freeze.protected_existing_contracts)) {
    const absolute = path.join(subjectRoot, relative);
    assert.ok(fs.existsSync(absolute), `PROTECTED_CONTRACT_MISSING:${relative}`);
    assert.equal(sha256File(absolute), expected, `PROTECTED_CONTRACT_DRIFT:${relative}`);
  }
  const priorGate = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/ts-resolve.mjs",
      path.join(gateRoot, "scripts/english-rent-agent-acceptance.mjs"),
      "--subject-root",
      subjectRoot,
    ],
    { cwd: subjectRoot, encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(priorGate.status, 0, `PRIOR_AGENT_GATE_RED:${(priorGate.stderr || priorGate.stdout).slice(0, 800)}`);
  assert.match(priorGate.stdout, /RESULT:PASS:12\/12/u, "PRIOR_AGENT_GATE_RESULT_DRIFT");
});

await check("G7", "complete unit suite remains green", () => {
  const unit = spawnSync("npm", ["run", "test:unit"], {
    cwd: subjectRoot,
    encoding: "utf8",
    timeout: 90_000,
    env: { ...process.env, CI: "1" },
  });
  assert.equal(unit.status, 0, `UNIT_SUITE_RED:${(unit.stderr || unit.stdout).slice(0, 1000)}`);
});

await check("G8", "candidate diff is limited to verifier artifacts and base-tag integration", () => {
  const diff = spawnSync("git", ["diff", "--name-only", `${baseline}...HEAD`], {
    cwd: subjectRoot,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(diff.status, 0, `DIFF_ENUMERATION_ERROR:${diff.stderr.trim()}`);
  const allowedExact = new Set([
    "app/(en)/layout.tsx",
    "components/EnglishGoogleAdsMeasurement.tsx",
    "lib/google-ads-measurement-core.ts",
    "scripts/fixtures/google-ads-measurement-v1.json",
    "scripts/google-ads-measurement-acceptance.mjs",
    "tasks/TASK-GOOGLE-ADS-MEASUREMENT-V1.baseline-red.txt",
    "tasks/TASK-GOOGLE-ADS-MEASUREMENT-V1.freeze.json",
    "tasks/TASK-GOOGLE-ADS-MEASUREMENT-V1.json"
  ]);
  const changed = diff.stdout.trim() ? diff.stdout.trim().split("\n") : [];
  const forbidden = changed.filter(
    (relative) => !allowedExact.has(relative) && !/^scripts\/google-ads-measurement-[a-z0-9-]+\.test\.mjs$/u.test(relative)
  );
  assert.deepEqual(forbidden, [], `OUT_OF_SCOPE_DIFF:${forbidden.join(",")}`);
});

const total = 9;
console.log(`RESULT:${failures.length === 0 ? "PASS" : "FAIL"}:${passed}/${total}`);
for (const failure of failures) console.log(`FINDING:${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const gateRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const rootFlag = args.indexOf("--subject-root");
const subjectRoot = path.resolve(rootFlag >= 0 ? args[rootFlag + 1] : process.cwd());
const baseline = "09d8793589ee1037b86b4be88bc246e8a5c1024c";
const freeze = JSON.parse(
  fs.readFileSync(path.join(gateRoot, "tasks/TASK-GOOGLE-ADS-RUNTIME-H3-V1.freeze.json"), "utf8")
);
const fixtures = JSON.parse(
  fs.readFileSync(path.join(gateRoot, "scripts/fixtures/google-ads-runtime-h3-v1.json"), "utf8")
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
  assert.equal(model.carrier, "native_script", `EXECUTION_CARRIER:${model.carrier}`);
  assert.equal(model.data_layer_defined, true, "DATA_LAYER_NOT_DEFINED");
  assert.equal(model.gtag_defined, true, "GTAG_NOT_DEFINED");
  for (const key of ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]) {
    assert.equal(model.consent_defaults[key], "denied", `CONSENT_DEFAULT_${key}:${String(model.consent_defaults[key])}`);
  }
  assert.ok(
    model.consent_index >= 0 && model.config_index > model.consent_index,
    `CONSENT_CONFIG_ORDER:${String(model.consent_index)}:${String(model.config_index)}`
  );
  assert.equal(model.loader_count, 1, `LOADER_COUNT:${String(model.loader_count)}`);
  assert.equal(model.config_id, "AW-16798915501", `CONFIG_ID:${String(model.config_id)}`);
  assert.equal(model.georgian_reach, 0, `GEORGIAN_REACH:${String(model.georgian_reach)}`);
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

await check("R0", "H3 verifier artifacts are intact and approved wrong states are observed red", () => {
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

let measurementCore = null;
await check("R1", "native bootstrap executes and defines ordered denied consent before exact config", async () => {
  measurementCore = await import(
    `${pathToFileURL(path.join(subjectRoot, "lib/google-ads-measurement-core.ts")).href}?gate=${Date.now()}`
  );
  assert.equal(measurementCore.GOOGLE_ADS_ID, "AW-16798915501", "GOOGLE_ADS_ID_DRIFT");
  assert.equal(typeof measurementCore.ENGLISH_GOOGLE_ADS_BOOTSTRAP, "string", "BOOTSTRAP_EXPORT_MISSING");
  const context = { Date };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(measurementCore.ENGLISH_GOOGLE_ADS_BOOTSTRAP, context, { timeout: 1_000 });
  assert.ok(Array.isArray(context.dataLayer), "DATA_LAYER_NOT_DEFINED");
  assert.equal(typeof context.gtag, "function", "GTAG_NOT_DEFINED");
  const calls = context.dataLayer.map((entry) => Array.from(entry));
  const consentIndex = calls.findIndex((call) => call[0] === "consent" && call[1] === "default");
  const configIndex = calls.findIndex((call) => call[0] === "config");
  assert.ok(consentIndex >= 0 && configIndex > consentIndex, `CONSENT_CONFIG_ORDER:${consentIndex}:${configIndex}`);
  assert.deepEqual(
    { ...calls[consentIndex][2] },
    {
      ad_storage: "denied",
      analytics_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    }
  );
  assert.deepEqual(calls[configIndex], ["config", "AW-16798915501"]);
  assert.equal(calls.filter((call) => call[0] === "consent" && call[1] === "update").length, 0, "CONSENT_UPDATE_PRESENT");
  assert.equal(calls.some((call) => JSON.stringify(call).includes("granted")), false, "UNCONDITIONAL_CONSENT_GRANT");
});

await check("R2", "measurement carrier is native script markup, not a Next queue", () => {
  const component = readSubject("components/EnglishGoogleAdsMeasurement.tsx");
  assert.doesNotMatch(component, /from\s+["']next\/script["']|<Script\b|strategy=/u, "NEXT_SCRIPT_CARRIER_PRESENT");
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|eval\s*\(|new\s+Function|document\.write/u, "DANGEROUS_SCRIPT_CONSTRUCTION");
  assert.equal(countMatches(component, /<script\b/gu), 2, "NATIVE_SCRIPT_COUNT");
  assert.equal(countMatches(component, /\{ENGLISH_GOOGLE_ADS_BOOTSTRAP\}/gu), 1, "BOOTSTRAP_CHILD_COUNT");
  assert.equal(countMatches(component, /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/gu), 1, "LOADER_SOURCE_COUNT");
  assert.match(component, /<script\b[\s\S]*?async[\s\S]*?src=\{`https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=\$\{GOOGLE_ADS_ID\}`\}[\s\S]*?<\/script>/u, "NATIVE_ASYNC_LOADER_MISSING");
});

await check("R3", "native measurement scripts are mounted exactly once inside the English head before body", () => {
  const layout = readSubject("app/(en)/layout.tsx");
  assert.equal(countMatches(layout, /<EnglishGoogleAdsMeasurement\s*\/>/gu), 1, "ENGLISH_MEASUREMENT_MOUNT_COUNT");
  const headStart = layout.indexOf("<head>");
  const mount = layout.indexOf("<EnglishGoogleAdsMeasurement />");
  const headEnd = layout.indexOf("</head>");
  const body = layout.indexOf("<body");
  assert.ok(headStart >= 0 && mount > headStart && headEnd > mount && body > headEnd, "MEASUREMENT_NOT_IN_PARSE_TIME_HEAD");
});

await check("R4", "Google Ads runtime authority remains English-only", () => {
  const englishPaths = new Set([
    path.join(subjectRoot, "app/(en)/layout.tsx"),
    path.join(subjectRoot, "components/EnglishGoogleAdsMeasurement.tsx"),
    path.join(subjectRoot, "lib/google-ads-measurement-core.ts"),
    path.join(subjectRoot, "lib/google-ads-conversion-core.ts"),
    path.join(subjectRoot, "lib/google-ads-conversion-client.ts"),
    path.join(subjectRoot, "components/EnglishContact.tsx"),
  ]);
  const otherSources = [
    ...collectSourceFiles("app"),
    ...collectSourceFiles("components"),
    ...collectSourceFiles("lib"),
  ].filter((absolute) => !englishPaths.has(absolute));
  const forbidden = otherSources.map((absolute) => fs.readFileSync(absolute, "utf8")).join("\n");
  assert.doesNotMatch(forbidden, /AW-16798915501|googletagmanager|EnglishGoogleAdsMeasurement|ENGLISH_GOOGLE_ADS_BOOTSTRAP|sendGoogleAdsConversion/u, "GOOGLE_ADS_REACH_OUTSIDE_ENGLISH_AUTHORITY");
});

await check("R5", "one exact loader and one exact config authority exist", () => {
  const runtime = [
    readSubject("app/(en)/layout.tsx"),
    readSubject("components/EnglishGoogleAdsMeasurement.tsx"),
    readSubject("lib/google-ads-measurement-core.ts"),
  ].join("\n");
  assert.equal(countMatches(runtime, /www\.googletagmanager\.com\/gtag\/js\?id=/gu), 1, "LOADER_COUNT");
  assert.equal(countMatches(runtime, /gtag\(["']config["']/gu), 1, "CONFIG_CALL_SOURCE_COUNT");
  assert.doesNotMatch(runtime, /consent["']\s*,\s*["']update|granted/u, "CONSENT_GRANT_OR_UPDATE_PRESENT");
});

await check("R6", "H2 conversion-click runtime and frozen evidence remain byte-identical", () => {
  for (const [relative, expected] of Object.entries(freeze.protected_h2_artifacts)) {
    const absolute = path.join(subjectRoot, relative);
    assert.ok(fs.existsSync(absolute), `H2_ARTIFACT_MISSING:${relative}`);
    assert.equal(sha256File(absolute), expected, `H2_ARTIFACT_DRIFT:${relative}`);
  }
});

await check("R7", "complete unit suite remains green", () => {
  const unit = spawnSync("npm", ["run", "test:unit"], {
    cwd: subjectRoot,
    encoding: "utf8",
    timeout: 90_000,
    env: { ...process.env, CI: "1" },
  });
  assert.equal(unit.status, 0, `UNIT_SUITE_RED:${(unit.stderr || unit.stdout).slice(0, 1_000)}`);
});

await check("R8", "H3 diff is limited to runtime execution repair and verifier artifacts", () => {
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
    "scripts/fixtures/google-ads-runtime-h3-v1.json",
    "scripts/google-ads-runtime-h3-acceptance.mjs",
    "tasks/TASK-GOOGLE-ADS-RUNTIME-H3-V1.baseline-red.txt",
    "tasks/TASK-GOOGLE-ADS-RUNTIME-H3-V1.freeze.json",
    "tasks/TASK-GOOGLE-ADS-RUNTIME-H3-V1.json"
  ]);
  const changed = diff.stdout.trim() ? diff.stdout.trim().split("\n") : [];
  const forbidden = changed.filter(
    (relative) => !allowedExact.has(relative) && !/^scripts\/google-ads-runtime-h3-[a-z0-9-]+\.test\.mjs$/u.test(relative)
  );
  assert.deepEqual(forbidden, [], `OUT_OF_SCOPE_DIFF:${forbidden.join(",")}`);
});

const total = 9;
console.log(`RESULT:${failures.length === 0 ? "PASS" : "FAIL"}:${passed}/${total}`);
for (const failure of failures) console.log(`FINDING:${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;

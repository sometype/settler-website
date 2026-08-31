#!/usr/bin/env node

/** Additive H2 acceptance: existing source-reading tests follow the Phase 1A
 * URL-neutral catalog route move without changing any assertion semantics. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "5794001270e0f31e3adddcd9753e0b532b96f911";
const OLD = "app/(ka)/page.tsx";
const NEXT = "app/(ka)/(catalog)/page.tsx";
const TESTS = [
  "scripts/pagination-hardening.test.mjs",
  "scripts/pagination.test.mjs",
  "scripts/tracking-phase-a.test.mjs",
];
const H1_FROZEN = {
  "scripts/seo-phase1a-acceptance.mjs": "e65fb3948c7bb7661e0d1e11e21bd4feeab46c5164a26e8aaf962b4f10a34670",
  "tasks/TASK-SEO-PHASE-1A-V1.json": "97fc798b27fee916ad2ad4c79356759f66f7969b176cee0c7719f8b1840fe91c",
  "tasks/TASK-SEO-PHASE-1A-V1.freeze.json": "42bad54808448f2ddfce8918ec41ca4b753047cdfe9a0ed8e07cf08b44576442",
  "tasks/TASK-SEO-PHASE-1A-V1.baseline-red.txt": "4b7b766f42fce0d47946694acad4d1ccfb2c7aa1f0531db844439d2f3693822d",
};
const H2_ARTIFACTS = [
  "scripts/seo-phase1a-route-move-tests.acceptance.mjs",
  "tasks/TASK-SEO-PHASE-1A-H2-V1.json",
  "tasks/TASK-SEO-PHASE-1A-H2-V1.freeze.json",
  "tasks/TASK-SEO-PHASE-1A-H2-V1.baseline-red.txt",
];
const allowedFinalCommit = new Set([...TESTS, ...H2_ARTIFACTS]);
const run = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const results = [];
function check(id, title, fn) {
  try { fn(); results.push({ id, title, ok: true, finding: "PASS" }); }
  catch (error) {
    results.push({ id, title, ok: false, finding: String(error?.message || error).replace(/\s+/g, " ").trim() });
  }
}

for (const [index, file] of TESTS.entries()) {
  check(`H${index + 1}`, `${file} follows the catalog route move and changes nothing else`, () => {
    const original = run(["show", `${BASELINE}:${file}`]);
    const oldCount = original.split(OLD).length - 1;
    assert.equal(oldCount, 1, `FROZEN_BASELINE_PATH_COUNT_DRIFT:${file}:${oldCount}`);
    const expected = original.split(OLD).join(NEXT);
    const actual = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(actual, expected, `TEST_ASSERTION_DRIFT_OR_OLD_ROUTE:${file}`);
  });
}

check("H4", "all old route references are gone and every replacement is exact", () => {
  for (const file of TESTS) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes(OLD), false, `STALE_CATALOG_SOURCE_PATH:${file}`);
    assert.equal(source.split(NEXT).length - 1, 1, `CATALOG_SOURCE_PATH_COUNT:${file}`);
  }
});

check("H5", "H1 frozen law is unchanged and the additive commit cannot touch H1 implementation", () => {
  for (const [file, expected] of Object.entries(H1_FROZEN)) {
    assert.equal(sha256(readFileSync(path.join(ROOT, file))), expected,
      `H1_FROZEN_ARTIFACT_DRIFT:${file}`);
  }
  const parent = run(["rev-parse", "HEAD^"]).trim();
  const changed = run(["diff", "--name-only", `${parent}..HEAD`]).split("\n").filter(Boolean);
  const outside = changed.filter((file) => !allowedFinalCommit.has(file));
  assert.deepEqual(outside, [], `H1_IMPLEMENTATION_DRIFT_IN_H2_COMMIT:${outside.join(",")}`);
});

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "RED"} ${result.id} ${result.title} :: ${result.finding}`);
}
const red = results.filter((result) => !result.ok).length;
console.log(`SUMMARY pass=${results.length - red} red=${red} total=${results.length}`);
process.exitCode = red;


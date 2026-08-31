#!/usr/bin/env node

/** Frozen transaction-bound acceptance for removing only Cloudflare
 * Turnstile from the owner email-verification entry step. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canRequestCode } from "../lib/uploadFlow.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "59b00bdac1dffd2048021d4cd8213cc855cd0cf3";
const FILES = {
  page: "app/(ka)/upload/page.tsx",
  component: "components/UploadFlow.tsx",
  route: "app/api/intake/[action]/route.ts",
  flow: "lib/uploadFlow.ts",
};
const ALLOWED = new Set([
  ...Object.values(FILES),
  "lib/turnstile.ts",
  "scripts/turnstile.test.mjs",
  "scripts/upload-flow.test.mjs",
  "scripts/upload-mobile.browser.mjs",
  "scripts/owner-verify-turnstile-removal.acceptance.mjs",
  "tasks/TASK-OWNER-VERIFY-TURNSTILE-REMOVAL-V1.json",
  "tasks/TASK-OWNER-VERIFY-TURNSTILE-REMOVAL-V1.freeze.json",
]);
const src = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [
  key, readFileSync(path.join(ROOT, rel), "utf8"),
]));
const results = [];
function check(id, title, fn) {
  try { fn(); results.push({ id, title, ok: true, finding: "PASS" }); }
  catch (error) { results.push({ id, title, ok: false, finding: String(error?.message || error).replace(/\s+/g, " ").trim() }); }
}

check("R1", "valid email can request a code without a bot credential", () => {
  assert.equal(canRequestCode({ emailValid: true, configOk: true, busy: false }), true,
    "ENTRY_STILL_REQUIRES_BOT_CREDENTIAL");
});

check("R2", "the /upload runtime has no Turnstile script, widget, env, or copy", () => {
  const runtime = Object.values(src).join("\n");
  assert.equal([
    /turnstile/i, /cf-turnstile/i, /challenges\.cloudflare\.com/i,
    /უსაფრთხოების შემოწმება[^\n]*(იტვირთება|მიმდინარეობს|ვერ|დასრულებულა)/,
  ].some((pattern) => pattern.test(runtime)), false,
  "UPLOAD_RUNTIME_STILL_CONTAINS_TURNSTILE_AUTHORITY");
});

check("R3", "verify-start client payload contains email and idempotency only", () => {
  const start = src.component.slice(src.component.indexOf("const startVerify"), src.component.indexOf("const checkCode"));
  assert.ok(start.includes('call("verify-start"'), "VERIFY_START_CALL_MISSING");
  assert.ok(start.includes("email: email.trim()"), "VERIFY_START_EMAIL_MISSING");
  assert.ok(start.includes("idem:"), "VERIFY_START_IDEMPOTENCY_MISSING");
  assert.equal(/turnstile|robot|რობოტ/i.test(start), false,
    "VERIFY_START_STILL_SENDS_OR_REQUIRES_BOT_TOKEN");
});

check("R4", "verify-start proxy forwards without bot-token validation", () => {
  assert.equal(/turnstile|siteverify|challenges\.cloudflare\.com/i.test(src.route), false,
    "VERIFY_START_PROXY_STILL_ENFORCES_TURNSTILE");
  assert.ok(src.route.includes('if (action === "verify-start")') && src.route.includes("body.client_ip = ip"),
    "VERIFY_START_IP_RATE_LIMIT_INPUT_WAS_REMOVED");
});

check("R5", "emailed code remains mandatory and invalid-code semantics remain", () => {
  assert.ok(src.component.includes('call("verify-check", { token: codeToken, code: code.trim() })'),
    "VERIFY_CHECK_NO_LONGER_SENDS_TOKEN_AND_CODE");
  assert.ok(src.route.includes('"verify-check": "/verify/check"'), "VERIFY_CHECK_PROXY_ROUTE_MISSING");
  assert.equal((src.component.match(/setSession\(s\)/g) || []).length, 1,
    "VERIFIED_SESSION_IS_NOT_EXCLUSIVELY_MINTED_AFTER_CODE_CHECK");
});

check("R6", "server-only signed proxy remains the command authority", () => {
  assert.ok(src.route.includes('import { signedIntakeCall } from "@/lib/intake"'), "SIGNED_PROXY_IMPORT_MISSING");
  assert.ok(src.route.includes("signedIntakeCall(path, body, { idemKey })"), "SIGNED_PROXY_CALL_MISSING");
});

check("R7", "rate-limit, client-IP, body-cap and idempotency semantics remain", () => {
  assert.ok(src.route.includes('import { mapIntakeError } from "@/lib/uploadErrors"'), "RATE_LIMIT_ERROR_AUTHORITY_MISSING");
  assert.ok(src.route.includes("body.client_ip = ip"), "CLIENT_IP_FORWARDING_MISSING");
  assert.ok(src.route.includes("const MAX_BODY_BYTES = 16 * 1024"), "PROXY_BODY_CAP_MISSING");
  assert.ok(src.route.includes("const idemKey =") && src.route.includes("delete body.idem"), "IDEMPOTENCY_FORWARDING_MISSING");
});

check("R8", "non-bot entry guards still fail closed", () => {
  assert.equal(canRequestCode({ emailValid: false, configOk: true, busy: false }), false);
  assert.equal(canRequestCode({ emailValid: true, configOk: false, busy: false }), false);
  assert.equal(canRequestCode({ emailValid: true, configOk: true, busy: true }), false);
});

check("R9", "candidate changes remain inside the frozen file boundary", () => {
  const run = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const changed = new Set([
    ...run(["diff", "--name-only", `${BASELINE}..HEAD`]).split("\n").filter(Boolean),
    ...run(["diff", "--name-only"]).split("\n").filter(Boolean),
    ...run(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean),
  ]);
  const outside = [...changed].filter((rel) => !ALLOWED.has(rel));
  assert.deepEqual(outside, [], `OUT_OF_SCOPE_FILES:${outside.join(",")}`);
});

for (const result of results) console.log(`${result.ok ? "PASS" : "RED"} ${result.id} ${result.title} :: ${result.finding}`);
const red = results.filter((result) => !result.ok).length;
console.log(`SUMMARY pass=${results.length - red} red=${red} total=${results.length}`);
process.exitCode = red;


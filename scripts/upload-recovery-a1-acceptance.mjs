#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const IDS = {
  orphan: "UPLOAD_RECOVERY_ORPHAN_DROPPED",
  deadlock: "UPLOAD_RECOVERY_HELD_DEADLOCK",
  generic: "UPLOAD_RECOVERY_GENERIC_FIELD_MASK",
  unfenced: "UPLOAD_RECOVERY_UNFENCED_RESET",
  foreign: "UPLOAD_RECOVERY_FOREIGN_RESET",
};
const BASELINE = Object.values(IDS);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function has(name) {
  return process.argv.includes(name);
}
function die(detail) {
  process.stdout.write(`${JSON.stringify({ status: "instrument_error", detail })}\n`);
  process.exit(2);
}
function slot(over = {}) {
  return {
    id: over.id ?? "slot-1",
    name: over.name ?? "phone.jpg",
    size: over.size ?? 10,
    type: over.type ?? "image/jpeg",
    position: over.position ?? null,
    state: over.state ?? "pending",
    permanent: over.permanent ?? false,
    hold: over.hold ?? false,
  };
}
function sourceFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?def\\s+${name}\\s*\\(`));
  if (start < 0) return "";
  const tail = source.slice(start);
  const next = tail.slice(1).search(/\n(?:async\s+)?def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(|\n@app\./);
  return next < 0 ? tail : tail.slice(0, next + 1);
}
function backendText(opts) {
  if (opts.file) {
    if (!existsSync(opts.file)) die(`backend file missing: ${opts.file}`);
    const api = readFileSync(opts.file, "utf8");
    const schemaPath = opts.schemaFile;
    const schema = schemaPath && existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";
    return { api, schema };
  }
  if (!opts.repo || !opts.rev) die("backend repo and revision are required");
  try {
    const show = (file) => execFileSync("git", ["-C", opts.repo, "show", `${opts.rev}:${file}`], { encoding: "utf8" });
    const api = show("intake_api.py");
    let schema = "";
    for (const file of ["schema_owner_upload_recovery.sql", "schema_owner_verify2.sql", "schema_owner_intake.sql"]) {
      try {
        schema += `\n${execFileSync("git", ["-C", opts.repo, "show", `${opts.rev}:${file}`], {
          encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
        })}`;
      } catch { /* optional candidate migration */ }
    }
    return { api, schema };
  } catch (error) {
    die(`cannot read backend subject: ${error?.message ?? error}`);
  }
}

async function frontendSubject(root, honest) {
  if (honest) {
    const fixture = await import("./fixtures/upload-recovery-a1-honest.mjs");
    return { mod: fixture, component: fixture.HONEST_COMPONENT, route: fixture.HONEST_ROUTE };
  }
  if (!root || !existsSync(root)) die(`frontend subject missing: ${root}`);
  const lib = path.join(root, "lib/uploadFlow.ts");
  const component = path.join(root, "components/UploadFlow.tsx");
  const route = path.join(root, "app/api/intake/[action]/route.ts");
  for (const file of [lib, component, route]) if (!existsSync(file)) die(`subject artifact missing: ${file}`);
  try {
    return {
      mod: await import(`${pathToFileURL(lib).href}?acceptance=${Date.now()}`),
      component: readFileSync(component, "utf8"),
      route: readFileSync(route, "utf8"),
    };
  } catch (error) {
    die(`frontend import failed: ${error?.stack ?? error}`);
  }
}

function checkFrontend({ mod, component, route }) {
  const findings = [];
  const uploading = slot({ id: "old", position: 0, state: "uploading", hold: false });
  const restored = mod.restorableSlots([uploading]);
  const pending = mod.parseStatusResponse(
    { submission_id: 42, status: "draft", positions: [], pending_positions: [0] }, 42,
  );
  const committed = mod.parseStatusResponse(
    { submission_id: 42, status: "draft", positions: [0], pending_positions: [] }, 42,
  );
  const pendingOut = pending && mod.reconcileSlots(restored, pending);
  const committedOut = committed && mod.reconcileSlots(restored, committed);
  if (
    restored.length !== 1 || restored[0].position !== 0 || !restored[0].hold ||
    !pendingOut?.ok || !committedOut?.ok
  ) findings.push(IDS.orphan);

  const held = slot({ id: "held", position: 0, state: "failed", hold: true });
  const after = mod.reconcileSlots([held], pending);
  const directive = typeof mod.recoveryDirective === "function"
    ? mod.recoveryDirective(after?.ok ? after.slots : [held], new Set())
    : null;
  const componentPolls = /recoveryDirective\s*\(/.test(component) &&
    /set(?:Timeout|Interval)[\s\S]{0,180}reconcile|reconcile[\s\S]{0,180}set(?:Timeout|Interval)/.test(component);
  const componentDoesNotBlindlyFinish = !/reconciledRef\.current\s*=\s*true\s*;\s*setReconciled\(true\)/s.test(component);
  const noFileRetryHidden = directive && Array.isArray(directive.retryIds) && directive.retryIds.length === 0;
  if (
    !after?.ok || !mod.needsReconcile(after.slots) ||
    !directive || directive.complete !== false || directive.poll !== true || directive.canReset !== true ||
    !noFileRetryHidden || !componentPolls || !componentDoesNotBlindlyFinish
  ) findings.push(IDS.deadlock);

  const mapperStart = route.indexOf("function mapError");
  const mapper = mapperStart >= 0 ? route.slice(mapperStart, route.indexOf("\n}", mapperStart) + 2) : "";
  const galleryCopy = /gallery\s*:/.test(route) && /ფოტო|ატვირთ/.test(route);
  // Detail strings are not a complete protocol: an unexpected 5xx/400 from
  // the status action has no photo keyword and currently falls through to the
  // unrelated field copy. The mapper must know the action that failed.
  const actionAware = /function\s+mapError\s*\([^)]*action/.test(mapper) &&
    /action\s*={2,3}\s*["']status["'][\s\S]{0,160}ERRORS\.gallery/.test(mapper) &&
    /mapError\s*\(\s*res\.status\s*,\s*res\.detail\s*,\s*action\s*\)/.test(route);
  if (!galleryCopy || !actionAware) findings.push(IDS.generic);

  return findings;
}

function checkBackend({ api, schema }, component, route) {
  const findings = [];
  const reset = sourceFunction(api, "_submission_gallery_reset_blocking");
  const claim = sourceFunction(api, "_upload_claim_blocking");
  const ingest = sourceFunction(api, "_upload_ingest_blocking");
  const epoch = /gallery_(?:epoch|generation)|reset_(?:epoch|generation)/i;
  const hasRoute = /@app\.post\(["']\/submission\/gallery-reset["']\)/.test(api);
  const proxyRoute = /["']gallery-reset["']\s*:\s*["']\/submission\/gallery-reset["']/.test(route);
  const componentUsesReset = /call\(["']gallery-reset["']/.test(component);

  // Late-worker control: a reset that merely DELETEs current rows is unsafe.
  // The worker already owns an in-memory claimed ticket and can commit after
  // that DELETE. A durable generation/epoch must advance under the draft lock,
  // travel with the claimed ticket, and be checked again by ingest under lock.
  const resetAdvances = epoch.test(reset) && /FOR\s+UPDATE/i.test(reset) &&
    /UPDATE\s+listing_submissions/i.test(reset) && /DELETE\s+FROM\s+submission_images/i.test(reset) &&
    /DELETE\s+FROM\s+submission_upload_tickets/i.test(reset);
  const ticketBound = epoch.test(schema) && epoch.test(claim) && epoch.test(ingest);
  const ingestFenced = /FOR\s+UPDATE/i.test(ingest) && /(409|conflict|stale|reset)/i.test(ingest);
  if (!(hasRoute && proxyRoute && componentUsesReset && resetAdvances && ticketBound && ingestFenced)) {
    findings.push(IDS.unfenced);
  }

  // Foreign-owner control: reset ownership is checked inside the same locked
  // transaction and a foreign id is indistinguishable from a missing id.
  const foreignSafe = /session_claims/.test(reset) && /FOR\s+UPDATE/i.test(reset) &&
    /email/.test(reset) && /claims/.test(reset) && /(404|no such submission)/i.test(reset) &&
    /status/.test(reset) && /draft/.test(reset);
  if (!(hasRoute && foreignSafe)) findings.push(IDS.foreign);
  return findings;
}

const expect = arg("--expect");
if (!expect) die("--expect is required");
const honestFrontend = has("--honest-target") || has("--frontend-honest");
const front = await frontendSubject(arg("--subject"), honestFrontend);
let backend;
if (has("--honest-target")) {
  const fixture = await import("./fixtures/upload-recovery-a1-honest.mjs");
  backend = { api: fixture.HONEST_BACKEND, schema: fixture.HONEST_SCHEMA };
} else {
  backend = backendText({
    file: arg("--backend-file"),
    schemaFile: arg("--backend-schema"),
    repo: arg("--backend-repo"),
    rev: arg("--backend-rev"),
  });
}

const findings = [...new Set([
  ...checkFrontend(front),
  ...checkBackend(backend, front.component, front.route),
])];
const wanted = expect === "red" ? BASELINE :
  expect === "green" ? [] : (arg("--expect-findings", "").split(",").filter(Boolean));
const ok = findings.length === wanted.length && wanted.every((id) => findings.includes(id));
process.stdout.write(`${JSON.stringify({ status: ok ? "pass" : "fail", findings })}\n`);
process.exit(ok ? 0 : 1);

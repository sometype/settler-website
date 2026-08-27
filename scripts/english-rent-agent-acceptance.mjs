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
const freezePath = path.join(gateRoot, "tasks/TASK-EN-RENT-MEPATRONE-AGENT-V1.freeze.json");
const freeze = JSON.parse(fs.readFileSync(freezePath, "utf8"));
const failures = [];
let passed = 0;

function read(relative) {
  return fs.readFileSync(path.join(subjectRoot, relative), "utf8");
}

function sha256File(relative) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(subjectRoot, relative))).digest("hex");
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

const mkhedruli = /[\u10A0-\u10FF]/u;
const englishFiles = [
  "app/(en)/layout.tsx",
  "app/(en)/en/rent/page.tsx",
  "app/(en)/en/listing/[id]/page.tsx",
  "components/EnglishListingCard.tsx",
  "components/EnglishContact.tsx",
  "components/EnglishListingImage.tsx",
];

await check("G1", "exact Mepatrone agent authority and fail-closed resolver", async () => {
  const relative = "lib/english-agent-contact-core.ts";
  assert.ok(fs.existsSync(path.join(subjectRoot, relative)), `${relative} missing`);
  const moduleUrl = `${pathToFileURL(path.join(subjectRoot, relative)).href}?gate=${Date.now()}`;
  const contactModule = await import(moduleUrl);
  assert.equal(typeof contactModule.buildEnglishAgentContact, "function", "buildEnglishAgentContact export missing");

  const contact = contactModule.buildEnglishAgentContact("+995555121150", 12411);
  assert.ok(contact, "approved number did not produce contact links");
  assert.equal(contact.phoneE164, "+995555121150");
  assert.equal(contact.displayPhone, "+995 555 12 11 50");
  assert.equal(contact.callHref, "tel:+995555121150");
  const whatsapp = new URL(contact.whatsappHref);
  assert.equal(whatsapp.protocol, "https:");
  assert.equal(whatsapp.hostname, "wa.me");
  assert.equal(whatsapp.pathname, "/995555121150");
  const message = whatsapp.searchParams.get("text") ?? "";
  assert.match(message, /listing\s+12411/iu, "WhatsApp message does not identify listing 12411");
  assert.match(message, /https:\/\/mepatrone\.com\/en\/listing\/12411/u, "WhatsApp message lacks canonical listing URL");

  for (const invalid of [undefined, null, "", " ", "995555121150", "+995555121151", "+995 555 12 11 50", "+9955551211500"]) {
    assert.equal(contactModule.buildEnglishAgentContact(invalid, 12411), null, `invalid authority accepted: ${String(invalid)}`);
  }
  for (const invalidId of [0, -1, 1.5, Number.NaN]) {
    assert.equal(contactModule.buildEnglishAgentContact("+995555121150", invalidId), null, `invalid listing id accepted: ${String(invalidId)}`);
  }
});

await check("G2", "server-side environment authority has no public or owner fallback", () => {
  const relative = "lib/english-agent-contact.ts";
  const source = read(relative);
  assert.match(source, /process\.env\.MEPATRONE_EN_AGENT_PHONE_E164/u, "server authority must read MEPATRONE_EN_AGENT_PHONE_E164");
  assert.match(source, /buildEnglishAgentContact/u, "server authority must use the tested resolver");
  assert.doesNotMatch(source, /NEXT_PUBLIC/u, "agent authority must not use NEXT_PUBLIC configuration");
  assert.doesNotMatch(source, /owner|listing\.phone|secondary_phones/iu, "server authority contains an owner-phone fallback");

  const client = read("components/EnglishContact.tsx");
  assert.doesNotMatch(client, /process\.env|english-agent-contact(?:\.server)?["']/u, "client component imports server authority");
});

await check("G3", "English contact UI makes the exact truthful Mepatrone service promise", () => {
  const source = read("components/EnglishContact.tsx");
  assert.match(source, /Message a Mepatrone agent on WhatsApp/u, "Mepatrone WhatsApp CTA missing");
  assert.match(source, /Call a Mepatrone agent/u, "Mepatrone call CTA missing");
  assert.ok(
    source.indexOf("Message a Mepatrone agent on WhatsApp") < source.indexOf("Call a Mepatrone agent"),
    "WhatsApp must precede Call"
  );
  assert.match(
    source,
    /An English-speaking Mepatrone agent can contact the owner, confirm availability, arrange a viewing, and assist with the rental process\./u,
    "approved service promise missing or changed"
  );
  assert.match(source, /contact\.displayPhone/u, "approved display number is not rendered");
  assert.match(source, /contact\.whatsappHref/u, "approved WhatsApp link is not rendered");
  assert.match(source, /contact\.callHref/u, "approved call link is not rendered");
  assert.doesNotMatch(source, /\bSettler\b/u, "internal Settler brand leaked into English contact UI");
  assert.doesNotMatch(source, mkhedruli, "Mkhedruli leaked into English contact UI");
});

await check("G4", "missing or invalid agent authority fails closed without contact links", () => {
  const source = read("components/EnglishContact.tsx");
  assert.match(source, /contact\??:\s*EnglishAgentContact\s*\|\s*null/u, "contact prop is not explicitly nullable");
  assert.match(source, /if\s*\(\s*!contact\s*\)/u, "missing contact is not handled before links render");
  assert.match(source, /Mepatrone agent contact is temporarily unavailable\./u, "fail-closed message missing");
  assert.doesNotMatch(source, /\bphone\??\s*:/u, "EnglishContact still accepts a raw phone prop");
  assert.doesNotMatch(source, /normalizedPhone|digitsOnly|listing\.phone|owner.{0,30}(?:phone|number)/iu, "raw/owner phone fallback remains in contact UI");
});

await check("G5", "English cards never receive or expose owner contact data", () => {
  const source = read("components/EnglishListingCard.tsx");
  assert.match(source, /getEnglishAgentContact\(listing\.id\)/u, "card does not resolve agent contact by listing id");
  assert.match(source, /<EnglishContact[\s\S]*?listingId=\{listing\.id\}/u, "card does not pass listing attribution");
  assert.match(source, /<EnglishContact[\s\S]*?contact=\{agentContact\}/u, "card does not pass the resolved agent contact");
  assert.doesNotMatch(source, /listing\.(?:phone|secondary_phones|has_phone)|<EnglishContact[^>]*\bphone=/u, "card still consumes owner contact data");
});

await check("G6", "English details never receive or expose owner contact data", () => {
  const source = read("app/(en)/en/listing/[id]/page.tsx");
  assert.match(source, /getEnglishAgentContact\(listing\.id\)/u, "detail does not resolve agent contact by listing id");
  assert.match(source, /<EnglishContact[\s\S]*?listingId=\{listing\.id\}/u, "detail does not pass listing attribution");
  assert.match(source, /<EnglishContact[\s\S]*?contact=\{agentContact\}/u, "detail does not pass the resolved agent contact");
  assert.doesNotMatch(source, /listing\.(?:phone|secondary_phones)|<EnglishContact[^>]*\bphone=/u, "detail still consumes owner contact data");
});

await check("G7", "English public copy is Mepatrone-agent only and remains zero-Mkhedruli", () => {
  const combined = englishFiles.map((relative) => `${relative}\n${read(relative)}`).join("\n");
  for (const forbidden of [
    /\bSettler\b/u,
    /Contact the property owner directly/iu,
    /Message owner on WhatsApp/iu,
    /Call owner/iu,
    /direct owner contact/iu,
    /contact property owners directly/iu,
    /Mepatrone is not an agency or concierge service/iu,
  ]) {
    assert.doesNotMatch(combined, forbidden, `superseded owner-direct/internal-brand copy remains: ${forbidden}`);
  }
  assert.doesNotMatch(combined, mkhedruli, "English source contains Mkhedruli");
  assert.match(read("app/(en)/en/rent/page.tsx"), /English-speaking Mepatrone agent/u, "catalog does not introduce agent service");
  assert.match(read("app/(en)/layout.tsx"), /Mepatrone agent/u, "English shell does not describe the agent service");
});

await check("G8", "WhatsApp and call events retain listing/action attribution", () => {
  const source = read("components/EnglishContact.tsx");
  assert.match(source, /trackEvent\("wa_tap",\s*\{[\s\S]*?listingId/u, "wa_tap lacks listingId attribution");
  assert.match(source, /trackEvent\("call_tap",\s*\{[\s\S]*?listingId/u, "call_tap lacks listingId attribution");
  assert.match(source, /surface:\s*compact\s*\?\s*"card"\s*:\s*"phone_block"/u, "contact surface attribution missing");
});

await check("G9", "existing Georgian-script and 12411 guards still pass", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/ts-resolve.mjs",
      "--test",
      "scripts/english-rent-georgian-blocks.test.mjs",
      "scripts/english-rent-12411-bathrooms.test.mjs",
    ],
    { cwd: subjectRoot, encoding: "utf8", timeout: 30_000 }
  );
  assert.equal(result.status, 0, `existing English safety tests failed: ${(result.stderr || result.stdout).slice(0, 600)}`);
  assert.match(read("components/EnglishListingImage.tsx"), /Image temporarily unavailable/u, "approved image failure copy changed");
});

await check("G10", "Georgian owner-direct product is byte-identical to the frozen baseline", () => {
  for (const [relative, expected] of Object.entries(freeze.protected_files)) {
    assert.ok(fs.existsSync(path.join(subjectRoot, relative)), `protected file missing: ${relative}`);
    assert.equal(sha256File(relative), expected, `protected file drift: ${relative}`);
  }
});

await check("G11", "stale owner-direct English assertion is superseded without dropping safety tests", () => {
  const source = read("scripts/english-rent-acceptance.test.mjs");
  assert.doesNotMatch(source, /contact remains owner-direct|Message owner on WhatsApp|Call owner/iu, "stale owner-direct assertion remains active");
  assert.match(source, /Mepatrone agent/iu, "replacement agent-contact assertion missing");
  assert.match(source, /listing data cannot leak Georgian/u, "listing-language guard removed");
  assert.match(source, /all English route and component source is Mkhedruli-free/u, "source-language guard removed");
});

await check("G12", "English source contains no alternate contact path or number", () => {
  const combined = englishFiles.map(read).join("\n");
  assert.doesNotMatch(combined, /listing\.(?:phone|secondary_phones)|\/api\/phone\//u, "owner contact path remains reachable from English source");
  const digitRuns = combined.match(/\+?\d[\d ()-]{7,}\d/gu) ?? [];
  for (const value of digitRuns) {
    const digits = value.replace(/\D/g, "");
    assert.equal(digits, "995555121150", `alternate contact number in English source: ${value}`);
  }
});

const total = 12;
console.log(`RESULT:${failures.length === 0 ? "PASS" : "FAIL"}:${passed}/${total}`);
for (const failure of failures) console.log(`FINDING:${failure}`);
process.exitCode = failures.length === 0 ? 0 : 1;

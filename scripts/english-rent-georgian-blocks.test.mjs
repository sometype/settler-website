/**
 * Control: the English catalog must reject EVERY Georgian script block, not
 * only Mkhedruli.
 *
 * Unicode encodes Georgian in three blocks:
 *   U+10A0–10FF  Georgian            (Asomtavruli + Mkhedruli)
 *   U+1C90–1CBF  Georgian Extended   (Mtavruli — Georgian ALL-CAPS)
 *   U+2D00–2D2F  Georgian Supplement (Nuskhuri)
 *
 * The frozen EN-RENT-OWNER-DIRECT-V1 contract requires zero Georgian script in
 * rendered English HTML. A guard that only tests U+10A0–10FF lets Mtavruli
 * through — and Mtavruli is what a Georgian ALL-CAPS headline is made of.
 * Measured 2026-08-26: 25 live rent rows already carry Mtavruli in their
 * description; today each also carries Mkhedruli, so the narrower guard still
 * catches them by accident. That accident is not a control.
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(path.join(root, "lib/english-rent.ts")).href);

const MTAVRULI = "ᲚᲠᲰ";      // ᲚᲠᲰ
const NUSKHURI = "ⴀⴄⴊ";      // ⴀⴄⴊ

test("containsMkhedruli detects every Georgian block", () => {
  assert.equal(mod.containsMkhedruli("ა"), true, "Mkhedruli");
  assert.equal(mod.containsMkhedruli(MTAVRULI), true, "Georgian Extended (Mtavruli)");
  assert.equal(mod.containsMkhedruli(NUSKHURI), true, "Georgian Supplement (Nuskhuri)");
  assert.equal(mod.containsMkhedruli("Saburtalo"), false, "plain Latin must stay allowed");
});

test("a Mtavruli description with enough Latin characters is refused", () => {
  // >=20 Latin characters, so only the script guard can reject it
  const leaky = `${MTAVRULI} Tbilisi Saburtalo apartment available now`;
  assert.equal(mod.englishOwnerDescription(leaky), null);
});

test("a Mtavruli street is refused rather than rendered", () => {
  assert.equal(mod.safeEnglishStreet(`${MTAVRULI} street`), null);
});

test("the whole-presentation guard refuses Mtavruli", () => {
  const presentation = mod.englishListingPresentation({
    id: 1,
    deal_type: "rent",
    district: null,
    district_code: "saburtalo",
    street_display: null,
    rooms: "2",
    price_usd: 700,
    area: 60,
    floor: "4/12",
    description: `${MTAVRULI} Tbilisi Saburtalo apartment available now`,
  });
  assert.ok(presentation);
  assert.equal(presentation.description, null);
  assert.equal(mod.containsMkhedruli(JSON.stringify(presentation)), false);
});

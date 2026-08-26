/**
 * Frozen regression: live listing 12411, bathrooms = "არ აქვს".
 *
 * Independent Grok verification 2026-08-26: englishListingPresentation JSON for
 * this row is Mkhedruli-free, then the English detail route interpolates
 * listing.bathrooms raw. The EN-RENT-OWNER-DIRECT-V1 contract is zero Georgian
 * script in rendered English HTML — not zero Georgian in the presentation
 * object. Every value the catalog and detail routes render must pass the
 * complete three-block Georgian-script guard.
 *
 * Observed fail on c1ceb9ec9e1bfca58334adb913baeb78339459ed: this file red.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const GEO = /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/u;

const LIVE_12411_SHAPE = {
  id: 12411,
  deal_type: "rent",
  district: "დიდუბე",
  district_code: "didube",
  street_display: "ეგნატე და ვახტანგ ფიფიების ქუჩა",
  rooms: "1",
  price_usd: 268,
  area: 32,
  floor: "2/2",
  bathrooms: "არ აქვს",
  description:
    "სააგენტოები არ შემეხმიანოთ! \nქირავდება, დინამო სტადიონთან სახლი, ფასი 700 ლარი, ქირავდება მხოლოდ გრძელვადიანად პირველი და ბოლო თვის წინასწარი გადახდით.",
};

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

const mod = await import(pathToFileURL(path.join(root, "lib/english-rent.ts")).href);

test("12411 bathrooms is a live Georgian value, not a presentation-only concern", () => {
  assert.equal(LIVE_12411_SHAPE.bathrooms, "არ აქვს");
  assert.equal(mod.containsMkhedruli(LIVE_12411_SHAPE.bathrooms), true);
});

test("englishSafeRenderedText drops Georgian and keeps Latin bathroom facts", () => {
  assert.equal(typeof mod.englishSafeRenderedText, "function");
  assert.equal(mod.englishSafeRenderedText("არ აქვს"), null);
  assert.equal(mod.englishSafeRenderedText("ᲚᲠᲰ"), null);
  assert.equal(mod.englishSafeRenderedText("ⴀⴄⴊ"), null);
  assert.equal(mod.englishSafeRenderedText("5+"), "5+");
  assert.equal(mod.englishSafeRenderedText("1"), "1");
  assert.equal(mod.englishSafeRenderedText(" 2 "), "2");
  assert.equal(mod.englishSafeRenderedText(null), null);
});

test("presentation for 12411 exposes bathrooms as null and stays script-free", () => {
  const facts = mod.englishListingPresentation(LIVE_12411_SHAPE);
  assert.ok(facts);
  assert.equal("bathrooms" in facts, true, "bathrooms must be a presentation field");
  assert.equal(facts.bathrooms, null);
  assert.equal(mod.containsMkhedruli(JSON.stringify(facts)), false);
});

test("reconstructed English detail HTML for 12411 has no Georgian script", () => {
  const facts = mod.englishListingPresentation(LIVE_12411_SHAPE);
  assert.ok(facts);
  const html = [
    facts.title,
    facts.price,
    facts.street,
    facts.district,
    facts.rooms,
    facts.area,
    facts.floor,
    facts.bathrooms,
    facts.description,
  ]
    .filter((value) => value != null && value !== "")
    .join("\n");
  assert.equal(GEO.test(html), false);
  assert.doesNotMatch(html, /არ აქვს/u);
});

test("English detail route does not interpolate unguarded listing.bathrooms", () => {
  const source = read("app/(en)/en/listing/[id]/page.tsx");
  assert.doesNotMatch(
    source,
    /listing\.bathrooms/,
    "detail must not render the raw bathrooms column"
  );
  assert.match(source, /facts\.bathrooms/);
  assert.match(source, /englishSafeRenderedText/);
});

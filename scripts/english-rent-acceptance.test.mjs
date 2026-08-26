import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const mkhedruli = /[\u10A0-\u10FF]/u;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("English rent has a real English document root and bounded routes", () => {
  const required = [
    "app/(ka)/layout.tsx",
    "app/(en)/layout.tsx",
    "app/(en)/en/rent/page.tsx",
    "app/(en)/en/listing/[id]/page.tsx",
    "components/EnglishListingCard.tsx",
    "components/EnglishContact.tsx",
    "components/EnglishListingImage.tsx",
    "lib/english-rent.ts",
  ];
  for (const relative of required) {
    assert.ok(fs.existsSync(path.join(root, relative)), `${relative} must exist`);
  }
  assert.equal(fs.existsSync(path.join(root, "app/layout.tsx")), false);

  const enLayout = read("app/(en)/layout.tsx");
  assert.match(enLayout, /<html\s+lang="en"/);
  assert.doesNotMatch(enLayout, mkhedruli);

  const rentPage = read("app/(en)/en/rent/page.tsx");
  assert.match(rentPage, /dealType:\s*"rent"/);
  assert.doesNotMatch(rentPage, /dealType:\s*"sale"/);
  assert.doesNotMatch(rentPage, mkhedruli);

  const detailPage = read("app/(en)/en/listing/[id]/page.tsx");
  assert.match(detailPage, /deal_type\s*!==\s*"rent"/);
  assert.doesNotMatch(detailPage, mkhedruli);
});

test("listing data cannot leak Georgian into an English presentation", async () => {
  const moduleUrl = pathToFileURL(path.join(root, "lib/english-rent.ts")).href;
  const {
    containsMkhedruli,
    englishListingPresentation,
    englishOwnerDescription,
  } = await import(moduleUrl);

  const fixture = {
    id: 42,
    deal_type: "rent",
    district: "საბურთალო",
    district_code: "saburtalo",
    street_display: "პეკინის გამზირი",
    rooms: "2",
    price_usd: 700,
    area: 62,
    floor: "4/12",
    description: "ქირავდება ნათელი ბინა",
    description_ka: "ქირავდება ნათელი ბინა",
  };
  const presentation = englishListingPresentation(fixture);
  assert.ok(presentation);
  assert.equal(presentation.district, "Saburtalo");
  assert.equal(presentation.street, "Pekinis gamziri");
  assert.equal(presentation.description, null);
  assert.equal(containsMkhedruli(JSON.stringify(presentation)), false);

  assert.equal(
    englishOwnerDescription("Bright apartment near the metro, available now."),
    "Bright apartment near the metro, available now."
  );
  assert.equal(englishOwnerDescription("Сдается квартира"), null);
  assert.equal(englishOwnerDescription("ქირავდება ბინა"), null);
  assert.equal(englishListingPresentation({ ...fixture, deal_type: "sale" }), null);
});

test("contact remains owner-direct and WhatsApp-first", () => {
  const source = read("components/EnglishContact.tsx");
  assert.match(source, /Message owner on WhatsApp/);
  assert.match(source, /Call owner/);
  assert.ok(
    source.indexOf("Message owner on WhatsApp") < source.indexOf("Call owner"),
    "WhatsApp must be the primary control"
  );
  assert.doesNotMatch(source, /concierge|desk|we contact|we call the owner/iu);
  assert.doesNotMatch(source, mkhedruli);
});

test("all English route and component source is Mkhedruli-free", () => {
  const files = [
    "app/(en)/layout.tsx",
    "app/(en)/en/rent/page.tsx",
    "app/(en)/en/listing/[id]/page.tsx",
    "components/EnglishListingCard.tsx",
    "components/EnglishContact.tsx",
    "components/EnglishListingImage.tsx",
  ];
  for (const relative of files) {
    assert.doesNotMatch(read(relative), mkhedruli, `${relative} leaks Mkhedruli`);
  }
});

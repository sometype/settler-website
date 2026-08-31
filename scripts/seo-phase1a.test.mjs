import assert from "node:assert/strict";
import test from "node:test";

import { buildListingSeo } from "../lib/listingSeo.ts";

const listing = {
  id: 19172,
  deal_type: "rent",
  district_code: "saburtalo",
  district: "საბურთალო",
  rooms: "2",
  area: 70,
  price_usd: 800,
  street_display: "პეკინის გამზირი",
};

test("listing SEO uses structured facts, a clean canonical, and the selected cover", () => {
  const seo = buildListingSeo({
    listing,
    images: [{ position: 7 }, { position: 1 }],
    searchParams: { src: "hot", utm_source: "google" },
  });

  assert.match(seo.title, /ქირავდება/);
  assert.match(seo.title, /საბურთალო/);
  assert.match(seo.description, /\$800/);
  assert.equal(seo.canonicalUrl, "https://mepatrone.com/listing/19172");
  assert.equal(seo.ogImageUrl, "https://mepatrone.com/img/19172/7");
  assert.equal(seo.districtHref, "/?deal=rent&district=saburtalo");
});

test("missing cover and district stay absent instead of being invented", () => {
  const seo = buildListingSeo({
    listing: { ...listing, id: 5, district_code: null, district: null },
    images: [],
  });

  assert.equal(seo.ogImageUrl, null);
  assert.equal(seo.districtHref, null);
  assert.doesNotMatch(seo.title, /undefined|null/);
});

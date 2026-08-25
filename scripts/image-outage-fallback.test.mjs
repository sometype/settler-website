import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const OUTAGE_MESSAGE = "ტექნიკური პრობლემა, მალე გამოსწორდება";

const listingImageUrl = new URL("../components/ListingImage.tsx", import.meta.url);

test("failed images use the exact approved outage copy while missing images keep their own label", async () => {
  const component = await readFile(listingImageUrl, "utf8");

  assert.match(
    component,
    new RegExp(`const IMAGE_OUTAGE_MESSAGE = ${JSON.stringify(OUTAGE_MESSAGE)}`)
  );
  assert.match(
    component,
    /if \(failed\) \{[\s\S]*?<Placeholder label=\{IMAGE_OUTAGE_MESSAGE\} \/>[\s\S]*?\}/
  );
  assert.match(
    component,
    /if \(!src\) \{[\s\S]*?<Placeholder label=\{placeholderLabel\} \/>[\s\S]*?\}/
  );
});

test("a failure completed before hydration is promoted to the same React fallback", async () => {
  const component = await readFile(listingImageUrl, "utf8");

  assert.match(component, /useEffect/);
  assert.match(component, /useRef<HTMLImageElement>/);
  assert.match(component, /image\.complete/);
  assert.match(component, /image\.naturalWidth === 0/);
  assert.match(component, /setFailedSrc\(src\)/);
  assert.match(component, /ref=\{imageRef\}/);
  assert.match(component, /onError=\{\(\) => setFailedSrc\(src\)\}/);
});

test("cards, rails, and populated galleries all retain the canonical ListingImage failure surface", async () => {
  const [cards, rails, gallery] = await Promise.all([
    readFile(new URL("../components/CardPhotoPeek.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Channel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Gallery.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(cards, /<ListingImage[\s\S]*?src=\{src\}/);
  assert.match(rails, /<ListingImage[\s\S]*?src=\{url\}/);
  assert.match(gallery, /<ListingImage[\s\S]*?src=\{src\}/);
  assert.match(gallery, /images\.length === 0[\s\S]*?placeholderLabel="ფოტოები ჯერ არ არის"/);
});

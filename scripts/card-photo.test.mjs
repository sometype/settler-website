import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { indexCardImages, pickMainImage } from "../lib/images.ts";

const rows = [
  { listing_id: 1, position: 0, is_main: true, serve_rank: 2 },
  { listing_id: 1, position: 1, is_main: false, serve_rank: 0 },
  { listing_id: 1, position: 2, is_main: false, serve_rank: 1 },
  { listing_id: 1, position: 3, is_main: false, serve_rank: 3 },
  { listing_id: 2, position: 4, is_main: false },
  { listing_id: 2, position: 2, is_main: true },
  { listing_id: 2, position: 0, is_main: false },
];

test("card previews use the same first image as the cover and cap each listing", () => {
  const previews = indexCardImages(rows, 3);
  assert.deepEqual(
    previews.get(1)?.map((image) => image.position),
    [1, 2, 0]
  );
  assert.deepEqual(
    previews.get(2)?.map((image) => image.position),
    [2, 0, 4]
  );
  assert.equal(previews.get(1)?.[0]?.position, pickMainImage(rows.filter((row) => row.listing_id === 1))?.position);
  assert.equal(previews.get(2)?.[0]?.position, pickMainImage(rows.filter((row) => row.listing_id === 2))?.position);
});

test("preview rows are client-safe and source rows are not mutated", () => {
  const before = structuredClone(rows);
  const previews = indexCardImages(rows, 3);
  assert.deepEqual(rows, before);
  for (const images of previews.values()) {
    for (const image of images) {
      assert.deepEqual(Object.keys(image).sort(), ["is_main", "listing_id", "position"]);
    }
  }
});

test("invalid or zero preview limits fail soft", () => {
  assert.equal(indexCardImages(rows, 0).size, 0);
  assert.equal(indexCardImages(rows, 1.5).size, 0);
});

test("card event types are present in TypeScript, API, CHECK and RLS gates", async () => {
  const [client, route, migration] = await Promise.all([
    readFile(new URL("../lib/events.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../sql/018_site_events_card_photos.sql", import.meta.url), "utf8"),
  ]);
  for (const eventType of ["card_photo_exposure", "card_photo_swipe"]) {
    assert.match(client, new RegExp(`\\| "${eventType}"`));
    assert.match(route, new RegExp(`"${eventType}"`));
    assert.ok(migration.split(`'${eventType}'::text`).length - 1 >= 2);
  }
  assert.match(migration, /site_events_event_type_check/);
  assert.match(migration, /site_events_anon_insert/);
});

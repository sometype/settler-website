import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../sql/021_cover_choice_public_only.sql", import.meta.url),
  "utf8",
);

test("cover choice refresh is public-only and prunes departed listings", () => {
  assert.match(migration, /JOIN listings_public p ON p\.id = li\.listing_id/);
  assert.match(migration, /DELETE FROM cover_choice cc/);
  assert.match(migration, /WHERE NOT EXISTS \(SELECT 1 FROM decided d/);
});

test("cover choice refresh stays version-pinned and private", () => {
  assert.match(migration, /appeal-v3-2026-08-09/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION refresh_cover_choice\(\) FROM public, anon, authenticated/,
  );
});

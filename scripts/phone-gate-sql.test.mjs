import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const prior = fs.readFileSync(
  path.join(root, "sql/017_listings_public_street_display.sql"),
  "utf8",
);
const gate = fs.readFileSync(
  path.join(root, "sql/021_listings_public_requires_phone.sql"),
  "utf8",
);

function selectProjection(sql) {
  const viewStart = sql.search(/CREATE\s+OR\s+REPLACE\s+VIEW\s+listings_public/i);
  assert.notEqual(viewStart, -1, "listings_public view declaration is present");
  const match = sql.slice(viewStart).match(/\bSELECT\s+([\s\S]*?)\s+FROM\s+listings\b/i);
  assert.ok(match, "listings_public projection is present");
  return match[1].replace(/\s+/g, " ").trim();
}

test("phone gate changes only visibility, never public columns or their order", () => {
  assert.equal(selectProjection(gate), selectProjection(prior));
  assert.match(
    gate,
    /canonical_id IS NULL AND phone IS NOT NULL AND btrim\(phone\) <> ''::text/,
  );
});

test("phone-gate migration is replay-safe and serving consumers use the gated view", () => {
  assert.match(
    gate,
    /GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;/,
  );
  const listings = fs.readFileSync(path.join(root, "lib/listings.ts"), "utf8");
  const phoneApi = fs.readFileSync(path.join(root, "app/api/phone/[id]/route.ts"), "utf8");
  assert.match(listings, /from\("listings_public"\)/);
  assert.match(phoneApi, /from\("listings_public"\)/);
});

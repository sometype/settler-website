import assert from "node:assert/strict";
import test from "node:test";

import { knownConditionLabel } from "../lib/labels.ts";
import { isHonestRecentSaleDrop } from "../lib/price-drops.ts";

const NOW = Date.parse("2026-08-09T16:00:00Z");

function drop(overrides = {}) {
  return {
    deal_type: "sale",
    price_usd: 95_000,
    price_drop_from_usd: 100_000,
    price_dropped_at: "2026-08-08T16:00:00Z",
    ...overrides,
  };
}

test("accepts a sane recent sale drop, including the exact seven-day boundary", () => {
  assert.equal(isHonestRecentSaleDrop(drop(), NOW), true);
  assert.equal(
    isHonestRecentSaleDrop(drop({ price_dropped_at: "2026-08-02T16:00:00Z" }), NOW),
    true
  );
});

test("fails closed on stale, invalid, future, missing, and rent timestamps", () => {
  for (const candidate of [
    drop({ price_dropped_at: "2026-08-02T15:59:59Z" }),
    drop({ price_dropped_at: "not-a-date" }),
    drop({ price_dropped_at: "2026-08-09T16:00:01Z" }),
    drop({ price_dropped_at: null }),
    drop({ deal_type: "rent" }),
  ]) {
    assert.equal(isHonestRecentSaleDrop(candidate, NOW), false);
  }
});

test("rejects rises, tiny/huge cuts, and prices outside the sale trust bounds", () => {
  for (const candidate of [
    drop({ price_usd: 100_000 }),
    drop({ price_usd: 99_500 }),
    drop({ price_usd: 40_000 }),
    drop({ price_usd: 4_999, price_drop_from_usd: 6_000 }),
    drop({ price_usd: 5_000_001, price_drop_from_usd: 5_010_001 }),
    drop({ price_usd: Number.NaN }),
  ]) {
    assert.equal(isHonestRecentSaleDrop(candidate, NOW), false);
  }
});

test("shows only conditions already translated by the canonical map", () => {
  assert.equal(knownConditionLabel("Newly Renovated"), "ახალი რემონტით");
  assert.equal(knownConditionLabel("შავი კარკასი"), "შავი კარკასი");
  assert.equal(knownConditionLabel("Future English Value"), null);
  assert.equal(knownConditionLabel(null), null);
});

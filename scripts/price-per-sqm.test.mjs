import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPrice,
  priceInputToUsd,
  pricePerSqm,
  priceUsdToInput,
  sanePriceUsd,
} from "../lib/prices.ts";

test("accepts sale shorthand and full-dollar input as the same budget", () => {
  for (const input of ["80", "80000", "80 000", "80,000", "$80,000"]) {
    assert.equal(priceInputToUsd(input, "sale"), 80_000, input);
  }
  assert.equal(priceInputToUsd("85.5", "sale"), 85_500);
  assert.equal(priceInputToUsd("2000", "sale"), 2_000_000);
  assert.equal(priceInputToUsd("5000", "sale"), 5_000);
});

test("keeps rent literal and rejects malformed price input", () => {
  assert.equal(priceInputToUsd("800", "rent"), 800);
  for (const input of ["", "0", "-80", "80k", "1e3", "Infinity"]) {
    assert.equal(priceInputToUsd(input, "sale"), null, input);
  }
});

test("round-trips real-dollar URL bounds without changing old links", () => {
  for (const dollars of [30, 5_000, 80_000, 85_500, 2_000_000, 5_000_000]) {
    const field = priceUsdToInput(String(dollars), "sale");
    assert.equal(priceInputToUsd(field, "sale"), dollars, `${dollars} -> ${field}`);
  }
  assert.equal(priceUsdToInput("800", "rent"), "800");
});

test("calculates whole-dollar sale price per square metre", () => {
  assert.equal(pricePerSqm(78_000, 60, "sale"), 1_300);
  assert.equal(pricePerSqm(55_000, 32.5, "sale"), 1_692);
});

test("does not produce a v1 value for rent", () => {
  assert.equal(pricePerSqm(750, 50, "rent"), null);
});

test("never derives from a hidden or invalid total price", () => {
  for (const price of [null, undefined, 0, 4_999, 5_000_001, NaN, Infinity]) {
    assert.equal(pricePerSqm(price, 50, "sale"), null);
  }
});

test("never divides by a missing, non-positive, or non-finite area", () => {
  for (const area of [null, undefined, 0, -1, NaN, Infinity]) {
    assert.equal(pricePerSqm(78_000, area, "sale"), null);
  }
});

test("keeps the existing total-price presentation contract", () => {
  assert.equal(sanePriceUsd(5_000, "sale"), 5_000);
  assert.equal(formatPrice(95_000, "sale"), "$95,000");
  assert.equal(formatPrice(750, "rent"), "$750 / თვეში");
  assert.equal(formatPrice(30, "rent"), null);
});

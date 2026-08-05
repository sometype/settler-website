/**
 * Public-price presentation rules.
 *
 * Keep derived prices here so every surface uses the same sanity boundary.
 * Source-provided unit-price fields are deliberately not part of this module:
 * price per m² must reconcile with the total price and area we actually show.
 */
const PRICE_BOUNDS: Record<"rent" | "sale", { min: number; max: number }> = {
  rent: { min: 50, max: 50_000 },
  sale: { min: 5_000, max: 5_000_000 },
};

function inputNumber(value: string): number | null {
  // Spaces and commas are grouping characters here: "80 000" / "80,000".
  // Keep a dot as the decimal separator so sale shorthand such as 85.5 remains
  // able to express $85,500. Exponents and mixed text are rejected rather than
  // being partially parsed into a surprising filter.
  const compact = value.trim().replace(/^\$/, "").replace(/[\s,]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return null;
  const parsed = Number(compact);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function compactNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * Convert a human price field to the real-dollar URL value.
 *
 * Sale accepts both Georgian shorthand and full dollars:
 *   80 / 85.5 -> $80,000 / $85,500
 *   80 000 / 80,000 / 80000 -> $80,000
 *
 * The $5,000 boundary is not arbitrary: anything below it is already outside
 * the sale sanity range, so treating it as shorthand cannot hide a valid sale
 * price. Rent always remains literal dollars.
 */
export function priceInputToUsd(
  value: string,
  dealType: "rent" | "sale"
): number | null {
  const parsed = inputNumber(value);
  if (parsed === null) return null;
  const dollars =
    dealType === "sale" && parsed < PRICE_BOUNDS.sale.min
      ? parsed * 1000
      : parsed;
  const rounded = Math.round(dollars);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : null;
}

/** Display an existing real-dollar URL bound without changing its meaning. */
export function priceUsdToInput(
  value: string | null,
  dealType: "rent" | "sale"
): string {
  if (!value) return "";
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars <= 0) return "";
  if (dealType === "rent") return compactNumber(dollars);

  const shorthand = dollars / 1000;
  // $5m / 1000 is exactly the shorthand/literal boundary. Keep it in full
  // dollars so submitting an existing max-bound URL remains bit-identical.
  return compactNumber(
    shorthand < PRICE_BOUNDS.sale.min ? shorthand : dollars
  );
}

export function sanePriceUsd(
  priceUsd: number | null | undefined,
  dealType: "rent" | "sale" | null | undefined
): number | null {
  if (priceUsd === null || priceUsd === undefined || !Number.isFinite(priceUsd)) {
    return null;
  }
  const bounds = PRICE_BOUNDS[dealType === "sale" ? "sale" : "rent"];
  if (priceUsd < bounds.min || priceUsd > bounds.max) return null;
  return priceUsd;
}

export function formatPrice(
  priceUsd: number | null,
  dealType: "rent" | "sale" | null | undefined = "rent"
): string | null {
  const sane = sanePriceUsd(priceUsd, dealType);
  if (sane === null) return null;
  const amount = `$${sane.toLocaleString("en-US")}`;
  if (dealType === "sale") return amount;
  return `${amount} / თვეში`;
}

/**
 * Whole-dollar sale price per m², or null when it would expose a hidden total
 * or derive from an unusable area. Rent is deliberately outside v1.
 */
export function pricePerSqm(
  priceUsd: number | null | undefined,
  area: number | null | undefined,
  dealType: "rent" | "sale" | null | undefined
): number | null {
  if (dealType !== "sale" || area === null || area === undefined) return null;
  if (!Number.isFinite(area) || area <= 0) return null;

  const sane = sanePriceUsd(priceUsd, dealType);
  if (sane === null) return null;

  const result = Math.round(sane / area);
  return Number.isFinite(result) && result > 0 ? result : null;
}

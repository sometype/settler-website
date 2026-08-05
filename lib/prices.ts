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

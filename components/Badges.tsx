import type { DealType } from "@/lib/types";

/**
 * Sharp, not a pill. On a card it sits on a translucent plate over the photo,
 * so it needs an opaque-ish ground of its own rather than a 10% tint.
 */
export function DealBadge({ dealType }: { dealType: DealType | string | null | undefined }) {
  const sale = dealType === "sale";
  return (
    <span
      className={`inline-flex items-center rounded bg-card/90 px-1.5 py-0.5 text-[10.5px] font-semibold backdrop-blur-[2px] ${
        sale ? "text-clay-deep" : "text-moss-deep"
      }`}
    >
      {sale ? "იყიდება" : "ქირავდება"}
    </span>
  );
}

/**
 * @deprecated Superseded by the age ramp (`AgeStamp`). A binary "new" badge
 * flattened a flat posted 7 minutes ago into the same thing as one posted 20
 * hours ago — the exact age says strictly more in less space. Kept only until
 * the remaining call sites are migrated; do not add new usages.
 */
export function NewBadge() {
  return (
    <span className="inline-flex items-center rounded bg-age1 px-1.5 py-0.5 text-[10.5px] font-semibold text-card">
      ახალი
    </span>
  );
}

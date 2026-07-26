import type { DealType } from "@/lib/types";

export function DealBadge({ dealType }: { dealType: DealType | string | null | undefined }) {
  const sale = dealType === "sale";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        sale
          ? "bg-clay/10 text-clay-deep ring-clay/25"
          : "bg-moss/10 text-moss-deep ring-moss/25"
      }`}
    >
      {sale ? "იყიდება" : "ქირავდება"}
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-moss px-2 py-0.5 text-xs font-semibold text-white">
      ახალი
    </span>
  );
}

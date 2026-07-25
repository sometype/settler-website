import type { DealType } from "@/lib/types";

export function DealBadge({ dealType }: { dealType: DealType | string | null | undefined }) {
  const sale = dealType === "sale";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        sale
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-sky-50 text-sky-800 ring-sky-200"
      }`}
    >
      {sale ? "იყიდება" : "ქირავდება"}
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
      ახალი
    </span>
  );
}

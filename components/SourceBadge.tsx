import type { ListingSource } from "@/lib/types";

const LABELS: Record<ListingSource, string> = {
  myhome: "myhome.ge",
  ss: "ss.ge",
};

export function SourceBadge({ source }: { source: ListingSource }) {
  return (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-200">
      {LABELS[source] ?? source}
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
      New
    </span>
  );
}

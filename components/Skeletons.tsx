export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="aspect-[4/3] animate-pulse bg-stone-200" />
      <div className="space-y-2 p-4">
        <div className="h-6 w-28 animate-pulse rounded bg-stone-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-stone-100" />
        <div className="h-4 w-24 animate-pulse rounded bg-stone-100" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-28 animate-pulse rounded bg-stone-200" />
      <div className="aspect-[16/10] animate-pulse rounded-2xl bg-stone-200" />
      <div className="h-8 w-40 animate-pulse rounded bg-stone-200" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-stone-100" />
      </div>
    </div>
  );
}

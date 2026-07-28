export function CardSkeleton() {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-sand bg-card">
      <div className="aspect-[4/3] animate-pulse bg-well" />
      <div className="space-y-2 p-2.5">
        <div className="h-5 w-24 animate-pulse rounded bg-sand" />
        <div className="h-3.5 w-32 animate-pulse rounded bg-sand/60" />
        <div className="h-3.5 w-20 animate-pulse rounded bg-sand/60" />
        <div className="mt-2 h-9 w-full animate-pulse rounded bg-sand" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="min-w-0 space-y-5">
      <div className="h-4 w-28 animate-pulse rounded bg-sand" />
      <div className="aspect-[4/3] animate-pulse rounded-lg bg-well sm:aspect-[16/10]" />
      <div className="h-8 w-36 animate-pulse rounded bg-sand" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-sand/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-sand/60" />
      </div>
    </div>
  );
}

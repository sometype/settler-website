import { FeedSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="h-32 animate-pulse rounded-2xl bg-card ring-1 ring-sand" />
      <FeedSkeleton />
    </div>
  );
}

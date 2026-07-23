import { FeedSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-32 animate-pulse rounded-2xl bg-white ring-1 ring-stone-200" />
      <FeedSkeleton />
    </div>
  );
}

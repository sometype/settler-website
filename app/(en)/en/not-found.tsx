import Link from "next/link";

export default function EnglishNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-ink">Rental listing not found</h1>
      <p className="mt-3 text-mink">It may have been removed or may not be a rental.</p>
      <Link
        href="/en/rent"
        className="mt-6 inline-flex rounded bg-ink px-5 py-3 text-sm font-bold text-card"
      >
        Browse current rentals
      </Link>
    </div>
  );
}

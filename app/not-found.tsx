import Link from "next/link";

/**
 * Georgian, branded 404. Catches both notFound() from route segments (e.g. a
 * listing id that doesn't exist) and unmatched URLs app-wide — replacing the
 * default English Next.js system page.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-20">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center ring-1 ring-stone-200">
        <p className="text-5xl font-black text-stone-300">404</p>
        <h1 className="mt-4 text-lg font-semibold text-stone-900">
          ეს გვერდი ვერ მოიძებნა
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          განცხადება შესაძლოა წაშლილია, გაქირავებულია ან ბმული არასწორია.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          ყველა განცხადების ნახვა
        </Link>
      </div>
    </div>
  );
}

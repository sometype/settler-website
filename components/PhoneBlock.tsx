/**
 * Test-launch contact block. The public view intentionally exposes only
 * has_phone (boolean) — no digits are ever available to the browser.
 */
export function PhoneBlock({ hasPhone }: { hasPhone: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="text-sm font-semibold text-stone-900">Contact</h2>
      {hasPhone ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-emerald-700">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />
            Phone available
          </p>
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-lg bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-400"
            title="Calling will be enabled after the test launch"
          >
            Call — coming soon
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone-500">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stone-300 align-middle" />
          Number pending
        </p>
      )}
    </div>
  );
}

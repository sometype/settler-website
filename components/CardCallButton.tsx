"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/events";

/**
 * Call straight from the feed card. The measured funnel is the reason this
 * exists: filter_apply -> listing_open -> call_tap collapses almost entirely at
 * the last step, so the call is moved one tap closer.
 *
 * The number is NOT a prop and never reaches feed HTML — it is fetched on tap
 * from /api/phone/{id}. See that route for why (a tel: link per card would make
 * the feed a harvestable directory of owners' numbers).
 *
 * Fires call_tap with surface=card so the two call surfaces stay separable in
 * the funnel; without that, moving the button would silently rewrite the meaning
 * of the existing call_tap series.
 */
export function CardCallButton({
  listingId,
  hasPhone,
}: {
  listingId: number;
  hasPhone: boolean;
}) {
  const [busy, setBusy] = useState(false);

  if (!hasPhone) return null;

  async function call(e: React.MouseEvent) {
    // The card is wrapped in a <Link>; without this the tap navigates to the
    // detail page instead of dialling.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);

    trackEvent("call_tap", { listingId, meta: { surface: "card" } });

    try {
      const res = await fetch(`/api/phone/${listingId}`, { cache: "no-store" });
      const body = (await res.json()) as { phone?: string | null };
      const digits = (body.phone ?? "").replace(/\D/g, "");
      if (digits) {
        const tel = digits.startsWith("995") ? `+${digits}` : `+995${digits}`;
        window.location.href = `tel:${tel}`;
        return;
      }
    } catch {
      /* fall through to the detail page */
    } finally {
      setBusy(false);
    }
    // No number resolved: send them to the listing rather than dead-ending.
    window.location.href = `/listing/${listingId}`;
  }

  return (
    <button
      type="button"
      onClick={call}
      aria-label="დარეკე პატრონს"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60"
      disabled={busy}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.03 11.03 0 0 0 5.754 5.754c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 14.352V15.5a1.5 1.5 0 0 1-1.5 1.5H15c-7.18 0-13-5.82-13-13v-.5Z" />
      </svg>
      {busy ? "..." : "დარეკე"}
    </button>
  );
}

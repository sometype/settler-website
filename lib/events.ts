/**
 * First-party product beacons — no third-party analytics, no cookie banner.
 * Events land in public.site_events for funnel measurement next to inventory.
 */

export type SiteEventType =
  | "call_tap"
  | "wa_tap"
  | "listing_open"
  | "filter_apply"
  | "empty_result"
  // Added 2026-07-30. ⚠️ Each answers a question that was previously
  // UNANSWERABLE, and events cannot be backfilled — see the frozen contract in
  // AITALKS § FROZEN CONTRACT — instrumentation (item #4) before changing any
  // meta shape here.
  //   session_start — the denominator. Without it every rate we quote is "of
  //     people who already clicked something", which is survivorship.
  //   filter_clear  — tells recovery from abandonment after a zero result.
  //     Clearing to a bare feed emits nothing, so "left" and "cleared and
  //     carried on" are currently identical.
  //   sort_apply    — sort is deliberately not a filter, so choosing one on the
  //     DEFAULT RENT feed fires nothing at all today. Sort adoption is measured
  //     only where sale happens to be active, i.e. biased.
  | "session_start"
  | "filter_clear"
  | "sort_apply";

const SESSION_KEY = "mp_sid";
const SESSION_START_KEY = "mp_ss";

function sessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Fire-and-forget; never blocks navigation or throws to UI. */
export function trackEvent(
  eventType: SiteEventType,
  opts?: {
    listingId?: number | null;
    meta?: Record<string, unknown>;
  }
): void {
  if (typeof window === "undefined") return;
  // Local `next dev` uses the same NEXT_PUBLIC_SUPABASE_* as production.
  // Without this, a single call-button test writes a real call_tap into
  // site_events — and that table has almost no real call volume to dilute.
  // Server route also no-ops in development as a second gate.
  if (process.env.NODE_ENV === "development") return;
  const body = JSON.stringify({
    event_type: eventType,
    listing_id: opts?.listingId ?? null,
    session_id: sessionId(),
    path: window.location.pathname + window.location.search,
    meta: opts?.meta ?? {},
  });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      // sendBeacon returns false when the browser's beacon queue is full —
      // fall through to fetch instead of silently dropping the event.
      if (navigator.sendBeacon("/api/events", blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Fire `session_start` exactly once per tab.
 *
 * ⚠️ ONCE PER SESSION, NOT ONCE PER PAGE. Next's app router navigates on the
 * client without a reload, so a naive "first render" check fires on every
 * page a visitor opens and the denominator becomes page views — which is the
 * exact bug that voided every funnel number before 2026-07-27 (`FeedBeacon`
 * fired on every feed render). The flag lives beside `mp_sid` and dies with
 * the tab, so it identifies nobody and needs no cookie banner.
 *
 * ⚠️ This is the number that makes "should the homepage default to sale?"
 * answerable. Today 87% of searches are sale — but only among visitors who
 * already searched, so people who look and leave are invisible and that 87%
 * is survivorship.
 */
export function markSessionStart(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(SESSION_START_KEY)) return;
    sessionStorage.setItem(SESSION_START_KEY, "1");
  } catch {
    // Private mode or blocked storage: fire once for this render rather than
    // loop. Losing the guard is better than losing the event entirely.
  }
  trackEvent("session_start", {
    // Pathname only — no query string. The query can carry a visitor's exact
    // search, and an entry marker does not need it.
    meta: { entry: window.location.pathname },
  });
}

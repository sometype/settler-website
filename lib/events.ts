/**
 * First-party product beacons — no third-party analytics, no cookie banner.
 * Events land in public.site_events for funnel measurement next to inventory.
 */

export type SiteEventType =
  | "call_tap"
  | "wa_tap"
  | "listing_open"
  | "filter_apply"
  | "empty_result";

const SESSION_KEY = "mp_sid";

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

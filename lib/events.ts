/**
 * First-party product beacons — no third-party analytics, no cookie banner.
 * Events land in public.site_events for funnel measurement next to inventory.
 */

import type {
  AcquisitionMeta,
  AcquisitionSource,
  UtmMedium,
} from "@/lib/event-contract";

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
  | "sort_apply"
  | "card_photo_exposure"
  | "card_photo_swipe";

const SESSION_KEY = "mp_sid";
const SESSION_START_KEY = "mp_ss";

function normalizeHost(raw: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "").slice(0, 120) || null;
  } catch {
    return null;
  }
}

function sourceFromLabel(raw: string | null): AcquisitionSource | null {
  const source = raw?.trim().toLowerCase() ?? "";
  if (!source) return null;
  if (["facebook", "fb", "meta"].includes(source)) return "facebook";
  if (["instagram", "ig"].includes(source)) return "instagram";
  if (["google", "google_ads", "adwords"].includes(source)) return "google";
  return "other";
}

function sourceFromHost(host: string | null): AcquisitionSource | null {
  if (!host) return null;
  if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "google.com" || host.endsWith(".google.com")) return "google";
  // Android apps send their package id as the referrer rather than a hostname.
  // The Google Search app is real Google discovery traffic and was landing in
  // `referral`: measured 22 of 48 Google sessions in the first 3h after the
  // Phase A cutover, i.e. it was understating Google by ~46%.
  if (host === "com.google.android.googlequicksearchbox") return "google";
  // NOTE: other search engines (bing.com seen once) stay `referral`. The enum
  // has no generic search bucket and one session does not justify a contract
  // change — but do not read `referral` as "someone linked us".
  return "referral";
}

function normalizeMedium(raw: string | null): UtmMedium | null {
  const medium = raw?.trim().toLowerCase().replace(/[- ]/g, "_") ?? "";
  if (!medium) return null;
  if (medium === "cpc" || medium === "ppc") return "cpc";
  if (medium === "paid_social" || medium === "paidsocial") return "paid_social";
  if (["social", "organic", "referral", "email", "display"].includes(medium)) {
    return medium as UtmMedium;
  }
  return "other";
}

/** Privacy-safe acquisition facts: enums/booleans + hostname, never raw IDs or campaign text. */
export function acquisitionMeta(
  pathname: string,
  search: string,
  referrer: string,
  currentHost: string
): AcquisitionMeta {
  const params = new URLSearchParams(search);
  const referrerHost = normalizeHost(referrer);
  const ownHost = currentHost.toLowerCase().replace(/^www\./, "");
  const externalReferrer = referrerHost && referrerHost !== ownHost ? referrerHost : null;
  const medium = normalizeMedium(params.get("utm_medium"));
  const hasFbclid = params.has("fbclid");
  const hasGclid = params.has("gclid");
  const referrerSource = sourceFromHost(externalReferrer);
  const source =
    sourceFromLabel(params.get("utm_source")) ??
    // Meta uses fbclid on Instagram too. A known referrer host is therefore
    // stronger evidence than the shared click-id family.
    (referrerSource && referrerSource !== "referral" ? referrerSource : null) ??
    (hasFbclid ? "facebook" : null) ??
    (hasGclid ? "google" : null) ??
    referrerSource ??
    "unattributed";

  return {
    entry: pathname,
    acq_source: source,
    // ⚠️ `fbclid` IS NOT EVIDENCE OF A PAID CLICK, and treating it as one made
    // this field almost pure noise: 204 of 209 Facebook sessions in the first
    // 3h after cutover came back paid_click=true with utm_medium null, which
    // would have read as an enormous ad spend that does not exist. Meta appends
    // fbclid to ORGANIC outbound links too.
    //
    // `gclid` is different and is kept: Google Ads auto-tagging is the only
    // thing that sets it, so it does imply a paid click. The asymmetry is the
    // whole point — one click id is a paid signal, the other is just Meta.
    //
    // Cost of the narrowing: a paid Meta campaign that forgets to tag
    // utm_medium now reads as unpaid. That is the right direction to fail —
    // under-claiming spend beats inventing it. Tag campaigns with
    // utm_medium=paid_social or cpc and this stays accurate.
    paid_click: hasGclid || medium === "cpc" || medium === "paid_social",
    utm_medium: medium,
    referrer_host: externalReferrer,
  };
}

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
    // Query values are unbounded user input. Product context belongs in each
    // event's bounded meta contract, never in this transport field.
    path: window.location.pathname,
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
    meta: acquisitionMeta(
      window.location.pathname,
      window.location.search,
      document.referrer,
      window.location.hostname
    ),
  });
}

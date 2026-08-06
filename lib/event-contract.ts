export const ACQUISITION_SOURCES = [
  "unattributed",
  "facebook",
  "instagram",
  "google",
  "referral",
  "other",
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const UTM_MEDIUMS = [
  "cpc",
  "paid_social",
  "social",
  "organic",
  "referral",
  "email",
  "display",
  "other",
] as const;

export type UtmMedium = (typeof UTM_MEDIUMS)[number];

export const CONTACT_SURFACES = ["card", "phone_block", "sticky_bar"] as const;
export type ContactSurface = (typeof CONTACT_SURFACES)[number];

export const ANALYTICS_RAILS = [
  "new",
  "hot",
  "hot_all",
  "intake_all",
  "district",
  "price_drop",
  "value",
] as const;
export type AnalyticsRail = (typeof ANALYTICS_RAILS)[number];

export const ANALYTICS_SORTS = ["new", "price_asc", "price_desc"] as const;
export type AnalyticsSort = (typeof ANALYTICS_SORTS)[number];

export const ANALYTICS_DEALS = ["sale", "rent"] as const;
export type AnalyticsDeal = (typeof ANALYTICS_DEALS)[number];

export type ContactAttribution = {
  rail: AnalyticsRail | null;
  sort: AnalyticsSort;
  deal: AnalyticsDeal;
};

export type CardPhotoContext = {
  deal: AnalyticsDeal;
  page: number;
  has_filters: boolean;
};

export type AcquisitionMeta = {
  entry: string;
  acq_source: AcquisitionSource;
  paid_click: boolean;
  utm_medium: UtmMedium | null;
  referrer_host: string | null;
};

const CONTACT_KEYS = new Set(["surface", "rail", "sort", "deal"]);
const SESSION_START_KEYS = new Set([
  "entry",
  "acq_source",
  "paid_click",
  "utm_medium",
  "referrer_host",
]);
const CARD_PHOTO_EXPOSURE_KEYS = new Set([
  "n",
  "surface",
  "deal",
  "page",
  "has_filters",
]);
const CARD_PHOTO_SWIPE_KEYS = new Set([
  "from",
  "to",
  "n",
  "surface",
  "deal",
  "page",
  "has_filters",
]);
const SORT_APPLY_KEYS = new Set([
  "from",
  "to",
  "deal",
  "has_filters",
  "view",
  "district_count",
]);

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function hasOnlyKeys(meta: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(meta).every((key) => allowed.has(key));
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isHostname(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 120 &&
    /^[a-z0-9.-]+$/.test(value) &&
    !value.startsWith(".") &&
    !value.endsWith(".") &&
    !value.includes("..")
  );
}

export type ContractIssue = {
  reason: string;
  key: string;
};

/** Cap on sanitization notices per event — see the loop in the contact branch. */
const MAX_NOTICES = 5;

export type PhaseAEventContract = {
  meta: Record<string, unknown>;
  error: ContractIssue | null;
  notices: ContractIssue[];
};

function hardError(
  meta: Record<string, unknown>,
  reason: string,
  key: string
): PhaseAEventContract {
  return { meta, error: { reason, key }, notices: [] };
}

/**
 * Validate strict denominator/media contracts and sanitize contact attribution.
 *
 * Contact rows are unbackfillable numerators, so only a missing listing or an
 * unknown surface is fatal. Optional attribution degrades to null and unknown
 * keys are dropped. New fields remain optional at the API boundary so already-
 * open pages using the previous client survive a rolling deployment.
 */
export function validatePhaseAEvent(
  eventType: string,
  listingId: number | null,
  meta: Record<string, unknown>
): PhaseAEventContract {
  if (eventType === "call_tap" || eventType === "wa_tap") {
    if (listingId === null) return hardError({}, "missing_listing", "listing_id");
    if (!isOneOf(meta.surface, CONTACT_SURFACES)) {
      return hardError({}, "bad_surface", "surface");
    }

    const notices: ContractIssue[] = [];
    // ⚠️ Bounded on purpose. Fail-soft means a pathological client can send
    // thousands of unknown keys and still get a 200 — without this cap that
    // becomes one console.warn per key in the route, i.e. a log flood reachable
    // by anon POST. We only need to know THAT unknown keys arrived and a sample
    // of which; the row is written either way.
    for (const key of Object.keys(meta)) {
      if (CONTACT_KEYS.has(key)) continue;
      if (notices.length >= MAX_NOTICES) {
        notices.push({ reason: "unknown_contact_key_truncated", key: "…" });
        break;
      }
      notices.push({ reason: "unknown_contact_key", key });
    }
    const rail = meta.rail === null || isOneOf(meta.rail, ANALYTICS_RAILS) ? meta.rail : null;
    const sort = isOneOf(meta.sort, ANALYTICS_SORTS) ? meta.sort : null;
    const deal = isOneOf(meta.deal, ANALYTICS_DEALS) ? meta.deal : null;
    if (meta.rail !== undefined && meta.rail !== null && rail === null) {
      notices.push({ reason: "bad_rail", key: "rail" });
    }
    if (meta.sort !== undefined && sort === null) {
      notices.push({ reason: "bad_sort", key: "sort" });
    }
    if (meta.deal !== undefined && deal === null) {
      notices.push({ reason: "bad_deal", key: "deal" });
    }

    return {
      meta: { surface: meta.surface, rail, sort, deal },
      error: null,
      notices,
    };
  }

  if (eventType === "session_start") {
    if (listingId !== null) return hardError(meta, "bad_session_listing", "listing_id");
    if (!hasOnlyKeys(meta, SESSION_START_KEYS)) {
      const key = Object.keys(meta).find((candidate) => !SESSION_START_KEYS.has(candidate));
      return hardError(meta, "bad_session_meta", key ?? "meta");
    }
    if (
      typeof meta.entry !== "string" ||
      !meta.entry.startsWith("/") ||
      meta.entry.length > 500 ||
      meta.entry.includes("?") ||
      meta.entry.includes("#")
    ) {
      return hardError(meta, "bad_entry", "entry");
    }
    if (meta.acq_source !== undefined && !isOneOf(meta.acq_source, ACQUISITION_SOURCES)) {
      return hardError(meta, "bad_acq_source", "acq_source");
    }
    if (meta.paid_click !== undefined && typeof meta.paid_click !== "boolean") {
      return hardError(meta, "bad_paid_click", "paid_click");
    }
    if (
      meta.utm_medium !== undefined &&
      meta.utm_medium !== null &&
      !isOneOf(meta.utm_medium, UTM_MEDIUMS)
    ) {
      return hardError(meta, "bad_utm_medium", "utm_medium");
    }
    if (
      meta.referrer_host !== undefined &&
      meta.referrer_host !== null &&
      !isHostname(meta.referrer_host)
    ) {
      return hardError(meta, "bad_referrer_host", "referrer_host");
    }
  }

  if (eventType === "card_photo_exposure" || eventType === "card_photo_swipe") {
    const allowed =
      eventType === "card_photo_exposure" ? CARD_PHOTO_EXPOSURE_KEYS : CARD_PHOTO_SWIPE_KEYS;
    if (listingId === null) return hardError(meta, "missing_listing", "listing_id");
    if (!hasOnlyKeys(meta, allowed)) return hardError(meta, "bad_card_photo_meta", "meta");
    if (!isBoundedInteger(meta.n, 2, 3)) return hardError(meta, "bad_photo_count", "n");
    if (meta.surface !== "feed") return hardError(meta, "bad_photo_surface", "surface");
    const contextCount = ["deal", "page", "has_filters"].filter(
      (key) => meta[key] !== undefined
    ).length;
    // Zero is the complete legacy shape from an already-open cached client;
    // three is the Phase A shape. Partial context is neither and stays loud.
    if (contextCount !== 0 && contextCount !== 3) {
      return hardError(meta, "incomplete_photo_context", "deal_page_has_filters");
    }
    if (contextCount === 3) {
      if (!isOneOf(meta.deal, ANALYTICS_DEALS)) return hardError(meta, "bad_deal", "deal");
      if (!isBoundedInteger(meta.page, 1, 999)) return hardError(meta, "bad_page", "page");
      if (typeof meta.has_filters !== "boolean") {
        return hardError(meta, "bad_has_filters", "has_filters");
      }
    }
    if (eventType === "card_photo_swipe") {
      if (!isBoundedInteger(meta.from, 0, 2)) return hardError(meta, "bad_photo_from", "from");
      if (!isBoundedInteger(meta.to, 0, 2)) return hardError(meta, "bad_photo_to", "to");
      if (Number(meta.from) >= Number(meta.n) || Number(meta.to) >= Number(meta.n)) {
        return hardError(meta, "bad_photo_index", "from_to");
      }
    }
  }

  if (eventType === "sort_apply") {
    if (!hasOnlyKeys(meta, SORT_APPLY_KEYS)) return hardError(meta, "bad_sort_meta", "meta");
    if (!isOneOf(meta.from, ANALYTICS_SORTS)) return hardError(meta, "bad_sort", "from");
    if (!isOneOf(meta.to, ANALYTICS_SORTS)) return hardError(meta, "bad_sort", "to");
    if (!isOneOf(meta.deal, ANALYTICS_DEALS)) return hardError(meta, "bad_deal", "deal");
    if (typeof meta.has_filters !== "boolean") {
      return hardError(meta, "bad_has_filters", "has_filters");
    }
    if (meta.view !== null && meta.view !== undefined && meta.view !== "hot" && meta.view !== "intake") {
      return hardError(meta, "bad_view", "view");
    }
    // Optional only for cached pre-Phase-A clients. New emitters always send it.
    if (meta.district_count !== undefined && !isBoundedInteger(meta.district_count, 0, 8)) {
      return hardError(meta, "bad_district_count", "district_count");
    }
  }

  return { meta, error: null, notices: [] };
}

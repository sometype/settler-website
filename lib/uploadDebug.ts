const TRACE_KEY = "mp_owner_upload_debug";
const TRACE_LIMIT = 200;
const TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;

const SAFE_KEYS = new Set([
  "action",
  "step",
  "phase",
  "http_status",
  "ok",
  "error_code",
  "field",
  "control_id",
  "details_id",
  "retry_after_s",
  "has_session",
  "has_submission",
  "photo_count",
  "pending_count",
  "done_count",
  "turnstile_state",
  "restored",
  "found",
  "reason",
  "response_shape",
  "request_seq",
  "edge_id",
  "debug_id",
]);

type DebugValue = string | number | boolean | null | undefined;
type DebugDetails = Record<string, DebugValue>;
type DebugEntry = Record<string, string | number | boolean | null>;

function safeToken(value: string): string | null {
  return TOKEN.test(value) ? value : null;
}

/** Strict allowlist: listing content and credentials cannot enter the trace. */
export function sanitizeUploadDebug(
  event: string,
  details: DebugDetails = {},
): DebugEntry | null {
  const cleanEvent = safeToken(event);
  if (!cleanEvent) return null;
  const clean: DebugEntry = { event: cleanEvent };
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_KEYS.has(key) || value === undefined) continue;
    if (typeof value === "string") {
      const token = safeToken(value);
      if (token !== null) clean[key] = token;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      clean[key] = value;
    }
  }
  return clean;
}

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const value = new URLSearchParams(window.location.search).get("debug");
    if (value === "1") sessionStorage.setItem(TRACE_KEY, "1");
    if (value === "0") sessionStorage.removeItem(TRACE_KEY);
    return value === "1" || (value !== "0" && sessionStorage.getItem(TRACE_KEY) === "1");
  } catch {
    return false;
  }
}

function currentDebugId(): string | null {
  if (!debugEnabled()) return null;
  try {
    let value = sessionStorage.getItem(`${TRACE_KEY}_id`);
    if (!value || !/^[A-Za-z0-9_-]{8,40}$/.test(value)) {
      value = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      sessionStorage.setItem(`${TRACE_KEY}_id`, value);
    }
    return value;
  } catch {
    return null;
  }
}

export function uploadDebugHeaders(): Record<string, string> {
  const id = currentDebugId();
  return id ? { "X-MP-Debug-ID": id } : {};
}

export function uploadDebug(event: string, details: DebugDetails = {}): void {
  if (!debugEnabled()) return;
  const debugId = currentDebugId();
  const safe = sanitizeUploadDebug(event, { ...details, debug_id: debugId });
  if (!safe) return;
  const entry: DebugEntry = { at: new Date().toISOString(), ...safe };
  const target = window as unknown as { __MP_UPLOAD_TRACE__?: DebugEntry[] };
  const trace = target.__MP_UPLOAD_TRACE__ ?? [];
  trace.push(entry);
  if (trace.length > TRACE_LIMIT) trace.splice(0, trace.length - TRACE_LIMIT);
  target.__MP_UPLOAD_TRACE__ = trace;
  console.info("[MP_UPLOAD]", entry);
}


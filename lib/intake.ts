import "server-only";
import crypto from "crypto";
import type { IntakeDetail } from "@/lib/uploadErrors";

/**
 * Server-side signing client for the intake API (VPS, behind caddy).
 *
 * ⚠️ THE REQUEST KEY LIVES ONLY IN VERCEL ENV — it can call commands but can
 * NOT mint owner sessions (those are signed with a separate VPS-only key; see
 * intake_api.py P0.1). Never import this from a client component; the
 * "server-only" import makes that a build error instead of a leak.
 *
 * Signature contract (must match intake_api.check_signature exactly):
 *   HMAC_SHA256(key, `${ts}|${nonce}|${method}|${path}|${sha256hex(body)}`)
 */

// A production build with no configured origin must not quietly sign requests
// to a hardcoded host: an unconfigured deploy fails closed instead of talking
// to whatever happens to answer at that name.
const CONFIGURED_API_URL = (process.env.INTAKE_API_URL || "").trim();
const API_URL =
  CONFIGURED_API_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");
const REQUEST_KEY = process.env.INTAKE_REQUEST_KEY || "";

export type IntakeResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; detail: IntakeDetail };

export async function signedIntakeCall(
  path: string,
  payload: Record<string, unknown>,
  opts: { idemKey?: string; timeoutMs?: number } = {},
): Promise<IntakeResult> {
  if (!REQUEST_KEY || !API_URL) {
    // Fail closed and loudly — a page silently talking to nothing is how a
    // whole cohort of owners would type a form into the void.
    return { ok: false, status: 503, detail: "intake not configured" };
  }
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const sig = crypto
    .createHmac("sha256", REQUEST_KEY)
    .update(`${ts}|${nonce}|POST|${path}|${bodyHash}`)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Settler-Ts": ts,
    "X-Settler-Nonce": nonce,
    "X-Settler-Sig": sig,
  };
  if (opts.idemKey) headers["X-Settler-Idem"] = opts.idemKey;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(API_URL + path, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      /* non-JSON body — `data` stays null and is never faked into {} */
    }
    if (!res.ok) {
      const rawDetail = data?.detail;
      const detail =
        typeof rawDetail === "string" ||
        (rawDetail && typeof rawDetail === "object" && !Array.isArray(rawDetail))
          ? (rawDetail as IntakeDetail)
          : `http ${res.status}`;
      return { ok: false, status: res.status, detail };
    }
    // A 200 carrying HTML (a proxy error page, a captive portal) is not an
    // empty success. Treating it as {} is how a caller reads a missing
    // submission_id as "fine" and walks the owner into the next step.
    if (data === null) {
      return { ok: false, status: 502, detail: "intake malformed response" };
    }
    return { ok: true, status: res.status, data };
  } catch {
    // Timeout / connection refused / DNS — the owner-facing copy for this is
    // K4's send-fail line; the route maps it. Never leak infra detail.
    return { ok: false, status: 503, detail: "intake unreachable" };
  } finally {
    clearTimeout(t);
  }
}

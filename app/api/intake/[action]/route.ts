import { NextResponse } from "next/server";
import { validOwnerUploadTurnstile } from "@/lib/turnstile";
import { signedIntakeCall } from "@/lib/intake";
import { mapIntakeError } from "@/lib/uploadErrors";

/**
 * Browser → Vercel → intake API proxy for the COMMAND lane.
 *
 * The browser never signs anything (the request key stays server-side) and
 * never talks to the VPS directly except for the image PUT, which uses a
 * single-use bearer ticket + CORS instead.
 *
 * Error mapping happens HERE, not in the client: the API's `detail` strings
 * are engineering text, and Grok's frozen copy law says the owner sees
 * Georgian product language, never «შეცდომა» as an opener (K5).
 */

const ACTIONS: Record<string, string> = {
  "verify-start": "/verify/start",
  "verify-check": "/verify/check",
  create: "/submission/create",
  recover: "/submission/recover",
  abandon: "/submission/abandon",
  ticket: "/submission/ticket",
  finalize: "/submission/finalize",
  status: "/submission/status",
  "gallery-reset": "/submission/gallery-reset",
};

function mapError(status: number, detail: Parameters<typeof mapIntakeError>[1], action: string) {
  return mapIntakeError(status, detail, action);
}

const TURNSTILE_TIMEOUT_MS = 5_000;
/** Largest command body we will read before parsing. Commands are small JSON
 *  objects; anything larger is rejected without buffering it. */
const MAX_BODY_BYTES = 16 * 1024;

function debugIdFrom(req: Request): string | null {
  const value = req.headers.get("x-mp-debug-id") || "";
  return /^[A-Za-z0-9_-]{8,40}$/.test(value) ? value : null;
}

function proxyDebug(
  debugId: string | null,
  event: string,
  action: string,
  details: Record<string, string | number | boolean | undefined> = {},
) {
  if (!debugId) return;
  console.info("[MP_UPLOAD_PROXY]", JSON.stringify({ debug_id: debugId, event, action, ...details }));
}

function proxyJson(body: unknown, status: number, debugId: string | null) {
  return NextResponse.json(body, {
    status,
    headers: debugId ? { "X-MP-Debug-ID": debugId } : undefined,
  });
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = (process.env.TURNSTILE_SECRET || "").trim();
  if (!secret) {
    // Production must be configured: an unconfigured bot gate that returns
    // true is an open door, not a convenience. Development still runs.
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TURNSTILE_TIMEOUT_MS);
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: ctrl.signal,
        cache: "no-store",
      },
    );
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    const expectedHostname = (
      process.env.TURNSTILE_EXPECTED_HOSTNAME || "mepatrone.com"
    ).trim();
    return validOwnerUploadTurnstile(data, expectedHostname);
  } catch {
    return false; // Turnstile down or slow = fail closed on the bot gate
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const debugId = debugIdFrom(req);
  const path = ACTIONS[action];
  proxyDebug(debugId, "proxy.request", action);
  if (!path) return proxyJson({ error: "unknown" }, 404, debugId);

  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return proxyJson({ error: mapError(413, "request body too large", action) }, 413, debugId);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    // Content-Length can lie or be absent under chunked encoding; the decoded
    // length is the one that actually bounds what we parse.
    if (raw.length > MAX_BODY_BYTES) {
      return proxyJson({ error: mapError(413, "request body too large", action) }, 413, debugId);
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return proxyJson({ error: mapError(400, "bad request", action) }, 400, debugId);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return proxyJson({ error: mapError(400, "bad request", action) }, 400, debugId);
  }

  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0";

  // Bot gate on the entry step only — the session HMAC covers the rest.
  if (action === "verify-start") {
    const token = typeof body.turnstile === "string" ? body.turnstile : "";
    delete body.turnstile;
    if (!(await verifyTurnstile(token, ip))) {
      return proxyJson(
        { error: { code: "turnstile", ka: "უსაფრთხოების შემოწმება ვერ დასრულდა. თავიდან ჩატვირთე და სცადე." } },
        403,
        debugId,
      );
    }
    body.client_ip = ip; // the API's per-IP caps key on this
  }

  const idemKey =
    typeof body.idem === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.idem)
      ? body.idem
      : undefined;
  delete body.idem;

  const res = await signedIntakeCall(path, body, { idemKey });
  if (!res.ok) {
    const mapped = mapError(res.status, res.detail, action);
    proxyDebug(debugId, "proxy.response", action, {
      http_status: res.status,
      ok: false,
      error_code: mapped.code,
      field: mapped.field,
    });
    return proxyJson({ error: mapped }, res.status, debugId);
  }
  proxyDebug(debugId, "proxy.response", action, { http_status: res.status, ok: true });
  return proxyJson(res.data, res.status, debugId);
}

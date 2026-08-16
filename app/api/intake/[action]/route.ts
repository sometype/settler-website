import { NextResponse } from "next/server";
import { signedIntakeCall } from "@/lib/intake";

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
  ticket: "/submission/ticket",
  finalize: "/submission/finalize",
};

// Frozen Georgian copy (Grok K1–K8 + street answer, OWNERUPLOADDISCUSSION).
// Keys are stable machine codes the client switches on; ka is shown verbatim.
const ERRORS: Record<string, { code: string; ka: string }> = {
  busy: {
    code: "busy",
    ka: "ახლა გადატვირთულია. 5 წამში თავიდან სცადე. არაფერი დაიკარგა.",
  },
  too_fast: {
    code: "too_fast",
    ka: "ცოტა დაიცადე და თავიდან დააჭირე. შენი განცხადება ადგილზეა.",
  },
  send_failed: {
    code: "send_failed",
    ka: "კოდი ვერ გაიგზავნა. სცადე თავიდან, ან სხვა მეილი.",
  },
  bad_email: { code: "bad_email", ka: "ელფოსტა არასწორია — შეამოწმე." },
  bad_code: {
    code: "bad_code",
    ka: "კოდი არასწორია ან ვადა გაუვიდა. სცადე თავიდან ან მოითხოვე ახალი.",
  },
  session_expired: {
    code: "session_expired",
    ka: "სესიის ვადა გავიდა — ელფოსტა თავიდან დაადასტურე. შენი მონაცემები ადგილზეა.",
  },
  bad_phone: {
    code: "bad_phone",
    ka: "ნომერი არასწორია — ქართული მობილური უნდა იყოს (5XX XX XX XX).",
  },
  street_name_only: {
    code: "street_name_only",
    ka: "სახლის ან ბინის ნომერი აქ არ იწერება (უსაფრთხოებისთვის — ნომერი საჯაროდ არ ჩანს). დატოვე მხოლოდ ქუჩა, მაგ.: პეკინის ქ. ან ვაჟა-ფშაველას გამზ.",
  },
  draft_exists_email: {
    code: "draft_exists_email",
    ka: "ამ ელფოსტაზე უკვე გაქვს დაუსრულებელი განცხადება.",
  },
  draft_exists_phone: {
    code: "draft_exists_phone",
    ka: "ამ ნომერზე უკვე გაქვს დაუსრულებელი განცხადება.",
  },
  field: { code: "field", ka: "ერთ-ერთი ველი არასწორია — გადახედე." },
  ticket_spent: {
    code: "ticket_spent",
    ka: "ამ ფოტოს ატვირთვა თავიდან სცადე.",
  },
  gallery: {
    code: "gallery",
    ka: "ფოტოებში ხარვეზია — გადახედე და თავიდან სცადე.",
  },
};

function mapError(status: number, detail: string) {
  // Detail beats status: the API's provider-failure branch is ALSO a 503,
  // and «გადატვირთულია» would tell an owner to retry a send that will fail
  // again — K4's copy exists precisely for that case.
  if (detail.includes("verification temporarily unavailable"))
    return ERRORS.send_failed;
  if (status === 503) return ERRORS.busy;
  if (status === 429) {
    // verify/start resend cooldown carries "retry in Ns" — surface seconds so
    // the client can count down instead of guessing.
    const m = detail.match(/retry in (\d+)s/);
    if (m) return { ...ERRORS.too_fast, retry_after_s: Number(m[1]) };
    return ERRORS.too_fast;
  }
  if (detail.includes("invalid email")) return ERRORS.bad_email;
  if (detail.includes("verification temporarily unavailable"))
    return ERRORS.send_failed;
  if (detail.includes("wrong or expired code")) return ERRORS.bad_code;
  if (detail.includes("session expired")) return ERRORS.session_expired;
  if (detail.includes("Georgian mobile")) return ERRORS.bad_phone;
  if (detail.includes("street_name_only") || detail === "street_display")
    return ERRORS.street_name_only;
  if (detail.includes("submission exists for this email"))
    return ERRORS.draft_exists_email;
  if (detail.includes("submission exists for this phone"))
    return ERRORS.draft_exists_phone;
  if (detail.includes("ticket")) return ERRORS.ticket_spent;
  if (detail.includes("positions") || detail.includes("preferred_cover"))
    return ERRORS.gallery;
  return ERRORS.field;
}

const TURNSTILE_TIMEOUT_MS = 5_000;
/** Largest command body we will read before parsing. Commands are small JSON
 *  objects; anything larger is rejected without buffering it. */
const MAX_BODY_BYTES = 16 * 1024;

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
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
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
  const path = ACTIONS[action];
  if (!path) return NextResponse.json({ error: "unknown" }, { status: 404 });

  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: ERRORS.field }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    // Content-Length can lie or be absent under chunked encoding; the decoded
    // length is the one that actually bounds what we parse.
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: ERRORS.field }, { status: 413 });
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: ERRORS.field }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: ERRORS.field }, { status: 400 });
  }

  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0";

  // Bot gate on the entry step only — the session HMAC covers the rest.
  if (action === "verify-start") {
    const token = typeof body.turnstile === "string" ? body.turnstile : "";
    delete body.turnstile;
    if (!(await verifyTurnstile(token, ip))) {
      return NextResponse.json(
        { error: { code: "turnstile", ka: "დაადასტურე, რომ რობოტი არ ხარ." } },
        { status: 403 },
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
    return NextResponse.json(
      { error: mapError(res.status, res.detail) },
      { status: res.status },
    );
  }
  return NextResponse.json(res.data);
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validatePhaseAEvent } from "@/lib/event-contract";

const ALLOWED = new Set([
  "call_tap",
  "wa_tap",
  "listing_open",
  "filter_apply",
  "empty_result",
  // 2026-07-30 — see AITALKS § FROZEN CONTRACT — instrumentation (item #4).
  // A type missing from this set 400s, which is how a new event silently
  // records nothing (the RAIL_SOURCES lesson, three times over).
  "session_start",
  "filter_clear",
  "sort_apply",
  "card_photo_exposure",
  "card_photo_swipe",
]);

type Body = {
  event_type?: string;
  listing_id?: number | null;
  session_id?: string | null;
  path?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function POST(req: Request) {
  // Local next dev shares production Supabase keys via NEXT_PUBLIC_*, so a
  // stray localhost click would land in real site_events — especially bad for
  // call_tap, which is sparse and high-signal (the whole table's history once
  // held a single one).
  //
  // Override: SITE_EVENTS_FORCE=1 records even in development.
  // ⚠️ The client ALSO no-ops in development (lib/events.ts), so this override
  // only takes effect for requests made directly to this route, not from the
  // browser. Kept server-side deliberately: this is the last line of defence
  // and must not depend on what the client chose to send.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SITE_EVENTS_FORCE !== "1"
  ) {
    return NextResponse.json({ ok: true, skipped: "development" });
  }

  // ⚠️ NODE_ENV is "production" on Vercel PREVIEW deployments, so the check
  // above does nothing there. Previews are exactly where the redesign gets
  // hand-tested on a real phone — and the most valuable thing to test is
  // tapping "დარეკე", which would write a fake conversion into the one metric
  // this work exists to move. VERCEL_ENV distinguishes them properly.
  //
  // Tagged rather than dropped: you still want proof the preview worked, and
  // meta.env keeps preview traffic separable in every query afterwards.
  const isPreview = process.env.VERCEL_ENV === "preview";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const eventType = (body.event_type ?? "").trim();
  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
  }

  let listingId: number | null = null;
  if (body.listing_id != null && body.listing_id !== undefined) {
    const n = Number(body.listing_id);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ ok: false, error: "bad_listing" }, { status: 400 });
    }
    listingId = n;
  }

  const sessionId =
    typeof body.session_id === "string" ? body.session_id.slice(0, 80) : null;
  const rawPath = typeof body.path === "string" ? body.path : null;
  // Phase A privacy cutover: queries are unbounded user input. Re-strip every
  // event server-side so old cached clients cannot keep writing them during
  // rollout even after the new client switches to pathname-only transport.
  const path = rawPath ? rawPath.split(/[?#]/, 1)[0].slice(0, 500) : null;
  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? body.meta
      : {};
  // session_id/path are length-capped above; cap meta too, or this endpoint
  // is an open invitation to bloat the free-tier DB with megabyte blobs.
  //
  // ⚠️ I3 BEATS I7 FOR CONTACT EVENTS — ruled at reconciliation, on GPT's own
  // flag. The contact contract returns a fixed {surface, rail, sort, deal}
  // shape, so an oversized raw contact payload can never reach the DB no matter
  // what it contained. Capping it BEFORE sanitization therefore protects
  // nothing and deletes an unbackfillable conversion — precisely the failure
  // C2 exists to prevent. Contacts are sanitized first and are bounded by
  // construction; every other event type keeps the raw cap unchanged.
  const isContact = eventType === "call_tap" || eventType === "wa_tap";
  if (!isContact && JSON.stringify(meta).length > 2048) {
    return NextResponse.json({ ok: false, error: "meta_too_big" }, { status: 400 });
  }
  const contract = validatePhaseAEvent(eventType, listingId, meta);
  for (const notice of contract.notices) {
    // Key/reason only. The rejected value is exactly what must not reach DB or logs.
    console.warn("[events] sanitized", notice.reason, notice.key);
  }
  if (contract.error) {
    console.warn("[events] rejected", contract.error.reason, contract.error.key);
    return NextResponse.json(
      { ok: false, error: contract.error.reason },
      { status: 400 }
    );
  }
  // Stamped AFTER the size check so a caller cannot use it to dodge the cap,
  // and last so a client-supplied `env` can never overwrite the real one.
  const taggedMeta = isPreview ? { ...contract.meta, env: "preview" } : contract.meta;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: "unconfigured" }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("site_events").insert({
    event_type: eventType,
    listing_id: listingId,
    session_id: sessionId,
    path,
    meta: taggedMeta,
  });

  if (error) {
    // Don't leak schema details to clients; log server-side.
    console.error("[events]", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

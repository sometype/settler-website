import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED = new Set([
  "call_tap",
  "wa_tap",
  "listing_open",
  "filter_apply",
  "empty_result",
]);

type Body = {
  event_type?: string;
  listing_id?: number | null;
  session_id?: string | null;
  path?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function POST(req: Request) {
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
  const path = typeof body.path === "string" ? body.path.slice(0, 500) : null;
  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? body.meta
      : {};

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
    meta,
  });

  if (error) {
    // Don't leak schema details to clients; log server-side.
    console.error("[events]", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

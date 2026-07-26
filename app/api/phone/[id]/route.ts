import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * Number lookup for the card's call button: GET /api/phone/{listingId}.
 *
 * WHY THIS EXISTS RATHER THAN PUTTING tel: ON THE CARD
 * Phones are public by product decision, but that decision was about a caller
 * being able to reach an owner fast — not about the feed being bulk-extractable.
 * A tel: link in the markup puts ~24 owners' numbers in every feed page, so the
 * whole corpus could be harvested in ~45 requests. Resolving on tap costs one
 * request per listing, which is the same effort as opening each detail page, and
 * keeps zero numbers in feed HTML.
 *
 * The listing id comes from the route, never a caller-supplied number, and the
 * lookup goes through listings_public — so anything the view hides (unpublished,
 * flagged_agent, dedupe alias, removed) has no number to give.
 *
 * Deliberately uncached: this is personal data and must not sit in a CDN.
 */
function noStore(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return noStore({ error: "bad_id" }, 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings_public")
    .select("phone, has_phone")
    .eq("id", listingId)
    .maybeSingle();

  if (error || !data || !data.has_phone || !data.phone) {
    return noStore({ phone: null }, 404);
  }
  return noStore({ phone: data.phone });
}

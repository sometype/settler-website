import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * Image origin for the whole site: /img/{listingId}/{position}.
 *
 * Every photo is served from our own domain. The browser never learns where a
 * listing was collected from — no upstream hostname appears in markup, network
 * requests, or referrers.
 *
 * The upstream URL is looked up server-side from the listing id, never taken
 * from the request. That is deliberate: a route that fetched a caller-supplied
 * URL would be an open proxy (SSRF). The host allowlist below is a second gate
 * in case a bad row ever reaches the table.
 *
 * Once the stored copies are reachable (NEXT_PUBLIC_IMAGE_BASE_URL set), this
 * route redirects to them instead and stops touching upstream entirely.
 */
const UPSTREAM_HOSTS = new Set([
  "static-statements.tnet.ge",
  "static.ss.ge",
  "static.my.ge",
]);

// Photos are immutable once posted; long CDN cache keeps the per-image DB
// lookup to a one-time cost.
const CACHE_CONTROL = "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400";

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; pos: string }> }
) {
  const { id, pos } = await ctx.params;
  const listingId = Number(id);
  const position = Number(pos);
  if (
    !Number.isInteger(listingId) ||
    listingId <= 0 ||
    !Number.isInteger(position) ||
    position < 0
  ) {
    return notFound();
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listing_images")
    .select("source_url, stored_path")
    .eq("listing_id", listingId)
    .eq("position", position)
    .maybeSingle();
  if (error || !data) return notFound();

  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;
  if (data.stored_path && base) {
    return Response.redirect(`${base.replace(/\/$/, "")}/${data.stored_path}`, 308);
  }

  if (!data.source_url) return notFound();
  let upstream: URL;
  try {
    upstream = new URL(data.source_url);
  } catch {
    return notFound();
  }
  if (upstream.protocol !== "https:" || !UPSTREAM_HOSTS.has(upstream.hostname)) {
    return notFound();
  }

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return notFound();
  }
  if (!res.ok || !res.body) return notFound();

  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return notFound();

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

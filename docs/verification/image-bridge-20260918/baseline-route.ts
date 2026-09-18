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
 * Once the stored copies are reachable (IMAGE_CDN_BASE_URL set), this
 * route redirects to them instead and stops touching upstream entirely.
 */
const UPSTREAM_HOSTS = new Set([
  "static-statements.tnet.ge",
  "static.ss.ge",
  "static.my.ge",
]);

// Existing keys can receive new bytes. Keep browser and CDN caching bounded.
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=300";

/**
 * Young-image bridge while the bounded image sync catches up.
 *
 * `stored_path` is written the moment a photo lands on VPS *disk*, but the
 * object only reaches storage on settler-imagesync's next sweep — so for a new
 * listing's first minutes the 308 below points at a 404. That window is
 * exactly the "just added" rail, i.e. the product's front door.
 *
 * While an image row is younger than the sync interval plus a buffer, serve
 * it through the upstream proxy instead of redirecting. Age comes from the
 * row's own `created_at` (measured ~2s after listing insert), so late-added
 * photos on an old listing bridge correctly too. After the window it is
 * ALWAYS the configured CDN redirect — if the sync breaks for hours, that is
 * an ops problem for the ledger-backed heartbeat,
 * not something this route should paper over per-request.
 */
function boundedMinutes(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 60 ? value : fallback;
}

const IMAGE_SYNC_INTERVAL_MIN = boundedMinutes(process.env.IMAGE_SYNC_INTERVAL_MIN, 10);
const BRIDGE_BUFFER_MIN = 10;
const BRIDGE_WINDOW_MS = (IMAGE_SYNC_INTERVAL_MIN + BRIDGE_BUFFER_MIN) * 60 * 1000;

// Bridge responses must expire fast: with the year-long TTL above, the edge
// would pin the proxied bytes forever and the image would never cut over to
// R2 after the sync runs.
const BRIDGE_CACHE_CONTROL = "public, max-age=60, s-maxage=60";

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
}

function serviceUnavailable(): Response {
  return new Response(null, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "60" },
  });
}

function validImageBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function imageBaseUrl(now = Date.now()): string | null {
  const primary = validImageBaseUrl(process.env.IMAGE_CDN_BASE_URL);
  if (primary) return primary;

  const fallbackRaw = process.env.IMAGE_CDN_FALLBACK_BASE_URL;
  const fallbackExpiresAt = Date.parse(process.env.IMAGE_CDN_FALLBACK_EXPIRES_AT ?? "");
  if (!fallbackRaw || !Number.isFinite(fallbackExpiresAt) || fallbackExpiresAt <= now) {
    return null;
  }
  return validImageBaseUrl(fallbackRaw);
}

/**
 * ss.ge stamps its logo on the default image URL; appending `_Original` to the
 * stem serves the same photo unstamped (image_worker.py does exactly this for
 * the stored copies — measured 250/250 available, never lower resolution).
 * Without this, a brand-new ss listing shows the logo for its first ~25 minutes
 * while the bridge proxies upstream, then flips clean once R2 syncs — and those
 * first minutes are precisely the just-added rail, i.e. the front door.
 * The stamped URL stays as the fallback, so a missing variant costs a logo,
 * never a photo. Suffix is case-sensitive.
 */
function unstampedCandidates(upstream: URL): URL[] {
  if (upstream.hostname !== "static.ss.ge") return [upstream];
  const m = upstream.pathname.match(/^(.*)(\.[A-Za-z]+)$/);
  if (!m || m[1].endsWith("_Original")) return [upstream];
  const clean = new URL(upstream.href);
  clean.pathname = `${m[1]}_Original${m[2]}`;
  return [clean, upstream];
}

/** Shared by the legacy no-stored-path branch and the young-image bridge. */
async function proxyUpstream(sourceUrl: string, cacheControl: string): Promise<Response> {
  let upstream: URL;
  try {
    upstream = new URL(sourceUrl);
  } catch {
    return notFound();
  }
  if (upstream.protocol !== "https:" || !UPSTREAM_HOSTS.has(upstream.hostname)) {
    return notFound();
  }

  for (const candidate of unstampedCandidates(upstream)) {
    let res: Response;
    try {
      res = await fetch(candidate, {
        headers: { Accept: "image/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      continue;
    }
    if (!res.ok || !res.body) continue;

    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) continue;

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return notFound();
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
    .select("source_url, stored_path, created_at")
    .eq("listing_id", listingId)
    .eq("position", position)
    .maybeSingle();
  if (error || !data) return notFound();

  const base = imageBaseUrl();
  if (data.stored_path) {
    const ageMs = Date.now() - new Date(data.created_at).getTime();
    // NaN age (malformed timestamp) falls through to the redirect — the
    // bridge is an exception for provably-young rows, never the default.
    if (ageMs < BRIDGE_WINDOW_MS && data.source_url) {
      return proxyUpstream(data.source_url, BRIDGE_CACHE_CONTROL);
    }
    // A missing/invalid CDN authority is a provider failure, not permission to
    // silently proxy source portals forever.
    if (!base) return serviceUnavailable();
    return Response.redirect(`${base}/${data.stored_path}`, 308);
  }

  if (!data.source_url) return notFound();
  return proxyUpstream(data.source_url, CACHE_CONTROL);
}

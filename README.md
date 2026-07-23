# Settler — website (test launch MVP)

Curated Tbilisi apartment rentals. Next.js App Router + TypeScript + Tailwind,
reading **public-safe data only** from Supabase.

## Data access model

- Listings come from the view **`public.listings_public`** — never the `listings` table.
- The view exposes `has_phone` (boolean) only. **No phone column exists on the view**;
  the browser can never see a number. RLS + zero anon grants block the base table.
- Images come from **`public.listing_images`** (RLS policy: public read).
- The browser uses the **anon key only**. `service_role` must never appear here.
- Empty DB ⇒ empty state. There is no mock data anywhere.

The migration that creates all of this is [sql/001_listings_public.sql](sql/001_listings_public.sql).
**Already applied** to the project on 2026-07-23 (verified: anon reads the view,
anon is denied on `listings`). Re-running it is safe (idempotent).

## Setup

1. `npm install`
2. Open `.env.local` (already contains the project URL) and paste the anon key:

   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://klzyldquqdsymjfbcmci.supabase.co` (prefilled) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → `anon` `public` key |
   | `NEXT_PUBLIC_IMAGE_BASE_URL` | optional; leave empty for test. When the image CDN exists, set it and stored images (`stored_path`, `image_status='ready'`) are preferred over hotlinks |

3. `npm run dev` → http://localhost:3000

## Deploy (Vercel)

Import the repo, set the same three env vars in Vercel → Project → Settings →
Environment Variables, deploy. No other config needed.

## Image resolution order

1. `NEXT_PUBLIC_IMAGE_BASE_URL + '/' + stored_path` when `stored_path` is set and `image_status='ready'`
2. `source_url` hotlink fallback (may be referrer-blocked → graceful placeholder)
3. Placeholder

## Pages

- `/` — feed, newest first (`first_seen_at desc`), 24 per page, filters in URL
  query params (`district`, `min`, `max`, `rooms`, `source`, `page`)
- `/listing/[id]` — gallery, full details, contact block (`has_phone` only),
  link to the original listing

## Out of scope (test launch)

Auth, maps, messaging, payments, analytics, admin, real phone numbers.

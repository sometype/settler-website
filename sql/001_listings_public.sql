-- Settler test-launch: public-safe read layer.
-- Run once against the Supabase project (SQL editor or psql as postgres).
--
-- Privacy model:
--   * RLS is enabled on all base tables and anon/authenticated hold no grants,
--     so nothing is web-readable except what this file explicitly exposes.
--   * The view runs with owner rights (security_invoker = false, the default),
--     which lets it read `listings` past RLS — deliberately. It exposes only
--     safe columns: NO phone, NO phone_status digits, just has_phone boolean.

create or replace view public.listings_public as
select
  id,
  source,
  source_id,
  url,
  district,
  rooms,
  price_usd,
  area,
  floor,
  bathrooms,
  build_period,
  condition,
  status,
  project_type,
  balcony,
  description,
  views,
  image_status,
  first_seen_at,
  last_seen_at,
  (phone is not null) as has_phone
from public.listings
where listing_status = 'active'
  and published = true
  and removed_at is null;

grant select on public.listings_public to anon, authenticated;

-- Images: web needs direct reads on listing_images (joined by listing_id).
-- Photos are public marketing content, so a permissive read policy is fine
-- for the test launch.
grant select on public.listing_images to anon, authenticated;

drop policy if exists "public read listing images" on public.listing_images;
create policy "public read listing images"
  on public.listing_images
  for select
  to anon, authenticated
  using (true);

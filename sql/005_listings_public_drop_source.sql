-- Remove collection provenance from the public read model.
--
-- WHY THIS IS A DB CHANGE AND NOT JUST A UI CHANGE
--
-- The site authenticates to PostgREST with the anon key, which is embedded in
-- the client JavaScript bundle and is therefore public by construction. Anyone
-- can lift it and query `listings_public` directly. So removing the source
-- badge, the source filter and the outbound "original listing" link from the
-- UI does not hide provenance — it only stops rendering it. `source`,
-- `source_id` and `url` have to leave the view itself.
--
-- The site no longer selects any of these three columns (lib/listings.ts uses
-- an explicit column list), so this migration can be applied before or after
-- the corresponding deploy without breaking either.
--
-- Everything else is carried over verbatim from 004, including the
-- `is distinct from 'flagged_agent'` exclusion — see that file for why it is an
-- exclusion and not an inclusion list.

drop view if exists public.listings_public;

create view public.listings_public as
select
  id,
  coalesce(deal_type, 'rent') as deal_type,
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
  description_ka,
  description_status,
  views,
  image_status,
  first_seen_at,
  last_seen_at,
  case
    when phone is not null and btrim(phone) <> '' then phone
    else null
  end as phone,
  (phone is not null and btrim(phone) <> '') as has_phone
from public.listings
where listing_status = 'active'
  and published = true
  and removed_at is null
  and description_status is distinct from 'flagged_agent';

grant select on public.listings_public to anon, authenticated;

-- STILL OPEN AFTER THIS MIGRATION
--
-- `listing_images.source_url` remains readable by anon, because /img/[id]/[pos]
-- resolves the upstream URL with the anon key at request time. That is the last
-- machine-readable trace. Two ways to close it, in preference order:
--
--   1. Finish the image migration. The image worker has already downloaded
--      ~98.6% of photos; once they are served from our own bucket and
--      NEXT_PUBLIC_IMAGE_BASE_URL is set, the route stops reading source_url at
--      all and the column can be revoked from anon outright.
--   2. Give the site a service-role key for server-side reads only, then revoke
--      anon SELECT on listing_images. Faster, but it puts a privileged key in
--      the deployment environment, which .env.example currently forbids.

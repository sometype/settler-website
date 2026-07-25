-- Normalized districts + amenities in the read model.
--
-- SUPERSEDES 006 (which superseded 005 — 005 must still never be applied).
-- Everything 006 did is carried verbatim: no source/source_id/url, the
-- flagged_agent exclusion, the canonical_id alias filter. New here:
--
--   district_code  canonical slug ("Saburtalo" and "საბურთალო" are BOTH
--                  'saburtalo'). The site filters on this; the raw `district`
--                  column stays exposed as a display fallback for codes the
--                  website's map doesn't know yet.
--
--   amenities      presence map {key: true}. UNION of two independent layers:
--                  1. structured source data (myhome parameters / ss booleans,
--                     extracted by normalize_lib into listings.amenities) —
--                     sparse on myhome, where 737/862 owners tick nothing;
--                  2. facts the description worker's Haiku pass extracted from
--                     the LISTING TEXT (description_flags.desc.facts) — this is
--                     what fills the myhome hole: 374 active listings say
--                     "furnished" in prose, 197 "metro nearby", 70 parking.
--                  Merged HERE, at the view boundary, so the base column stays
--                  purely source-derived and future description worker runs are
--                  reflected without any backfill.
--                  Only 'yes' facts merge in. Absence means UNKNOWN, not "no".
--
--   desc_facts     the raw facts object itself (pets_allowed can be 'no',
--                  deposit_required, utilities_included, min_months) for the
--                  detail page's rental-terms block. Values are yes/no/unstated
--                  enums + an integer — no free text, no PII.

drop view if exists public.listings_public;

create view public.listings_public as
select
  id,
  coalesce(deal_type, 'rent') as deal_type,
  district,
  district_code,
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
  coalesce(amenities, '{}'::jsonb)
    || case when description_flags->'desc'->'facts'->>'furnished' = 'yes'
            then '{"furniture": true}'::jsonb else '{}'::jsonb end
    || case when description_flags->'desc'->'facts'->>'pets_allowed' = 'yes'
            then '{"pets_allowed": true}'::jsonb else '{}'::jsonb end
    || case when description_flags->'desc'->'facts'->>'parking' = 'yes'
            then '{"parking": true}'::jsonb else '{}'::jsonb end
    || case when description_flags->'desc'->'facts'->>'metro_nearby' = 'yes'
            then '{"metro_nearby": true}'::jsonb else '{}'::jsonb end
    as amenities,
  description_flags->'desc'->'facts' as desc_facts,
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
  and description_status is distinct from 'flagged_agent'
  and canonical_id is null;

grant select on public.listings_public to anon, authenticated;

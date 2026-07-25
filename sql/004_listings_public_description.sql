-- Expose the cleaned Georgian description and hide text-detected agents.
--
-- Two deliberate choices:
--
-- 1. The agent filter is an EXCLUSION (`is distinct from 'flagged_agent'`), never an
--    inclusion list like `in ('clean','fail_open','empty')`. An inclusion list would
--    also drop every listing still queued as 'pending', which would empty the feed the
--    moment this view is applied ahead of the worker draining its backlog. The
--    exclusion form is safe to apply at any time: unprocessed listings keep showing,
--    and each one disappears only if it is actually judged an agent.
--    `is distinct from` (not `<>`) so NULL statuses are kept rather than silently dropped.
--
-- 2. `description` stays RAW here and `description_ka` is exposed alongside it; the
--    site prefers the clean text and falls back to raw. Collapsing the two into one
--    column in SQL would hide which listings have actually been processed.

drop view if exists public.listings_public;

create view public.listings_public as
select
  id,
  source,
  source_id,
  url,
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

-- One physical apartment, one public card.
--
-- SUPERSEDES 005 — this file contains everything 005 did (dropping source /
-- source_id / url from the read model) plus the alias filter. 005 was written but
-- never applied; applying it AFTER this would silently drop the canonical filter
-- and put duplicates back on the site. Apply this one instead.
--
-- WHAT `canonical_id` MEANS
--
-- An owner posts the same flat on myhome AND ss, or twice on one site. dedupe_worker.py
-- picks the best copy as the master and points every other copy's `canonical_id` at it.
-- `canonical_id IS NULL` therefore means "I am the master" — which is the default for
-- every existing and future row, so this filter is a no-op until the worker runs, and
-- an un-run worker can never empty the feed. Same fail-open shape as the
-- `description_status` exclusion below.
--
-- NOTHING IS DELETED. An alias keeps its history, images, phone and view samples; it
-- just stops being shown. Clearing `canonical_id` un-hides it immediately, which is why
-- a wrong merge is recoverable.
--
-- WHY THIS IS A VIEW CHANGE AND NOT A UI CHANGE: the same reason as 005 — the view is
-- the durable boundary, the front end is not. It also means the hero's live counts and
-- the pagination totals correct themselves without touching lib/listings.ts.

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
  and description_status is distinct from 'flagged_agent'
  and canonical_id is null;

grant select on public.listings_public to anon, authenticated;

-- NOTE ON DEEP LINKS: a listing that becomes an alias disappears from this view, so
-- /listing/<alias-id> now renders the branded Georgian not-found page. That is correct
-- but not ideal — redirecting an alias to its master would be better, and needs
-- canonical_id exposed to the app. Deliberately not done here: the aliases being hidden
-- today have never been linked from anywhere public.
--
-- STILL OPEN (unchanged from 005): `listing_images.source_url` remains anon-readable
-- because /img/[id]/[pos] resolves the upstream URL at request time. Closed by finishing
-- the image bucket move — the files are now in R2, so this is one env var away.

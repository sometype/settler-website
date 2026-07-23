-- Product decision: show seller phones to buyers on the public site.
-- Only expose a number when we actually have one (resolved/unmasked or ss full number).
-- Note: the anon key can read these numbers (by design for Settler).

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
  -- digits only when present; UI shows "pending" when null
  case
    when phone is not null and btrim(phone) <> '' then phone
    else null
  end as phone,
  (phone is not null and btrim(phone) <> '') as has_phone
from public.listings
where listing_status = 'active'
  and published = true
  and removed_at is null;

grant select on public.listings_public to anon, authenticated;

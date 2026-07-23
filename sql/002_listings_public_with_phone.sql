-- Product decision: show seller phones to buyers on the public site.
-- DROP + recreate required when column list changes (Postgres view replace limit).

drop view if exists public.listings_public;

create view public.listings_public as
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

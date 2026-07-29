-- Expose price-drop pair on listings_public for the sale «ფასი დაეცა» rail.
-- Supersedes 009 column list by appending only (CREATE OR REPLACE may not
-- reorder/rename). Carries forward 009 verbatim + price columns.
--
-- If condition_code was already added to listings by a parallel migration,
-- it is NOT automatically here — append in a later migration if the website
-- needs it for karkasi chips. This file only adds the price-drop fields.

CREATE OR REPLACE VIEW public.listings_public AS
 SELECT id,
    COALESCE(deal_type, 'rent'::text) AS deal_type,
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
    (((COALESCE(amenities, '{}'::jsonb) ||
        CASE
            WHEN (((description_flags -> 'desc'::text) -> 'facts'::text) ->> 'furnished'::text) = 'yes'::text THEN '{"furniture": true}'::jsonb
            ELSE '{}'::jsonb
        END) ||
        CASE
            WHEN (((description_flags -> 'desc'::text) -> 'facts'::text) ->> 'pets_allowed'::text) = 'yes'::text THEN '{"pets_allowed": true}'::jsonb
            ELSE '{}'::jsonb
        END) ||
        CASE
            WHEN (((description_flags -> 'desc'::text) -> 'facts'::text) ->> 'parking'::text) = 'yes'::text THEN '{"parking": true}'::jsonb
            ELSE '{}'::jsonb
        END) ||
        CASE
            WHEN (((description_flags -> 'desc'::text) -> 'facts'::text) ->> 'metro_nearby'::text) = 'yes'::text THEN '{"metro_nearby": true}'::jsonb
            ELSE '{}'::jsonb
        END AS amenities,
    (description_flags -> 'desc'::text) -> 'facts'::text AS desc_facts,
    views,
    image_status,
    first_seen_at,
    last_seen_at,
        CASE
            WHEN phone IS NOT NULL AND btrim(phone) <> ''::text THEN phone
            ELSE NULL::text
        END AS phone,
    phone IS NOT NULL AND btrim(phone) <> ''::text AS has_phone,
    last_checked_at,
    price_drop_from_usd,
    price_dropped_at
   FROM listings
  WHERE listing_status = 'active'::text
    AND published = true
    AND removed_at IS NULL
    AND description_status IS DISTINCT FROM 'flagged_agent'::text
    AND canonical_id IS NULL;

GRANT SELECT ON public.listings_public TO anon, authenticated;

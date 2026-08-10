-- 021 — a listing nobody can contact is not a listing (live 8613, 2026-08-10):
-- myhome reveal failed 3x -> NULL phone, row stayed public. The product is
-- "call the owner"; publication now requires a phone. Self-healing: the row
-- returns the moment a phone lands (reveal retry / monitor refresh).
-- Verbatim pg_get_viewdef + ONE predicate — columns untouched.
-- Measured before apply: exactly 4 live rows leave.
CREATE OR REPLACE VIEW listings_public AS
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
    price_dropped_at,
    condition_code,
        CASE
            WHEN COALESCE(deal_type, 'rent'::text) = 'sale'::text AND price_usd IS NOT NULL AND price_usd >= 5000 AND price_usd <= 5000000 THEN price_usd
            WHEN COALESCE(deal_type, 'rent'::text) IS DISTINCT FROM 'sale'::text AND price_usd IS NOT NULL AND price_usd >= 50 AND price_usd <= 50000 THEN price_usd
            ELSE NULL::integer
        END AS price_sort,
    street_display
   FROM listings
  WHERE listing_status = 'active'::text AND published = true AND removed_at IS NULL AND description_status IS DISTINCT FROM 'flagged_agent'::text AND canonical_id IS NULL AND phone IS NOT NULL AND btrim(phone) <> ''::text;

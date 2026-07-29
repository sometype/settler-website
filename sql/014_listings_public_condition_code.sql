-- 014 — expose `condition_code` on listings_public.
--
-- ⚠️ RENUMBERED 013 -> 014. Two migrations were authored as `013` in parallel
-- (this one and 013_listings_public_price_drop.sql). Both are a full
-- CREATE OR REPLACE of the SAME view, and the price-drop one does NOT select
-- condition_code — so replaying them in filename order would have run it LAST
-- and silently dropped this column, breaking the კარკასი filter with no error.
-- This file is the authoritative definition: it contains BOTH price_drop_*
-- and condition_code. Apply it after 013.
--
-- APPEND-ONLY. This is the live 009/price-drop view definition with ONE column
-- added at the end; every visibility clause, the amenities merge, raw
-- `condition`, and existing column ORDER are preserved byte-for-byte. Column
-- order matters: the website selects an explicit list, but anything doing
-- `select *` against a changed order would silently shift.
--
-- `condition_code` is the normalized კარკასი grade (black|white|green, else
-- NULL) written by normalize_lib.condition_code(). Raw `condition` stays for
-- the detail page's «მდგომარეობა» label — the code is for filtering only.
--
-- ⚠️ Anon can read this column. That is fine: it is a market grade, not
-- provenance. It says nothing about which site a listing came from.

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
    condition_code
   FROM listings
  WHERE listing_status = 'active'::text AND published = true AND removed_at IS NULL AND description_status IS DISTINCT FROM 'flagged_agent'::text AND canonical_id IS NULL;

GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;

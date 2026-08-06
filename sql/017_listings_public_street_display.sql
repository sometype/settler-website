-- 017 — expose `street_display` on listings_public.
--
-- APPEND-ONLY. This is the live 015/price_sort view definition with ONE column
-- added at the end; every visibility clause, the amenities merge, and existing
-- column ORDER are preserved byte-for-byte. Column order matters: the website
-- selects an explicit list, but anything doing `select *` against a changed
-- order would silently shift.
--
-- ⚠️⚠️ ONLY `street_display` CROSSES THIS BOUNDARY. Deliberately NOT exposed:
--   * street_normalizer_version — ops metadata, tells a visitor nothing
--   * the raw source address     — never stored on `listings` at all, by design
--   * ss streetId / streetNumber, myhome's bundled address string, coordinates
-- The column holds a street or place NAME and never a house number: the owner's
-- phone is public, so street + number + phone would be a doorstep rather than a
-- listing. That law is enforced upstream in normalize_lib.street_display(),
-- which fails closed, plus a reviewed allow/deny list for any value carrying a
-- digit. See STREETDISCUSSION.md.
--
-- ⚠️ Anon can read this column. That is the point — it is a public street name,
-- the same fact printed on the building. It says nothing about which portal a
-- listing came from and carries no provenance.
--
-- ⚠️ TRAP #10: apply this BEFORE deploying website code that selects the column.
-- `main` auto-deploys, and append-only migrations are safe to apply early —
-- deployed code never selects what it does not know about.

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
  WHERE listing_status = 'active'::text AND published = true AND removed_at IS NULL AND description_status IS DISTINCT FROM 'flagged_agent'::text AND canonical_id IS NULL;

GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;

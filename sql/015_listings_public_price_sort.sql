-- 015 — expose `price_sort` on listings_public for honest price ordering.
--
-- ⚠️ Why this exists (Claude 2026-07-30 sort critique):
-- Cards use `sanePriceUsd` (rent 50–50_000, sale 5_000–5_000_000) and render
-- «ფასი მოთხოვნით» when out of bounds. Ordering raw `price_usd` still ranks
-- those garbage values, so "cheapest first" opens with price-less cards
-- (measured: 4 on rent, 33 on sale under the sale floor).
--
-- `price_sort` is the same bounds in ONE place at the database: the value if
-- it would display as a real price, else NULL. Sort with NULLS LAST so
-- display and order agree by construction — same discipline as cover_penalty.
--
-- APPEND-ONLY: full CREATE OR REPLACE of the live 014 view with ONE column
-- added at the end. Visibility clauses and column order of existing fields
-- are preserved. Website selects an explicit list and does not need to
-- SELECT price_sort into the browser — it only uses it for ORDER BY.

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
    -- Display-honest sort key (mirrors website sanePriceUsd bounds).
    CASE
      WHEN COALESCE(deal_type, 'rent'::text) = 'sale'::text
        AND price_usd IS NOT NULL
        AND price_usd >= 5000
        AND price_usd <= 5000000
      THEN price_usd
      WHEN COALESCE(deal_type, 'rent'::text) IS DISTINCT FROM 'sale'::text
        AND price_usd IS NOT NULL
        AND price_usd >= 50
        AND price_usd <= 50000
      THEN price_usd
      ELSE NULL::integer
    END AS price_sort
   FROM listings
  WHERE listing_status = 'active'::text AND published = true AND removed_at IS NULL AND description_status IS DISTINCT FROM 'flagged_agent'::text AND canonical_id IS NULL;

GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;

-- 022 — merged duals can have TWO real phones; show both (human decision,
-- DEDUPDISCUSSION 2026-08-11). photo_shape merges two-SIM owners: the alias's
-- number was verified for ITS portal listing, and burying it kills half the
-- owner's real contact surface on Mepatrone. The card keeps the master's
-- number first; `alt_phones` carries the aliases' distinct numbers.
--
-- Correlated subquery cost: hits idx_listings_canonical (partial, canonical_id
-- IS NOT NULL) and only the DETAIL fetch selects the column — feed/rail
-- queries never reference it, so the planner prunes it from card pages.
-- Verbatim 021 view + ONE appended column; predicate untouched.
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
    street_display,
    (SELECT array_agg(DISTINCT btrim(a.phone))
       FROM listings a
      WHERE a.canonical_id = listings.id
        AND a.phone IS NOT NULL AND btrim(a.phone) <> ''::text
        AND right(regexp_replace(a.phone, '\D'::text, ''::text, 'g'::text), 9)
            IS DISTINCT FROM right(regexp_replace(listings.phone, '\D'::text, ''::text, 'g'::text), 9)
    ) AS alt_phones
   FROM listings
  WHERE listing_status = 'active'::text AND published = true AND removed_at IS NULL AND description_status IS DISTINCT FROM 'flagged_agent'::text AND canonical_id IS NULL AND phone IS NOT NULL AND btrim(phone) <> ''::text;

-- CREATE OR REPLACE preserves existing grants in production, but keep this
-- migration independently replayable on a fresh database too.
GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;

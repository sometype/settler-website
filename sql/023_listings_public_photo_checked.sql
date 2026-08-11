-- 023 — a listing is not FINISHED until its photos are checked (human law,
-- DEDUPDISCUSSION 2026-08-11): the dedupe worker's photo check must run
-- BEFORE the card enters the feed, so a duplicate never flashes publicly at
-- all. Cost accepted by the human: a new listing appears up to ~15 min later.
--
-- Gate logic (no flap states):
--   photo_dedupe_checked_at set          -> visible (checked)
--   image_status 'pending'               -> hidden  (gallery incomplete)
--   terminal status + NO stored images   -> visible (nothing to check)
--   terminal status + images, unchecked  -> hidden  (waiting for the worker,
--                                            <=15 min; heartbeat alarms if
--                                            the worker starves the feed)
--
-- ⚠️ CUTOVER ORDER: backfill-stamp the existing corpus FIRST (it was fully
-- covered by the 2026-08-11 pilot + weekly scans) or the whole feed vanishes.
-- Verbatim 022 view + ONE appended predicate; columns untouched.
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
  WHERE listing_status = 'active'::text AND published = true AND removed_at IS NULL AND description_status IS DISTINCT FROM 'flagged_agent'::text AND canonical_id IS NULL AND phone IS NOT NULL AND btrim(phone) <> ''::text
 AND (photo_dedupe_checked_at IS NOT NULL
        OR (image_status IS DISTINCT FROM 'pending'
            AND NOT EXISTS (SELECT 1 FROM listing_images li
                             WHERE li.listing_id = listings.id
                               AND li.stored_path IS NOT NULL)));

-- CREATE OR REPLACE preserves existing grants in production, but keep this
-- migration independently replayable on a fresh database too.
GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;

-- 023 v2 — a listing is not FINISHED until its photos are checked (human law
-- 2026-08-11), REVISIONED per GPT critique: a one-time stamp is not a
-- certificate, because inputs change after the check (late photos, phone
-- reveal, price/shape edits, republish, unhide). schema_photo_gate.sql
-- triggers advance photo_dedupe_due_at on every such change; the checker
-- CAS-stamps photo_dedupe_checked_at after actually resolving the listing.
--
-- Gate states (no flap):
--   image_status 'pending'            -> hidden  (gallery incomplete)
--   due IS NULL                       -> visible (terminal, nothing stored to check)
--   checked_at >= due_at              -> visible (certified for THIS revision)
--   otherwise                         -> hidden  (due; worker stamps within ~1 min,
--                                        heartbeat pages on starvation)
--
-- ⚠️ CUTOVER (GPT §7): schema+triggers first · minute timer proven on canaries ·
-- reconcile the corpus through the REAL checker (--reconcile-gate; never a
-- blanket UPDATE) · parity check · only then apply this view. At the 2026-08-11
-- snapshot, flipping early = 205 of 4,280 visible — a hard stop.
-- Verbatim 022 view + the gate predicate; columns untouched.
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
 AND (image_status IS DISTINCT FROM 'pending')
    AND (photo_dedupe_due_at IS NULL
         OR photo_dedupe_checked_at >= photo_dedupe_due_at);

-- CREATE OR REPLACE preserves existing grants in production, but keep this
-- migration independently replayable on a fresh database too.
GRANT SELECT ON listings_public TO anon, authenticated, claude_ro;

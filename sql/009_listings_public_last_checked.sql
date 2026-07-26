-- Expose last_checked_at on listings_public.
--
-- WHY: "we re-checked this listing N hours ago" is the strongest honest trust
-- signal we have and no incumbent shows it. Measured 2026-07-26 over 1,122 live
-- listings: median 3.6h since last check, worst 6.0h, 99.8% within 6h, ZERO
-- never-checked. That is a claim worth putting on the page.
--
-- Supersedes 007. Everything else is carried forward VERBATIM from the live
-- definition (pulled with pg_get_viewdef, not retyped) — the amenities union
-- from description_flags, desc_facts, the phone/has_phone pair, and all four
-- hide axes in the WHERE clause. Adding one column must not quietly change the
-- read model.
--
-- Note last_checked_at is refreshed both by the monitor's verification pass AND
-- by a scraper re-observing a listing, so it means "last seen to be real",
-- slightly weaker than "independently re-verified". The UI wording should not
-- over-promise.

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
    -- APPENDED, not inserted mid-list: CREATE OR REPLACE VIEW can only add
    -- columns at the end (it refuses to rename existing positions), and
    -- appending avoids a DROP that would take the grants and any dependent
    -- object with it.
    last_checked_at
   FROM listings
  WHERE listing_status = 'active'::text
    AND published = true
    AND removed_at IS NULL
    AND description_status IS DISTINCT FROM 'flagged_agent'::text
    AND canonical_id IS NULL;

GRANT SELECT ON public.listings_public TO anon, authenticated;

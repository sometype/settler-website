-- public.listings_hot — ranking for the "people are looking at this" rail.
--
-- FOUR THINGS HERE ARE LOAD-BEARING. Each one corresponds to a way this rail
-- has already been shown to break:
--
-- 1. ROLLING WINDOW OVER view_samples, never listings.views and never
--    peak_velocity.
--      * listings.views is a CAPTURE-TIME value refreshed only when the monitor
--        revisits. Measured 2026-07-26: it matches the newest view_samples row
--        in 2 of 1,124 live listings. Ranking on it is meaningless.
--      * view_velocity is a single-interval point estimate overwritten on every
--        poll; read in the morning it ranks listings by overnight traffic.
--      * peak_velocity never decays (GREATEST), so it fills the rail with
--        listings that spiked three days ago.
--
-- 2. SELF-READ CORRECTION IS SOURCE-SPECIFIC. Fetching a myhome page increments
--    its own counter by exactly 1; ss's counter does not move on a raw HTTP read
--    (verified by triple-reading both). Subtracting 1 everywhere is what used to
--    floor every ss listing to zero and produce an all-myhome leaderboard.
--
-- 3. RANK WITHIN AGE BAND. Views per hour collapses with age — measured medians
--    10.0/h under 6h, 3.77 at 6-24h, 2.86 at 24-72h. Ranking on raw heat puts
--    only newborns in the rail, which makes it a duplicate of "just added" with
--    a different title. Banding is what makes this a SECOND signal rather than
--    the same one relabelled.
--
-- 4. RANK WITHIN SOURCE. myhome is a genuinely bigger site (max peak 357 vs ss
--    28). Pooling them erases ss entirely — which looks exactly like the old
--    velocity bug and is not.
--
-- Price sanity bounds match lib/listings.ts so a $38 "sale" cannot be famous.
-- Sale is computed but the site currently requests rent only: sale listings die
-- faster than rentals (median 18h vs 39h) for reasons nobody has explained, so
-- sale velocity is not trusted yet.

CREATE OR REPLACE VIEW public.listings_hot AS
WITH pairs AS (
    SELECT vs.listing_id,
           l.source,
           l.deal_type,
           l.created_at,
           vs.raw_views,
           vs.sampled_at,
           lag(vs.raw_views) OVER w  AS prev_views,
           lag(vs.sampled_at) OVER w AS prev_at
      FROM view_samples vs
      JOIN listings l ON l.id = vs.listing_id
     WHERE vs.sampled_at > now() - interval '12 hours'
       AND l.listing_status = 'active'
       AND l.published
       AND l.canonical_id IS NULL
       AND l.description_status IS DISTINCT FROM 'flagged_agent'
       AND (
             (l.deal_type = 'rent' AND l.price_usd BETWEEN 50 AND 50000)
          OR (l.deal_type = 'sale' AND l.price_usd BETWEEN 5000 AND 5000000)
           )
    WINDOW w AS (PARTITION BY vs.listing_id ORDER BY vs.sampled_at)
),
rates AS (
    SELECT listing_id, source, deal_type, created_at,
           (raw_views - prev_views
              - CASE WHEN source = 'myhome' THEN 1 ELSE 0 END)
           / greatest(extract(epoch FROM (sampled_at - prev_at)) / 3600.0, 0.25)
             AS vph
      FROM pairs
     WHERE prev_views IS NOT NULL
       -- a counter that went backwards is a source glitch, not negative interest
       AND raw_views >= prev_views
),
peak AS (
    SELECT listing_id, source, deal_type,
           max(vph) AS hot_vph,
           CASE
             WHEN extract(epoch FROM (now() - created_at)) / 3600.0 < 6  THEN '<6h'
             WHEN extract(epoch FROM (now() - created_at)) / 3600.0 < 24 THEN '6-24h'
             WHEN extract(epoch FROM (now() - created_at)) / 3600.0 < 72 THEN '24-72h'
             ELSE '>72h'
           END AS age_band
      FROM rates
     GROUP BY listing_id, source, deal_type, created_at
)
SELECT listing_id,
       deal_type,
       round(hot_vph::numeric, 2) AS hot_vph,
       age_band,
       round((percent_rank() OVER (PARTITION BY source, deal_type, age_band
                                   ORDER BY hot_vph) * 100)::numeric, 1) AS pct_in_band,
       count(*) OVER (PARTITION BY source, deal_type, age_band) AS band_n
  FROM peak
 WHERE hot_vph > 0;

-- Anon needs this to render the rail. It exposes no personal data: listing ids
-- and a rate, nothing more.
GRANT SELECT ON public.listings_hot TO anon, authenticated;

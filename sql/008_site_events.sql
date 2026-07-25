-- 008_site_events.sql — first-party product analytics (no third-party scripts).
--
-- Purpose: measure the call-first funnel without cookies/consent banners:
--   call_tap, wa_tap, listing_open, filter_apply, empty_result
--
-- Security:
--   • anon may INSERT only (beacon from the site)
--   • anon may NOT SELECT (no public read of other sessions)
--   • claude_ro / service role can SELECT for analysis
--   • never stores phone numbers or PII beyond opaque session_id

CREATE TABLE IF NOT EXISTS site_events (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type   TEXT NOT NULL
                   CHECK (event_type IN (
                     'call_tap', 'wa_tap', 'listing_open',
                     'filter_apply', 'empty_result'
                   )),
    listing_id   BIGINT REFERENCES listings(id) ON DELETE SET NULL,
    session_id   TEXT,
    path         TEXT,
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_events_type_time
    ON site_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_events_listing
    ON site_events (listing_id, created_at DESC)
    WHERE listing_id IS NOT NULL;

ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;

-- Insert beacons from the public site (anon key in browser → API → this policy).
GRANT INSERT ON site_events TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE site_events_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS site_events_anon_insert ON site_events;
CREATE POLICY site_events_anon_insert ON site_events
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        event_type IN (
          'call_tap', 'wa_tap', 'listing_open', 'filter_apply', 'empty_result'
        )
    );

-- Read for analysis (same pattern as listing_matches).
GRANT SELECT ON site_events TO claude_ro;
DROP POLICY IF EXISTS claude_ro_read ON site_events;
CREATE POLICY claude_ro_read ON site_events
    FOR SELECT TO claude_ro USING (true);

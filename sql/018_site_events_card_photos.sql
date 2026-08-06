-- 018 — card-photo preview measurement.
--
-- Phase 1 adds:
--   card_photo_exposure — once per browser-tab session when the first eligible
--                         feed carousel is at least 50% visible
--   card_photo_swipe    — after a changed slide index settles
--
-- Keep the API allowlist, table CHECK and anon INSERT policy identical. This is
-- a forward migration: 016 may already be applied and must not be rewritten.

ALTER TABLE site_events
  DROP CONSTRAINT IF EXISTS site_events_event_type_check;

ALTER TABLE site_events
  ADD CONSTRAINT site_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'call_tap'::text,
    'wa_tap'::text,
    'listing_open'::text,
    'filter_apply'::text,
    'empty_result'::text,
    'session_start'::text,
    'filter_clear'::text,
    'sort_apply'::text,
    'card_photo_exposure'::text,
    'card_photo_swipe'::text
  ]));

DROP POLICY IF EXISTS site_events_anon_insert ON site_events;

CREATE POLICY site_events_anon_insert ON site_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (event_type = ANY (ARRAY[
    'call_tap'::text,
    'wa_tap'::text,
    'listing_open'::text,
    'filter_apply'::text,
    'empty_result'::text,
    'session_start'::text,
    'filter_clear'::text,
    'sort_apply'::text,
    'card_photo_exposure'::text,
    'card_photo_swipe'::text
  ]));

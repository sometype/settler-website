-- 016 — allow session_start / filter_clear / sort_apply into site_events.
--
-- ⚠️⚠️ WHY THIS EXISTS, AND THE TRAP IT DOCUMENTS.
-- `site_events.event_type` is guarded in THREE places that must agree:
--   1. `ALLOWED` in app/api/events/route.ts        (rejects with 400)
--   2. `site_events_event_type_check` on the table (rejects with 500)
--   3. the `site_events_anon_insert` RLS policy's WITH CHECK — the route
--      inserts as `anon`, so this one bites even after the table constraint
--      is fixed, and it fails with the SAME opaque 500. Fixing only the
--      constraint looked correct and changed nothing.
-- Commit 48cb18d added three new event types to the first and not the second,
-- because nothing in the route hints that a second gate exists. Result: every
-- session_start POST returned 500 and NOTHING was recorded — the events looked
-- wired, the code was correct, and the data silently did not exist.
--
-- This is the same shape as the RAIL_SOURCES whitelist (a `src` value missing
-- there records rail:null and the taps vanish) and the normalize_lib /
-- lib/districts.ts two-place sync rule. **Adding an event type is a TWO-PLACE
-- change. Apply this migration in the same breath as the code, or the code is
-- a no-op.**
--
-- ⚠️ Events cannot be backfilled. Every page load between 48cb18d shipping and
-- this migration being applied is a session_start that is gone for good. Apply
-- promptly and record the cutover — the denominator only begins here.
--
-- Additive and reversible: the five existing types are unchanged, so nothing
-- already recorded can violate the new constraint and no rewrite is needed.

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
    -- 2026-07-30, see AITALKS § FROZEN CONTRACT — instrumentation (item #4)
    'session_start'::text,
    'filter_clear'::text,
    'sort_apply'::text
  ]));

-- The RLS policy the route actually inserts under. Same list, third place.
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
    'sort_apply'::text
  ]));

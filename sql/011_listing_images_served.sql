-- 011 — listing_images_served: the image rows the site reads, in cover order.
--
-- Companion to schema_cover_class.sql in the backend repo (which adds the class
-- labels and the cover_penalty() policy function). Apply that one first.
--
-- WHAT THIS EXPOSES, AND WHAT IT DELIBERATELY DOES NOT
--   Out: listing_id, position, is_main, serve_rank.
--   NOT out: cover_classes, cover_confidence, suspect_reasons, dhash, or
--   anything else on image_quality. Those strings — `platform_mark` above all —
--   name the site a photo was collected from. The /img route exists so no
--   upstream hostname ever reaches the browser; shipping a class label that
--   means "this carries myhome's watermark" would leak the same fact in words.
--   `serve_rank` leaks nothing: it is an order, and an order is what the UI
--   needs. Do NOT "just add the reason for debugging" — read image_quality
--   directly as claude_ro instead.
--
--   ⚠️ This is also why anon must NOT be granted SELECT on image_quality.
--
-- SECURITY MODEL
--   Plain view, owned by postgres, NOT security_invoker. Anon needs SELECT on
--   this view and nothing else; the join into RLS-protected image_quality
--   happens as the view owner. That is the entire point — a narrow window
--   instead of opening the analysis table.
--
--   The row SET is unchanged from what anon can already read: listing_images
--   carries `public read listing images` USING (true), so every image row of
--   every listing is anon-visible today and this view adds not one row to that.
--   (That policy is broader than it looks — it does not check `published`.
--   Pre-existing, unchanged here, recorded in HANDOFF as its own question.)
--
-- COST
--   The window function partitions by listing_id, and every caller filters on
--   listing_id, so Postgres pushes the filter through the window and the plan
--   stays an index scan over the handful of listings on screen. Re-check with
--   EXPLAIN if the feed ever selects images without a listing_id filter — a
--   full ranking of 24k rows per page load is the failure mode.

CREATE OR REPLACE VIEW listing_images_served AS
SELECT
    li.listing_id,
    li.position,
    li.is_main,
    -- 0 = the cover. Ordering, not identity: nothing here writes is_main.
    (row_number() OVER (
        PARTITION BY li.listing_id
        ORDER BY cover_penalty(q.cover_classes),
                 li.is_main DESC,
                 li.position
     ) - 1)::int AS serve_rank
FROM listing_images li
LEFT JOIN image_quality q ON q.image_id = li.id;

GRANT SELECT ON listing_images_served TO anon, authenticated, claude_ro;

COMMENT ON VIEW listing_images_served IS
  'Client-safe image rows plus serve_rank (0 = cover). Cover demotion happens here, at query time — never by writing listing_images.is_main. Class labels are intentionally absent: they name the collection source.';

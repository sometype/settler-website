-- 012 — listing_images_served, v2: a swap must EARN the position.
--
-- Replaces 011's penalty sort. Same view name, same columns, same grants — the
-- website is unchanged and does not know this happened.
--
-- 011 ordered every photo by how dirty it was and let the cleanest win. That
-- reliably removed watermarks and just as reliably replaced good rooms with
-- clean bad ones (see schema_cover_class_v2.sql for the audit that killed it).
--
-- v2 inverts the default. THE OWNER'S COVER STAYS unless a specific candidate
-- clears every one of four bars:
--
--   1. the ORIGINAL's overlay is `obvious` or `dominant`   — a discreet corner
--      logo is not worth touching someone's chosen photo
--   2. the CANDIDATE has no overlay at all (`graphic_defect = 'none'`)
--   3. the CANDIDATE is a real room or view — never a floor plan, map,
--      document or non-property image
--   4. the CANDIDATE is not a downgrade: strength >= the original's
--   5. and not a downgrade in SUBJECT either — a hero room is never traded for
--      a bathroom, corridor or window view. Added after the first v2 audit:
--      both of its 2 losses in 40 tied on strength and fell on subject.
--
-- Everything else — no v2 grades yet, ungraded photos, every photo defective,
-- a subtle mark, only weak alternatives — falls through to the legacy order.
-- Falling through is the SAFE outcome: it is exactly what the site does today.
--
-- Two properties worth stating because they were bugs in v1:
--   * An UNGRADED photo can never win. Rule 2 requires a positive 'none', and
--     cover_strength_rank(NULL) is NULL so rule 4 is never true. In v1 an
--     unscored photo outranked a known-bad one and could take the cover of a
--     half-processed listing.
--   * A listing where EVERY photo is defective keeps position 0. There is no
--     candidate satisfying rule 2, so nothing moves. v1 reshuffled 16 such
--     listings on the strength of noisy class labels.

CREATE OR REPLACE VIEW listing_images_served AS
WITH graded AS (
    SELECT li.id,
           li.listing_id,
           li.position,
           li.is_main,
           q.graphic_defect,
           q.defect_prominence,
           q.cover_subject,
           cover_strength_rank(q.cover_strength) AS strength,
           cover_subject_rank(q.cover_subject) AS subject_rank
      FROM listing_images li
      LEFT JOIN image_quality q ON q.image_id = li.id
),
-- The photo the site shows today: is_main, else lowest position. Measured
-- 2026-07-28, is_main is always position 0, so in practice this IS position 0.
original AS (
    SELECT DISTINCT ON (listing_id)
           listing_id, position, defect_prominence, strength, subject_rank
      FROM graded
     ORDER BY listing_id, is_main DESC, position
),
candidate AS (
    SELECT DISTINCT ON (g.listing_id) g.listing_id, g.position
      FROM graded g
      JOIN original o ON o.listing_id = g.listing_id
     WHERE o.defect_prominence IN ('obvious', 'dominant')   -- 1
       AND g.graphic_defect = 'none'                        -- 2
       AND g.cover_subject IN ('hero_room', 'secondary_space_or_view')  -- 3
       AND g.strength >= o.strength                         -- 4 (NULL ⇒ false)
       AND g.subject_rank >= o.subject_rank                 -- 5
       AND g.position <> o.position
     -- Best available, earliest as the tie-break: reaching deeper into a
     -- gallery costs nothing extra once the photo has already qualified.
     ORDER BY g.listing_id, g.strength DESC, g.position
)
SELECT
    g.listing_id,
    g.position,
    g.is_main,
    (row_number() OVER (
        PARTITION BY g.listing_id
        ORDER BY CASE WHEN g.position = c.position THEN 0 ELSE 1 END,
                 g.is_main DESC,
                 g.position
     ) - 1)::int AS serve_rank
FROM graded g
LEFT JOIN candidate c ON c.listing_id = g.listing_id;

GRANT SELECT ON listing_images_served TO anon, authenticated, claude_ro;

COMMENT ON VIEW listing_images_served IS
  'Client-safe image rows plus serve_rank (0 = cover). The owner''s cover is kept unless a candidate proves it is clean, a real room, and no weaker. Class labels are intentionally absent: they name the collection source.';

-- 019 — listing_images_served v3: the most appealing eligible photo leads.
--
-- Same view name, same columns, same grants — the website does not know this
-- happened. Rollback = re-apply 012. That is the entire kill switch.
--
-- WHAT CHANGED (COVERAPPEALDISCUSSION, human-approved 2026-08-09 after judging
-- a 30-pair blind sheet — "yes it beats it, ship"): v2 kept the owner's cover
-- unless it was defect-marked. v3 ranks every photo of a FULLY-GRADED gallery
-- by appeal and scene, and the best eligible photo takes position 0 in serve
-- order. Measured before flip: 1,602 of 3,635 live covers change (44%),
-- 485 of them weak→strong.
--
-- THE RULES, in priority order per listing:
--   0. owner_pin (listing_images.owner_pin) short-circuits everything.
--      No writer sets it yet; the contract honors it from day one (Grok §B).
--   1. v3 ranking applies ONLY when every stored photo of the gallery has a
--      terminal v3 grade (graded/unreadable). Partial gallery ⇒ rule 3.
--      New listings therefore keep today's behavior until the appeal worker
--      grades them — decay of coverage is a worker-cadence problem, never a
--      wrong-cover problem.
--   2. Within a graded gallery: eligible = no overlay, real room or view,
--      not bathroom/hallway scene, not poor strength — the v2 bars, answered
--      by v3's own re-ask so one grader's opinion is self-consistent.
--      Order: appeal (strong>decent>weak) → scene tier (living/kitchen >
--      bedroom/exterior/view > other) → owner's photo keeps EXACT appeal
--      ties (GPT tie policy — the sheet the human approved used it) →
--      earliest position.
--   3. Fallback for ungraded/partial galleries: v2's defect-rescue verbatim
--      (see 012's header for its five bars). Falling through is the SAFE
--      outcome: it is exactly what the site served yesterday.
--
-- Version is PINNED. A future v4 re-grade coexists in cover_grade_v3 and
-- takes over only by editing this literal in a reviewed migration.

CREATE OR REPLACE VIEW listing_images_served AS
WITH graded AS (
    SELECT li.id,
           li.listing_id,
           li.position,
           li.is_main,
           li.owner_pin,
           q.graphic_defect,
           q.defect_prominence,
           q.cover_subject,
           cover_strength_rank(q.cover_strength) AS strength,
           cover_subject_rank(q.cover_subject) AS subject_rank
      FROM listing_images li
      LEFT JOIN image_quality q ON q.image_id = li.id
),
g3 AS (
    SELECT cg.image_id,
           cg.listing_id,
           cg.status,
           (cg.status = 'graded'
            AND cg.graphic_defect = 'none'
            AND cg.cover_subject IN ('hero_room', 'secondary_space_or_view')
            AND cg.cover_scene NOT IN ('bathroom', 'hallway')
            AND cg.cover_strength <> 'poor')                    AS eligible,
           CASE cg.cover_appeal WHEN 'strong' THEN 2
                                WHEN 'decent' THEN 1 ELSE 0 END AS appeal_rank,
           CASE WHEN cg.cover_scene IN ('living_room', 'kitchen') THEN 3
                WHEN cg.cover_scene IN ('bedroom', 'exterior', 'view') THEN 2
                WHEN cg.cover_scene = 'other' THEN 1 ELSE 0 END AS scene_tier
      FROM cover_grade_v3 cg
     WHERE cg.classifier_version = 'appeal-v3-2026-08-09'
),
complete AS (       -- rule 1: every stored photo terminally graded
    SELECT li.listing_id
      FROM listing_images li
      LEFT JOIN g3 ON g3.image_id = li.id
     WHERE li.stored_path IS NOT NULL
     GROUP BY li.listing_id
    HAVING count(*) = count(*) FILTER (WHERE g3.status IN ('graded', 'unreadable'))
),
owner0 AS (         -- authoritative owner cover: is_main, else lowest position
    SELECT DISTINCT ON (g.listing_id)
           g.listing_id, g.position,
           g3.eligible   AS owner_eligible,
           g3.appeal_rank AS owner_appeal
      FROM graded g
      LEFT JOIN g3 ON g3.image_id = g.id
     ORDER BY g.listing_id, g.is_main DESC, g.position
),
pinned AS (         -- rule 0
    SELECT DISTINCT ON (listing_id) listing_id, position
      FROM listing_images
     WHERE owner_pin
     ORDER BY listing_id, position
),
best3 AS (          -- rule 2 ranking, before the owner-tie residual
    SELECT DISTINCT ON (g.listing_id)
           g.listing_id, g.position, g3.appeal_rank
      FROM graded g
      JOIN g3 ON g3.image_id = g.id
      JOIN complete c ON c.listing_id = g.listing_id
     WHERE g3.eligible
     ORDER BY g.listing_id, g3.appeal_rank DESC, g3.scene_tier DESC, g.position
),
chosen3 AS (        -- pin > owner-keeps-exact-tie > best
    SELECT b.listing_id,
           COALESCE(
               p.position,
               CASE WHEN o.owner_eligible AND o.owner_appeal >= b.appeal_rank
                    THEN o.position ELSE b.position END
           ) AS position
      FROM best3 b
      JOIN owner0 o ON o.listing_id = b.listing_id
      LEFT JOIN pinned p ON p.listing_id = b.listing_id
),
candidate2 AS (     -- rule 3: v2's defect rescue, verbatim from 012
    SELECT DISTINCT ON (g.listing_id) g.listing_id, g.position
      FROM graded g
      JOIN owner0 o ON o.listing_id = g.listing_id
      JOIN graded og ON og.listing_id = o.listing_id AND og.position = o.position
     WHERE og.defect_prominence IN ('obvious', 'dominant')
       AND g.graphic_defect = 'none'
       AND g.cover_subject IN ('hero_room', 'secondary_space_or_view')
       AND g.strength >= og.strength
       AND g.subject_rank >= og.subject_rank
       AND g.position <> o.position
     ORDER BY g.listing_id, g.strength DESC, g.position
)
SELECT
    g.listing_id,
    g.position,
    g.is_main,
    (row_number() OVER (
        PARTITION BY g.listing_id
        ORDER BY CASE WHEN g.position = COALESCE(c3.position, c2.position)
                      THEN 0 ELSE 1 END,
                 g.is_main DESC,
                 g.position
    ) - 1)::int AS serve_rank
FROM graded g
LEFT JOIN chosen3 c3 ON c3.listing_id = g.listing_id
LEFT JOIN candidate2 c2 ON c2.listing_id = g.listing_id;

GRANT SELECT ON listing_images_served TO anon, authenticated, claude_ro;

COMMENT ON VIEW listing_images_served IS
  'Client-safe image rows plus serve_rank (0 = cover). v3: fully-graded galleries lead with the most appealing eligible photo (owner keeps exact ties; owner_pin wins outright); partial/ungraded galleries fall back to the v2 defect rescue. Labels never reach the client.';

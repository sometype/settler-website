-- 020 — precompute the cover choice; the serving view becomes one cheap join.
--
-- WHY, measured minutes after 019 shipped: the v3 ranking CTEs (gallery
-- completeness GROUP BY + three DISTINCT ONs over all images) cannot take a
-- listing_id pushdown once the CTE is referenced twice — every card query
-- full-scanned the image corpus. 24-listing image batch: 10.9s cold / ~0.9s
-- warm, against a whole-homepage budget of ~2s. 012 had the same disease in
-- milder form; 019 made it visible.
--
-- SHAPE: the heavy SQL moves into refresh_cover_choice(), which writes one
-- row per listing into cover_choice (~4k rows, runs in ~1s). The view keys a
-- window function on listing_id over listing_images LEFT JOIN cover_choice —
-- fully pushdown-friendly. Same name, same columns, same grants; the website
-- still does not know any of this happened.
--
-- STALENESS CONTRACT: a listing with no cover_choice row serves the owner's
-- order (is_main, then position) — the safest possible default. The refresh
-- runs after every grading pass (settler-appeal timer) and at worst a new
-- listing waits one cycle for its ranked cover, never shows a wrong one.
--
-- Rollback: re-apply 012 (view only; the table is inert without the view).

CREATE TABLE IF NOT EXISTS cover_choice (
    listing_id bigint PRIMARY KEY,
    position   integer NOT NULL,
    rule       text    NOT NULL,   -- 'pin' | 'v3_owner_tie' | 'v3_appeal' | 'v2_rescue'
    updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON cover_choice FROM anon, authenticated;
GRANT SELECT ON cover_choice TO claude_ro;

CREATE OR REPLACE FUNCTION refresh_cover_choice() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH graded AS (
    SELECT li.id, li.listing_id, li.position, li.is_main, li.owner_pin,
           q.graphic_defect, q.defect_prominence, q.cover_subject,
           cover_strength_rank(q.cover_strength) AS strength,
           cover_subject_rank(q.cover_subject)  AS subject_rank
      FROM listing_images li
      LEFT JOIN image_quality q ON q.image_id = li.id
),
g3 AS (
    SELECT cg.image_id, cg.listing_id, cg.status,
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
complete AS (
    SELECT li.listing_id
      FROM listing_images li
      LEFT JOIN g3 ON g3.image_id = li.id
     WHERE li.stored_path IS NOT NULL
     GROUP BY li.listing_id
    HAVING count(*) = count(*) FILTER (WHERE g3.status IN ('graded', 'unreadable'))
),
owner0 AS (
    SELECT DISTINCT ON (g.listing_id)
           g.listing_id, g.position,
           g3.eligible AS owner_eligible, g3.appeal_rank AS owner_appeal
      FROM graded g LEFT JOIN g3 ON g3.image_id = g.id
     ORDER BY g.listing_id, g.is_main DESC, g.position
),
pinned AS (
    SELECT DISTINCT ON (listing_id) listing_id, position
      FROM listing_images WHERE owner_pin
     ORDER BY listing_id, position
),
best3 AS (
    SELECT DISTINCT ON (g.listing_id) g.listing_id, g.position, g3.appeal_rank
      FROM graded g
      JOIN g3 ON g3.image_id = g.id
      JOIN complete c ON c.listing_id = g.listing_id
     WHERE g3.eligible
     ORDER BY g.listing_id, g3.appeal_rank DESC, g3.scene_tier DESC, g.position
),
candidate2 AS (
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
),
decided AS (
    SELECT o.listing_id,
           COALESCE(p.position,
                    CASE WHEN b.listing_id IS NOT NULL
                              AND o.owner_eligible AND o.owner_appeal >= b.appeal_rank
                         THEN o.position END,
                    b.position,
                    c2.position) AS position,
           CASE WHEN p.listing_id IS NOT NULL THEN 'pin'
                WHEN b.listing_id IS NOT NULL
                     AND o.owner_eligible AND o.owner_appeal >= b.appeal_rank
                     THEN 'v3_owner_tie'
                WHEN b.listing_id IS NOT NULL THEN 'v3_appeal'
                WHEN c2.listing_id IS NOT NULL THEN 'v2_rescue' END AS rule
      FROM owner0 o
      LEFT JOIN pinned p ON p.listing_id = o.listing_id
      LEFT JOIN best3 b ON b.listing_id = o.listing_id
      LEFT JOIN candidate2 c2 ON c2.listing_id = o.listing_id
),
upsert AS (
    INSERT INTO cover_choice (listing_id, position, rule, updated_at)
    SELECT listing_id, position, rule, now()
      FROM decided WHERE position IS NOT NULL AND rule IS NOT NULL
    ON CONFLICT (listing_id) DO UPDATE
       SET position = EXCLUDED.position, rule = EXCLUDED.rule,
           updated_at = now()
     WHERE cover_choice.position <> EXCLUDED.position
        OR cover_choice.rule <> EXCLUDED.rule
    RETURNING 1
),
prune AS (
    DELETE FROM cover_choice cc
     WHERE NOT EXISTS (SELECT 1 FROM decided d
                        WHERE d.listing_id = cc.listing_id
                          AND d.position IS NOT NULL AND d.rule IS NOT NULL)
    RETURNING 1
)
SELECT coalesce((SELECT count(*) FROM upsert), 0)::int
     + coalesce((SELECT count(*) FROM prune), 0)::int;
$$;

REVOKE ALL ON FUNCTION refresh_cover_choice() FROM public, anon, authenticated;

-- The cheap view: one window over listing_images, one PK join. Pushdown works.
CREATE OR REPLACE VIEW listing_images_served AS
SELECT
    li.listing_id,
    li.position,
    li.is_main,
    (row_number() OVER (
        PARTITION BY li.listing_id
        ORDER BY CASE WHEN li.position = cc.position THEN 0 ELSE 1 END,
                 li.is_main DESC,
                 li.position
    ) - 1)::int AS serve_rank
FROM listing_images li
LEFT JOIN cover_choice cc ON cc.listing_id = li.listing_id;

GRANT SELECT ON listing_images_served TO anon, authenticated, claude_ro;

COMMENT ON VIEW listing_images_served IS
  'Client-safe image rows plus serve_rank (0 = cover). Choice precomputed in cover_choice by refresh_cover_choice() — pin > v3 appeal ranking (owner keeps exact ties) > v2 defect rescue; a listing with no row serves the owner''s order. Labels never reach the client.';

SELECT refresh_cover_choice() AS initial_rows;

-- 021 — keep the precomputed cover read model scoped to public inventory.
--
-- The first 020 refresh ranked every listing that still had image rows. That
-- was harmless to visitors (the serving query starts from public listings),
-- but it retained 195 choices for dead/hidden listings and made the rollout
-- counts overstate live coverage. Starting `graded` from listings_public makes
-- the table's rows and rule counts mean exactly what operators think they mean.
-- The prune CTE removes a choice as soon as its listing leaves public inventory.

CREATE OR REPLACE FUNCTION refresh_cover_choice() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH graded AS (
    SELECT li.id, li.listing_id, li.position, li.is_main, li.owner_pin,
           li.stored_path,
           q.graphic_defect, q.defect_prominence, q.cover_subject,
           cover_strength_rank(q.cover_strength) AS strength,
           cover_subject_rank(q.cover_subject)  AS subject_rank
      FROM listing_images li
      JOIN listings_public p ON p.id = li.listing_id
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
    SELECT g.listing_id
      FROM graded g
      LEFT JOIN g3 ON g3.image_id = g.id
     WHERE g.stored_path IS NOT NULL
     GROUP BY g.listing_id
    HAVING count(*) = count(*) FILTER (WHERE g3.status IN ('graded', 'unreadable'))
),
owner0 AS (
    SELECT DISTINCT ON (g.listing_id)
           g.listing_id, g.position,
           g3.eligible AS owner_eligible, g3.appeal_rank AS owner_appeal
      FROM graded g
      LEFT JOIN g3 ON g3.image_id = g.id
     ORDER BY g.listing_id, g.is_main DESC, g.position
),
pinned AS (
    SELECT DISTINCT ON (g.listing_id) g.listing_id, g.position
      FROM graded g
     WHERE g.owner_pin
     ORDER BY g.listing_id, g.position
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

SELECT refresh_cover_choice() AS reconciled_rows;

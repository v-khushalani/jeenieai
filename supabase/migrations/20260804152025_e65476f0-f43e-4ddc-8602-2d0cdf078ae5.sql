DO $$
DECLARE
  g RECORD;
  keeper uuid;
  dup uuid;
BEGIN
  FOR g IN
    SELECT upper(subject) AS s, class_level AS cl,
           lower(trim(coalesce(chapter_name, name, ''))) AS nm
    FROM public.chapters
    WHERE is_active
    GROUP BY 1,2,3
    HAVING count(*) > 1
  LOOP
    SELECT c.id INTO keeper
    FROM public.chapters c
    WHERE c.is_active AND upper(c.subject)=g.s
      AND c.class_level IS NOT DISTINCT FROM g.cl
      AND lower(trim(coalesce(c.chapter_name, c.name, '')))=g.nm
    ORDER BY (SELECT count(*) FROM public.questions q WHERE q.chapter_id=c.id) DESC,
             c.created_at ASC
    LIMIT 1;

    FOR dup IN
      SELECT c.id FROM public.chapters c
      WHERE c.is_active AND upper(c.subject)=g.s
        AND c.class_level IS NOT DISTINCT FROM g.cl
        AND lower(trim(coalesce(c.chapter_name, c.name, '')))=g.nm
        AND c.id <> keeper
    LOOP
      UPDATE public.questions SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.topics SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.study_notes SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.educator_content SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.concept_maps SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.class_logs SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.revision_schedule SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.study_plan_progress SET chapter_id = keeper WHERE chapter_id = dup;
      UPDATE public.chapters
        SET is_active = false,
            chapter_number = NULL,
            slug = NULL
        WHERE id = dup;
    END LOOP;
  END LOOP;
END $$;

-- Renumber sequentially (two-pass to dodge the unique index)
WITH ranked AS (
  SELECT id, row_number() OVER (
      PARTITION BY upper(subject), class_level
      ORDER BY coalesce(chapter_number, 999), lower(coalesce(chapter_name, name, ''))
    ) AS rn
  FROM public.chapters WHERE is_active
)
UPDATE public.chapters c SET chapter_number = r.rn + 1000
FROM ranked r WHERE c.id = r.id;

UPDATE public.chapters SET chapter_number = chapter_number - 1000
WHERE is_active AND chapter_number > 1000;
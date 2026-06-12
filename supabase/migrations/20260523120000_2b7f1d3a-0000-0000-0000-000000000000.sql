-- Returns difficulty distribution for a chapter (easy/medium/hard counts)
CREATE OR REPLACE FUNCTION public.get_chapter_difficulty_distribution(
  p_chapter_id uuid
) RETURNS TABLE(difficulty text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(difficulty, 'Unknown')::text AS difficulty, COUNT(*)::bigint
  FROM questions
  WHERE is_active = true AND chapter_id = p_chapter_id
  GROUP BY COALESCE(difficulty, 'Unknown')::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_chapter_difficulty_distribution(uuid) TO authenticated;

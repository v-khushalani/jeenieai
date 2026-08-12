create or replace function public.get_all_subject_question_counts(
  p_batch_ids uuid[] default null,
  p_exam text default null,
  p_class_level int default null
)
returns table (
  subject text,
  question_count bigint,
  chapter_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with filtered_chapters as (
    select id, c.subject
    from public.chapters c
    where is_active = true
      and (p_class_level is null or c.class_level = p_class_level)
      and (p_batch_ids is null or c.batch_id = any(p_batch_ids))
      and (p_exam is null or exam_relevance @> array[p_exam]::public.exam_code[])
  ),
  chapter_stats as (
    select 
      fc.subject,
      count(distinct fc.id) as chapters,
      count(q.id) as questions
    from filtered_chapters fc
    left join public.questions q on q.chapter_id = fc.id and q.is_active = true
    group by fc.subject
  )
  select 
    cs.subject,
    cs.questions,
    cs.chapters
  from chapter_stats cs;
end;
$$;

grant execute on function public.get_all_subject_question_counts to authenticated;
grant execute on function public.get_all_subject_question_counts to service_role;

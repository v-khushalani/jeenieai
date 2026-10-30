-- REVIEW REQUIRED. Do not execute in production during this task.
-- Forward-only hardening; rollback must NOT restore exposed answer grants.
BEGIN;
SET LOCAL check_function_bodies = false;
CREATE TABLE public.assessment_issuances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
 purpose text NOT NULL, config jsonb NOT NULL, issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, review_after timestamptz NOT NULL,
 group_id uuid, request_id uuid NOT NULL, completed_at timestamptz,
 totals jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,request_id)
);
GRANT SELECT ON public.assessment_issuances TO authenticated;
GRANT ALL ON public.assessment_issuances TO service_role;
ALTER TABLE public.assessment_issuances ENABLE ROW LEVEL SECURITY;
CREATE POLICY issuance_owner_read ON public.assessment_issuances FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE TABLE public.assessment_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuance_id uuid NOT NULL REFERENCES public.assessment_issuances(id),
 question_id uuid NOT NULL, position integer NOT NULL, snapshot jsonb NOT NULL,
 correct_marks numeric NOT NULL, incorrect_marks numeric NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(issuance_id,question_id),UNIQUE(issuance_id,position)
);
GRANT ALL ON public.assessment_items TO service_role;
ALTER TABLE public.assessment_items ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.assessment_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuance_id uuid NOT NULL REFERENCES public.assessment_issuances(id),
 item_id uuid NOT NULL UNIQUE REFERENCES public.assessment_items(id), response jsonb NOT NULL,
 is_correct boolean NOT NULL, marks numeric NOT NULL,request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT ALL ON public.assessment_receipts TO service_role;
ALTER TABLE public.assessment_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.assessment_requests (
 owner_id uuid NOT NULL,request_id uuid NOT NULL,operation text NOT NULL,input jsonb NOT NULL,receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_id,request_id,operation)
);
GRANT ALL ON public.assessment_requests TO service_role;
ALTER TABLE public.assessment_requests ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.secure_group_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,code text NOT NULL UNIQUE,is_active boolean NOT NULL DEFAULT true,
 config jsonb NOT NULL,items jsonb NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(owner_id,request_id)
);
GRANT ALL ON public.secure_group_templates TO service_role;
ALTER TABLE public.secure_group_templates ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX assessment_group_owner ON public.assessment_issuances(owner_id,group_id) WHERE group_id IS NOT NULL;
CREATE FUNCTION public.assessment_safe_question(q jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (q - ARRAY['correct_option','correct_options','correct_answer','numerical_answer','numerical_tolerance','explanation','explanation_image_url']) || jsonb_build_object('question_type',CASE WHEN q->>'numerical_answer' IS NOT NULL THEN 'numerical_decimal' ELSE coalesce(q->>'question_type','single_correct') END);
$$;
CREATE FUNCTION public.assessment_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.role()='service_role',false) OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','super_admin'));
$$;
CREATE FUNCTION public.assessment_grade(q jsonb,a jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE chosen text[]; correct text[]; numeric_value numeric;
BEGIN
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid response' USING ERRCODE='22023'; END IF;
 IF a->>'kind' IN ('skip','timeout') THEN IF a- 'kind'<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023';END IF;RETURN false; END IF;
 IF a->>'kind' IS NULL OR a ?| ARRAY['is_correct','score','correct_option','explanation'] THEN RAISE EXCEPTION 'Invalid response' USING ERRCODE='22023';END IF;
 IF (q->>'question_type' IN ('numerical','numerical_int','numerical_decimal') OR q->>'numerical_answer' IS NOT NULL) THEN
  IF a->>'kind'<>'numerical' OR (a->>'value') !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' OR length(a->>'value')>64 THEN RAISE EXCEPTION 'Invalid response' USING ERRCODE='22023'; END IF;
  numeric_value:=(a->>'value')::numeric;
  RETURN abs(numeric_value-(q->>'numerical_answer')::numeric)<=coalesce((q->>'numerical_tolerance')::numeric,0);
 END IF;
 IF a->>'kind'<>'options' OR jsonb_typeof(a->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'values') NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Invalid response' USING ERRCODE='22023'; END IF;
 SELECT array_agg(value ORDER BY value) INTO chosen FROM jsonb_array_elements_text(a->'values');
 IF EXISTS(SELECT 1 FROM unnest(chosen) v WHERE v NOT IN ('A','B','C','D')) OR cardinality(chosen)<>(SELECT count(DISTINCT v) FROM unnest(chosen) v) OR (q->>'question_type'<>'multi_correct' AND cardinality(chosen)>1) THEN RAISE EXCEPTION 'Invalid response' USING ERRCODE='22023'; END IF;
 SELECT array_agg(upper(trim(value)) ORDER BY upper(trim(value))) INTO correct FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(q->'correct_options')='array' AND jsonb_array_length(q->'correct_options')>0 THEN q->'correct_options' ELSE to_jsonb(string_to_array(q->>'correct_option',',')) END);
 RETURN coalesce(chosen=correct,false);
END $$;
CREATE FUNCTION public.get_assessment(p_assessment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.assessment_issuances; qs jsonb;
BEGIN
 SELECT * INTO s FROM public.assessment_issuances WHERE id=p_assessment_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment unavailable' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(public.assessment_safe_question(snapshot)||jsonb_build_object('item_id',id,'assessment_id',s.id) ORDER BY position) INTO qs FROM public.assessment_items WHERE issuance_id=s.id;
 RETURN jsonb_build_object('id',s.id,'sessionId',s.id,'title',coalesce(s.config->>'title','Test'),'duration',extract(epoch FROM s.expires_at-s.issued_at)/60,'startTime',s.issued_at,'expiresAt',s.expires_at,'examPattern',coalesce(s.config->>'resolved_exam',s.config->>'exam'),'questions',qs,'status',CASE WHEN s.completed_at IS NULL THEN 'in_progress' ELSE 'completed' END);
END $$;
CREATE FUNCTION public.issue_assessment(p_config jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); old public.assessment_issuances; v_config jsonb:=p_config; sid uuid; v_purpose text; cnt integer; dur integer; v_grade integer; v_exam text; ch uuid; v_topic uuid; rec record; pos integer:=0; marks numeric; negative numeric; g public.secure_group_templates; premium boolean;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 SELECT * INTO old FROM public.assessment_issuances WHERE owner_id=u AND request_id=p_request_id;
 IF FOUND THEN IF old.config - ARRAY['resolved_exam'] IS DISTINCT FROM p_config THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='22023'; END IF; RETURN public.get_assessment(old.id); END IF;
 IF jsonb_typeof(v_config) IS DISTINCT FROM 'object' OR v_config ?| ARRAY['user_id','question_ids','score','completed_at','review_after'] THEN RAISE EXCEPTION 'Invalid configuration' USING ERRCODE='22023'; END IF;
 v_purpose:=coalesce(v_config->>'purpose','test');
 IF v_purpose NOT IN ('practice','recap','battle','test') THEN RAISE EXCEPTION 'Invalid purpose' USING ERRCODE='22023'; END IF;
 SELECT p.grade,coalesce(v_config->>'exam',p.target_exam,'JEE'),p.is_premium INTO v_grade,v_exam,premium FROM public.profiles p WHERE id=u;
 IF v_purpose='battle' AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND subscription_tier='pro_plus') THEN RAISE EXCEPTION 'Battle unavailable' USING ERRCODE='42501'; END IF;
 IF v_purpose='test' AND NOT coalesce(premium,false) AND (SELECT count(*) FROM public.assessment_issuances ai WHERE ai.owner_id=u AND ai.purpose='test' AND ai.issued_at>=date_trunc('month',clock_timestamp()))>=2 THEN RAISE EXCEPTION 'Monthly limit' USING ERRCODE='42501'; END IF;
 cnt:=coalesce((v_config->>'count')::integer,25); dur:=coalesce((v_config->>'duration')::integer,60);
 IF cnt NOT BETWEEN 1 AND 300 OR dur NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid configuration' USING ERRCODE='22023'; END IF;
 ch:=(v_config->>'chapter_id')::uuid;v_topic:=(v_config->>'topic_id')::uuid;
 IF v_purpose='recap' THEN
  SELECT chapter_id,topic_id INTO ch,v_topic FROM public.class_logs WHERE id=(v_config->>'class_log_id')::uuid AND user_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF v_config ? 'group_code' THEN
  SELECT * INTO g FROM public.secure_group_templates WHERE code=upper(v_config->>'group_code') AND is_active=true AND clock_timestamp()>=starts_at AND clock_timestamp()<ends_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Group unavailable' USING ERRCODE='42501'; END IF;
  v_exam:=g.config->>'exam';dur:=(g.config->>'duration')::integer;
 END IF;
 sid:=gen_random_uuid();
 INSERT INTO public.assessment_issuances(id,owner_id,purpose,config,expires_at,review_after,request_id,group_id) VALUES(sid,u,v_purpose,p_config||jsonb_build_object('resolved_exam',v_exam),clock_timestamp()+make_interval(mins=>dur),CASE WHEN g.id IS NULL THEN clock_timestamp() ELSE g.ends_at END,p_request_id,g.id);
 FOR rec IN SELECT to_jsonb(q) snapshot FROM public.questions q WHERE q.is_active=true AND coalesce(q.text_quality,'ok')<>'damaged'
 AND (g.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(g.items) z WHERE z->>'id'=q.id::text))
 AND (g.id IS NOT NULL OR ((ch IS NULL OR q.chapter_id=ch) AND (v_topic IS NULL OR q.topic_id=v_topic)
 AND (v_config->>'subject' IS NULL OR lower(q.subject)=lower(v_config->>'subject'))
 AND (NOT(v_config ? 'subjects') OR jsonb_array_length(v_config->'subjects')=0 OR q.subject IN (SELECT jsonb_array_elements_text(v_config->'subjects')))
 AND (NOT(v_config ? 'chapter_ids') OR q.chapter_id::text IN (SELECT jsonb_array_elements_text(v_config->'chapter_ids')))
 AND (v_grade IS NULL OR q.class_level IS NULL OR q.class_level=v_grade)
 AND (public.exam_pool(v_exam,q.subject) IS NULL OR q.exam=ANY(public.exam_pool(v_exam,q.subject)))
 AND (NOT(v_config ? 'year') OR coalesce(q.pyq_year,q.year)=(v_config->>'year')::integer)))
 AND (coalesce((v_config->>'revisit')::boolean,false) OR (coalesce((v_config->>'repair')::boolean,false) AND EXISTS(SELECT 1 FROM public.question_attempts qa WHERE qa.user_id=u AND qa.question_id=q.id AND qa.is_correct=false AND qa.created_at<clock_timestamp()-interval '1 day')) OR (NOT coalesce((v_config->>'repair')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.question_attempts qa WHERE qa.user_id=u AND qa.question_id=q.id)))
 AND NOT EXISTS(SELECT 1 FROM public.assessment_disclosures d WHERE d.owner_id=u AND d.question_id=q.id AND v_purpose IN ('test','battle'))
 AND NOT EXISTS(SELECT 1 FROM public.assessment_items i JOIN public.assessment_issuances a ON a.id=i.issuance_id WHERE a.owner_id=u AND a.completed_at IS NULL AND a.expires_at>clock_timestamp() AND a.purpose IN ('test','battle') AND i.question_id=q.id)
 ORDER BY CASE WHEN g.id IS NOT NULL THEN (SELECT ord FROM jsonb_array_elements(g.items) WITH ORDINALITY z(value,ord) WHERE value->>'id'=q.id::text) ELSE 0 END, random() LIMIT CASE WHEN g.id IS NULL THEN cnt ELSE jsonb_array_length(g.items) END LOOP
  pos:=pos+1;
  IF g.id IS NOT NULL THEN SELECT z INTO rec.snapshot FROM jsonb_array_elements(g.items) z WHERE z->>'id'=rec.snapshot->>'id'; END IF;
  marks:=CASE WHEN upper(v_exam) LIKE '%CET%' THEN CASE WHEN lower(rec.snapshot->>'subject') LIKE '%math%' THEN 2 ELSE 1 END WHEN upper(v_exam) LIKE '%FOUNDATION%' OR upper(v_exam) LIKE '%SCHOLARSHIP%' THEN 1 ELSE 4 END;
  negative:=CASE WHEN upper(v_exam) LIKE '%CET%' OR upper(v_exam) LIKE '%FOUNDATION%' OR upper(v_exam) LIKE '%SCHOLARSHIP%' THEN 0 ELSE -1 END;
  INSERT INTO public.assessment_items(issuance_id,question_id,position,snapshot,correct_marks,incorrect_marks) VALUES(sid,(rec.snapshot->>'id')::uuid,pos,rec.snapshot,marks,negative);
 END LOOP;
 IF g.id IS NOT NULL AND pos<>jsonb_array_length(g.items) THEN RAISE EXCEPTION 'Fixed paper unavailable' USING ERRCODE='42501';END IF;
 IF pos=0 THEN RAISE EXCEPTION 'No eligible questions' USING ERRCODE='22023'; END IF;
 RETURN public.get_assessment(sid);
END $$;
CREATE FUNCTION public.submit_assessment_answer(p_assessment_id uuid,p_item_id uuid,p_answer jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.assessment_issuances;i public.assessment_items;r public.assessment_receipts;ok boolean; prior public.assessment_requests; result jsonb; input jsonb:=jsonb_build_object('assessment',p_assessment_id,'item',p_item_id,'answer',p_answer);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO prior FROM public.assessment_requests WHERE owner_id=auth.uid() AND request_id=p_request_id AND operation='submit';
 IF FOUND THEN IF prior.input<>input THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='22023'; END IF;RETURN prior.receipt;END IF;
 SELECT * INTO s FROM public.assessment_issuances WHERE id=p_assessment_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR s.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Assessment unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.assessment_items WHERE id=p_item_id AND issuance_id=s.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.assessment_receipts WHERE item_id=i.id;
 IF FOUND THEN IF r.response<>p_answer THEN RAISE EXCEPTION 'Already submitted' USING ERRCODE='22023'; END IF; RETURN jsonb_build_object('accepted',true,'is_correct',CASE WHEN s.purpose='test' THEN NULL ELSE r.is_correct END); END IF;
 IF s.purpose='test' THEN RAISE EXCEPTION 'Use draft endpoint' USING ERRCODE='22023'; END IF;
 IF p_answer->>'kind'='timeout' AND clock_timestamp()<s.expires_at THEN RAISE EXCEPTION 'Timeout not eligible' USING ERRCODE='22023'; END IF;
 IF clock_timestamp()>=s.expires_at AND p_answer->>'kind'<>'timeout' THEN RAISE EXCEPTION 'Expired' USING ERRCODE='22023'; END IF;
 ok:=public.assessment_grade(i.snapshot,p_answer);
 INSERT INTO public.assessment_receipts(issuance_id,item_id,response,is_correct,marks,request_id) VALUES(s.id,i.id,p_answer,ok,CASE WHEN ok THEN i.correct_marks WHEN p_answer->>'kind' IN ('skip','timeout') THEN 0 ELSE i.incorrect_marks END,p_request_id);
 result:=jsonb_build_object('accepted',true,'is_correct',ok,'points',CASE WHEN s.purpose='battle' THEN CASE WHEN ok THEN 100 ELSE -20 END ELSE 0 END);
 INSERT INTO public.assessment_requests VALUES(auth.uid(),p_request_id,'submit',input,result,clock_timestamp(),clock_timestamp());
 RETURN result;
END $$;
CREATE FUNCTION public.complete_assessment(p_assessment_id uuid,p_answers jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.assessment_issuances;i public.assessment_items;a jsonb;ok boolean;prior public.assessment_requests;input jsonb:=jsonb_build_object('id',p_assessment_id,'answers',p_answers);result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO prior FROM public.assessment_requests WHERE owner_id=auth.uid() AND request_id=p_request_id AND operation='complete';
 IF FOUND THEN IF prior.input<>input THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='22023';END IF;RETURN prior.receipt;END IF;
 SELECT * INTO s FROM public.assessment_issuances WHERE id=p_assessment_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment unavailable' USING ERRCODE='42501';END IF;
 IF s.completed_at IS NOT NULL THEN RETURN jsonb_build_object('accepted',true,'id',s.id);END IF;
 IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_answers) k WHERE NOT EXISTS(SELECT 1 FROM public.assessment_items WHERE issuance_id=s.id AND question_id::text=k)) THEN RAISE EXCEPTION 'Invalid answers' USING ERRCODE='22023';END IF;
 FOR i IN SELECT * FROM public.assessment_items WHERE issuance_id=s.id ORDER BY position LOOP
  IF EXISTS(SELECT 1 FROM public.assessment_receipts WHERE item_id=i.id) THEN CONTINUE;END IF;
  a:=CASE WHEN clock_timestamp()>=s.expires_at THEN coalesce((SELECT response FROM public.assessment_drafts WHERE item_id=i.id),jsonb_build_object('kind','timeout')) ELSE coalesce(p_answers->i.question_id::text->'response',(SELECT response FROM public.assessment_drafts WHERE item_id=i.id),jsonb_build_object('kind','skip')) END;
  ok:=public.assessment_grade(i.snapshot,a);
  INSERT INTO public.assessment_receipts(issuance_id,item_id,response,is_correct,marks,request_id) VALUES(s.id,i.id,a,ok,CASE WHEN ok THEN i.correct_marks WHEN a->>'kind' IN ('skip','timeout') THEN 0 ELSE i.incorrect_marks END,p_request_id);
 END LOOP;
 UPDATE public.assessment_issuances SET completed_at=clock_timestamp(),updated_at=clock_timestamp(),totals=(SELECT jsonb_build_object('correct',count(*) FILTER(WHERE is_correct),'attempted',count(*) FILTER(WHERE response->>'kind' NOT IN ('skip','timeout')),'marks',sum(marks),'total',count(*)) FROM public.assessment_receipts WHERE issuance_id=s.id) WHERE id=s.id;
 result:=jsonb_build_object('accepted',true,'id',s.id);
 INSERT INTO public.assessment_requests VALUES(auth.uid(),p_request_id,'complete',input,result,clock_timestamp(),clock_timestamp());
 RETURN result;
END $$;
CREATE FUNCTION public.get_assessment_review(p_assessment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.assessment_issuances;qs jsonb;results jsonb;answers jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO s FROM public.assessment_issuances WHERE id=p_assessment_id AND owner_id=auth.uid();
 IF NOT FOUND OR (s.purpose IN ('test','battle') AND (s.completed_at IS NULL OR clock_timestamp()<s.review_after)) THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_items i JOIN public.assessment_items other ON other.question_id=i.question_id JOIN public.assessment_issuances active ON active.id=other.issuance_id WHERE i.issuance_id=s.id AND active.owner_id=auth.uid() AND active.id<>s.id AND active.purpose IN ('test','battle') AND active.completed_at IS NULL AND active.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO public.assessment_disclosures(owner_id,question_id) SELECT auth.uid(),i.question_id FROM public.assessment_items i JOIN public.assessment_receipts r ON r.item_id=i.id WHERE i.issuance_id=s.id AND (s.purpose IN ('test','battle') OR r.response->>'kind' NOT IN ('skip','timeout')) ON CONFLICT DO NOTHING;
 SELECT jsonb_agg(i.snapshot ORDER BY i.position),jsonb_agg(jsonb_build_object('questionId',i.question_id,'is_correct',r.is_correct,'correct_option',i.snapshot->'correct_option','correct_options',i.snapshot->'correct_options','numerical_answer',i.snapshot->'numerical_answer','explanation',i.snapshot->'explanation','selectedOption',CASE WHEN r.response->>'kind'='options' THEN (SELECT string_agg(value,',') FROM jsonb_array_elements_text(r.response->'values')) WHEN r.response->>'kind'='numerical' THEN 'NUM:'||(r.response->>'value') ELSE '' END) ORDER BY i.position),jsonb_object_agg(i.question_id::text,jsonb_build_object('selectedOption',CASE WHEN r.response->>'kind'='options' THEN (SELECT string_agg(value,',') FROM jsonb_array_elements_text(r.response->'values')) WHEN r.response->>'kind'='numerical' THEN 'NUM:'||(r.response->>'value') ELSE '' END,'isCorrect',r.is_correct,'timeSpent',0)) INTO qs,results,answers FROM public.assessment_items i JOIN public.assessment_receipts r ON r.item_id=i.id WHERE i.issuance_id=s.id AND (s.purpose IN ('test','battle') OR r.response->>'kind' NOT IN ('skip','timeout'));
 RETURN jsonb_build_object('session',jsonb_build_object('id',s.id,'title',s.config->>'title','total_questions',coalesce((s.totals->>'total')::integer,jsonb_array_length(qs)),'correct_answers',s.totals->'correct','attempted_questions',s.totals->'attempted','completed_at',s.completed_at,'exam_pattern',coalesce(s.config->>'resolved_exam',s.config->>'exam')),'questions',coalesce(qs,'[]'::jsonb),'results',coalesce(results,'[]'::jsonb),'answers',coalesce(answers,'{}'::jsonb));
END $$;
CREATE TABLE public.assessment_disclosures (
 owner_id uuid NOT NULL,question_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_id,question_id)
);
GRANT ALL ON public.assessment_disclosures TO service_role;
ALTER TABLE public.assessment_disclosures ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.assessment_drafts (
 item_id uuid PRIMARY KEY REFERENCES public.assessment_items(id),response jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT ALL ON public.assessment_drafts TO service_role;
ALTER TABLE public.assessment_drafts ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.save_assessment_draft(p_assessment_id uuid,p_item_id uuid,p_answer jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.assessment_issuances;i public.assessment_items;rev integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO s FROM public.assessment_issuances WHERE id=p_assessment_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR s.purpose<>'test' OR s.completed_at IS NOT NULL OR clock_timestamp()>=s.expires_at THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO i FROM public.assessment_items WHERE id=p_item_id AND issuance_id=s.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item unavailable' USING ERRCODE='42501';END IF;
 PERFORM public.assessment_grade(i.snapshot,p_answer);
 SELECT revision INTO rev FROM public.assessment_drafts WHERE item_id=i.id;
 IF coalesce(rev,0)<>p_revision THEN RAISE EXCEPTION 'Stale draft' USING ERRCODE='22023';END IF;
 INSERT INTO public.assessment_drafts(item_id,response,revision) VALUES(i.id,p_answer,1) ON CONFLICT(item_id) DO UPDATE SET response=excluded.response,revision=assessment_drafts.revision+1,updated_at=clock_timestamp();
 RETURN jsonb_build_object('accepted',true,'revision',coalesce(rev,0)+1);
END $$;
CREATE FUNCTION public.create_secure_group_test(p_config jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE issued jsonb;items jsonb;gid uuid;code text;existing public.secure_group_templates;hours integer;
BEGIN
 IF NOT public.assessment_admin() AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='educator') THEN RAISE EXCEPTION 'Educator required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO existing FROM public.secure_group_templates WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN IF existing.config<>p_config THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='22023';END IF;RETURN jsonb_build_object('id',existing.id,'code',existing.code);END IF;
 hours:=coalesce((p_config->>'expiry_hours')::integer,24);
 IF hours NOT BETWEEN 1 AND 720 THEN RAISE EXCEPTION 'Invalid schedule' USING ERRCODE='22023';END IF;
 -- Freeze a server-selected paper; never accept a caller-authored membership list.
 issued:=public.issue_assessment((p_config-'grades')||jsonb_build_object('purpose','practice'),p_request_id);
 SELECT jsonb_agg(snapshot ORDER BY position) INTO items FROM public.assessment_items WHERE issuance_id=(issued->>'id')::uuid;
 gid:=gen_random_uuid();code:=upper(substr(replace(gid::text,'-',''),1,6));
 INSERT INTO public.secure_group_templates(id,owner_id,code,config,items,starts_at,ends_at,request_id) VALUES(gid,auth.uid(),code,p_config,items,clock_timestamp(),clock_timestamp()+make_interval(hours=>hours),p_request_id);
 RETURN jsonb_build_object('id',gid,'code',code);
END $$;
CREATE FUNCTION public.lookup_secure_group_test(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.secure_group_templates;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 SELECT * INTO g FROM public.secure_group_templates WHERE code=upper(p_code) AND is_active=true AND ends_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Group unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('id',g.id,'test_code',g.code,'title',g.config->>'title','question_ids','[]'::jsonb,'duration_minutes',g.config->'duration','subject',g.config->>'subject','chapter_names','[]'::jsonb,'expires_at',g.ends_at,'exam_pattern',g.config->>'exam');
END $$;
CREATE FUNCTION public.deactivate_secure_group_test(p_group_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.secure_group_templates WHERE id=p_group_id AND owner_id=auth.uid()) AND NOT public.assessment_admin() THEN RAISE EXCEPTION 'Group unavailable' USING ERRCODE='42501';END IF;
 UPDATE public.secure_group_templates SET is_active=false,updated_at=clock_timestamp() WHERE id=p_group_id;
 RETURN jsonb_build_object('accepted',true);
END $$;
CREATE FUNCTION public.assessment_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable assessment evidence' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='secure_group_templates' AND (to_jsonb(NEW)-ARRAY['is_active','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['is_active','updated_at']) THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='assessment_issuances' THEN
  IF (to_jsonb(NEW)-ARRAY['completed_at','totals','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['completed_at','totals','updated_at']) THEN RETURN NEW;END IF;
 END IF;
 RAISE EXCEPTION 'Immutable assessment evidence' USING ERRCODE='42501';
END $$;
CREATE TRIGGER freeze_issuance BEFORE UPDATE OR DELETE ON public.assessment_issuances FOR EACH ROW EXECUTE FUNCTION public.assessment_immutable();
CREATE TRIGGER freeze_items BEFORE UPDATE OR DELETE ON public.assessment_items FOR EACH ROW EXECUTE FUNCTION public.assessment_immutable();
CREATE TRIGGER freeze_receipts BEFORE UPDATE OR DELETE ON public.assessment_receipts FOR EACH ROW EXECUTE FUNCTION public.assessment_immutable();
CREATE TRIGGER freeze_requests BEFORE UPDATE OR DELETE ON public.assessment_requests FOR EACH ROW EXECUTE FUNCTION public.assessment_immutable();
CREATE TRIGGER freeze_group BEFORE UPDATE OR DELETE ON public.secure_group_templates FOR EACH ROW EXECUTE FUNCTION public.assessment_immutable();
-- Live battle membership is issued by the existing server matchmaking routine.
-- The wrapper serializes matching and freezes keys before safe question delivery.
CREATE TABLE public.secure_battle_items (
 battle_id uuid NOT NULL,question_id uuid NOT NULL,position integer NOT NULL,snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(battle_id,question_id)
);
GRANT ALL ON public.secure_battle_items TO service_role;
ALTER TABLE public.secure_battle_items ENABLE ROW LEVEL SECURITY;
ALTER FUNCTION public.start_battle(text,text,uuid,text) RENAME TO security_legacy_start_battle;
ALTER FUNCTION public.finish_battle(uuid) RENAME TO security_legacy_finish_battle;
REVOKE ALL ON FUNCTION public.security_legacy_start_battle(text,text,uuid,text),public.security_legacy_finish_battle(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.start_battle(p_subject text DEFAULT NULL,p_chapter text DEFAULT NULL,p_topic_id uuid DEFAULT NULL,p_difficulty text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;bid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(937041);
 result:=public.security_legacy_start_battle(p_subject,p_chapter,p_topic_id,p_difficulty);
 IF result ? 'error' THEN RETURN result;END IF;
 bid:=(result->>'battle_id')::uuid;
 INSERT INTO public.secure_battle_items(battle_id,question_id,position,snapshot)
 SELECT bid,q.id,z.ord::integer,to_jsonb(q) FROM public.battle_sessions bs CROSS JOIN LATERAL unnest(bs.question_ids) WITH ORDINALITY z(qid,ord) JOIN public.questions q ON q.id=z.qid WHERE bs.id=bid ON CONFLICT DO NOTHING;
 RETURN result;
END $$;
CREATE FUNCTION public.get_secure_battle_questions(p_battle_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.battle_players WHERE battle_id=p_battle_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Battle unavailable' USING ERRCODE='42501';END IF;
 SELECT jsonb_agg(public.assessment_safe_question(snapshot) ORDER BY position) INTO result FROM public.secure_battle_items WHERE battle_id=p_battle_id;
 RETURN coalesce(result,'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.submit_battle_answer(p_battle_id uuid,p_question_id uuid,p_selected_options text[] DEFAULT NULL,p_numerical_answer numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bs public.battle_sessions;player public.battle_players;item public.secure_battle_items;prior public.battle_answers;response jsonb;ok boolean;points integer;deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 SELECT * INTO bs FROM public.battle_sessions WHERE id=p_battle_id FOR UPDATE;
 SELECT * INTO player FROM public.battle_players WHERE battle_id=p_battle_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR bs.status<>'active' THEN RAISE EXCEPTION 'Battle unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO item FROM public.secure_battle_items WHERE battle_id=p_battle_id AND question_id=p_question_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO prior FROM public.battle_answers WHERE battle_id=p_battle_id AND user_id=auth.uid() AND question_id=p_question_id;
 IF FOUND THEN IF prior.selected_options IS DISTINCT FROM p_selected_options OR prior.numerical_answer IS DISTINCT FROM p_numerical_answer THEN RAISE EXCEPTION 'Already submitted' USING ERRCODE='22023';END IF;RETURN jsonb_build_object('is_correct',prior.is_correct,'points',prior.points);END IF;
 IF item.position<>(SELECT count(*)+1 FROM public.battle_answers WHERE battle_id=p_battle_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Round unavailable' USING ERRCODE='42501';END IF;
 deadline:=least(bs.expires_at,bs.started_at+make_interval(secs=>item.position*30));
 IF p_numerical_answer IS NOT NULL THEN response:=jsonb_build_object('kind','numerical','value',p_numerical_answer::text);
 ELSIF cardinality(p_selected_options)>0 THEN response:=jsonb_build_object('kind','options','values',to_jsonb(p_selected_options));
 ELSE IF clock_timestamp()<deadline THEN RAISE EXCEPTION 'Timeout not eligible' USING ERRCODE='22023';END IF;response:=jsonb_build_object('kind','timeout');END IF;
 IF clock_timestamp()>=deadline AND response->>'kind'<>'timeout' THEN RAISE EXCEPTION 'Round expired' USING ERRCODE='22023';END IF;
 ok:=public.assessment_grade(item.snapshot,response);points:=CASE WHEN ok THEN 100+least(50,player.streak*10) ELSE -20 END;
 INSERT INTO public.battle_answers(battle_id,user_id,question_id,selected_options,numerical_answer,is_correct,points) VALUES(p_battle_id,auth.uid(),p_question_id,p_selected_options,p_numerical_answer,ok,points);
 UPDATE public.battle_players SET score=greatest(0,score+points),correct_count=correct_count+CASE WHEN ok THEN 1 ELSE 0 END,wrong_count=wrong_count+CASE WHEN ok THEN 0 ELSE 1 END,streak=CASE WHEN ok THEN streak+1 ELSE 0 END WHERE battle_id=p_battle_id AND user_id=auth.uid();
 RETURN jsonb_build_object('is_correct',ok,'points',points);
END $$;
CREATE FUNCTION public.finish_battle(p_battle_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bs public.battle_sessions;
BEGIN
 SELECT * INTO bs FROM public.battle_sessions WHERE id=p_battle_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.battle_players WHERE battle_id=p_battle_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Battle unavailable' USING ERRCODE='42501';END IF;
 IF bs.status='completed' THEN RETURN jsonb_build_object('winner_user_id',bs.winner_user_id);END IF;
 IF clock_timestamp()<bs.expires_at AND (SELECT count(*) FROM public.battle_answers WHERE battle_id=p_battle_id AND user_id=auth.uid())<cardinality(bs.question_ids) THEN RAISE EXCEPTION 'Battle incomplete' USING ERRCODE='22023';END IF;
 RETURN public.security_legacy_finish_battle(p_battle_id);
END $$;
-- Supporting operations: role checks inside definer functions, no anonymous helper grants.
CREATE FUNCTION public.admin_question_rows() RETURNS SETOF public.questions LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.assessment_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';END IF; RETURN QUERY SELECT * FROM public.questions;END $$;
CREATE VIEW public.questions_admin WITH(security_invoker=true) AS SELECT * FROM public.admin_question_rows();
REVOKE ALL ON public.questions_admin FROM PUBLIC,anon;
GRANT SELECT ON public.questions_admin TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.backfill_text_quality(p_limit integer DEFAULT 5000) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE n integer;BEGIN IF NOT public.assessment_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';END IF;IF p_limit NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid limit' USING ERRCODE='22023';END IF;WITH b AS(SELECT id FROM public.questions WHERE text_quality IS NULL LIMIT p_limit) UPDATE public.questions q SET text_quality=public.classify_question_text(q.question_text) FROM b WHERE q.id=b.id;GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END $$;
REVOKE SELECT ON public.questions FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text;BEGIN SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.questions'::regclass AND attnum>0 AND NOT attisdropped;EXECUTE 'REVOKE SELECT ('||cols||') ON public.questions FROM PUBLIC,anon,authenticated';END $$;
GRANT SELECT(id,question,question_text,question_image_url,option_a,option_b,option_c,option_d,options,question_type,difficulty,difficulty_jee_mains,difficulty_neet,subject,subject_id,chapter,chapter_id,topic_id,concept_id,batch_id,exam,exam_relevance,year,pyq_year,is_pyq,source,source_row_id,is_active,is_verified,created_at,updated_at,topic,content_hash,pyq_session,pyq_exam,language,class_level,text_quality,option_a_image_url,option_b_image_url,option_c_image_url,option_d_image_url) ON public.questions TO authenticated;
REVOKE ALL ON public.questions_public FROM PUBLIC,anon;
GRANT SELECT ON public.questions_public TO authenticated,service_role;
ALTER VIEW public.content_health SET(security_invoker=true);
REVOKE ALL ON public.content_health FROM PUBLIC,anon;
GRANT SELECT ON public.content_health TO authenticated,service_role;
ALTER POLICY "admin manage questions" ON public.questions TO authenticated;
REVOKE ALL ON FUNCTION public.validate_practice_answer(uuid,text[],numeric),public.validate_question_answer(uuid,text),public.validate_question_answer(uuid,text[],numeric,public.exam_code),public.next_damaged_questions(integer) FROM PUBLIC,anon,authenticated;
DROP POLICY "Walkthroughs readable by signed-in users" ON public.question_walkthroughs;
-- Walkthroughs are served through authorized pinned review only; staff policy remains.
REVOKE SELECT ON public.question_walkthroughs FROM anon;
REVOKE ALL ON FUNCTION public.backfill_text_quality(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.backfill_text_quality(integer) TO authenticated,service_role;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('assessment_safe_question','assessment_admin','assessment_grade','get_assessment','issue_assessment','submit_assessment_answer','complete_assessment','get_assessment_review','admin_question_rows','save_assessment_draft','create_secure_group_test','lookup_secure_group_test','assessment_immutable','deactivate_secure_group_test','start_battle','finish_battle','get_secure_battle_questions','submit_battle_answer') LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.sig);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.get_assessment(uuid),public.issue_assessment(jsonb,uuid),public.submit_assessment_answer(uuid,uuid,jsonb,uuid),public.complete_assessment(uuid,jsonb,uuid),public.get_assessment_review(uuid),public.admin_question_rows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_assessment_draft(uuid,uuid,jsonb,integer),public.create_secure_group_test(jsonb,uuid),public.lookup_secure_group_test(text) TO authenticated;
REVOKE ALL ON FUNCTION public.fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_battle(text,text,uuid,text),public.finish_battle(uuid),public.get_secure_battle_questions(uuid),public.submit_battle_answer(uuid,uuid,text[],numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_secure_group_test(uuid) TO authenticated;
COMMIT;

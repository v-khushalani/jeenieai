-- NOT EXECUTED. Requires separately approved disposable database application.
-- Runner MUST use psql -X -v ON_ERROR_STOP=1; never connected production.
BEGIN;
DO $$ BEGIN IF current_setting('qa.disposable_security_fixture',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Disposable database required';END IF;END $$;
-- Catalog assertions cannot be satisfied by an RLS-helper failure.
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT roles.rolname,a.attname FROM pg_roles roles CROSS JOIN pg_attribute a
 WHERE roles.rolname IN ('anon','authenticated') AND a.attrelid='public.questions'::regclass
 AND a.attname IN ('correct_option','correct_options','correct_answer','numerical_answer','numerical_tolerance','explanation','explanation_image_url') LOOP
  IF has_column_privilege(r.rolname,'public.questions',r.attname,'SELECT') THEN RAISE EXCEPTION 'Answer privilege exposed: % %',r.rolname,r.attname;END IF;
 END LOOP;
 IF NOT has_column_privilege('authenticated','public.questions','question','SELECT') THEN RAISE EXCEPTION 'Safe field denied';END IF;
 IF has_column_privilege('authenticated','public.assessment_issuances','totals','SELECT') THEN RAISE EXCEPTION 'Group score oracle exposed';END IF;
 FOR r IN SELECT p.oid::regprocedure sig,roles.rolname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles roles
 WHERE n.nspname='public' AND roles.rolname IN ('anon','authenticated') AND p.proname IN ('validate_question_answer','validate_practice_answer','fetch_unseen_questions','assessment_grade','assessment_admin','security_legacy_start_battle','security_legacy_finish_battle','next_damaged_questions') LOOP
  IF has_function_privilege(r.rolname,r.sig,'EXECUTE') THEN RAISE EXCEPTION 'Alternative oracle: % %',r.rolname,r.sig;END IF;
 END LOOP;
END $$;
-- Actual client roles, not superuser calls masquerading as access tests.
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false;BEGIN
 BEGIN PERFORM correct_option FROM public.questions LIMIT 1;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous answer read succeeded';END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false;BEGIN
 BEGIN PERFORM numerical_answer,explanation,explanation_image_url FROM public.questions LIMIT 1;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Authenticated answer read succeeded';END IF;
 denied:=false;BEGIN PERFORM totals FROM public.assessment_issuances;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Direct group totals readable';END IF;
 denied:=false;BEGIN PERFORM public.assessment_grade('{}','{}');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Private grader callable';END IF;
END $$;
RESET ROLE;
-- Synthetic known-answer lifecycle, separate from real Supabase JWT evidence.
INSERT INTO public.profiles(id,grade,target_exam,is_premium,subscription_tier,subscription_end_date)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',11,'JEE',false,'free',NULL),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',12,'JEE',true,'pro_plus',clock_timestamp()+interval '1 day');
INSERT INTO public.user_roles(user_id,role) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','educator');
INSERT INTO public.questions(id,question,option_a,option_b,correct_option,correct_options,is_active,class_level,question_type,subject)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Known grade 11 paper','one','two','A',ARRAY['A'],true,11,'single_correct','Physics');
SELECT set_config('qa.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $$ DECLARE g jsonb;s jsonb;sid uuid;item uuid;denied boolean;ack jsonb;BEGIN
 g:=public.create_secure_group_test('{"grades":[11],"subjects":["Physics"],"exam":"JEE","count":1,"duration":60,"expiry_hours":24}',gen_random_uuid());
 IF g->>'id' IS NULL THEN RAISE EXCEPTION 'Template not created';END IF;
 PERFORM set_config('qa.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 s:=public.issue_assessment(jsonb_build_object('group_code',g->>'code','purpose','practice'),gen_random_uuid());
 sid:=(s->>'id')::uuid;item:=(s->'questions'->0->>'item_id')::uuid;
 IF sid IS NULL OR item IS NULL OR s->'questions'->0->>'class_level' IS DISTINCT FROM '11' THEN RAISE EXCEPTION 'Selected-grade membership lost';END IF;
 IF public.issue_assessment(jsonb_build_object('group_code',g->>'code'),gen_random_uuid())->>'id' IS DISTINCT FROM sid::text THEN RAISE EXCEPTION 'Rejoin duplicated participation';END IF;
 denied:=false;BEGIN PERFORM public.save_assessment_draft(sid,item,'{"kind":"options","values":["A"]}',NULL);EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'NULL revision bypass';END IF;
 ack:=public.save_assessment_draft(sid,item,'{"kind":"options","values":["A"]}',0);
 IF ack->>'revision' IS DISTINCT FROM '1' OR public.save_assessment_draft(sid,item,'{"kind":"options","values":["A"]}',0) IS DISTINCT FROM ack THEN RAISE EXCEPTION 'Lost ACK retry failed';END IF;
 denied:=false;BEGIN PERFORM public.complete_assessment(sid,jsonb_build_object('dddddddd-dddd-4ddd-8ddd-dddddddddddd',jsonb_build_object('response',jsonb_build_object('kind','timeout'))),gen_random_uuid());EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Early timeout accepted';END IF;
 PERFORM public.complete_assessment(sid,'{}',gen_random_uuid());
 denied:=false;BEGIN PERFORM public.get_assessment_review(sid);EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Premature group review';END IF;
 PERFORM set_config('qa.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 denied:=false;BEGIN PERFORM public.get_assessment_review(sid);EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Cross-user group review';END IF;
END $$;
ROLLBACK;
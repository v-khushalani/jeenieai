-- Run ONLY against a disposable fixture initialized with fixture.sql and the
-- proposed migration. Never run fixture mutations against connected Supabase.
INSERT INTO public.profiles(id,grade,target_exam,is_premium,subscription_tier)
VALUES ('11111111-1111-4111-8111-111111111111',12,'JEE',true,'pro_plus');
INSERT INTO public.questions(id,question,option_a,option_b,correct_option,correct_options,is_active,class_level,question_type,subject)
VALUES ('22222222-2222-4222-8222-222222222222','fixture question','one','two','A',ARRAY['A'],true,12,'single_correct','Physics');
SELECT set_config('qa.uid','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE issued jsonb;sid uuid;item uuid;receipt jsonb;before_count integer;request uuid:=gen_random_uuid();failed boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN pg_attribute a WHERE r.rolname IN ('anon','authenticated') AND a.attrelid='public.questions'::regclass AND a.attname IN ('correct_option','correct_options','correct_answer','numerical_answer','numerical_tolerance','explanation','explanation_image_url') AND has_column_privilege(r.oid,'public.questions',a.attname,'SELECT')) THEN RAISE EXCEPTION 'Sensitive privileges remain';END IF;
 RAISE NOTICE 'PASS: 14 effective sensitive-column privileges denied';
 IF NOT has_column_privilege('authenticated','public.questions','question','SELECT') THEN RAISE EXCEPTION 'Safe privilege missing';END IF;
 RAISE NOTICE 'PASS: safe question privilege retained';
 IF has_function_privilege('anon','public.assessment_grade(jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.assessment_grade(jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Private grader exposed';END IF;
 RAISE NOTICE 'PASS: private grader unavailable to client roles';
 issued:=public.issue_assessment('{"purpose":"practice","count":1,"duration":60}',request);
 sid:=(issued->>'id')::uuid;item:=(issued->'questions'->0->>'item_id')::uuid;
 IF issued->'questions'->0 ?| ARRAY['correct_option','correct_options','correct_answer','numerical_answer','numerical_tolerance','explanation','explanation_image_url'] THEN RAISE EXCEPTION 'Issuance key exposure';END IF;
 RAISE NOTICE 'PASS: issuance key-free';
 IF public.issue_assessment('{"purpose":"practice","count":1,"duration":60}',request)->>'id'<>sid::text THEN RAISE EXCEPTION 'Issuance retry duplicated';END IF;
 RAISE NOTICE 'PASS: issuance retry idempotent';
 failed:=false;BEGIN PERFORM public.submit_assessment_answer(sid,item,'{"kind":"options","values":[]}',gen_random_uuid());EXCEPTION WHEN SQLSTATE '22023' THEN failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.assessment_receipts WHERE issuance_id=sid) THEN RAISE EXCEPTION 'Invalid answer committed';END IF;
 RAISE NOTICE 'PASS: empty response denied and transaction unchanged';
 PERFORM set_config('qa.uid','33333333-3333-4333-8333-333333333333',false);
 failed:=false;BEGIN PERFORM public.get_assessment(sid);EXCEPTION WHEN SQLSTATE '42501' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-user issuance readable';END IF;
 failed:=false;BEGIN PERFORM public.get_assessment_review(sid);EXCEPTION WHEN SQLSTATE '42501' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Cross-user review readable';END IF;
 RAISE NOTICE 'PASS: cross-user issuance and review denied';
 PERFORM set_config('qa.uid','11111111-1111-4111-8111-111111111111',false);
 request:=gen_random_uuid();receipt:=public.submit_assessment_answer(sid,item,'{"kind":"options","values":["A"]}',request);
 IF receipt->>'is_correct'<>'true' OR receipt ? 'correct_option' THEN RAISE EXCEPTION 'Invalid grading acknowledgement';END IF;
 RAISE NOTICE 'PASS: valid grading acknowledgement without key';
 PERFORM public.submit_assessment_answer(sid,item,'{"kind":"options","values":["A"]}',request);
 SELECT count(*) INTO before_count FROM public.assessment_receipts WHERE issuance_id=sid;
 IF before_count<>1 THEN RAISE EXCEPTION 'Duplicate receipt';END IF;
 RAISE NOTICE 'PASS: submission retry records once';
 failed:=false;BEGIN PERFORM public.submit_assessment_answer(sid,item,'{"kind":"options","values":["B"]}',request);EXCEPTION WHEN SQLSTATE '22023' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Idempotency conflict accepted';END IF;
 RAISE NOTICE 'PASS: changed payload with reused request denied';
 UPDATE public.questions SET correct_option='B',correct_options=ARRAY['B'] WHERE id='22222222-2222-4222-8222-222222222222';
 IF public.get_assessment_review(sid)->'results'->0->>'correct_option'<>'A' THEN RAISE EXCEPTION 'Pinned key changed';END IF;
 RAISE NOTICE 'PASS: review uses pinned immutable key after source edit';
 failed:=false;BEGIN UPDATE public.assessment_items SET snapshot='{}' WHERE id=item;EXCEPTION WHEN SQLSTATE '42501' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Immutable snapshot editable';END IF;
 RAISE NOTICE 'PASS: immutable snapshot trigger';
 failed:=false;BEGIN PERFORM public.get_assessment_review('44444444-4444-4444-8444-444444444444');EXCEPTION WHEN SQLSTATE '42501' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Legacy/arbitrary ID opens review';END IF;
 RAISE NOTICE 'PASS: arbitrary legacy review denied';
END $$;
-- NOT RUN: requires a separately approved disposable database with the proposal
-- applied. Never run this script against connected Supabase or production.
-- The runner must set qa.disposable_security_fixture=true explicitly.
DO $$ BEGIN
 IF current_setting('qa.disposable_security_fixture',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Disposable fixture gate required';
 END IF;
END $$;
BEGIN;
INSERT INTO public.profiles(id,grade,target_exam,is_premium,subscription_tier)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10,'JEE',false,'free'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',12,'JEE',false,'free'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',11,'JEE',false,'free');
INSERT INTO public.user_roles(user_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','educator');
INSERT INTO public.questions(id,question,option_a,option_b,correct_option,correct_options,is_active,class_level,question_type,subject)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','grade 11 paper','one','two','A',ARRAY['A'],true,11,'single_correct','Physics'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','grade 12 paper','one','two','A',ARRAY['A'],true,12,'single_correct','Chemistry');
SELECT set_config('qa.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $$
DECLARE g jsonb;first_join jsonb;second_join jsonb;sid uuid;item uuid;req uuid:=gen_random_uuid();denied boolean;resume jsonb;ack jsonb;
BEGIN
 -- Blocker 1: ACLs are independent of policy/helper errors.
 IF has_table_privilege('authenticated','public.assessment_entitlements','INSERT') OR has_table_privilege('authenticated','public.assessment_entitlements','UPDATE') OR has_table_privilege('anon','public.assessment_entitlements','SELECT') THEN RAISE EXCEPTION 'Entitlement evidence exposed';END IF;
 RAISE NOTICE 'PASS B1: entitlement authority has no student write grants';
 -- Blockers 2/6: creator grade 10 must not replace selected grade 11.
 g:=public.create_secure_group_test('{"purpose":"test","exam":"JEE","grades":[11],"subjects":["Physics"],"count":1,"duration":60,"expiry_hours":24}',req);
 IF EXISTS(SELECT 1 FROM public.assessment_issuances WHERE owner_id=auth.uid() AND request_id=req) THEN RAISE EXCEPTION 'Reviewable template seed exists';END IF;
 IF EXISTS(SELECT 1 FROM public.secure_group_templates t CROSS JOIN LATERAL jsonb_array_elements(t.items) z WHERE t.id=(g->>'id')::uuid AND (z->>'class_level')::integer<>11) THEN RAISE EXCEPTION 'Creator grade overrode selected grades';END IF;
 RAISE NOTICE 'PASS B2/B6: no practice seed; selected grade 11 is frozen';
 PERFORM set_config('qa.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 -- A fabricated legacy attempt must not change fixed membership.
 INSERT INTO public.question_attempts(user_id,question_id,is_correct,created_at) VALUES(auth.uid(),'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true,clock_timestamp());
 first_join:=public.issue_assessment(jsonb_build_object('group_code',g->>'code','purpose','practice'),gen_random_uuid());
 sid:=(first_join->>'id')::uuid;item:=(first_join->'questions'->0->>'item_id')::uuid;
 IF (SELECT purpose FROM public.assessment_issuances WHERE id=sid)<>'test' THEN RAISE EXCEPTION 'Caller controlled group purpose';END IF;
 denied:=false;BEGIN PERFORM public.submit_assessment_answer(sid,item,'{"kind":"options","values":["A"]}',gen_random_uuid());EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Group practice submission opened grader';END IF;
 ack:=public.save_assessment_draft(sid,item,'{"kind":"options","values":["A"]}',0);
 -- Blocker 5: lost-ACK retry returns revision 1, never increments twice.
 IF public.save_assessment_draft(sid,item,'{"kind":"options","values":["A"]}',0)<>ack THEN RAISE EXCEPTION 'Lost ACK retry not idempotent';END IF;
 resume:=public.get_assessment(sid);
 IF resume->'drafts'->'dddddddd-dddd-4ddd-8ddd-dddddddddddd'->>'revision'<>'1' OR resume->'drafts'->'dddddddd-dddd-4ddd-8ddd-dddddddddddd'->'response'<> '{"kind":"options","values":["A"]}'::jsonb THEN RAISE EXCEPTION 'Resume lost draft evidence';END IF;
 RAISE NOTICE 'PASS B5: revision and response resume; lost ACK retries once';
 PERFORM public.complete_assessment(sid,'{}',gen_random_uuid());
 denied:=false;BEGIN PERFORM public.get_assessment_review(sid);EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Completed group paper released before close';END IF;
 RAISE NOTICE 'PASS B2: completed participant cannot release answers before close';
 PERFORM set_config('qa.uid','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
 second_join:=public.issue_assessment(jsonb_build_object('group_code',g->>'code','purpose','test'),gen_random_uuid());
 IF first_join->'questions'->0->>'id'<>second_join->'questions'->0->>'id' THEN RAISE EXCEPTION 'Personal history changed fixed group paper';END IF;
 denied:=false;BEGIN PERFORM public.get_assessment_review(sid);EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Cross-user review opened';END IF;
 RAISE NOTICE 'PASS B4/B6: fixed membership ignores history and participant grade';
END $$;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT p.oid::regprocedure signature,role.rolname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles role
 WHERE n.nspname='public' AND role.rolname IN ('anon','authenticated')
 AND p.proname IN ('validate_practice_answer','validate_question_answer','fetch_unseen_questions','security_legacy_start_battle','security_legacy_finish_battle','assessment_grade') LOOP
 IF has_function_privilege(r.rolname,r.signature,'EXECUTE') THEN RAISE EXCEPTION 'Alternative oracle exposed: % %',r.rolname,r.signature;END IF;
 END LOOP;
 RAISE NOTICE 'PASS: all discovered historical overloads and private grader inaccessible';
END $$;
-- Legacy battle arrays must reserve questions even without secure snapshots.
INSERT INTO public.battle_sessions(id,status,question_ids,expires_at,started_at)
VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','active',ARRAY['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid],clock_timestamp()+interval '1 hour',clock_timestamp());
SELECT set_config('qa.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $$ DECLARE denied boolean:=false;BEGIN
 BEGIN PERFORM public.issue_assessment('{"purpose":"practice","subject":"Chemistry","count":1,"revisit":true}',gen_random_uuid());EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Legacy live battle question escaped reservation';END IF;
 denied:=false;BEGIN PERFORM public.get_secure_battle_questions('ffffffff-ffff-4fff-8fff-ffffffffffff');EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Nonmember fetched battle';END IF;
 RAISE NOTICE 'PASS B3: legacy battle reservation and nonmember denial';
END $$;
ROLLBACK;
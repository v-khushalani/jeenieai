-- Synthetic local fixtures only. Run after isolated-regressions.sql.
INSERT INTO public.profiles(id,grade,target_exam,is_premium,subscription_tier)
VALUES ('55555555-5555-4555-8555-555555555555',12,'JEE',true,'pro_plus');
SELECT set_config('qa.uid','55555555-5555-4555-8555-555555555555',false);
DO $$
DECLARE issued jsonb;sid uuid;item uuid;qid text;failed boolean;result jsonb;req uuid:=gen_random_uuid();
BEGIN
 issued:=public.issue_assessment('{"purpose":"test","count":1,"duration":60}',gen_random_uuid());
 sid:=(issued->>'id')::uuid;item:=(issued->'questions'->0->>'item_id')::uuid;qid:=issued->'questions'->0->>'id';
 failed:=false;BEGIN PERFORM public.get_assessment_review(sid);EXCEPTION WHEN SQLSTATE '42501' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Active formal test leaked review';END IF;
 RAISE NOTICE 'PASS: active test review denied';
 result:=public.save_assessment_draft(sid,item,'{"kind":"options","values":["A"]}',0);
 IF result ?| ARRAY['is_correct','correct_option','explanation'] THEN RAISE EXCEPTION 'Draft leaked grade';END IF;
 RAISE NOTICE 'PASS: draft does not disclose grade or solution';
 failed:=false;BEGIN PERFORM public.save_assessment_draft(sid,item,'{"kind":"options","values":["B"]}',0);EXCEPTION WHEN SQLSTATE '22023' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale draft accepted';END IF;
 RAISE NOTICE 'PASS: stale draft revision rejected';
 failed:=false;BEGIN PERFORM public.complete_assessment(sid,'{"foreign-question":{"response":{"kind":"skip"}}}',gen_random_uuid());EXCEPTION WHEN SQLSTATE '22023' THEN failed:=true;END;
 IF NOT failed OR EXISTS(SELECT 1 FROM public.assessment_issuances WHERE id=sid AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Forged membership completed assessment';END IF;
 RAISE NOTICE 'PASS: forged membership denied without completion';
 result:=public.complete_assessment(sid,'{}',req);
 IF result ?| ARRAY['correct_option','explanation'] THEN RAISE EXCEPTION 'Completion leaked key';END IF;
 PERFORM public.complete_assessment(sid,'{}',req);
 IF (SELECT count(*) FROM public.assessment_receipts WHERE issuance_id=sid)<>1 THEN RAISE EXCEPTION 'Finalization replay duplicates receipts';END IF;
 RAISE NOTICE 'PASS: finalization is key-free and idempotent';
 result:=public.get_assessment_review(sid);
 IF jsonb_array_length(result->'results')<>1 THEN RAISE EXCEPTION 'Completed review missing';END IF;
 RAISE NOTICE 'PASS: committed test review authorized';
 failed:=false;BEGIN PERFORM public.save_assessment_draft(sid,item,'{"kind":"skip"}',1);EXCEPTION WHEN SQLSTATE '42501' THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Terminal state accepts draft';END IF;
 RAISE NOTICE 'PASS: completed test rejects mutations';
END $$;
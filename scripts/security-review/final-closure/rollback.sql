-- REVIEW ONLY. No execution authorized in this task.
-- Fail-closed operational rollback, NOT restoration of vulnerable old ACLs.
-- Preserves immutable evidence and questions; staff/service access remains.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE f record;t record;cols text;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('issue_assessment','get_assessment','submit_assessment_answer','complete_assessment',
 'save_assessment_draft','get_assessment_review','create_secure_group_test',
 'lookup_secure_group_test','deactivate_secure_group_test','start_battle','finish_battle',
 'submit_battle_answer','get_secure_battle_questions','get_secure_battle_review',
 'fetch_unseen_questions','validate_question_answer','validate_practice_answer',
 'next_damaged_questions','security_legacy_start_battle','security_legacy_finish_battle',
 'security_legacy_cancel_subscription') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 END LOOP;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('assessment_issuances','assessment_items',
 'assessment_receipts','assessment_requests','assessment_entitlements','assessment_drafts',
 'assessment_disclosures','secure_group_templates','secure_battle_items') LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t.relname);
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped;
  IF cols IS NOT NULL THEN EXECUTE format('REVOKE SELECT (%s),INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,cols,t.relname);END IF;
 END LOOP;
END $$;
REVOKE SELECT ON public.questions FROM PUBLIC,anon,authenticated;
REVOKE SELECT(correct_option,correct_options,correct_answer,numerical_answer,numerical_tolerance,explanation,explanation_image_url) ON public.questions FROM PUBLIC,anon,authenticated;
-- Keep safe catalog access available for maintenance; answers remain inaccessible.
GRANT SELECT(id,question,question_text,option_a,option_b,option_c,option_d,options,question_type,is_active,subject,chapter,chapter_id,topic_id,exam) ON public.questions TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- SELECT-only. Run each statement independently; preserve every result.
-- Production pre-application failures are expected, not labelled passing.
SELECT r.rolname,a.attname,has_table_privilege(r.oid,'public.questions','SELECT') AS table_select,
 has_column_privilege(r.oid,'public.questions',a.attname,'SELECT') AS can_read
FROM pg_roles r CROSS JOIN pg_attribute a
WHERE r.rolname IN ('anon','authenticated') AND a.attrelid='public.questions'::regclass
 AND a.attname IN ('correct_option','correct_options','correct_answer','numerical_answer','numerical_tolerance','explanation','explanation_image_url') ORDER BY r.rolname,a.attname;

SELECT c.relname,CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,acl.privilege_type
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
WHERE n.nspname='public' AND c.relname IN ('questions','assessment_issuances','assessment_items','assessment_receipts','assessment_entitlements','secure_group_templates','secure_battle_items') ORDER BY c.relname,grantee;

SELECT p.oid::regprocedure::text AS signature,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') AS executable,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
WHERE n.nspname='public' AND r.rolname IN ('anon','authenticated','service_role')
AND p.proname IN ('validate_practice_answer','validate_question_answer','fetch_unseen_questions','next_damaged_questions','assessment_grade','assessment_admin','get_assessment_review','get_secure_battle_review','admin_question_rows','security_legacy_start_battle','security_legacy_finish_battle') ORDER BY signature,r.rolname;

SELECT c.relname,c.reloptions,pg_get_viewdef(c.oid,true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v' AND pg_get_viewdef(c.oid,true) ~* 'questions|walkthrough|question_edit_history';

SELECT member.rolname,parent.rolname AS inherited_role,pg_has_role(member.oid,parent.oid,'USAGE') AS effective_inheritance
FROM pg_roles member CROSS JOIN pg_roles parent WHERE member.rolname IN ('anon','authenticated') AND member.oid<>parent.oid AND pg_has_role(member.oid,parent.oid,'MEMBER');
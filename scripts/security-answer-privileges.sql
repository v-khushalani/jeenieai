-- Read-only catalog regression; run with the Supabase read-query tool.
-- Every row must have can_read = false before release.
SELECT r.rolname AS role, a.attname AS column_name,
       has_column_privilege(r.oid, 'public.questions', a.attname, 'SELECT') AS can_read
FROM pg_roles r
CROSS JOIN pg_attribute a
WHERE r.rolname IN ('anon', 'authenticated')
  AND a.attrelid = 'public.questions'::regclass
  AND a.attname IN ('correct_option', 'correct_options', 'correct_answer',
                   'numerical_answer', 'numerical_tolerance', 'explanation',
                   'explanation_image_url')
ORDER BY r.rolname, a.attname;

-- Run each following SELECT independently with the read-query tool, which
-- returns the final statement's result. Do not infer absent earlier results.
-- Explicit ACLs: table-level and PUBLIC rights can override column revocation.
SELECT c.relname, acl.grantee, CASE WHEN acl.grantee=0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(acl.grantee) END AS grantee_name,
       acl.privilege_type, acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
WHERE n.nspname='public' AND c.relname IN
 ('questions','questions_public','questions_admin','content_health',
  'question_walkthroughs','question_edit_history','extracted_questions_queue')
ORDER BY c.relname,grantee_name,acl.privilege_type;

-- Effective membership, including recursively inherited privileges.
SELECT member.rolname AS member_role,parent.rolname AS reachable_role,
       pg_has_role(member.oid,parent.oid,'USAGE') AS inherits_privileges
FROM pg_roles member CROSS JOIN pg_roles parent
WHERE member.rolname IN ('anon','authenticated')
 AND member.oid<>parent.oid AND pg_has_role(member.oid,parent.oid,'MEMBER');

-- Every historical overload matters. PUBLIC defaults count as effective access.
SELECT p.oid::regprocedure::text AS signature,r.rolname,
       has_function_privilege(r.oid,p.oid,'EXECUTE') AS executable,
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname='public' AND r.rolname IN ('anon','authenticated')
 AND p.proname IN ('has_role','fetch_unseen_questions','validate_practice_answer',
  'validate_question_answer','backfill_text_quality','next_damaged_questions',
  'submit_battle_answer','get_assessment_review','submit_assessment_answer')
ORDER BY signature,r.rolname;

-- Nested relations and view definitions must be audited along with base grants.
SELECT c.relname,c.reloptions,pg_get_viewdef(c.oid,true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
 AND pg_get_viewdef(c.oid,true) ~* '(questions|walkthrough|question_edit_history)';
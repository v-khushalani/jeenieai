# Final database security closure review — NO-GO

## Authorization and evidence boundary

No migration was executed, including in a local/disposable database. No production data, permissions, or auth users were changed. The strict instruction “DO NOT execute any migration” takes precedence over the request for isolated applied-migration evidence. A separately approved isolated application is required to obtain that evidence. Authenticated end-to-end access is unavailable for this externally managed Supabase project; no passwords or service-role credentials were requested.

This package supplies complete SQL text for a **consolidated review candidate**, not a proven executable production migration. SQL and PL/pgSQL parsing do not establish database compilation, idempotency, lifecycle correctness, or release readiness. The remaining issues below mean the requested final closure is **not complete**.

## 1. Exact cause of all 14 privilege failures

Fresh effective PostgreSQL checks on 2026-11-04 returned `true` for table SELECT and each of seven sensitive-column SELECT privileges for both `anon` and `authenticated`. Column ACLs were NULL, not explicit protective revokes. The table ACL grants both roles `arwdDxtm`, including table-wide SELECT. PostgreSQL column privileges are additive: a table-wide SELECT grant authorizes every column, regardless of missing column grants. The roles have no inherited memberships; neither has superuser or RLS-bypass status. RLS row filtering and a `has_role` permission error cannot remove those column privileges.

The live public-schema default ACLs additionally grant broad table access and function execution to client roles for both postgres and supabase_admin owners. The previous proposal did not clear default-created client grants on new private evidence tables. This candidate explicitly clears them per object; it does not globally alter defaults or unrelated objects.

## 2. Exact per-column and role remediation

For **each role, anon and authenticated**, the same sequence applies to every column below:

| Protected column | Anonymous direct SELECT | Authenticated direct SELECT | Authorized release |
|---|---|---|---|
| correct_option | Revoke table-wide and column SELECT | Same | Trusted submitted-item review / verified admin |
| correct_options | Same | Same | Same |
| correct_answer | Same | Same | Same |
| numerical_answer | Same | Same | Same |
| numerical_tolerance | Same | Same | Same |
| explanation | Same | Same | Same |
| explanation_image_url | Same | Same | Same |

`migration.sql` first revokes table-wide SELECT from PUBLIC/anon/authenticated, then all question-column SELECT grants, then grants only an explicit safe-field allowlist to authenticated. No direct anonymous question access is added; existing intended question access is signed-in. Verified administrators receive keys through `admin_question_rows` / invoker `questions_admin`, not a broad authenticated answer grant. Existing admin mutation policies remain. Independent effective-privilege postconditions abort the transaction if inherited or PUBLIC grants still expose a protected column.

## 3. Package contents

- `migration.sql`: consolidated proposed full assessment lifecycle and privilege changes; explicit private evidence ACL clearing; server-side identity/admin checks; immutable receipts; group embargo; draft revisions; battle reservation/round/response checks; safe admin interfaces. Reapplication uses replacement definitions, guarded legacy renames, and trigger/policy recreation. Exact table-column preflight guards are included; type/constraint compatibility and actual second application remain unverified.
- `rollback.sql`: executable-text fail-closed operational rollback. Stops client assessment entry points, retains evidence and keys, keeps safe catalog/staff access. It intentionally **does not** restore insecure old grants or old answer validators. A failed forward transaction rolls back normally; committed rollout failure uses maintenance/forward repair, not insecure schema restoration.
- `verification.sql`: five independent SELECT-only catalog checks.
- `regressions.sql`: gated disposable regression source, actual SET ROLE access checks, group-score bypass, alternate oracle ACLs, selected-grade membership, repeated join, NULL revision, lost acknowledgement, early timeout, premature/cross-user review. Not run.
- `function-permissions.md`: all 113 inspected public application functions, with live ownership/execution permissions and disposition; intentional new interfaces listed separately.
- `evidence/`: complete live definitions, relations, policies, selected table columns, effective privilege results, test/lint logs and validation boundary.

Older drafts and fixtures are retained untouched for provenance; neither is an execution instruction.

## 4. Answer-returning functions

Confirmed live direct answer routes: `validate_question_answer(uuid,text)`, `validate_question_answer(uuid,text[],numeric,exam_code)`, `validate_practice_answer(uuid,text[],numeric)`, `fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer)` (full questions), and `next_damaged_questions(integer)` (explanations). All are proposed service-only, with PUBLIC/client grants revoked across every discovered overload. Historical authenticated validators remain executable in the actual database; `next_damaged_questions` remains effectively PUBLIC-executable. `submit_battle_answer` returns correctness feedback and is replaced with trusted membership/snapshot/round checks. Counts/remap metadata are not mislabeled key-returning APIs. Full inventory and definitions accompany the package.

## 5. Verification results

| Check | Observed result | Meaning |
|---|---|---|
| Live effective PostgreSQL protected-column privileges | 14/14 enabled | Actual protection still failing; not remediated in production |
| Unit tests | 147 passed / 16 files | Existing client/domain regressions only |
| Project lint | 0 errors, 4 warnings | Existing unrelated hook warnings retained |
| Live non-mutating security E2E | 2 passed, 1 failed, 5 skipped | Failure is `has_role` helper denial instead of column denial |
| SQL / PL/pgSQL parsing | Passed | Syntax only; no application or database compilation |
| Automatic preview compilation | build OK | Harness result; no separately invoked production build |
| Supabase linter | 110 findings / 7 categories | Unchanged live database; aggregate triage only |
| Isolated applied-database tests | Not run | No isolated Supabase established; all migration execution prohibited |
| Authenticated student/admin/browser lifecycle | Blocked | External unmanaged sessions and unapplied contract |
| Second-application / rollback / concurrency tests | Not run | Need explicit approved isolated application |

No skipped test is counted as passed. Live privilege checks independently confirm the defect rather than relying on HTTP failures.

## 6. Six-blocker closure and remaining deployment risks

| Original blocker | Candidate remediation | Closure status / missing evidence |
|---|---|---|
| 1. Mutable entitlement authority | Protected profile INSERT/UPDATE; private server-owned entitlement projection; scoped cancellation/admin writes | Partial: payment/admin/signup-trigger compatibility, provenance-backed existing paid users and cancellation reconciliation require real DB tests |
| 2. Premature group disclosure | Server-derived formal purpose, template snapshot, completion/close embargo; **new direct totals route removed** | Partial: SET ROLE and one-item group regressions supplied, not run |
| 3. Battle disclosure | Cross-lifecycle reservations, frozen membership equality, FK/position uniqueness/immutable trigger, timed round opening, mixed-response rejection, terminal retry ordering | Partial: live-battle full-solution review endpoint remains absent; legacy matchmaking chooses before filtering and can reject instead of selecting an alternative; reward/idempotency/concurrency/CPU timing compatibility unverified |
| 4. Forged attempt evidence | Receipt-driven selection; feedback disclosure recorded during submission; group papers ignore personal history | Partial: historical trusted receipt disclosure reconciliation and races need applied DB validation |
| 5. Lost drafts / expiry | Serialized revisions/resume; NULL revision rejected; lost ACK preserved; early caller timeouts denied; non-test completion cannot grade unsubmitted items | Partial: real reload/expiry timing, lock waits and client round cadence unverified |
| 6. Discarded group grades | Selected-grade frozen templates, code-based admission, new-request rejoin resumes membership | Partial: identical papers across users/grades and fixed snapshot selection need actual database execution |

Additional blockers: current fixtures omit production prerequisites and contain permissive policies/stub battle functions; they must not be used as production-equivalent proof. Existing working-tree screens already reference undeployed assessment endpoints; do not publish them before a controlled cutover. Authorized walkthrough preservation is not fully wired. Two importer handlers were identified without mandatory in-handler admin gates (`hf-aligned-importer`, `hf-dataset-importer`); this package does not silently deploy unrelated function changes, and privileged mutation compatibility must be resolved before GO. New candidate table-shape guards do not establish exact type/index/constraint equivalence. Full production-build evidence was not generated because this environment requires harness-managed builds.

## 7. Deployment and rollback sequence — not authorized execution

1. Finish unresolved live-battle solution review, walkthrough preservation, importer admin authorization and candidate compatibility gaps; review the exact SQL plus dependent application/edge-function diff.
2. Explicitly approve this finalized exact package **for an isolated Supabase environment first**. Production authorization is separate.
3. Capture that environment's schema/ACLs; apply through the managed migration tool; run every verification SELECT independently, real role/JWT tests, complete lifecycle and concurrent-race tests, second application and fail-closed rollback/recovery.
4. Supply student/admin browser readback evidence, payment/provisioning compatibility, linter per-object triage, production build evidence and updated hashes.
5. Only after those checks pass request explicit production cutover approval. Keep maintenance available; never re-grant keys or historical oracles to restore availability.

**Final recommendation: NO-GO.** Actual production access remains vulnerable, and neither isolated execution nor authenticated evidence exists. This package advances the existing implementation and exposes remaining gaps honestly; it is not a completed database security closure or approval request to execute SQL.
# Six-blocker closure report — NO-GO

Checked 2026-11-01 UTC. Continued the existing implementation; no project restart,
database migration execution, production writes, or permission weakening.

## Original independent evidence

Retrieved completed agent `sub_6spj1v7r` and inspected its exact six findings.
The original report is preserved in `independent-review-blockers.md`.
The following statuses describe this working tree, not deployed protections.

All SQL locations below are in `scripts/security-review/assessment-security.sql`.

| # | Exact affected locations | Vulnerability | Implemented remediation | Closure status and evidence |
|---|---|---|---|---|
| 1 | `issue_assessment`; `profiles`; `is_active_pro_plus`; entitlement provisioning | Owner-authored premium/tier fields could become paid-access authority; INSERT was not covered by the existing UPDATE trigger. | Added INSERT/UPDATE profile guard, private `assessment_entitlements`, trusted-write projection trigger, entitlement-based issuance/battle checks and cancellation. No unverified historical-profile bootstrap. | **Partially fixed.** SQL syntax passes. Existing paid-user provenance reconciliation/backfill is still required before cutover; payment/admin/cancellation compatibility needs executed tests. No production entitlement protection changed. |
| 2 | `issue_assessment`, `create_secure_group_test`, `submit_assessment_answer`, `get_assessment_review`; `secure_group_templates` | `group_code` plus practice purpose bypassed completion/embargo; educator template seed was reviewable practice. | Templates now selected directly without issuance; group purpose is forced to test before quotas; duration/expiry/review time derive from template. Group and overlapping-practice review blocked until close. Resolved fields cannot be caller supplied. | **Partially fixed — code implemented, database tests blocked.** Added no-seed, malicious-purpose, formal-submit rejection, completed-before-close denial in `six-blocker-regressions.sql`; not executed. |
| 3 | `start_battle`, `submit_battle_answer`, `finish_battle`, `issue_assessment`, `get_assessment_review`; `secure_battle_items`, legacy `battle_sessions.question_ids` | Separate battle lifecycle escaped assessment reservations and disclosure locks; prior disclosed questions could enter battles. | Shared transaction lock for start/issuance/review/battle grading; both secure items and legacy arrays reserve questions; battle start rejects disclosed/active-assessment/group conflicts transactionally. Battle feedback records disclosure. Finish waits for all participants or expiry; legacy start/finish are private. | **Partially fixed — code implemented, database tests blocked.** Added legacy-array reservation/nonmember tests and gated historical endpoint denial. Concurrent starts, real matchmaking/finish/rewards and authenticated workflow still unverified. |
| 4 | `issue_assessment`; `question_attempts`, `assessment_receipts`, `assessment_items` | Clients could fabricate/backdate/delete attempts used for unseen/repair eligibility; genuine receipts did not affect that evidence. | Unseen/repair now reads immutable owned receipts, not `question_attempts`; fixed groups bypass personal history. Existing legacy history remains unverified rather than retroactively trusted. | **Partially fixed — code implemented, database tests blocked.** Added different-history identical-paper regression. Genuine receipt selection/repair timing and legacy-history cutover need executed validation. |
| 5 | `get_assessment`, `save_assessment_draft`; `src/pages/TestAttemptPage.tsx`; `src/services/api/modules/assessmentDrafts.ts` | Reload reset revisions and lost answers; lost acknowledgements caused silent conflicts; expiry rejected pre-finalization flush and could strand submission. | Owner-scoped drafts/revisions on resume; same-response revision retry; serialized writes; surfaced sync errors; completed sessions redirect; expired or pending-completion retries skip draft writes and use server finalization. | **Partially fixed overall; client rules verified.** Six concrete draft unit regressions pass (resume revision 7, serialized revisions, failed-ACK retry, response recovery, exact expiry boundary, pending completion). SQL resume/ACK tests added but not executed; authenticated reload/expiry flow unavailable. |
| 6 | `create_secure_group_test`, `issue_assessment`; `secure_group_templates.config/items`; `src/pages/CreateGroupTestPage.tsx:handleCreate` | Selected grades were discarded and educator profile grade silently determined paper content. | Grades validated as 6–12, preserved, and used for server template selection; joins receive template snapshots independent of participant profile/history. Grade is a paper criterion; existing code-based admission remains unchanged. | **Partially fixed — code implemented, database tests blocked.** Added creator-grade-10/selected-grade-11 assertion and identical-paper assertion. No grade-based identity restriction invented. |

## Historical and alternative routes

- Read-only live inventory found three validator signatures, one unseen fetch,
  start/submit/finish battle, and no deployed assessment-review RPC.
- The proposal revokes every discovered overload of both validator names, unseen
  fetch, legacy battle wrappers and paid-subscription mutation from client roles.
- `e2e/specs/answer-security.spec.ts` now checks all validator overloads and foreign
  assessment/review/battle IDs and legacy battle endpoints behind the existing
  applied-migration/authenticated gate. No production submission tests ran.
- The disposable SQL suite independently checks effective helper/oracle grants.
  It is explicitly gated and **not run** under this task's no-migration instruction.

## Actual evidence, separated from pending checks

**Passed**

- `bun run test:run`: **147 tests, 16 files passed**, including six new draft tests.
- Targeted ESLint for changed TypeScript/React and security e2e: **0 errors/warnings**.
- PostgreSQL parser: **94 SQL statements and 26 PL/pgSQL declarations** in proposal;
  **12 SQL statements and 4 PL/pgSQL declarations** in regression suite parsed.
  Parsing is not execution, relation resolution, or database security proof.
- Automatic preview build log: **build OK**, latest observed 08:55:45 UTC.
  A standalone optimized production build was **not manually run** because this
  environment prohibits manual project builds/typechecks. Do not call it passed.
- Live HTTP suite: **2 passed** (anonymous unseen RPC and historical validator denied).

**Failed**

- Live HTTP column-protection test: **1 failed**. Error is from `has_role`, not an
  actual table/column privilege denial; the regression remains strict.
- Fresh live catalog query: **14/14 protected role-column checks still allow SELECT**
  (anon/authenticated × seven sensitive columns). Production answer security fails.
- Live catalog confirms authenticated execution remains enabled for the historical
  validators and unseen fetch; proposal revocations have not been applied.

**Blocked / not run**

- **5 authenticated e2e tests skipped**: applied reviewed contract and authenticated
  access unavailable. No credentials requested.
- All newly added database lifecycle tests, role-switched profile tests, concurrent
  reservation tests, group embargo expiry/readback, admin/payment preservation,
  battle reward finalization and signed-in browser flow remain unverified.
- Standalone production build and full current schema compatibility validation.
- Paid-user entitlement reconciliation and verified non-destructive cutover.

## Recommendation

**NO-GO.** Changes were implemented across all six areas, but none is declared
database-verified or production-resolved. Do not apply/publish this proposal.
Required closure: reviewed complete migration/cutover, independently verified
entitlement provisioning for existing users, authorized isolated execution and
concurrency/lifecycle tests, authenticated student/admin workflows, production
build evidence, and fresh effective privilege checks after approved application.
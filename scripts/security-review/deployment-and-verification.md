# Deployment and verification gate — not an execution instruction

No complete final migration exists yet. No existing SQL draft is approved. The
following is the required sequence after a complete implementation is reviewed;
do not perform any application step now.

1. Produce the full migration and dependent code diff. Confirm every new public
   table has explicit appropriate grants before RLS and policies. Private evidence
   and grading helpers must be inaccessible through PostgREST/PUBLIC/client roles.
2. Inventory existing grants, inherited roles, defaults, views, dependencies and
   function ownership. Pin search_path and fully qualify sensitive references.
   Do not grant anon `has_role`. Keep admin authorization narrow.
3. Apply the exact approved migration only to an isolated intended verification
   environment via the migration tool. Never test new writes on production as
   a substitute. Keep legacy answer oracles inaccessible during cutover.
4. Apply the complete reviewed screen/API/battle/group/admin diff in the same
   controlled cutover. Do not apply base-column revocation alone while leaving
   dependent screens relying on direct keys.
5. Run each SELECT in `scripts/security-answer-privileges.sql` independently.
   Required: all 14 protected role/column conditions false; no PUBLIC/inherited
   table/column grants undo them; all legacy overloads appropriately restricted.
6. Run anonymous and authenticated real HTTP requests through tables, views,
   relationships and RPCs. A has_role error is not a passed column regression.
7. Run isolated DB regressions: foreign owner/item, unissued question, empty and
   invalid answers, skips/timeouts, immutable versions, draft revisions, forged
   completion, legacy replay, embargo, concurrent disclosure/start, idempotency,
   late lock waits, duplicate finalization and transaction rollback on failures.
8. Run all unit/security tests, battle/CPU/group/test/admin workflows and a genuine
   authenticated browser practice flow including reload/readback. Ordinary and
   admin callers require distinct verified sessions. Do not invent credentials.
9. Rerun database linter and triage each security-relevant finding. Record actual
   results; unapplied-model or mocked-client tests are not database proof.
10. Submit fresh GO/NO-GO report. Production application and release require
    explicit authorization separate from approval in principle.

## Rollback considerations

- Before application, capture current exact definitions, ACLs, policies and
  dependencies, plus an approved non-destructive rollback/forward-repair script.
- On failure, stop new issuance/disclosure and retain immutable submissions and
  versions. Do not drop evidence, delete questions or replay legacy client totals.
- Do not restore the insecure broad answer-column grants/old key oracles just to
  restore UI compatibility. Prefer maintenance/read-only safe catalog behavior.
- Migration transactions can roll back failed DDL, but external media/deployment
  effects require their own rollback handling.
- A reviewed executable rollback remains pending with the full migration.

## Current linter triage

Fresh run this work: **110 findings**, unchanged database.

| Category | Count | Disposition |
|---|---:|---|
| Definer view | 1 | content_health in scope; security_invoker + correct grants required. |
| Anonymous-executable definer functions | 36 | backfill_text_quality and next_damaged_questions confirmed relevant; remaining items require individual role/data-path review, not blanket revocation. |
| Authenticated-executable definer functions | 68 | fetch, all validator overloads, battle and new assessment endpoints require explicit guard review; executable is not intrinsically unsafe. |
| Mutable function search path | 1 | Identify exact function and relation to this scope before deciding; aggregate output does not name it. |
| Extensions in public | 2 | Unrelated; unchanged. |
| RLS enabled without policy | 1 | Identify relation; absence of policies is generally fail-closed, not proof of public access. No broad change. |
| Leaked-password protection disabled | 1 | Authentication configuration warning; unchanged, not verified as remediated. |

The aggregate linter is not a complete per-object disposition report. Detailed
finding review and the post-application linter run remain pending.
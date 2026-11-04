
- Adaptive practice (separate Main/Advanced/NEET tracks, L1-L3 each, rolling 5-answer window promote/demote, ~30% mistake-repair interleave) lives only in src/lib/difficultyLadder.ts, persisted per user+track+scope in localStorage — zero AI cost, deterministic, unit-tested.
- Answer-access security regressions live in e2e/specs/answer-security.spec.ts; authenticated checks require an explicit applied-migration gate so audit runs cannot submit answers or alter QA account state.
- Unapproved assessment SQL and dependent-code proposals belong under scripts/security-review, never supabase/migrations or deployable function paths; review staging must not activate incomplete database contracts.
- Assessment callers use the shared assessments API and server issuance IDs; legacy test rows, cached keys and locally calculated outcomes never authorize review.
- Assessment eligibility uses immutable receipts and server-only entitlement evidence; group papers are template snapshots, never practice issuances, and selected grades constrain paper content rather than asserting a participant's identity.
- Formal-test draft writes are serialized per item and resume from server revisions; synchronization failures remain visible and cannot be treated as successful finalization.
- Final database-security candidates and evidence remain isolated under the review workspace; fail-closed rollback revokes assessment entry points without restoring answer grants, because availability rollback must not reopen key exposure.

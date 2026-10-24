
- Adaptive practice (separate Main/Advanced/NEET tracks, L1-L3 each, rolling 5-answer window promote/demote, ~30% mistake-repair interleave) lives only in src/lib/difficultyLadder.ts, persisted per user+track+scope in localStorage — zero AI cost, deterministic, unit-tested.
- Answer-access security regressions live in e2e/specs/answer-security.spec.ts; authenticated checks require an explicit applied-migration gate so audit runs cannot submit answers or alter QA account state.

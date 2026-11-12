
- Adaptive practice (separate Main/Advanced/NEET tracks, L1-L3 each, rolling 5-answer window promote/demote, ~30% mistake-repair interleave) lives only in src/lib/difficultyLadder.ts, persisted per user+track+scope in localStorage — zero AI cost, deterministic, unit-tested.

- Daily planner missions come only from src/lib/missionEngine.ts (pure, deterministic, unit-tested; cohort + phase + score-leak + test-to-plan rules) — keeps planning zero-AI-cost and testable.

- Planner Today and Week share missionEngine; preferences and task-scoped, device-local evidence live in plannerState so navigation never counts as completion and offline check-offs never alter mastery.
- Planner practice links carry planner_task and bounded target; test links use canonical /tests with explicit mode so chapter scope survives navigation.

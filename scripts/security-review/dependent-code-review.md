# Complete dependency inventory — implementation still pending

This is a source review, not the requested completed screen diff.

| File/flow | Required replacement |
|---|---|
| PracticePage fetchQuestions | Replace unseen, revisit, repair and fallback pools with safe issued items. Never fall back to key-bearing table reads. Preserve ladder ordering. |
| PracticePage submitAnswer | Replace bare-question validator with issued-item submission, then authorized feedback. Remove authoritative client correctness writes; avoid duplicate progress. |
| ClassRecapTest load/submit/finish | Verify owned class log on server; issue pinned items; server grade and end. Remove local key comparison and trusted correctness insertion. |
| StudyNowPage | Safe catalog metadata only; launch by scope, not client-authoritative membership. |
| TestPage all startTest branches | Server selection/reservation using validated configuration; no fresh offline authoritative start on request failure. |
| TestAttemptPage both hydrate paths | Resume by owned issuance ID; navigation/local storage cannot confer authority. |
| TestAttemptPage handleSubmitTest | Replace per-question practice validation with accepted drafts plus atomic finalization; failures remain pending. |
| TestResultsPage | Delete empty-submission answer hydration and local-results authority; review from committed server evidence only. |
| questionPaperPdf | Render released review data only; use question_type rather than a private numerical key to detect numerical questions. |
| BattlePage loadQuestions | Key-free server membership read. |
| BattlePage CPU creation/scoring | Server issuance and grading; delete scoreLocalAnswer; server-owned bot outcomes and result if authoritative. |
| BattlePage timeout/finish | Server round eligibility, idempotent grade and terminal result; no silent local authoritative fallback. |
| start/create/join/submit/finish battle RPCs | Audit together; freeze versions, lock membership/round/score, withhold keys, award once. |
| CreateGroupTestPage | Server-approved template creation, code uniqueness, frozen scope/versions/marking/schedule; not mutable group rows. |
| JoinGroupTestPage | Verify code, eligibility and quota, issue fixed owned participant assessment transactionally. |
| GroupTestLeaderboard | Read only finalized trusted participant results and server marks. |
| tests API module | Replace client reserve/create/grade/complete/save and correctness-bearing offline replay. Only raw draft commands for known issuances may replay. |
| questions API, batchQueryBuilder | Catalog projections only; client sampling is not issuance authority. |
| Historical validator overloads | Reject/restrict arbitrary-question answer lookup; all dependencies must migrate together. |
| QuestionHealthManager, QuestionReportsManager | Role-checked admin keys and protected mutations; no broad student column grants. |
| ExtractionReviewQueue, BulkCsvUploader | Keep import/review keys staff-only; preserve authorized import operations. |
| ChapterManager, QuestionLivePreview | Split safe metadata from admin-only full content/preview. |
| extraction/import/repair edge functions | Retain verified staff authorization; edits do not mutate pinned versions. |
| question_walkthroughs and edit history | Enforce review boundary for solution-bearing reads; staff-only audit history. |

## Implemented this iteration, not activated

- `assessmentContract.ts`: strict answer/submission validation and recursive
  rejection of protected fields in issuance/acknowledgement data.
- `assessmentReviewClient.ts`: unwired adapter separating submit from review,
  forwarding stable request IDs and rejecting request failure without local grade.
- Twelve unit checks across the two modules.
- Expanded read-only catalog audit for PUBLIC ACLs, inherited privileges,
  historical overloads and answer-bearing views.

No listed screen, admin operation or battle/group flow has been migrated. RPCs
named by the adapter do not exist in the applied database. Do not import the
adapter into active screens until the approved complete migration is applied.

## Final review package acceptance criteria

The final package must include the executable migration, every affected code
diff, isolated database/concurrency tests, fixed-group entry policy, and compatible
deployment sequence. The inventory and client tests alone do not satisfy it.
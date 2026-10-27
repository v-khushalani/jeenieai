# Trusted assessment state model — review specification, not deployed

## Immutable authority

An issuance fixes owner, purpose, ordered item membership, canonical question
identity, version, scope, grading rule, marking, server start/deadline, and review
policy. Students cannot create or change these records. Class/group/battle
references are verified against server-owned configuration, not `test_sessions`.

Private question versions contain prompt, options, key, numerical tolerance and
explanation. Public item projections exclude all seven protected answer fields.
Version retention must not cascade on deletion or deactivation of a source
question. Image URLs must be immutable/content-addressed; a frozen mutable URL
alone does not freeze the image. Media immutability remains a review dependency.

## Session transitions

| State | Command | Preconditions | Effect | Solution disclosure |
|---|---|---|---|---|
| Absent | Issue | Authenticated; scope/entitlement/config verified | Atomically reserve quota, select and freeze membership; active | None |
| Active | Get/resume | Owner | Safe items and accepted drafts | None |
| Active test | Save/clear draft | Owner; membership; expected revision; before deadline | Increment revision, replace raw selection/review flag | None, including no correctness |
| Active practice/recap | Submit | Owner; membership; valid first response | Commit immutable response and grade | Separate review may release this committed item |
| Active practice | Next/previous | UI navigation | No authoritative mutation | None |
| Active test | Finalize | Owner; accepted membership; policy satisfied | Freeze drafts, grade all items, aggregate, record completion transactionally | Aggregate only; review checks separately |
| Active timed session | Deadline reached | Server clock at/after deadline | Finalize accepted drafts; unresolved items skipped | Only after review policy |
| Active practice | End | Owner | Preserve answers; unresolved items skipped | Skipped practice items do not unlock keys |
| Finalized | New mutation | Any | Reject | None |
| Finalized | Same accepted command retry | Same request ID and canonical input | Return stable receipt; no rescore | Must recheck current release policy; no cached key bypass |
| Finalized | Review | Owner; committed completion; embargo/overlap checks | Read pinned versions only | Policy-authorized items only |
| Unverified legacy | Review/replay | No independent trusted issuance | Deny verified solutions; preserve labeled display history | None |

## Submission, clearing, skipping and timeout

Empty practice submissions are invalid and cannot open keys. Practice navigation
is not a wrong answer, a quota-consuming submission, or an irreversible skip.
Explicit end/skip does not reveal an unanswered practice solution.

Test selections remain editable before finalization. Clearing a test draft makes
it unanswered; a review flag never constitutes submission. Finalization treats
unanswered items as skipped, zero marks, excluded from attempted-answer accuracy.

An explicit timeout request is only eligible at a server-owned item/session
deadline. A browser clock cannot authorize it. Battle timeouts use authoritative
round timing, not generic empty practice validation. At the deadline boundary,
`clock_timestamp() >= deadline` is expired. Capture time after locking.

Expiry discovery must commit and return the terminal timeout result, rather than
finalize and raise an exception that rolls the transaction back. Late offline
responses cannot be backdated; only server-accepted drafts count.

## Locking, transactions and replay

1. Resolve identity with `auth.uid()`; never use a body user ID as authority.
2. Serialize issuance, submission, finalization and disclosure by owner with a
   transaction-scoped lock. Then lock session/item rows in a consistent order.
3. Enforce request uniqueness by owner + operation + request UUID. Store canonical
   input and an answer-free receipt. Same input retries return the same receipt;
   changed input with the same UUID rejects without mutations.
4. Lock before checking deadline or terminal state. Unique item receipts prohibit
   different UUIDs from scoring an answered practice item twice.
5. Apply final draft batch, grades, totals and completion in one transaction. Any
   validation or persistence error rolls all of it back.
6. Draft saves use optimistic revision checks to prevent stale-tab overwrite.
7. Derived compatibility progress is applied once from accepted server events;
   no new reward amounts or a reward-system redesign in this scope.

Direct writes to issuance, versions, submissions, grade, completion, membership,
review authorization or idempotency records are forbidden to students.

## Separate review authorization

Grading must not return private keys during an active test/battle. Practice/recap
feedback is retrieved only for a committed valid answer. Tests require server
completion; group tests additionally require their frozen review window; battle
review requires the chosen terminal round/battle policy. These policies must be
encoded in issuance, never supplied on review by the caller.

Review verifies ownership, canonical membership, committed evidence, current
embargo, and overlapping active assessments before reading private versions.
Walkthrough relationships, exports/PDFs, historical validators and retries must
use the same boundary. A display `withAnswers` toggle is not authorization.

## Concurrent disclosure protection

Use canonical question ID, not only version ID. Under the same owner lock:

- Reject/exclude newly issued timed-test items already disclosed to that owner or
  present in another active conflicting assessment.
- Exclude conflicting active test/battle items from newly issued practice.
- Recheck before any practice/historical/retry disclosure; issuance checks alone
  are insufficient.
- Record authorized disclosures transactionally.
- Do not silently replace questions in a fixed group paper. Entry conflicts need
  an explicit product policy; comparability must not be misrepresented.

This is an anti-oracle boundary, not an anti-collusion guarantee. Past exposure,
screenshots, other accounts and independently solved public questions cannot be
undone. Historical exposures before rollout are not reliably reconstructable.

## Compatibility rules retained

- Existing L1/L2/L3 engine stays in `difficultyLadder.ts`; level requests advise
  selection, never authorize keys or outcomes. No planner/taxonomy changes.
- Preserve existing JEE/NEET +4/-1, Foundation +1/0, CET subject-dependent marks,
  exact multi-option matching and inclusive numerical tolerance.
- Preserve legacy score and accuracy as distinct denominators; return marks
  separately instead of reinterpreting an old percentage column.
- Preserve admin edits through narrow server role checks. Newly issued versions
  reflect edits; existing issuances do not change.
- Legacy `test_sessions` may remain compatibility/display rows, but their editable
  question lists, correctness, totals and completion never authorize review.

## Unfinished implementation dependencies

This model is not executable SQL. Full schema/RPC implementations, scope/limits,
group template creation/join, authoritative battle timing/CPU outcomes, media
versioning and the complete screen/admin diff remain unfinished. Do not apply a
core-only migration or claim these transitions are enforced yet.
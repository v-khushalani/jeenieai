# Independent security review — NO-GO

Review received 2026-10-31. Read-only source analysis; no production SQL applied.
References describe the reviewed draft and may shift with edits.

## Unresolved blockers

1. **Mutable entitlement authority.** Issuance trusts profile premium/tier/grade
   fields without closing owner INSERT/UPDATE paths (SQL lines 89–91). Protect
   entitlement writes and use independently server-owned entitlement evidence.
2. **Premature group disclosure.** A group code can be combined with practice
   purpose, bypassing the formal-test review embargo. Template-seeding practice
   also remains reviewable. Derive participant purpose and review policy from the
   server template; do not create a reviewable practice session to seed a paper.
3. **Battle disclosure boundary missing.** Live battle items are not included in
   assessment reservation/disclosure checks. Include both lifecycle families in
   eligibility and review locks; membership checks alone are insufficient.
4. **Mutable attempt selection evidence.** Unseen/repair selection reads
   client-writable question_attempts, while trusted receipts do not maintain that
   history. Use receipts or a server-maintained projection. Fixed group papers
   must not change membership according to personal attempt history.
5. **Draft recovery missing.** Resume omits saved answers/revisions; the client
   restarts revision counters and suppresses conflicts. Recover drafts and
   reconcile retry acknowledgements; surface unsynchronized answers, especially
   before expiry finalization.
6. **Group grade contract discarded.** Selected grades are stripped during
   template creation; selection uses the creator profile instead. Preserve
   selected-grade selection and existing admission semantics server-side.

## Evidence boundaries

- Earlier runs: 141 unit tests passed; lint had zero errors and four warnings.
- The full draft compiled and limited practice/formal-test regressions passed in
  synthetic local PostgreSQL. They do not cover these six blockers or demonstrate
  compatibility with the complete production schema.
- Live read-only checks showed all 14 sensitive-column privileges still allowed;
  HTTP regressions reported one failure, two passes and four skipped checks.
- Supabase linter reported 110 findings; not all are in scope.
- Latest preview compilation reports build OK. No separate current TypeScript
  validation or signed-in workflow evidence establishes readiness.
- Authenticated end-to-end checks are unavailable for this externally managed
  Supabase project; do not request credentials or label skipped checks passed.

## Approval state

Implementation is incomplete. Neither SQL application nor release is authorized.
Do not deploy these callers against missing endpoints, apply the draft, or claim
that production answer access is protected. Complete blocker fixes and regressions
before requesting review of a final migration and dependent-code package.
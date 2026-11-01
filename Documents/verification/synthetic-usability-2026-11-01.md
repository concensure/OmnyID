# Synthetic Wedding Family Usability and Isolation Review

Date: 2026-11-01

This is automated synthetic evidence. It does **not** satisfy the couple-usability,
helper-usability, authorised-cohort, or promotion gates. Those gates remain open until
the applicable human or controlled hosted activity is recorded.

## Provenance and environment

- Exact application SHA tested:
  `585979fa793470b461c97047c66beacd03590b8a`
- Clean verification worktree:
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed315-verify-585979f`
- `git status --short` was empty before and after exact-candidate verification.
- Environment: local Windows browser harness plus a disposable PostgreSQL 18/pgvector
  container on `127.0.0.1:55435/omnyid_test` with temporary storage.
- Browser Family run flags:
  `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED=true`,
  `OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED=true`, and
  `OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST=synthetic-owner-only`.
- The database suite explicitly exercised both flags-off behavior and an exact generated
  owner allowlist. It restored process variables after each serial scenario.
- The disposable container was removed after the run. Oracle and production were not
  contacted or changed.

Pacing statement: browser cases ran with one worker. The gesture case deliberately paused
before pointer-down, during movement, and after release. Each navigation assertion waited
for the rendered result. No double-clicks or scripted bursts were used. The API suite ran
with one test thread. This was careful automation, not a timed human session.

## Personas and data actually exercised

The database scenarios created separate randomised owner, second-partner, delegate and
outsider accounts inside tenant-private schemas. The browser fixtures used synthetic Alex
Rivera guest/family data and a synthetic photographer decision. No real email, Gmail,
Calendar, account, guest or vendor data was used.

The requested full Mia/Jordan and Priya/Sam signed-in browser journeys were **not**
executed. The repository does not currently provide a disposable full-account browser
harness that can seed two complete weddings, helper grants and cross-wedding delegate
grants without using production-like external setup. The API-level tenant tests cover the
security boundary, but not those personas' first-time comprehension.

## Couple-goal observations

| Goal | Persona / intent | Observed outcome | Gulf / heuristic | Severity | Evidence |
|---|---|---|---|---|---|
| Start but do not send a family request | Synthetic owner; preserve a draft | Server test starts with a canonical draft and the Wedding suite confirms drafts remain outside the decision queue. No first-time signed-in browser path was observed. | Evaluation gulf remains unmeasured; visibility of system status | Not rated | `request_draft_submit_withdraw_is_versioned_idempotent_and_non_mutating`; Wedding draft lifecycle tests |
| Check nobody was told | Synthetic owner; verify no side effect | Draft/transition tests record no guest creation and no external send path. Browser comprehension was not observed. | Evaluation gulf remains unmeasured | Not rated | PostgreSQL lifecycle scenario; AFP draft-only tests |
| Submit and understand success | Synthetic owner; submit once | `POST /wedding/boundaries/requests/transitions` returned 200, status `pending`; exact replay returned 200 with the original receipt. | System status is machine-verifiable; human comprehension unmeasured | Not rated | PostgreSQL lifecycle scenario |
| Withdraw and understand history | Synthetic owner; withdraw submitted request | Transition returned 200, status `withdrawn`; a later submit returned 409. No guest profile was created. The signed-in history presentation was not observed. | Evaluation gulf remains unmeasured; visibility of system status | Not rated | PostgreSQL lifecycle scenario |
| Give Alex catering-only access | Synthetic owner; minimum scope | The delegated API projected scoped household data and omitted full guest collections, private notes and restricted markers. The first-time grant UI path was not observed. | Execution/evaluation gulfs remain unmeasured; match to real world | Not rated | `delegated_access_is_scoped_revocable_and_private_notes_stay_opaque` |
| Revoke Alex | Synthetic owner; end access | Revoke returned 200; reuse returned 404; an expired grant also returned 404. | Server status clear; human confirmation unmeasured | Not rated | Delegated-access PostgreSQL scenario |
| Delegate one task and see completion | Synthetic couple; one shared task projection | Exact-candidate tests confirm the task list and completion button consume one completion value, and status/stage filters compose. A full helper browser completion was not observed. | Execution gulf reduced in code; human result unmeasured | Not rated | `wedding-connected-projection-ui.test.ts` |
| Repeat with a second couple | Separate tenant | Separate tenant schemas and outsider probes were exercised, but the full second-couple first-time browser journey was not. | Cross-tenant comprehension unmeasured | Not rated | Seven serial PostgreSQL scenarios |
| Explain helper vs delegate | First-time couple | Not observed. Synthetic automation cannot supply a credible first-person wording judgment. | Match between system and real world | Open acceptance question | Human session required |

## Browser observations

- Family disclosure opened by keyboard, moved focus into the revealed region, closed, and
  restored focus to the trigger at 320 px and 375 px.
- At 200% root text size there was no horizontal overflow in the Family fixture.
- Axe reported no serious or critical issue in the focused Family, Wedding home, People,
  and task/budget fixtures.
- Guest Pending count was activated as a pressed filter, revealed Alex Rivera in place,
  and returned to all guests without navigation.
- The current Wedding journey marker rendered with the filled Wedding primary colour.
- A 100 px downward gesture opened the decision's labelled `Search vendors` action. A
  105 px upward gesture deferred the first card and visibly rendered the second card.
- A preliminary run exposed a stale-card rendering defect after a successful defer. The
  candidate keys the card subtree by the current item; the exact-SHA rerun passed.

Exact focused browser result: 10 passed. A second flags-explicit Family/deck run: 3 passed.

## Isolation and transition results

| Probe | Exact request/result | Result |
|---|---|---|
| Features off | `GET /wedding/boundaries/access/capabilities` -> 200 with both capabilities `false`; helper open -> 404; delegate grant create -> 404 | Pass |
| Allowed delegate opens own grant | `GET /wedding/boundaries/delegates/grants/{grant}/open` -> 200; private notes false and no unrestricted `guests` collection | Pass |
| Outsider opens grant | Same GET with outsider session -> 404 | Pass |
| Delegate proposes within scope | `POST .../{grant}/propose` -> 200 and `pending` | Pass |
| Delegate forges approval | `POST /wedding/boundaries/decisions` -> 403 | Pass |
| Owner approves | Same decision route with owner session -> 200 | Pass |
| Private note isolation | Owner write/read -> 200; delegate projection had null ciphertext; AFP contained zero ciphertext copies | Pass |
| Revoked or expired grant reuse | Owner revoke -> 200; later delegate open -> 404; expired open -> 404 | Pass |
| Household split retry | Owner command -> 200 `applied`; exact retry -> 200 with identical impact receipt | Pass |
| Stale household revision | Same command with a new idempotency key and stale revision -> 409 | Pass |
| Outsider household command | Outsider command -> 409 and no owner mutation | Inconclusive strict-status check: no data was returned by the test assertion, but the prompt preferred denial or 404. A future adversarial test should compare its bounded body with a guessed nonexistent household. |
| Draft submit/replay | Submit -> 200 `pending`; exact replay -> 200 with identical response | Pass |
| Withdraw/terminal transition | Withdraw -> 200 `withdrawn`; later submit -> 409; zero guest profiles created | Pass |
| Expired request | Decision route -> 200 `expired`; zero guest profiles created | Pass |
| Distinct second partner | First approval remains partial; only a different authenticated partner completes the required approval | Pass |
| Simultaneous last seat | Serialized database scenario allowed one bounded result rather than over-allocation | Pass |

Observed facts: all seven disposable-Postgres scenarios passed. Inference: these cases
provide strong server-side isolation and lifecycle evidence. They do not prove that every
guessed ID returns an indistinguishable body, nor do they snapshot every budget, seating,
vendor, search, notification and export projection named in the supplied protocol.

## Verification summary

- TypeScript typecheck completed after installing the clean worktree's SDK dependencies.
- Wedding native suite: 2,140 passed.
- Line-budget suite: 2 passed.
- Production frontend build completed.
- Focused account-boundary/profile/contact/projection/swipe suite: 25 passed.
- Focused Playwright suite: 10 passed; explicit-flag Family/deck rerun: 3 passed.
- Disposable PostgreSQL Family suite: 7 passed.

The first clean-worktree typecheck/build attempt failed because `typescript-sdk`'s own
dependencies had not yet been installed in the new worktree (`zod/v3` was absent). After
`npm ci` in that package, both commands completed. This was verification-environment
setup, not an application-code failure.

## Findings and recommended next steps

1. **Human comprehension remains unmeasured.** Run the supplied plain-language goals with
   at least two couples and one restricted helper. This repairs the execution/evaluation
   stages that automation cannot judge.
2. **Cross-couple grant swapping needs one explicit adversarial case.** Seed two owners and
   one delegate with different grants in the same test, swap grant IDs, and assert identical
   404 bodies. This strengthens tenant identification and feedback safety.
3. **Connected non-mutation needs broader snapshots.** Compare guest, invitation, RSVP,
   budget, seating, vendor, decision-queue, search, notification and export projections
   before and after draft, submit and withdraw. Current evidence directly proves the guest
   side and route constraints, but not every named projection.
4. **Outsider household-command status should be normalised or proven indistinguishable.**
   The current 409 did not mutate owner data, but a denial/404 contract is easier to reason
   about and aligns with the supplied protocol.

No usability gate, cohort, or promotion decision is claimed by this report.

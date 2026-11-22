# Wedding decision-card clarity and recovery tasks

Tasks: WED-389, WED-390
Depends on: WED-386, WED-388
Specification: `decision card clarity and recovery spec.md`

The tasks below extend the existing Wedding planner. They do not authorize a new
decision store, reminder service or parallel research queue.

Implementation status (2026-11-22): DC-01 through DC-11 are implemented and live.
WED-390 generalised the contract across every current Wedding decision kind, added the
bulk audit and source evidence, verified bounded online research, and installed the
passing twice-daily production monitor. Exact release evidence is in
`Documents/verification/WED-390-wedding-decision-and-monitor-release.md`.
DC-12 is implemented and clean-candidate verified on WED-393; it is not yet deployed.

## DC-01 — Reproduce and recover the Wedding template failure

Files:

- `solid-ui/src/App.tsx`
- new focused module-recovery state/helper if needed
- route and browser tests

Work:

- Preserve the exact error at the Wedding Planner boundary.
- Detect stale dynamic-import/module-graph failures separately from projection
  failures.
- Replace same-promise retry loops with one deliberate latest-shell reload while the
  saved navigation intent remains intact.
- Keep the normal remount and Back to Home choices for non-module errors.
- During release, retain the immediately preceding asset generation and prove both
  old and new module graphs resolve.

Acceptance:

- A simulated missing lazy chunk does not loop on Retry.
- A fresh Templates view and Wedding launch still work.
- Recovery does not clear a plan, local intake or AFP records.

## DC-02 — Add the actionable decision-content contract

Files:

- `solid-ui/src/lib/decisionCardState.ts`
- new Wedding decision-content state module
- focused state tests

Work:

- Add known facts, one missing fact, primary outcome, compromise, alternative and
  unconfirmed fields.
- Derive a readiness stage and action label from task/evidence state.
- Implement the transport decision question and stages without assuming paid
  transport is required.
- Format dates by role and suppress unsupported urgency.
- Filter internal pipeline wording from first-screen copy.

Acceptance:

- The screenshot's transport example becomes “How should your wedding party
  travel?” with an evidence-appropriate action.
- Missing information is stated instead of replaced by confidence language.
- Generic tasks remain usable when no safe category-specific rewrite exists.

## DC-03 — Prepare current, next and following before presentation

Files:

- `solid-ui/src/lib/weddingDecisionResearchState.ts`
- `solid-ui/src/components/WeddingMobileFocusHome.tsx`
- `solid-ui/src/components/WeddingDecisionFocusCard.tsx`
- research and rendering tests

Work:

- Increase the bounded research window from two items to three.
- Define deterministic ready/preparing/failed state for each window item.
- Start only the research required by that three-item window.
- Gate the deck until every available item in the window is ready.
- Render preparation/retry UI outside the decision-card model; never present loading
  prose as a recommendation.

Acceptance:

- No current, next or following card is displayed with research still pending.
- A failure names the unavailable evidence and exposes a bounded retry.
- The fourth and later decisions do not trigger advance research.

## DC-04 — Make Defer's reminder date explicit and editable

Files:

- `solid-ui/src/lib/weddingDecisionFocusActionState.ts`
- `solid-ui/src/lib/weddingDecisionDeferralAfpState.ts`
- `solid-ui/src/components/MobileFocusDeck.tsx`
- `solid-ui/src/components/WeddingMobileFocusHome.tsx`
- `solid-ui/src/components/WeddingDecisionFocusCard.tsx`
- deferral tests

Work:

- Centralise the existing default reminder-date calculation.
- Display the calculated date on the card/deck before deferral.
- Add a compact date-review sheet and carry a valid custom date through the existing
  action and AFP record.
- Preserve due-window, seven-day fallback and dependency-change resurfacing.
- Include the date in swipe and saved-status announcements.

Acceptance:

- Default reminders retain existing timing semantics.
- A custom future date survives serialization and is the projected
  `deferred_until_at`.
- Invalid/past dates cannot silently replace the safe default.

## DC-05 — Compact and harden the mobile card

Files:

- `solid-ui/src/components/DecisionCard.tsx`
- `solid-ui/src/components/MobileFocusDeck.tsx`
- relevant responsive/browser tests

Work:

- Put decision context and the missing fact before expanded recommendation detail.
- Keep deck actions outside the card's clipped/scrollable content.
- Make “View details” progressively disclose sources, compromise and alternative.
- Keep both labelled buttons and optional swipe behaviour.
- Verify the bottom navigation and agent control do not obscure actions.

Acceptance:

- Primary and reminder actions are visible at 320, 390 and 430 pixels and at 200%
  zoom.
- No horizontal overflow, clipped heading or covered button remains.
- Calm Wedding colours and existing accessibility focus behaviour remain.

## DC-06 — Integration, regression and handoff

Work:

- Run focused state/component/browser tests after each slice.
- Run `npm run test:wedding:ci` and `npm run build` from a clean exact-SHA release
  worktree.
- Exercise the fresh template and stale-module recovery.
- Record exact SHA, test evidence, remaining limitations and any Oracle release
  boundary in `.agent/HANDOFF.md`.

Acceptance:

- All WED-389 acceptance checks pass without weakening quote, RSVP, vendor-send,
  approval or privacy gates.
- No deployment is claimed from local edits; a later production release uses a
  clean frozen SHA and retained rollback.

## DC-07 — Select every decision before writing card copy

Files:

- `solid-ui/src/lib/weddingDecisionDefinitionState.ts`
- `solid-ui/src/lib/weddingPersonalOsProjectionState.ts`
- shared decision-card state modules and focused tests

Work:

- Declare a question, ordered prerequisites, answer record, deadline policy, options,
  primary outcome and approval boundary for every Wedding task kind.
- Use the existing plan, budget, guest, task, decision, quote, RSVP, seating,
  run-sheet and approval authorities.
- Surface a missing prerequisite first, suppress dependent cards while the canonical
  date/budget/guest setup choice is active, and remove settled choices.
- Keep existing deadline ranking and urgent blocker weights as the priority source.

Acceptance:

- Transport is no longer the only decision with a concrete content contract.
- A card cannot present a dependent choice before its prerequisite or repeat a
  settled answer.
- The visible prerequisite points to the record that actually resolves it.

## DC-08 — Put one choice and source evidence on every card

Files:

- `solid-ui/src/lib/decisionCardState.ts`
- `solid-ui/src/lib/weddingDecisionCardContentState.ts`
- `solid-ui/src/components/DecisionCard.tsx`
- `solid-ui/src/components/WeddingMobileFocusHome.tsx`

Work:

- Derive the title, options, primary action and outcome from the shared contract.
- Put quote lines, amounts, inclusions, constraints and vendor-source links beside
  the recommendation.
- Label estimates and unknowns and suppress unsupported recommendations.
- Preserve the existing guarded enquiry, message, payment and approval flows.

Acceptance:

- The compact and detailed surfaces agree on the question and next action.
- Checkable sources are links and an unknown is never restated as a fact.
- An external commitment still requires explicit approval and a provider receipt.

## DC-09 — Audit the existing queue in bulk

Work:

- Audit all projected cards for compound decisions, missing prerequisites,
  unsupported recommendations and repeated settled choices.
- Fix shared projection/rendering logic before category-specific definitions.
- Cover every planning-task kind and representative setup, selected-decision,
  calendar and approval records in tests.

Acceptance:

- Audit findings are available in the Wedding PersonalOS projection.
- Focused regressions prove prerequisite suppression and settled-choice removal.

## DC-10 — Verify online decision research

Files:

- `scripts/oracle-wedding-exa-decision-smoke.ps1`
- WED-390 verification record

Work:

- Run bounded live EXA searches for transport, celebrant and florist decision
  contexts using the configured Oracle secret without exposing it.
- Require useful category matches and first-party-like sources, and retain bounded
  titles, URLs and highlights for review.
- Decide from evidence whether query shaping, system prompts or response structure
  need changing.

Acceptance:

- All three searches return sensible source-linked results or the provider fails
  closed with an actionable result.
- Search highlights remain unconfirmed discovery evidence. No prompt is added where
  deterministic provider/query structure is sufficient.

## DC-11 — Install twice-daily Wedding production monitoring and release

Files:

- `scripts/omnyid-wedding-monitor.sh`
- `scripts/install-oracle-wedding-monitor.sh`
- `scripts/systemd/omnyid-wedding-monitor.*`
- `Documents/website monitoring/Wedding production monitor.md`
- WED-390 verification and coordination records

Work:

- Use a dedicated least-privilege Wedding synthetic account and root-owned systemd
  credentials.
- Check the public page, workspace shell, password login, session, bootstrap,
  database/daemon readiness, health and the current JavaScript asset without writes.
- Run at 08:00 and 20:00 Australia/Sydney with persistent scheduling, bounded jitter,
  machine-readable status and optional webhook alerting.
- Run the complete Wedding suite and production build from a clean exact-SHA release
  worktree, retain rollback evidence, deploy and verify the timer plus live routes.

Acceptance:

- The local synthetic self-test and a manual Oracle service run pass.
- The next two runs are visible in systemd and secrets do not appear in Git or logs.
- The frozen candidate SHA is the deployed static source and production smoke checks
  pass without changing the homeserver image unnecessarily.

## DC-12 — Keep venue discovery actionable before the date is fixed

Files:

- `solid-ui/src/lib/weddingVendorLeadTimeState.ts`
- `solid-ui/src/lib/weddingDecisionDefinitionState.ts`
- `solid-ui/src/lib/weddingPersonalOsProjectionState.ts`
- focused lead-time and PersonalOS tests

Work:

- Carry the catalogue's existing `mustDecideFirst` signal into generated planning
  task metadata instead of losing it after recommendation ranking.
- Generate the venue research task when the couple has only a season or no saved
  date, while leaving later vendor categories blocked from date-derived timing.
- Give date-less venue research its own shared decision definition so the general
  venue-booking date prerequisite does not suppress discovery.
- Use a bounded PersonalOS tie-break for venue when vendor urgency is equal; retain
  priority and deadline dominance.

Acceptance:

- A season-only and a no-date workspace both surface venue research in Decision
  Focus without inventing a date, deadline or availability claim.
- The card asks which venue options to compare and states that exact availability
  must be confirmed before booking.
- Venue ranks ahead of an equally urgent florist, while a materially more urgent
  florist or blocker can still rank first.
- Booked and skipped venue categories remain absent.

Implementation evidence: clean exact candidate
`60713cd4fba82b5d4d5784c73530b7750be85bf8` passed typecheck, both line budgets,
the public Wedding checks, all 2,348 Wedding tests and the production build. No
Oracle release is claimed for DC-12.

## DC-13 — Separate venue holds from quote validity and booking

Status: implemented in WED-400; release evidence pending the frozen candidate.

Work:

- [x] Parse vendor date-hold expiry and booking state from the existing normalised
  quote record.
- [x] Remove the fabricated 14-day quote-review countdown when no vendor deadline
  exists.
- [x] Keep quote validity and date hold as separate fields while ranking by the
  earlier explicit vendor deadline.
- [x] Define unreadable, no-deadline, over-budget, hold-expiring, hold-lapsed,
  chosen and booked content states without changing the Decision Focus layout.
- [x] Ask “Hold [venue] for [date]?” while the choice is open and retain explicit
  approval before contact or commitment.
- [x] Put stable contract/caterer/photographer successor task ids and dependency
  releases on the existing accepted-quote AFP selection; acceptance remains neither
  booking nor payment.

## DC-14 — Surface derivative signals only from saved evidence

Status: implemented bounded wiring in WED-400; unsupported watcher integrations
remain explicitly out of scope.

Work:

- [x] Compare a silent vendor with the median reply time only when two same-category
  replied peers support the comparison.
- [x] Reduce a five-or-more-decision focus to one item without deleting the queue,
  but only when saved weekly opened/closed counts establish the pressure.
- [x] Consume saved focus-switch, completed-check, budget-pace and watcher event
  metadata as plain-language relief lines.
- [x] Count only current seven-day expiring-hold, over-budget-quote and stale-vendor
  events in the weekly caught-work line.
- [x] Preserve the existing passive quote-event reconciler and approval boundary.
- [ ] Do not claim Gmail auto-ingress, encrypted-mail reading or calendar clash
  detection until those provider integrations have their own tasks and production
  proof.

## DC-15 — Restore the Soft public message on mobile

Status: implemented in WED-400; Oracle publication pending the release gate.

Work:

- [x] Restore the existing Elvis Bekmanis hero asset directly from this worktree;
  do not build an older checkout.
- [x] Keep the general headline and name an intimate ceremony, a micro wedding and
  a larger celebration in both static and runtime copy.
- [x] Add public-site regression coverage that rejects a mobile rule hiding the
  hero subtitle.
- [ ] Record the clean candidate SHA and hosted mobile proof after deployment.

## Completion evidence

- Exact deployed source: `3c22a9c7766455fa591ddd5b19ee14f9b2fc8517`.
- Full Wedding suite: 2,336 tests passed; production build passed.
- Shared definitions and audit cover all 25 planning-task kinds plus setup, calendar,
  selected-decision and approval projections.
- Live Exa transport, celebrant and florist checks each returned five relevant
  first-party-like sources; highlights remain unconfirmed.
- Oracle readiness is green, the read-only eight-check synthetic passes, and the
  08:00/20:00 Australia/Sydney timer is enabled and active.

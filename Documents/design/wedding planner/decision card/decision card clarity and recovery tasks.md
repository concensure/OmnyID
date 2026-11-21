# Wedding decision-card clarity and recovery tasks

Task: WED-389
Depends on: WED-386, WED-388
Specification: `decision card clarity and recovery spec.md`

The tasks below extend the existing Wedding planner. They do not authorize a new
decision store, reminder service or parallel research queue.

Implementation status (2026-11-21): DC-01 through DC-05 are implemented on
`agent/codex/WED-389`; DC-06 verification is in progress. The production compatibility
repair restored the previous asset generation additively and did not deploy this
uncommitted implementation.

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

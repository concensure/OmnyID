# WED-292 run-sheet profile editing evidence

Date: 2026-10-29 (Australia/Sydney)

## Candidate

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Branch: `agent/codex/WED-292`
- Exact clean code candidate: `8c9923361eac1cca0396c68803b2e2a5e601fe3f`
- Dependency: WED-291 atomic projector candidate `c1ee49a03a50507080f2172f431b49847169ed58`
- Deployment: not requested and not performed.

## Implemented boundary

- A generic Database profile plug-in registers Wedding run-sheet controls and preferred fields. Ordinary and custom databases retain their existing controls and fields.
- The profile provides day, status and attention filters, chronological ordering, a keyboard-scrollable time rail, desktop editing, and mobile cards.
- Run-sheet rows expose zoned time, place, owners, participants, visibility, dependencies, buffers, source linkage and override state.
- Manual entries are detached AFP database records and cannot be overwritten by the automatic projector.
- Proposed relative rows recompute from their anchors. Confirmed anchor drift becomes a conflict instead of silently changing.
- Editing a confirmed source-linked time requires explicit confirmation. Safe linked task due-date updates use the authoritative task command; other changes remain visibly labelled run-sheet-only overrides.
- Desktop cells are keyboard-operable and restore focus after save, cancel or confirmation. Add-item and time-change dialogs restore their triggers. Earlier/later buttons provide a drag-free time adjustment.

## Exact-candidate verification

Every command reported the worktree above, exact SHA `8c9923361eac1cca0396c68803b2e2a5e601fe3f`, and an empty `git status --short` before execution.

| Check | Result |
|---|---|
| TypeScript typecheck | Pass |
| Database/run-sheet focused tests | Pass: 29 |
| Source and Wedding line budgets | Pass: 2 |
| Full Wedding frontend suite | Pass: 2,033 |
| Production UI build | Pass |
| Playwright at 320px, 375px and 1280px | Pass: 3 |
| Axe serious/critical scan in those viewports | Pass: none found |

The 320px browser check exercises the same CSS reflow width as a 1280 CSS-pixel layout enlarged to 400%. The production build emitted only the existing large-chunk advisory. No external provider, hosted share, PDF delivery or outbound message was exercised.

## Remaining program work

WED-293 remains responsible for saved role views, preview, print/PDF output and false-default hosted sharing. WED-294 adds deterministic conflict/buffer rules and contextual A2UI. WED-295 performs migration, adversarial authorization, offline, accessibility, performance and flags-off shadow hardening before any hosted-sharing rollout.

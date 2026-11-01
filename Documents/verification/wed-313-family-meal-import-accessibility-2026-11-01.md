# WED-313 Family Meal, Import and Accessibility Assurance

Date: 2026-11-01

## Candidate

- Implementation SHA: `0a889ffeaba142027fb6b3a124e549aed3b117bc`
- Branch: `agent/codex/WED-308`
- Clean detached verifier: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed313-verify-0a889ff`
- Production was not changed. Oracle remains on `eb398ebfecaec6a0277d7fe634e6c97198b44afe`.
- `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED` and `OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED` remain false-default.

## What was verified

1. Plan and RSVP edit the same AFP-backed, source-referenced meal catalogue.
2. Only explicit structured `meal_choices`, `meal_options` and `menu_options` arrays are projected from venue quotation, vendor conversation or run-sheet evidence. Free prose is ignored.
3. Replacing a choice already used by an attending response identifies the affected response through bounded opaque references and requires explicit couple confirmation.
4. The successor event records its revision, evidence source and zero model calls without copying guest names, meal answers, dietary facts or allergy facts into the review receipt.
5. Reviewed synthesized guest-list tables project invitation-group households into the canonical Family ledger. The import omits email, address, dietary, allergy and private-note columns and refuses invalid allocations and deadlines.
6. The compact Family surface restores keyboard focus after disclosure changes, exposes accessible names and status text independent of colour, and reflows at 320 px, 375 px and 200% zoom.

## Exact-SHA checks

Run from the clean detached verifier at the implementation SHA:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run test:wedding` | Passed, 2,131 tests |
| `npm run test:line-budget` | Passed, both budgets |
| `npm run build` | Passed, production bundle |
| `npx playwright test tests/e2e/wedding-family-boundary.spec.ts --config playwright.config.ts` | Passed, 2 browser cases |

The browser cases use real controls and Axe checks at 320 px and 375 px, set the page to 200% zoom, verify focus restoration after collapse, and reject serious or critical accessibility findings.

## Privacy boundary

| Source content | Projected | Deliberately excluded |
| --- | --- | --- |
| Explicit meal/menu arrays | Choice label, source kind, reviewed source reference | Prose guesses, dietary facts, allergy facts |
| Replacement review | Removed choice labels, affected count, bounded response references | Guest name, current meal answer, health data |
| Reviewed guest table | Invitation group, household label, family group, allocation, request deadline | Email, address, phone, dietary/allergy and private-note columns |

## Remaining gates

- Couple usability for request review, household attention and rule comprehension.
- Delegated-helper usability using deliberately restricted data.
- A separately authorised allowlisted Family cohort followed by the documented promotion criteria.

These gates do not justify enabling either Family rollout switch in this candidate.

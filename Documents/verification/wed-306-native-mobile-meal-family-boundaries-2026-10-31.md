# WED-306 Native Mobile, Meal Catalogue and Family Boundaries Evidence

Date: 2026-10-31

## Candidate provenance

- Branch: `agent/codex/WED-306`
- Pre-change coordination SHA: `3bd1f79fdae00c370556b504e0fde1daf66cc36f`
- Exact deployed application SHA: `3c626dd149d61ae57c739fa90cd26acecb0109aa`
- Clean release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed306-release-3c626dd`
- Deployment used Oracle's existing `.env.oracle`; no local environment file or secret was uploaded.

The clean checkout contained no tracked changes. The proof output created after
deployment is an untracked release artifact and was not included in the build.

## Implemented boundary

- Wedding mobile views use the phone viewport without the redundant desktop
  glass border or outer horizontal inset. Internal cards still provide grouping.
- The onboarding atmosphere helper contains only user-facing guidance. Photo
  choices use exact semicolon-delimited tokens and selecting an active image
  removes it without mutating unrelated free text.
- Meal choices are one AFP-backed catalogue scoped to the Wedding workspace.
  Suggestions require explicit structured `meal_choices`, `meal_options` or
  `menu_options` fields from a venue package/quote, vendor conversation or run
  sheet. The couple chooses the source, can edit the list, and confirms it.
  Meal choices remain separate from allergy and dietary notes.
- Family boundaries now opens as a compact Requests/Households summary. The
  detailed existing request, rule and visibility controls remain available
  through disclosure and continue to use the canonical boundary ledger.
- The vendor quotation frontend now addresses the server's real protected
  `/quotation/vendor-transactions/*` routes.

## Exact-candidate verification

The unchanged application SHA passed:

- Solid UI typecheck.
- Both repository line-budget checks.
- Ten focused tests covering vendor route paths, meal projection/provenance/
  isolation, reversible intake selections, native mobile framing and the compact
  family-boundary projection.
- Full Wedding suite: 2,101 passed, 0 failed.
- Production Solid UI build.
- Playwright People-hub checks at 320 px and desktop: 2 passed, 0 failed.

No Rust production code or database contract changed in this slice, so no new
Rust route/database test was required.

## Oracle deployment and hosted verification

`scripts/deploy-oracle.ps1` deployed only the clean exact SHA. The generated
post-deploy proof reports:

- status: pass
- generated at: `2026-10-31T09:43:51.7225989Z`
- homeserver running: true
- backup service running: true
- manifest verification: passed
- backup verification: passed
- restore drill: passed
- failure step/reason: none

After the proof completed, no restore-drill container remained. Root disk was
37 GiB of 45 GiB used, 7.7 GiB free (83% by `df -h`; the proof recorded 82%
before rounding/state settled).

Hosted asset checks established:

- `WeddingSiteIntakeWizard-DYnYZN3v.js` contains the remove-selection helper
  and does not contain `local WebP thumbnails`.
- `WeddingResponseWorkspaceView-r4xi4jRA.js` contains the compact family
  summary and the couple meal-confirmation/source controls.
- `vendor-BdwtWdP9.js` contains `/quotation/vendor-transactions/inbox` and not
  `/api/quotation/vendor-transactions/inbox`.
- The protected correct inbox route returns HTTP 401 without a session,
  demonstrating the route exists and refuses anonymous access. The old path
  returns HTTP 404.
- `vendor.html` and `quotation-response.html` are publicly reachable shell
  pages; data still requires the protected transaction/grant boundary.

Production quotation extraction, recommendation, closure, vendor grants and
vendor response-capability flags remained enabled at their already approved
values. `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED` remained false. No unrelated
rollout flag was enabled by this release.

## Remaining family-boundary work

This is deliberately the first couple-facing slice, not completion of delegated
family governance. The ordered task document still requires the Plan/day-detail
meal editor, household commands, structured rule precedence, server-authoritative
grants, atomic and idempotent request decisions, connected reconciliation, bulk
operations, restricted-helper privacy testing and allowlisted rollout evidence.

See `Documents/design/wedding planner/wedding planner/family-boundary-tasks.md`.

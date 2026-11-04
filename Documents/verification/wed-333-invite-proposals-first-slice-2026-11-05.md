# WED-333 Invite Proposals first-slice evidence

Date: 2026-11-05
Branch: `agent/codex/WED-333`
Base: `ce62ebd3c1bf83f90b40398b46a33e12e998b54d`

## Implemented

- Added the companion product/architecture specification and dependency-ordered task plan.
- Replaced the static vendor-card heading with accessible in-place Find vendors and Invite
  Proposals tabs while preserving the mounted search state.
- Projects a reusable brief from the same wedding context, category allocation and comparison.
- Selects at most five current comparison vendors.
- Shows explicit sharing controls. Approximate category budget and phone contact default off.
- Saves an internal AFP event with A2UI and Markdown views, pending approval and
  `external_action: false`.
- Does not send email, create a provider receipt, or mark a vendor Enquired.

## Verification

- `npm run typecheck`: pass.
- Focused Invite Proposals tests: 6 pass.
- `npm run test:line-budget`: 2 pass.
- `npm run test:wedding`: 2,200 pass.
- `npm run build`: pass.
- `git diff --check`: pass.

## Deliberately open

The first slice does not broadcast invitations. Eligibility, conversion into the existing
permission-fingerprinted outreach drafts, partial-batch idempotency, structured vendor response,
normalization, booking closure and allowlisted rollout remain in the dependency-ordered task plan.
Those paths remain false-default.

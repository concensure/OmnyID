# WED-305 account isolation and connected mobile projections

Date: 2026-10-31 (Australia/Sydney)

## Production account finding

A read-only production inspection was performed after the test account was
recreated. The new account has:

- no generic onboarding row;
- no Wedding onboarding row;
- no retained attachment metadata or allocated attachment bytes;
- two tenant messages, both written after recreation; and
- an empty Wedding preference profile with no derived signals, facets, hard
  constraints, budget or guest count.

The visible 80-guest and budget values therefore did not originate in the
recreated account's tenant database. They came from browser convenience state
whose keys were shared across account identities.

## Implemented boundaries

- Generic onboarding completion, Wedding entry source, intake variant and
  Wedding intake draft keys are now scoped by the authenticated user ID.
- A deleted account's browser state is not read by a recreated account with a
  new user ID, even when the email and Wedding workspace identifiers match.
- Account deletion inventories every attachment object while the private
  tenant schema still exists, removes the corresponding SeaweedFS or managed
  filesystem object, and only then deletes the tenant profile, AFP ledger,
  quota and account rows.
- Object deletion rejects unsafe storage keys and fails closed. If any object
  cannot be removed, the tenant metadata is retained so the operation can be
  retried from its authoritative inventory.
- The successful deletion response reports stored-file count, profile/ledger
  deletion and allocated-storage release.

## Connected Wedding behavior

- Vendor-research actions resolve against the complete mobile queue, so later
  photographer, planner and other category decisions open Search vendors or an
  existing shortlist instead of falling back to Review decision.
- Mobile overview tiles use content-driven height and place the action in a
  separate final row. Plan aggregate actions use larger gaps and touch areas.
- Vendor category changes remain in place. Favourite is visible on mobile and
  lifecycle filters merge current comparison choices with account-scoped AFP
  state while recognizing supported enquiry and quote event variants.
- Original import storage remains automatic. A storage retry is an operational
  state, not a couple planning task.
- Quote acceptance uses one confirmed AFP decision from the follow-up card,
  Documents or Quote received filter. That same decision supplies the Budget
  commitment and vendor lifecycle projection; it explicitly does not sign a
  contract, book, pay, or send a message.

## Local verification before freeze

- TypeScript typecheck: passed.
- Focused account-state, intake-draft, import, mobile and vendor-lifecycle
  tests: passed.
- Full Wedding suite: 2,094 passed.
- Production UI build: passed.
- Source and Wedding line budgets: passed after quote acceptance ownership was
  extracted from the existing large workspace component.
- `cargo check`: passed.
- Account deletion route tests: 4 passed.
- Attachment purge traversal test: 1 passed.

The final release SHA, clean-worktree checks, Oracle deployment and controlled
RSVP allowlisted-pilot evidence are appended after the candidate is frozen.

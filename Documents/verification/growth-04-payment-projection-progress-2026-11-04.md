# GROWTH-04 payment projection progress — 2026-11-04

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/GROWTH-001`

Base SHA: `c5b2ee0f144e3a21d0a6505e26c2e8af76d872a4`

## Implemented

- `payment-v1` accepts only live-mode, paid, one-off OmnyID Wedding Checkout success events with
  the server-bound account, canonical Wedding plan, resolved Stripe price, PaymentIntent, currency,
  gross amount and available tax.
- Checkout now binds the canonical Wedding and resolved price into both Checkout Session and
  PaymentIntent metadata. A caller cannot supply amount, price, product or revenue facts.
- Signed `charge.refunded` events reconcile by PaymentIntent. Refund amounts are cumulative,
  append-only and cannot exceed the accepted gross transaction; partial and full refund states do
  not erase the original success.
- Transaction uniqueness prevents distinct success webhook IDs for one PaymentIntent from
  double-counting revenue. Existing `billing_events.stripe_event_id` uniqueness still suppresses
  exact provider replay.
- The projection excludes checkout starts, unpaid events, test mode, malformed bindings, unknown
  Weddings, wrong products and mismatched refund identity/currency/price.
- A Wedding summary exposes first purchase, 30-day maturity, gross, refund, net-before-tax and
  current paid state. Variable payment/service costs are append-only revisions; the pure
  profitability function returns `incomplete` whenever tax or any cost input is missing.

## Verification completed

- 19 Growth unit tests passed, including success/refund classification and incomplete-cost rules.
- 21 existing billing tests passed.
- Migration-catalog parity passed with migration `0140` embedded.
- `cargo check --lib` passed after the final projection changes.
- Solid source and Wedding line-budget tests passed. All three new files are below 999 lines, and
  the pre-existing 17k-line DB file and 1.7k-line billing file are line-neutral.
- `git diff --check` passed.

## Open verification

The real disposable-Postgres scenario is implemented but not executed in this session. Docker
Desktop returned `Docker Desktop is unable to start` before a tmpfs pgvector container could be
created, and the remaining localhost listener could not be identified as the guarded
`omnyid_test` database. It was deliberately not used. GROWTH-04 remains `in_progress` until the
fresh container applies all migrations and proves success replay, partial/full refund, test-mode
exclusion, maturity and incomplete cost revision end to end.

No Oracle deployment, Stripe API call, payment, refund, feature-flag change or production database
mutation occurred.

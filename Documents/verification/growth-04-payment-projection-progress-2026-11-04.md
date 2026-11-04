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

## Disposable database verification completed

Docker recovered later in the session. A fresh loopback-only `pgvector/pgvector:pg16` container
named `omnyid-growth-db-20261104` used a tmpfs data directory and the guarded `omnyid_test`
database. The first run exposed PostgreSQL's `SUM(BIGINT)` to `NUMERIC` promotion; migration 0140
now casts exact minor-unit aggregates back to `BIGINT` so overflow fails instead of silently
changing type. After recreating the database, the focused case applied all 141 migrations and
passed success replay, transaction deduplication, partial/full refund, test-mode exclusion,
maturity and incomplete-cost revision checks. The container was removed after the test.

No Oracle deployment, Stripe API call, payment, refund, feature-flag change or production database
mutation occurred.

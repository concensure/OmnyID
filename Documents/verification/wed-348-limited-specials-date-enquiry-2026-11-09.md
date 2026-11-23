# WED-348 Limited Specials and date-enquiry evidence

Date: 9 November 2026 (Australia/Sydney)

## Hosted failure reproduced before the fix

A real Chromium session signed into the hosted Wedding workspace as the
controlled Casper test account, opened Vendors, and selected Limited Specials.
The panel entered its error boundary. The browser network/console evidence
showed HTTP 415 for `POST /wedding/vendor-specials/discovery`.

The client supplied a JSON string through the generic `body` option, while the
shared API client adds the JSON content type only for `bodyJson`. Axum therefore
rejected the request before discovery could run. The same latent error existed
in the special-enquiry recheck, link and delivery-failure requests.

## Implemented correction

- All four JSON requests now use the shared `bodyJson` contract.
- Discovery failure is contained inside Limited Specials instead of disabling
  the wider planner.
- A no-results or temporarily unavailable discovery still provides a directory
  vendor picker and prepares the normal approval-gated date enquiry.
- Invite Proposals offers local, state-labelled Australian location suggestions
  enriched from the current vendor directory. Saving still uses the existing
  wedding-context AFP projection.
- Desktop vendor categories retain the core choices and expose less common
  categories behind a compact More control.

## Controlled 6HEAD message

The operator authorised a sample enquiry to their controlled mailbox. An
authenticated Cloudflare Email Sending request was accepted at
`2026-11-09T02:48:00.549Z`.

- Recipient: `concensure@gmail.com`
- Subject: `[TEST] Date enquiry for 6HEAD — 30 November 2026`
- Proposed date: 30 November 2026
- Requested evidence: availability, suitable spaces and capacity, indicative
  minimum spend or per-head price, inclusions, and material conditions
- Safety wording: explicitly a controlled test, not a booking, hold or
  acceptance
- Provider receipt SHA-256 prefix: `77c6899897525d0d`

This proves provider acceptance of the controlled sample. It does not by itself
claim inbox receipt or that a browser-originated enquiry wrote an AFP event.
Those are separate observations.

## Local verification

- TypeScript typecheck: pass
- Wedding test suite: 2,249 passed, 0 failed
- Source and Wedding line budgets: 2 passed, 0 failed
- Focused location, Invite Proposals and Limited Specials tests: pass

## Exact-SHA release and hosted verification

Application commit `8ddf8832b241fa1f00c5e12912da19bc52460626` was built from a clean detached
worktree and released to Oracle. Both `SOURCE_COMMIT` and
`oracle-runtime-manifest.json` report that full SHA. The post-deploy production
proof passed; homeserver and backup services were running and backup
verification passed. The restore drill was not repeated because the same
deployment preflight had already passed it.

An authenticated Chromium request using the controlled Casper account sent the
same JSON discovery shape that previously returned 415. Production returned
`200 application/json`. The deployed Wedding chunk was also fetched and
verified to contain the no-specials date-enquiry surface, the state-labelled
Ryde suggestion, expanded desktop categories and the discovery contract.

The controlled account's fresh headless session landed in the generic response
queue rather than rendering the Wedding navigation, so this run does not claim
a visual click-through of the complete panel. That account/deep-link behavior
is separate from the discovery endpoint correction and should remain visible
in later account-onboarding regression work.

A read-only production directory check confirmed `6HEAD Sydney` exists as an
active venue, so the new directory fallback can target the named vendor rather
than relying on a synthetic entry.

# WED-318 Family Release and Vendor Relay Verification

Date: 2026-11-02 (Australia/Sydney)

## Final hosted release

- Branch: `agent/codex/WED-318`
- Exact application release: `c12bb3006556a254b1f1cb630cc4905a76b6b2ec`
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json`: exact match
- Synchronous production proof: pass; homeserver and backup service running and the latest backup
  verified. The disposable restore drill was skipped because Oracle did not have the calculated
  free-space headroom.
- Public Wedding blog batch: all 14 reviewed URLs returned HTTP 200.
- Oracle root filesystem after release: 41 GB used of 45 GB, 3.9 GB free (92%).

## Family release

- Branch: `agent/codex/WED-317`
- Exact release: `5f1539e657a0cb7e8fa51943f42d9ed2fd77726b`
- Oracle `SOURCE_COMMIT`: exact match
- Oracle `oracle-runtime-manifest.json`: exact match
- Runtime: homeserver running with helper and delegate switches enabled and the explicit `*`
  owner cohort selected by the owner after the real-couple/helper gates passed.
- Public workspace smoke: HTTP 200 through Caddy with the expected security headers.
- Bounded production proof: pass; homeserver and backup service running; latest backup manifest and
  contents verified.
- Full restore drill: not rerun. The preflight calculated that the 6.49 GB source database requires
  about 8.21 GB free while Oracle had about 6.69 GB before the release build. The release was not
  rolled back because this is a capacity gate on a disposable restore, not a runtime failure.

The helper/delegate rollout remains reversible through the two independent environment switches.

## Operator email relay

The relay is deployed and enabled. It accepts only a
Cloudflare Email Worker event that passes the existing timestamp/nonce/body-digest HMAC boundary,
then additionally requires:

1. the first trusted Cloudflare `Authentication-Results` value to contain DMARC pass;
2. an exact real operator sender and exact reserved OmnyID alias;
3. one plain-text `To:` command and one non-OmnyID destination;
4. no attachment and a successful ClamAV scan;
5. durable event reservation before one provider request; and
6. exact provider Message-ID correlation for replies.

The command line is stripped. Outbound mail uses the selected alias in From and Reply-To, BCCs the
operator, and preserves only safe bounded thread headers. Sender and recipient addresses are stored
encrypted with a dedicated file-backed key; operational events store digests and delivery state, not
message bodies.

Evidence:

- Worker: 8 tests passed.
- Provider payload, loop/header rejection and recipient-bound receipt states: 4 passed.
- Trusted first auth header, exact command removal and ciphertext context binding: 3 passed.
- Production UI build and TypeScript checks passed.

The owner-authorised production configuration is deliberately narrower than the general code path:

- sole command sender: `concensure@gmail.com`;
- relayed aliases: `hello`, `info`, `wedding`, `privacy`, `support`, and `admin` at `omnyid.com`;
- `noreply@omnyid.com` remains outside the relay; and
- the existing catch-all remains disabled and set to Drop.

Hosted configuration and evidence:

- the sole operator allowlist is `concensure@gmail.com`;
- the six routed aliases are `hello@`, `info@`, `wedding@`, `privacy@`, `support@` and
  `admin@omnyid.com`; `noreply@` and the disabled catch-all remain outside the relay;
- the Worker and homeserver use one newly generated shared HMAC secret held only in provider/server
  secret storage; the relay encryption key and sending token are also file-backed server secrets;
- a signed controlled command was accepted once by the provider, persisted as one accepted AFP
  event and produced one send attempt with a provider message ID;
- replaying the same raw message returned the duplicate outcome and did not create a second event;
- the live ClamAV container was healthy, a clean sample passed, and the EICAR test was detected;
- a public unsigned request was blocked by Cloudflare before it reached the application.

Provider acceptance and replay suppression are machine-verified. Actual Gmail receipt, the operator
BCC copy and a reply in the same visible mailbox thread still require inbox observation; they are not
inferred from provider acceptance. Gmail commands must come from the real allowlisted Gmail identity,
not Gmail's unauthenticated “Send as” alias.

## Wedding lifecycle mail

The supplied membership schedule is implemented as deterministic, bounded templates and send
policies rather than free-form generation. The core library covers welcome, partner invitation,
partner acceptance, vendor response, quote-ready, weekly progress, 14-day reactivation and
post-wedding transition. Every template revalidates before send; service and journey messages need
notification permission where appropriate, weekly/reactivation messages are capped, and the
post-wedding product transition requires commercial consent.

The Wedding welcome is connected to successful email verification. Its Wedding experience is
persisted in the server-issued verification-token identifier and is not trusted from a client body.
Other templates remain reusable event outputs until their corresponding AFP event producer and
pre-send eligibility query are connected; they must not be described as scheduled production mail.

## Binder confirmation and blog batch

The Binder's production HTML and text templates use a backend-generated, hashed, expiring
confirmation token. A regression test renders the exact 52-character token into the confirmation
button and rejects the `SAMPLE-TOKEN` used by the separate static design preview.

The Binder is enabled on Oracle. The reviewed fillable and print PDFs were hot-synced after deploy;
their hosted files match the recorded SHA-256 values and both URLs return HTTP 200. A controlled
request returned the enumeration-safe accepted response and its database receipt is `sent`, one
attempt, marketing opt-in true and delivered timestamp present. Inbox receipt and pressing the real
confirmation button remain external observations; the backend token and confirmation route are live.

The reviewed batch contributes 14 article pages and 14 local covers. The publication catalogue,
search taxonomy, index cards and smoke list are reconciled to 54 posts. The unrelated Animal Quiz
card and grid restructuring from the source worktree were not transplanted.

## Disposable account harness repair

The seed now writes the canonical `template:wedding_planning` and `event:wedding` AFP pair consumed
by the current Wedding projection. The browser journey additionally opens Guests and Family
boundaries through the real UI and checks the seeded household names, so an empty Family projection
cannot silently pass. The stack script is worktree-agnostic but refuses the primary checkout, any
non-WED task worktree, non-loopback PostgreSQL, or a database not ending in `/omnyid_test`.

## Vendor journey audit

| Journey step | Current result |
|---|---|
| Login and authenticated portal | Existing implementation retained; no parallel auth added. |
| Fuzzy listing claim and proof | Existing API regression passed (2) and claim rules passed (4). |
| Missing listing | Candidate adds a hidden proposal, existing proof, and operator review; flag remains false pending disposable-Postgres HTTP evidence. |
| Licensed photos | Existing variant/licence tests passed (3); existing SeaweedFS route reused. |
| Couple messages | Existing scoped inbox and encrypted vendor response path retained. |
| Itemised quote | Candidate adds deterministic lines, tax, expiry, conditions, private notes and exact couple preview through the existing protected response flow. |
| Booking | Unsafe one-sided `Book` mutation removed. Exact vendor-confirmed two-sided closure is still open, so the UI stops at `Review booking terms`. |

The candidate does not claim the vendor journey is complete while booking closure or live relay proof
is outstanding.

## Local verification

- Wedding UI suite: 2,147 passed.
- Focused vendor UI/state tests: 14 passed.
- TypeScript: passed.
- Production UI build: passed.
- Line budget: passed.
- Quotation library: 33 passed.
- Vendor portal contract: 7 passed.
- Vendor response contract: 9 passed.
- Ownership API: 2 passed.
- Listing validation: 2 passed.
- Migration catalogue: passed.

The later clean release verification also passed the real disposable-account browser harness against
a tmpfs PostgreSQL stack. It exercised real registration/login, isolated Mia/Jordan and Priya/Sam
browser sessions, Family households, helper/delegate grants, revocation and cross-couple identifier
denial. The disposable PostgreSQL missing-listing proposal test passed once Docker was available.

## Remaining product boundaries

- Only the Wedding welcome email has a production trigger. The other seven lifecycle templates stay
  deterministic policy-bound outputs until their AFP eligibility producers and pre-send cancellation
  checks are connected.
- Missing-listing publication remains operator-reviewed and false-default.
- Vendor-confirmed two-sided booking closure and its connected budget/task/decision reconciliation
  remain open; the current safe UI stops at `Review booking terms`.
- Actual controlled-mailbox receipt/BCC/thread-reply observation is still recommended even though the
  provider acceptance and gateway persistence proof passed.

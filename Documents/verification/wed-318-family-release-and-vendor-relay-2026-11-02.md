# WED-318 Family Release and Vendor Relay Verification

Date: 2026-11-02 (Australia/Sydney)

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

## Operator email relay candidate

The relay is implemented but remains false-default and is not deployed or routed. It accepts only a
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

Still required before enablement: provision the dedicated sending token/key, configure the exact
aliases and sole operator sender, run the controlled initial/BCC/reply/replay proof, and compare the
post-change Cloudflare inventory to the protected baseline. Gmail must send commands from the real
allowlisted Gmail identity; Gmail “Send as hello@omnyid.com” is deliberately not used.

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

The listing-proposal disposable-Postgres test compiled. It was not executed because the local Docker
engine was unavailable and both expected disposable endpoints were closed. No Oracle database was
used as a substitute.

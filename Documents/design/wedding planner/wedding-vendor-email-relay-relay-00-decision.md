# RELAY-00: Wedding Vendor Email Relay Decisions

Date: 2026-10-13

## Accepted transport and address decisions

- Inbound mail remains on Cloudflare Email Routing. The existing catch-all will
  eventually invoke a dedicated, versioned Email Worker; it must not forward
  wedding mail to Gmail or any human mailbox.
- The canonical product-facing mask is
  `<name-one>-<name-two>-<year>@mail.omnyid.com`. This supersedes the earlier
  apex-address example in the proposed specification, at the owner's explicit
  direction, and preserves the apex for existing OmnyID addresses.
- Cloudflare Email Sending is the primary outbound provider. Resend is a
  fallback provider only. Neither provider is a silent substitute for a
  user's Gmail OAuth credentials, Gmail SMTP credentials, or another personal
  mailbox.
- Relay configuration is isolated under `OMNYID_VENDOR_MAIL_*`. Secrets use
  file-backed `*_FILE` references and are synchronized by the existing Oracle
  secret-sync workflow. Secrets, raw provider payloads, and correspondence
  plaintext are never committed.
- Live relay sending is disabled by default and remains disabled until the
  security, webhook-verification, and provider-readiness gates in RELAY-14
  have passed.

## Vendor response identity (WED-253)

The vendor's response identity is separate from the couple relay identity:

- A verified claimed vendor may select a Gmail address already connected to
  that OmnyID account, or reserve
  `<vendor_name>_<locality>@omnyid.com`. For example, Bejewelled Jewellery in
  Mosman becomes `bejewelled_jewellery_mosman@omnyid.com`.
- The application never accepts an arbitrary From address. A connected-email
  choice is valid only while its OAuth mailbox remains connected. The OmnyID
  mask uses lowercase ASCII letters, digits and underscores, contains no
  internal account/listing identifier, and is stable once reserved.
- Address collisions append an approved neutral word (`harbour`, `garden`,
  `meadow`, `orchard`, `coast`, `fern`, `cedar`, or `willow`) rather than a
  user/account identifier or random public number.
- `hello`, `wedding`, `info`, `support`, `admin`, `noreply`, `privacy`,
  `security`, `abuse`, `postmaster`, `webmaster`, `billing`, and operational
  variants are reserved. Existing explicit apex routing rules retain priority.
- Selecting an identity creates a private AFP audit receipt and binds that
  identity to the signed, ciphertext-only response transport. It does not send
  a separate email, accept a booking, or grant payment authority.
- External delivery for the apex mask remains separately gated by
  `OMNYID_VENDOR_SENDER_MASK_ENABLED` as well as vendor-provider readiness.
  The current disabled/drop apex catch-all must not be enabled until the
  dedicated Worker, lookup, replay, security/privacy and rollback gates pass.

This does not change the accepted couple-facing mask at `@mail.omnyid.com`.
The earlier proposed couple address built from first names and wedding year is
therefore not reused for vendor identity and cannot collide with vendor masks.

## Temporary legacy Gmail transport

On 2026-10-14 the owner directed that the existing Gmail wiring remain the
live transport while the Cloudflare Email Routing API is unavailable. This is
a temporary continuity decision, not a change to the accepted relay design:

- Existing general and wedding follow-up mail continues through the already
  deployed Gmail configuration. No new relay path is enabled and no Gmail
  credential is copied into `OMNYID_VENDOR_MAIL_*` configuration.
- Cloudflare routing, DNS, MX/SPF, catch-all, Worker, and Resend settings are
  unchanged. In particular, this decision does not authorize a Gmail
  forwarder for the future mask domain.
- The relay configuration and AFP contracts may be developed disabled, but
  must fail closed until the Cloudflare inventory, gateway-capsule boundary,
  authenticated ingress, and independent security review are complete.
- The future relay still uses `@mail.omnyid.com`, Cloudflare Email Sending as
  primary outbound transport, and Resend only as its provider fallback. A
  later cutover requires an explicit release decision and machine evidence.

## Cloudflare control-plane safety gate

Before changing any Email Routing rule or DNS record, save all of the
following for zone `1e9906283b35a7537f3f4345a2c4083e`:

1. `GET /zones/{zone_id}/email/routing/rules`;
2. `GET /zones/{zone_id}/email/routing/rules/catch_all` (the exact JSON is
   the rollback input for a `PUT`);
3. `GET /zones/{zone_id}/email/routing`;
4. `GET /accounts/{account_id}/email/routing/addresses`;
5. the DNS export.

The capture script is `scripts/capture-cloudflare-email-routing-inventory.ps1`.
It writes a dedicated rollback payload and never prints the API token.

On 2026-10-14 the updated user-owned token successfully read the account,
zone, routing rules, catch-all, and destination addresses. The saved
catch-all rollback payload records a disabled `drop` rule, so no existing
forwarding behavior was altered. The same token still returns `403/10000` for
the Email Routing status endpoint and DNS export. The inventory is therefore
intentionally marked incomplete and no routing or DNS mutation is authorized
until those two reads succeed.

The token is entitled to use Cloudflare Email Sending: a deliberately empty,
non-sending REST request reached `400/10001`
(`email.sending.error.invalid_request_schema`), rather than `403/10105`.
That proves entitlement and send permission but does not send mail or prove a
sender domain. A user-owned token is acceptable for Cloudflare SMTP/REST when
it has Email Sending Edit permission and can act on the sender's account.

On 2026-10-24 the revoked credential was replaced with an account-owned API
token scoped to the relevant account and zone. Account-token verification
reported active. It can read the `omnyid.com` zone, routing rules and exact
catch-all; it cannot read destination-address inventory or DNS records. The
`privacy@omnyid.com` rule targets `concensure+omnyid@gmail.com`, and the
catch-all remains disabled with `drop`. This is valid least-privilege
inventory evidence, not authorization to enable the relay or modify DNS.

## Provider-event endpoints (after authenticated gateway implementation)

- Cloudflare Worker inbound: `https://api.omnyid.com/integrations/vendor-email/cloudflare/inbound`
- Resend event webhook: `https://api.omnyid.com/integrations/vendor-email/resend/events`

Resend should subscribe only to sent, delivered, delayed, bounced, complained,
and failed delivery events. Open/click tracking events are intentionally out
of scope for the wedding relay privacy model.

## Ownership and remaining release gates

The account owner must name the DNS owner, Cloudflare/provider-account owner,
privacy reviewer, independent security reviewer, and production approver
before live traffic is enabled. The gateway key/KMS boundary, quarantine
lifetime, collision-word vocabulary, native-AFP default, and post-wedding
archive policy also require recorded approval.

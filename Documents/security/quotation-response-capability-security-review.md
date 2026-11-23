# Quotation response capability security review

Status: implementation checklist complete; independent reviewer sign-off pending.

Scope: WED-219 / DBV-04 only. This review covers link authority, transaction sessions,
vendor-context projection, persistence, rate limiting, audit data, and HTTP failure behaviour.
It does not approve WED-220 response payloads, the WED-222 portal, delivery providers, or rollout.

## Release blockers

- Keep `OMNYID_QUOTATION_VENDOR_RESPONSE_CAPABILITIES_ENABLED` disabled.
- Require the quotation release gate and evidence SHA before the flag can resolve true.
- Require a base64url-decoded, minimum 256-bit
  `OMNYID_QUOTATION_RESPONSE_CAPABILITY_PEPPER`.
- Require `OMNYID_SIGNING_KEY_HEX`; unsigned or arbitrarily signed approval receipts fail closed.
- Run the Postgres HTTP matrix with `TEST_DATABASE_URL` against disposable `omnyid_test`.
- Obtain reviewer sign-off below before staged rollout.

## Authority and isolation

- [x] Capability binds owner, grant message, grant ID, vendor, response recipient, quotation,
  exact active version, thread, projection fingerprint, actions, question IDs, not-before,
  expiry, and generation.
- [x] Grant issuance requires a visible, approved human-decision receipt signed by the
  configured OmnyID server key.
- [x] Grant message parent must be that exact approval receipt.
- [x] Quotation version must be active and its vendor must equal the grant vendor.
- [x] Exchange and consume re-evaluate grant revocation, quotation supersession, disputed
  wedding claim state when a listing exists, and terminal closure state.
- [x] Authenticated owner lookup includes `owner_user_id`; another tenant receives the same
  not-found response.
- [x] Public wrong-vendor, wrong-thread, stale, revoked, expired, consumed, and malformed
  cases use one generic response and do not expose existence.

## Secrets and sessions

- [x] Link, session, CSRF, and submission nonce secrets use 256 bits of random entropy.
- [x] Only HMAC-SHA-256 values produced with the deployment pepper are persisted.
- [x] Raw link token is returned once and is absent from capability/session/audit rows.
- [x] Response capability tables are separate from authentication magic links.
- [x] Transaction cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, and path scoped.
- [x] Transaction session has `account_access = false` in both the Rust contract and a
  database check constraint.
- [x] CSRF and submission nonce are both required; atomic compare-and-update permits one
  consume only.
- [x] An exchanged capability cannot rotate around its still-live session.

## Projection and data minimisation

- [x] Projection is stored in the private AFP grant envelope and revalidated on access.
- [x] Canonical fingerprint covers recipient, quotation/version/thread, purpose, actions,
  questions, fields, fact IDs, and provenance.
- [x] Projection fact IDs must be a subset of the approved grant list.
- [x] Authoritative field classes and prohibited-key defence block competitor, score,
  private-note, hidden-preference, and full-plan fields.
- [x] Field values, keys, lists, grant duration, and complete projection bytes are bounded.
- [x] Exchange returns the revalidated canonical projection; it does not reconstruct extra
  wedding-plan context.

## Persistence, replay, and rate limiting

- [x] Issue plus audit, exchange plus session/audit, consume plus session/audit, revoke,
  and rotate are database transactions.
- [x] Status and generation predicates prevent concurrent double exchange/consume/rotate.
- [x] Expiry is an explicit terminal status and content-free audit kind added by migration
  0113 without editing already-applied migration semantics.
- [x] Token-prefix, Cloudflare connecting-IP, stored vendor, and stored thread counters use
  keyed hashes; raw values are not retained in the rate table.
- [x] Vendor/thread rate keys come from the stored capability, not request-controlled fields.
- [x] Audit rows contain event ID, capability ID, owner ID, kind, and time only.

## Logging and operational review

- [x] Capability route and persistence modules contain no tracing, print, or debug calls.
- [x] Shared request middleware logs only request ID, not URI, headers, cookies, or body.
- [x] Static regression test guards these logging boundaries.
- [x] New implementation and test files remain below 999 physical lines.
- [ ] Independent reviewer:
- [ ] Review date:
- [ ] Review commit:
- [ ] Findings resolved or explicitly accepted:

## Evidence commands

```powershell
cargo test --test quotation_response_capability
cargo test --test quotation_vendor_context
cargo test --test quotation_response_capability_api
scripts/verify-quotation-readiness.ps1
git diff --check
```

The conditional API test must not be counted as Postgres evidence when
`TEST_DATABASE_URL` is unset; in that case it only proves compilation and the always-run
logging-boundary assertion.

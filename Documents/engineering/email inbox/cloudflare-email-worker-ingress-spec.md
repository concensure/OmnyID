# OmnyID Email Worker and Authenticated Ingress Specification

Status: implementation candidate, dark by default
Task: WED-255
Baseline: `0dc247fab163f0abc0a151a6a1352ec29841bebb` on `agent/codex/WED-215`
Date: 2026-10-25

## 1. Outcome

Build a dedicated Cloudflare Email Worker and homeserver ingress that can receive
ordinary Internet email for an active OmnyID-owned mask without forwarding the
message to a human mailbox. The first release slice authenticates, bounds,
deduplicates, resolves and durably encrypts the raw RFC 822 message before it
acknowledges receipt.

The Worker and ingress are reusable platform email infrastructure. Wedding is
the first adapter and source of the current identity rules; it does not own a
parallel inbox, email parser, AFP ledger or transport.

This specification does not authorize a Cloudflare routing change, provider
send, external message, feature-flag change or production deployment.

## 2. Existing contracts that remain authoritative

- AFP is the canonical durable conversation and audit ledger.
- `src/gateway/smtp_in.rs` remains the RFC 822 parser and email-to-AFP adapter.
- The existing file, ClamAV, OCR and document preparation paths remain the only
  attachment and extraction paths. The Worker must not implement OCR.
- Migration 0108 owns couple relay masks at `mail.omnyid.com`, encrypted relay
  threads and provider-event deduplication.
- Migration 0116 owns verified vendor sender identities at the `omnyid.com`
  apex using `<vendor_name>_<locality>@omnyid.com`.
- Existing explicit apex routes such as `hello@`, `privacy@`, `support@`,
  `admin@`, `info@`, `wedding@` and `noreply@` retain priority.
- The apex catch-all remains disabled and drops unmatched mail until the release
  packet, independent security review and WED-225 gates approve a change.
- `OMNYID_VENDOR_MAIL_ENABLED`, `OMNYID_VENDOR_SENDER_MASK_ENABLED`, all
  quotation/planning rollout flags and ranking policy V2 remain false.

## 3. Scope

### 3.1 First implementation slice

1. A buildable, dependency-light Cloudflare Email Worker with an `email()`
   handler.
2. A versioned binary HTTPS contract from the Worker to the homeserver.
3. Timestamp, HMAC-SHA256, body digest and deterministic event-ID validation.
4. A strict raw-message size limit and bounded metadata.
5. Exact lookup of an active, selected and verified vendor apex mask.
6. A replay-safe database receipt and encrypted quarantine envelope written in
   one transaction before HTTP 202.
7. Content-free operational logs and status codes.
8. Dark configuration: no `addresses` in Wrangler and ingress disabled by
   default in every application environment.

### 3.2 Later slices

- scan quarantined MIME and attachments through the existing ClamAV boundary;
- parse through `smtp_in`, bind the correct tenant/thread and append encrypted
  AFP;
- project the result into the existing vendor/couple inbox and response queue;
- add couple-mask lookup at `mail.omnyid.com` once thread-address digests and
  sender matching are implemented;
- delivery, bounce and complaint callbacks;
- retention/deletion worker, dead-letter review and incident tooling;
- authorized hosted shadow, provider smoke and staged cohort evidence.

### 3.3 Explicitly out of scope

- a general-purpose mailbox;
- auto-replies, auto-forwarding or automatic vendor/couple decisions;
- interpreting email as booking, contract, payment or acceptance authority;
- allowing arbitrary From addresses or treating a friendly mask as identity;
- a second MIME parser, OCR engine, attachment store, task ledger or UI inbox;
- changing Cloudflare DNS, MX, routing rules or catch-all state in source deploy.

## 4. Topology

```text
Internet sender
  -> Cloudflare Email Routing
  -> explicit alias, if matched (unchanged)
  -> disabled future catch-all -> dedicated Email Worker
  -> authenticated binary HTTPS ingress
  -> exact active-mask resolution
  -> encrypted quarantine + content-free receipt
  -> existing ClamAV / SMTP parser / AFP adapter (later slice)
  -> existing response or vendor inbox projection
```

The Worker has no database access and no account API token at runtime. It holds
only the HTTPS endpoint, a key identifier and the ingress HMAC secret. The
homeserver never trusts the recipient supplied by the message body: it validates
the signed SMTP envelope recipient and resolves that address server-side.

## 5. Namespaces and routing

| Address type | Domain | Owner | First-slice receive support |
| --- | --- | --- | --- |
| Operational alias | `omnyid.com` | Cloudflare explicit rule | unchanged; bypasses Worker catch-all |
| Verified vendor mask | `omnyid.com` | migration 0116 | yes, only active and selected `omnyid_mask` |
| Couple relay mask | `mail.omnyid.com` | migration 0108 | later processing slice |

Unknown, archived, transferred, unselected or unverified masks fail closed. A
catch-all match is never evidence that a mask exists.

## 6. Worker-to-gateway contract

### 6.1 Endpoint and body

`POST /integrations/vendor-email/cloudflare/inbound`

- `Content-Type: message/rfc822`
- body: exact raw bytes from `EmailMessage.raw`
- initial maximum: 10 MiB
- no JSON/base64 wrapping of the raw body

The smaller-than-provider limit bounds gateway memory and database quarantine.
The value can only be raised through a reviewed capacity and abuse decision.

### 6.2 Required headers

| Header | Rule |
| --- | --- |
| `X-OmnyID-Email-Version` | exactly `1` |
| `X-OmnyID-Email-Key-Id` | reviewed key ID, ASCII and at most 32 characters |
| `X-OmnyID-Email-Timestamp` | Unix seconds, within 300 seconds |
| `X-OmnyID-Email-Nonce` | 32 lowercase hexadecimal characters |
| `X-OmnyID-Email-Event-Id` | 64 lowercase hexadecimal characters |
| `X-OmnyID-Email-From` | base64url without padding, at most 320 decoded bytes |
| `X-OmnyID-Email-To` | base64url without padding, at most 320 decoded bytes |
| `X-OmnyID-Email-Body-SHA256` | 64 lowercase hexadecimal characters |
| `X-OmnyID-Email-Raw-Size` | canonical decimal byte count |
| `X-OmnyID-Email-Signature` | lowercase hexadecimal HMAC-SHA256 |

The deterministic event ID is SHA-256 over a domain-separated sequence of the
lowercased envelope recipient, lowercased envelope sender, normalized
`Message-ID` when present and raw-body digest. Retrying the same delivery keeps
the event ID while using a new nonce and timestamp.

### 6.3 Canonical signature input

UTF-8, LF only, no final LF:

```text
omnyid-email-worker-v1
<key-id>
<timestamp>
<nonce>
<event-id>
<from-base64url>
<to-base64url>
<body-sha256>
<raw-size>
```

`signature = hex(HMAC-SHA256(shared_secret, canonical_input))`

The gateway recomputes the byte length and SHA-256 before constant-time
signature comparison. Header parsing is strict; duplicate critical headers are
rejected by the HTTP stack or normalized contract test.

## 7. Gateway acceptance state machine

1. Unless ingress, vendor mail and vendor sender-mask flags are all enabled,
   return `404` without revealing configuration.
2. Enforce transport and in-process rate limits before database work.
   A second content-free recipient bucket applies after signature and exact
   mask resolution; its key is a SHA-256 digest, never the address.
3. Read no more than the configured 10 MiB limit.
4. Require `Content-Type: message/rfc822`, then validate header shapes,
   timestamp and configured key ID.
5. Recompute body digest and constant-time HMAC.
6. Decode and normalize envelope addresses.
7. Resolve exactly one current verified vendor identity where:
   - domain is `omnyid.com`;
   - status is `active`;
   - selected kind is `omnyid_mask`;
   - its listing is active, verified and still owned by the same account.
8. Begin a database transaction.
9. Claim `(provider, event_id)`. A prior matching digest is an idempotent
   success; a conflicting digest is rejected and alerted.
   An authenticated matching event may return before ClamAV so provider
   retries cannot consume scanner capacity; the transactional claim remains
   authoritative for races.
10. Encrypt the raw bytes immediately with the dedicated file-backed ingress
    key and metadata-only associated data.
11. Store the encrypted envelope, mask identity, digest, size, receive time and
    quarantine expiry. Never store raw headers/body in receipt columns.
12. Commit the scanner-clean ciphertext as `quarantined` (awaiting MIME/AFP
    processing), then return `202` with only event ID and status.

No 2xx is returned before durable encrypted storage. The first slice marks the
record `awaiting_scan`; it does not create an AFP message. This prevents an
unscanned or unparsed email from entering the canonical ledger.

## 8. Persistence

The quarantine table stores:

- internal quarantine ID;
- provider and deterministic event ID;
- recipient identity ID, vendor ID and owner user ID;
- raw digest and size;
- recipient-X25519/XChaCha20-Poly1305 envelope JSON only;
- `awaiting_scan`, `processing`, `accepted`, `quarantined`, `rejected`,
  `failed` or `expired` status;
- content-free error code;
- received, expiry, processed and deleted timestamps.

Associated data binds provider, event ID, recipient identity, owner, verified
AgentCard identity/key version and raw digest. The server stores only the
recipient public key; the private key remains non-extractable on the vendor's
device. Ciphertext cannot be transplanted to another receipt or opened with a
different vendor key. The initial quarantine retention is 24 hours; final
retention awaits privacy approval.

## 9. Processing into AFP

The gateway/client processing split must:

1. run ClamAV synchronously on the exact raw bytes before persistence and fail
   closed when the scanner is absent or unavailable;
2. retain only ciphertext addressed to the current verified recipient key;
3. decrypt only on an authorised recipient device;
4. use existing MIME limits and reject active content, bombs and unsafe
   attachments using existing policy;
5. parse with `smtp_in` before encryption or in the authorised client;
6. resolve a thread from signed routing and exact reply headers, never prose;
7. create a tenant-private encrypted AFP message with source/digest lineage;
8. store safe attachments through the existing owner-scoped file path;
9. mark the quarantine record accepted only after AFP commit;
10. erase ciphertext at expiry or after the approved processing grace period.

Model/OCR output is untrusted proposal data. It cannot create confirmed facts,
send a response or change booking/payment state without existing review gates.

## 10. Error and privacy behavior

- `202`: durably encrypted new delivery or exact idempotent replay.
- `400`: malformed contract or digest/size mismatch.
- `401`: signature/key/timestamp failure.
- `404`: disabled ingress or unavailable recipient; externally indistinguishable.
- `409`: event ID exists with a different digest.
- `413`: body exceeds the ingress limit.
- `429`: bounded rate limit.
- `503`: encryption key or database unavailable; Worker treats as transient.

Logs may include request ID, key ID, event ID prefix, status/error code, byte
count and latency. They may not include email addresses, subject, Message-ID,
raw headers/body, attachment names, ciphertext, signature or secret material.

## 11. Worker failure behavior

- Reject locally when `rawSize` exceeds the configured maximum.
- A gateway `202` completes processing.
- A gateway `400`, `401`, `404`, `409` or `413` sets one generic SMTP reject.
- A gateway `429` or `5xx` throws so Cloudflare can treat it as a transient
  handler failure; it must not forward to an administrator or personal inbox.
- Fetch uses a short timeout and a fixed HTTPS origin.
- Worker logs contain event/error codes only, never envelope addresses or mail.

## 12. Configuration and key rotation

Application settings:

- `OMNYID_VENDOR_MAIL_INGRESS_ENABLED=false`
- `OMNYID_VENDOR_MAIL_INGRESS_MAX_BYTES=10485760`
- `OMNYID_VENDOR_MAIL_WORKER_KEY_ID=primary-v1`
- `OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET_FILE=...`
- `CLAMD_HOST=clamav:3310`
- `OMNYID_VENDOR_SENDER_MASK_ENABLED=false`

Worker settings:

- `GATEWAY_URL` as a non-secret fixed URL;
- `KEY_ID` as non-secret version metadata;
- `MAX_RAW_BYTES=10485760`;
- `INGRESS_SHARED_SECRET` as a Wrangler secret.

Worker HMAC rotation supports an active key plus one time-bounded previous key
at the gateway. Recipient encryption follows the verified AgentCard key ID;
old ciphertext stays bound to its recorded recipient key and requires the
recipient's encrypted recovery material during rotation.

The Worker Wrangler file deliberately omits `addresses`. Deploying Worker code
therefore cannot create, replace or enable any routing rule. Catch-all mutation
is a separate reviewed operation with captured rollback JSON.

## 13. Abuse and security controls

- Cloudflare routing and platform DDoS controls at the edge;
- Worker size check before reading raw bytes;
- HTTPS only and fixed gateway host;
- HMAC timestamp, nonce, body digest and deterministic event ID;
- constant-time verification;
- gateway global/key and recipient quotas;
- exact verified-mask lookup and ownership revalidation;
- database unique event claim;
- encrypted quarantine before acknowledgement;
- no remote image fetch or link execution;
- existing ClamAV and file-type controls before AFP;
- bounce/complaint suppression before automated retry in later slices;
- content-free metrics and incident-safe key rotation.

## 14. Release gates

Live routing remains blocked until all of these are evidenced against one frozen
commit:

1. exact Worker and gateway tests;
2. disposable PostgreSQL migration/rollback evidence;
3. real disposable ClamAV clean/infected/unavailable evidence;
4. replay, stale, altered, oversized, unknown-mask and cross-tenant tests;
5. independent security and privacy review;
6. hosted accessibility and couple/vendor usability gates where UI is affected;
7. authorized provider smoke using disposable addresses;
8. hosted shadow with routing flags off;
9. permission wording approval;
10. allowlisted seven-day cohort and named release sign-off.

Policy V2 is independent and stays disabled even if email gates pass.

## 15. Acceptance criteria

- Exact retries cannot create duplicate quarantine or AFP records.
- A changed body cannot reuse an event ID or signature.
- No unverified, archived, transferred, unknown or connected-email identity can
  receive through the vendor apex Worker path.
- No plaintext correspondence reaches PostgreSQL, logs or AFP before scan.
- No code deployment mutates Email Routing.
- Operational aliases and couple relay namespace remain unchanged.
- New files remain below 1000 lines and oversized owner files do not grow.

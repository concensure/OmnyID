# Vendor-Side Completion and Operator Email Relay Specification

Status: implementation candidate

Task: WED-318

Build base: `c4d7cf410b88493a1b28548e1eb8d2455be332c9`

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-318`

## 1. Purpose

Complete the smallest coherent vendor journey without creating a second wedding planner, CRM,
quotation store or booking ledger. The same AFP ledger, quotation engine, claim authority, file
pipeline and A2UI projections used by couples remain authoritative.

This specification also defines a private operator convenience relay. An authorised operator can
email an OmnyID operational alias from an allowlisted mailbox, put `To: recipient@example.com` on
the first non-empty body line, and have OmnyID send the remaining message through Cloudflare Email
Sending as that alias. The relay is not a public SMTP service and must fail closed.

## 2. Repository audit

### 2.1 Present and reusable

- `/workspace/vendor.html` and the existing shared auth entry support vendor sign-in.
- Fuzzy active-listing suggestions and the Business name field avoid exact-slug entry.
- Claim intake is non-exclusive and does not grant ownership.
- Work-domain and website/DNS challenge foundations separate authentication from ownership proof.
- Verified vendors can edit public contact/profile fields and see a couple-facing preview.
- Licensed JPEG, PNG and WebP uploads are re-encoded and published through the existing file path.
- The private transaction panel lists only requests for the current verified claim and AgentCard.
- Couple-shared context is field allowlisted and transaction scoped.
- Vendors can attach PDF, DOCX, TXT, JPEG, PNG and WebP files to a response.
- Sender identity selection, quotation normalisation, clarification, closure and couple-side quote
  acceptance foundations exist.
- Couple-side `Book` currently records a Wedding AFP lifecycle decision and explicitly does not send,
  contract, pay or prove vendor acceptance.

### 2.2 Gaps

1. A legitimate vendor whose business is absent cannot propose a new listing from the portal.
2. The vendor response form answers scoped questions but is not a complete mobile itemised quote
   builder with vendor-private calculation and couple-facing normalised preview.
3. Couple `Book` is one-sided. There is no vendor booking request inbox, exact terms/date/budget
   acknowledgement, vendor acceptance or evidence-backed confirmation fan-out.
4. The portal lacks a clear unified next-action order across claim, profile, enquiries, quotes and
   bookings.
5. The operator cannot conveniently send authenticated operational mail from Gmail without Google
   Workspace. Existing vendor mail ingress is transaction-specific and must not be repurposed into
   an open relay.

## 3. Invariants

- AFP remains the source of truth; tables are replay-safe operational projections.
- UI state cannot grant ownership, report delivery, accept a booking or prove payment.
- Source verification and suitability remain separate.
- Couple context is disclosed only from the exact active permission snapshot.
- A quote accepted by a couple is not a booking until the vendor accepts exact terms with evidence.
- Connected projections update together. A vendor-confirmed booking updates booking state, budget
  commitment, linked task and decision history through one idempotent transition.
- Existing OCR and malware scanning are reused.
- Operational aliases never become vendor/couple masks.
- No new file exceeds 999 physical lines and oversized files gain no new responsibility.

## 4. Operator email relay

### 4.1 Supported aliases

The operator config explicitly allowlists reserved local parts such as `hello`, `info`, `wedding`
and `privacy`. No request may select another sender. The configured alias must equal the address that
received the command.

The same exact list is configured as Worker `OPERATOR_ALIASES` and server
`OMNYID_OPERATOR_EMAIL_RELAY_ALIASES`; a mismatch fails closed at one of the two boundaries.

Production configuration is intentionally explicit:

| Boundary | Setting |
|---|---|
| Worker aliases | `OPERATOR_ALIASES=hello@omnyid.com,info@omnyid.com,wedding@omnyid.com,privacy@omnyid.com` |
| Server aliases | `OMNYID_OPERATOR_EMAIL_RELAY_ALIASES` with the exact same value |
| Real operator sender | `OMNYID_OPERATOR_EMAIL_RELAY_SENDERS` with the exact Gmail mailbox, not an alias |
| Routing key | `OMNYID_OPERATOR_EMAIL_RELAY_ENCRYPTION_KEY_HEX_FILE` pointing to a mode-restricted 32-byte hex key |
| Sending credential | `OMNYID_OPERATOR_EMAIL_RELAY_CLOUDFLARE_API_TOKEN_FILE` pointing to a dedicated token |
| Provider account | `OMNYID_OPERATOR_EMAIL_RELAY_CLOUDFLARE_ACCOUNT_ID` |
| Kill switch | `OMNYID_OPERATOR_EMAIL_RELAY_ENABLED=false` until the controlled proof passes |

### 4.2 Authentication chain

The relay accepts a command only when every check passes:

1. Cloudflare Email Routing invoked the reviewed Worker.
2. The first `Authentication-Results` header is from `mx.cloudflare.net` and contains
   `dmarc=pass`; sender-supplied later headers are ignored.
3. The Worker-to-Oracle request has the existing timestamp, nonce, exact-body digest and HMAC.
4. The HMAC-bound envelope sender is an exact member of the operator sender allowlist.
5. The parsed RFC 5322 From mailbox equals the envelope sender.
6. The envelope recipient is an exact configured OmnyID operational alias.
7. The feature flag, provider credentials and encryption key are present.

Cloudflare documents that Email Routing prepends this trusted authentication result before invoking
the Worker. The server rechecks it from the HMAC-bound raw message rather than trusting arbitrary
`Authentication-Results` headers.

### 4.3 Command format

- The operator writes from the real allowlisted mailbox identity, for example
  `concensure@gmail.com`, to the desired OmnyID alias. Gmail's unauthenticated
  “Send mail as hello@omnyid.com” path is not used and must not be enabled as a
  workaround for DMARC.
- New thread: first non-empty plain-text line is exactly `To: address@example.com`.
- Everything after that line is the outgoing body. The command line is never delivered.
- Subject carries over, with bounded length and control characters rejected.
- HTML-only commands, attachments, multiple To commands, CC/BCC commands, group syntax and more
  than one external recipient are rejected in v1.
- Reply command: an authorised message replying to a known relay Message-ID may omit the To line;
  the recipient is recovered from the encrypted thread record.

### 4.4 Destination and abuse controls

- Exactly one external recipient per send.
- Reject operational aliases, the operator mailbox and OmnyID-owned domains as destinations to
  prevent loops.
- Reject malformed, local-only, overlong or control-character addresses.
- Rate-limit by sender digest, alias and recipient digest.
- One inbound provider event creates at most one outbound provider request.
- Provider acceptance is recorded separately from delivered, queued, bounced or suppressed.
- No automatic retry after a receipt-bearing request.
- No raw body, recipient, sender or token in logs or metric labels.
- A kill switch disables command processing independently from vendor mail.

### 4.5 Sending and threading

Cloudflare Email Sending sends:

- `from`: the exact operational alias;
- `to`: the resolved single recipient;
- `bcc`: the authorised operator mailbox;
- `reply_to`: the same operational alias;
- `subject` and stripped body from the command; and
- safe `In-Reply-To`/`References` headers for a known relay thread.

The BCC copy therefore appears in the operator mailbox. Replying to it returns to the operational
alias, where a DMARC-authenticated operator reply is correlated by provider Message-ID and sent to
the original recipient as the alias. An external reply is accepted only from that thread's exact
recipient; it is relayed to the operator mailbox with the same bounded thread references. Arbitrary
addresses cannot use a thread identifier to change its parties.

The provider request is not considered proof of delivery by itself. The relay records provider
acceptance, delivery, bounce and suppression separately, and the controlled enablement proof must
include an actual BCC receipt plus one reply in each direction.

### 4.6 Persistence

Add content-free operational projections:

- thread identity, alias, sender/recipient digests, encrypted recipient envelope, status and dates;
- provider Message-ID correlation; and
- inbound event, direction, provider receipt state and idempotency key.

Do not store message bodies in relational columns. The recipient envelope uses a dedicated
file-backed 32-byte relay key. Event retention is bounded; active thread routing remains until
closed or revoked.

## 5. Missing-listing proposal

When fuzzy search returns no correct listing, a signed-in vendor may propose a private pending
listing with business name, category, service area, website and business email. It is not public,
claimable by others, ranked or verified until reviewed proof succeeds. Duplicate detection runs
against canonical name/domain/location. The claimant receives a stable receipt and can continue
ownership proof against the pending identity.

## 6. Vendor quote construction

Extend the existing transaction response rather than making a parallel quote tool:

- typed line items, quantities, tax, optional items, exclusions and conditions;
- wedding date, guest basis, expiry and availability status;
- private vendor calculation notes excluded from the couple payload;
- source attachments through the existing upload/OCR/parser path;
- deterministic total validation and explicit unknowns;
- vendor preview of the exact couple-facing normalised quote; and
- an explicit approve-and-send action bound to sender, recipient, permission revision and quote
  fingerprint.

Generation is optional and explicit. Editing never calls a model. The existing prompt/cost ladder
and AFP draft revision contract applies.

## 7. Two-sided booking closure

Couple action becomes `Request booking` after a decision-ready quote. It creates a booking proposal
containing exact vendor, quote version, date/time basis, amount/currency, inclusions, conditions,
expiry and evidence references. It neither books nor pays.

The verified vendor sees the proposal in the same transaction inbox and may:

- accept the exact proposal;
- propose changed terms, producing a successor quote/proposal;
- decline with a bounded reason; or
- request clarification.

Vendor acceptance requires an authorised representative attestation and evidence reference. The
server revalidates claim, quote, proposal revision and availability basis atomically. One confirmed
event projects booking, budget commitment, task completion and decision history, with a visible
reconciliation summary for both parties.

## 8. Mobile and A2UI

The vendor portal orders content by next action: ownership, urgent enquiry, quote, booking, profile.
Read-only context, quote preview, booking summary and receipts use existing A2UI primitives. Typed
quote/profile/file inputs remain focused Solid controls until A2UI has an approved input schema.
Controls have 44 px targets, no horizontal overflow, clear consequence labels and focus restoration.

## 9. Rollout

All relay, listing-proposal and booking-request switches default false. Release order:

1. deterministic unit and security tests;
2. disposable Postgres integration;
3. Worker fixtures with trusted and forged Authentication-Results;
4. provider sandbox/allowlisted recipient;
5. one operational alias and one operator mailbox;
6. restore flags and compare inventory;
7. enable additional aliases individually; and
8. vendor cohort only after mobile and claim-authority review.

## 10. Definition of done

- No unauthenticated, unallowlisted or uncorrelated sender can trigger delivery.
- A recipient cannot be changed by quoted text, a forged header or a substituted thread ID.
- The operator is BCCed and can continue a correlated thread through the alias.
- Existing vendor capabilities are regression tested rather than rebuilt.
- Missing listings remain private until ownership/review authority exists.
- Vendor quotes normalise to the same couple workflow and Documents projection.
- Booking is confirmed only by two-sided, exact-revision, evidence-backed acceptance.
- All releases name one full source SHA and preserve rollback switches.

# OmnyID Email Worker and Authenticated Ingress Tasks

Status: active
Task: WED-255 implementation; WED-286 operational completion
Historical baseline: `0dc247fab163f0abc0a151a6a1352ec29841bebb`
Last hosted evidence source: `9e1be336219f6a8efc78c36f5c2aabb24d571874`
Spec: `cloudflare-email-worker-ingress-spec.md`

## Working rules

- [x] Implement the original slice only in the advanced `agent/codex/WED-215`
  worktree, then continue operations only in isolated `agent/codex/WED-286`.
- [x] Preserve unrelated dirty/untracked files.
- [x] Keep provider, vendor-mail, sender-mask, quotation, planning and policy-V2
  flags false.
- [x] Keep the implementation slice dark. The later owner-authorised WED-286
  rehearsal used one temporary literal route and controlled sends; catch-all
  and DNS remained unchanged and restoration completed.
- [x] Reuse AFP, SMTP parsing, ClamAV, OCR and file storage owners.
- [x] Keep every new file under 1000 lines and avoid growing oversized files.

## Slice 0 — freeze and reconcile

- [x] Confirm HEAD is `0dc247fab163f0abc0a151a6a1352ec29841bebb`.
- [x] Confirm only the pre-existing Oracle proof directory is untracked in the
  advanced worktree.
- [x] Read migration 0108, migration 0116, sender identity, provider readiness,
  SMTP parser, threat model and relay decision.
- [x] Register WED-255 in the canonical task ledger.
- [ ] Record the final changed-file inventory and exact commit.

## Slice 1 — versioned Worker contract

- [x] Add `cloudflare/vendor-email-ingress-worker/`.
- [x] Implement deterministic event ID from envelope recipient/sender,
  Message-ID and raw SHA-256.
- [x] Implement the canonical request string and HMAC-SHA256 signature.
- [x] Base64url-encode envelope addresses; do not copy subject/body into headers.
- [x] Reject over-limit `rawSize` before consuming the stream.
- [x] Send exact RFC 822 bytes to the fixed HTTPS endpoint.
- [x] Treat permanent gateway statuses as one generic reject and transient
  statuses as retryable handler failures.
- [x] Add an abort timeout and content-free error behavior.
- [x] Add unit tests for digest, deterministic ID, canonicalization, signing,
  size bounds, status classification and no content logging.
- [x] Add Wrangler configuration with no `addresses` property.
- [x] Add static test proving code deploy cannot manage routing rules.

Exit evidence:

- [x] `node --test cloudflare/vendor-email-ingress-worker/test/*.test.mjs`
- [x] Worker source/config contract audit passes.

## Slice 2 — authenticated homeserver ingress

- [x] Add a focused route module for
  `/integrations/vendor-email/cloudflare/inbound`.
- [x] Add a dedicated ingress-enable flag, default false.
- [x] Apply a 10 MiB route/body limit and bounded header parsing.
- [x] Require the configured key ID and file-backed shared secret.
- [x] Verify timestamp, raw byte count, body SHA-256 and HMAC in constant time.
- [x] Decode and validate one envelope sender and recipient address.
- [x] Return indistinguishable not-found behavior for disabled and unavailable
  recipients.
- [x] Add content-free rate limiting and metrics hooks.
- [x] Require `message/rfc822` before accepting request bytes.
- [x] Apply a per-recipient digest rate bucket after authenticated routing.
- [x] Short-circuit exact authenticated provider retries before ClamAV while
  retaining the transactional dedupe claim for races.
- [x] Add unit tests for valid, stale, malformed, altered, oversized and wrong-key
  requests.

Exit evidence:

- [x] `cargo test --lib vendor_email_worker_ingress -- --nocapture`
- [x] `cargo check`

## Slice 3 — replay-safe encrypted quarantine

- [x] Add migration 0117 using the next free migration number.
- [x] Register it in the migration catalog.
- [x] Store only XChaCha20-Poly1305 envelope JSON plus allowlisted metadata.
- [x] Bind associated data to provider, event ID, recipient identity, owner,
  verified AgentCard key and digest.
- [x] Encrypt to the verified recipient's X25519 public key; retain no server
  decryption key and fail closed when the recipient key is missing or invalid.
- [x] Resolve only active `omnyid_mask` identities on active verified listings
  still owned by the identity owner.
- [x] Claim provider event and quarantine record atomically.
- [x] Return 202 only after commit.
- [x] Return an idempotent 202 for exact repeats and 409 for digest conflicts.
- [x] Set 24-hour quarantine expiry and add bounded ciphertext destruction.
- [x] Add disposable-PostgreSQL tests for valid, duplicate, conflict, archived,
  transferred, connected-email and cross-tenant cases.

Exit evidence:

- [x] migration catalog check passes;
- [x] clean disposable PostgreSQL applies all migrations;
- [x] focused database integration suite passes.

## Slice 4 — scan and AFP processing

- [x] Run the existing ClamAV boundary before persistence; scanner unavailable
  fails closed.
- [x] Mark scanner-clean ciphertext `quarantined`, not `awaiting_scan`, while
  MIME/AFP processing remains incomplete.
- [x] Parse and validate MIME during the same transient-plaintext ingress
  boundary, before recipient encryption, or finish it on the recipient device.
- [x] Never add a server decryption wrapper merely to support background work.
- [x] Parse with `src/gateway/smtp_in.rs`.
- [ ] Reuse existing file validation/storage for safe attachments.
- [ ] Resolve recipient/thread from signed routing and exact reply headers.
- [x] Append one tenant-private encrypted AFP message with source lineage.
- [x] Mark accepted only after the AFP transaction succeeds.
- [ ] Quarantine infection, active content, ambiguous routing and parse failures
  with bounded content-free reason codes.
- [x] Prove duplicate processing cannot append a second AFP message.

Exit evidence:

- [x] live disposable ClamAV clean/infected/unavailable tests;
- [x] exact-replay and transaction-failure tests;
- [ ] existing wedding response-queue projection tests.

## Slice 5 — couple relay and outbound reply continuity

- [ ] Add exact `mail.omnyid.com` mask lookup without conflating vendor masks.
- [ ] Bind vendor sender digest and reply headers to one active relay thread.
- [ ] Reject sender/thread mismatches and legacy plaintext guessing.
- [ ] Make inbound vendor replies project through the existing response queue.
- [ ] Bind outbound idempotency to AFP approval and provider receipt.
- [x] Add bounce/complaint state and retry suppression.
- [ ] Preserve connected Gmail as the separate existing path until explicit
  cutover; never use it as silent relay fallback.

## Slice 6 — operations and review packet

- [ ] Add aggregate metrics without addresses or content.
- [x] Add quarantine expiry and reviewed deletion/key-destruction flow.
- [x] Add active/previous key rotation and rollback rehearsal.
- [x] Capture complete Email Routing inventory with rollback payload; DNS was
  read-only and unchanged.
- [x] Prove Worker deployment cannot mutate Email Routing, then separately add
  and remove the one authorised literal-address rule.
- [ ] Run independent security/privacy review.
- [ ] Run authorized provider smoke with disposable addresses.
- [x] Run hosted shadow with all routing/send flags off.
- [ ] Complete the applicable WED-225 review records against the exact commit.
- [ ] Obtain permission-copy and production-owner sign-off.

## Required regression checks before commit

- [x] Worker tests.
- [x] Focused Rust ingress tests.
- [x] `cargo test --lib gateway::smtp_in -- --nocapture`.
- [x] `cargo test --lib gateway::smtp_out -- --nocapture`.
- [x] Migration catalog and disposable PostgreSQL checks.
- [x] Full wedding tests.
- [x] Typecheck and production build.
- [x] Source line-budget checks.
- [x] Confirm every relevant flag is false in `.env.example` and Oracle compose
  packaging.
- [x] Confirm no source data, secrets, plaintext mail or generated evidence is
  committed.

## Human and operational blockers

These cannot be checked by implementation alone:

- [ ] independent security reviewer approves ingress, replay, storage, rotation,
  attachment and incident controls;
- [ ] privacy reviewer approves ordinary-email disclosure and retention;
- [ ] authorized owner approves Cloudflare routing/DNS changes;
- [ ] hosted accessibility, couple usability and vendor usability records pass;
- [ ] permission wording is approved;
- [ ] authorized provider smoke passes;
- [ ] allowlisted cohort completes seven days within thresholds;
- [ ] named production approver signs the frozen release.

Until those boxes are evidenced, the correct verifier result is `blocked`, not
`failed`, and all live relay flags remain false.

## WED-286 operational evidence, 2026-10-28

- A disposable local `clamd` accepted a clean fixture, detected the harmless
  EICAR fixture and proved unavailable-scanner fail-closed behaviour.
- Cloudflare suppression polling is disabled unless the complete outbound
  provider configuration is ready. Complaint and bounce records are
  idempotent, persist only recipient/provider digests and suppress automated
  resend. Plaintext recipient addresses and provider record IDs are not stored.
- Oracle staging ran the exact candidate image with vendor mail, sender masks,
  ingress and policy V2 false. The ingress endpoint stayed unavailable and the
  provider-event, quarantine and suppression counts remained `0,0,0`.
- The requested staging account `concensure+testing@gmail.com` was created and
  verified with its random password retained only in the staging server's
  restricted secret directory.
- The account-scoped routing token deployed Worker version
  `30e3e00e-fd04-449a-9f82-b199d3f6932c` from exact clean source `9e1be33...`.
  One literal mask rule was added only after deployment and removed after the
  controlled window; the Worker now has no route.
- One platform send to the literal synthetic mask reported delivery and created
  exactly one encrypted quarantine record plus one tenant-private AFP event in
  Oracle staging. Hosted exact replay returned `duplicate` and did not append a
  second event.
- The gateway now accepts only its active HMAC key and one explicitly configured
  previous key. Automated rehearsal covers forward overlap, unknown-key denial
  and swapping the pair back for rollback; no live secret was rotated.
- Expired raw-envelope ciphertext is replaced in bounded `SKIP LOCKED` batches
  with a content-free destruction tombstone. The integration case proves the
  raw envelope is gone while the recipient-encrypted AFP message remains the
  canonical record.
- A separate controlled-mailbox request was accepted into Cloudflare's queue.
  That is not mailbox delivery evidence: received headers and a human reply are
  not yet observed, so the authorized-provider-smoke item remains open.
- A deliberate invalid-domain message was queued without an immediate
  permanent-bounce or suppression record. The application made no retry, but a
  live provider bounce remains unproved.
- The restored Email Routing inventory again contained the same eight rules and
  disabled Drop catch-all as before; the temporary route/allowlist were empty
  and all runtime flags were false. Production application state was untouched.

# OmnyID Email Worker and Authenticated Ingress Tasks

Status: active
Task: WED-255
Baseline: `0dc247fab163f0abc0a151a6a1352ec29841bebb`
Spec: `cloudflare-email-worker-ingress-spec.md`

## Working rules

- [x] Work only in the advanced `agent/codex/WED-215` worktree.
- [x] Preserve unrelated dirty/untracked files.
- [x] Keep provider, vendor-mail, sender-mask, quotation, planning and policy-V2
  flags false.
- [x] Do not deploy, enable catch-all, mutate DNS/routing or send email in this
  implementation slice.
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
- [x] Set 24-hour quarantine expiry without implementing destructive cleanup yet.
- [ ] Add disposable-PostgreSQL tests for valid, duplicate, conflict, archived,
  transferred, connected-email and cross-tenant cases.

Exit evidence:

- [x] migration catalog check passes;
- [x] clean disposable PostgreSQL applies all migrations;
- [x] focused database integration suite passes.

## Slice 4 — scan and AFP processing

- [x] Run the existing ClamAV boundary before persistence; scanner unavailable
  fails closed.
- [ ] Parse and validate MIME during the same transient-plaintext ingress
  boundary, before recipient encryption, or finish it on the recipient device.
- [ ] Never add a server decryption wrapper merely to support background work.
- [ ] Parse with `src/gateway/smtp_in.rs`.
- [ ] Reuse existing file validation/storage for safe attachments.
- [ ] Resolve recipient/thread from signed routing and exact reply headers.
- [ ] Append one tenant-private encrypted AFP message with source lineage.
- [ ] Mark accepted only after the AFP transaction succeeds.
- [ ] Quarantine infection, active content, ambiguous routing and parse failures
  with bounded content-free reason codes.
- [ ] Prove duplicate processing cannot append a second AFP message.

Exit evidence:

- [ ] live disposable ClamAV clean/infected/unavailable tests;
- [ ] exact-replay and transaction-failure tests;
- [ ] existing wedding response-queue projection tests.

## Slice 5 — couple relay and outbound reply continuity

- [ ] Add exact `mail.omnyid.com` mask lookup without conflating vendor masks.
- [ ] Bind vendor sender digest and reply headers to one active relay thread.
- [ ] Reject sender/thread mismatches and legacy plaintext guessing.
- [ ] Make inbound vendor replies project through the existing response queue.
- [ ] Bind outbound idempotency to AFP approval and provider receipt.
- [ ] Add bounce/complaint state and retry suppression.
- [ ] Preserve connected Gmail as the separate existing path until explicit
  cutover; never use it as silent relay fallback.

## Slice 6 — operations and review packet

- [ ] Add aggregate metrics without addresses or content.
- [ ] Add quarantine expiry and reviewed deletion/key-destruction flow.
- [ ] Add active/previous key rotation and rollback rehearsal.
- [ ] Capture complete Email Routing and DNS inventory with rollback payload.
- [ ] Dry-run Worker deploy and prove no routing mutation.
- [ ] Run independent security/privacy review.
- [ ] Run authorized provider smoke with disposable addresses.
- [ ] Run hosted shadow with all routing/send flags off.
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

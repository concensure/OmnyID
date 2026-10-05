# Wedding Vendor Production Operations

Policy: `config/wedding_vendor_production_v1.json`
Frozen replay fixture: `tests/fixtures/wedding_vendor_production_v1.json`
Governing specification: `Documents/design/wedding planner/wedding-vendor-decisionos-mvp-to-production-spec.md`

## Release invariant

The AFP ledger remains authoritative. Search projections, comparisons, quote decisions, deferrals,
and UI cards are rebuildable views. A complete-looking vendor selection or quote response card may
only be projected after its versioned Decision Pattern verifies as `VALID` or
`VALID_WITH_OPTIONAL_GAPS`. Draft creation, approval, and external send are distinct durable events;
approval binds to the exact immutable payload hash sent.

The production policy is release-candidate configuration, not proof that general availability has
happened. GA remains blocked until the required hosted evidence and four accountable approvals are
recorded by their real authorities.

## Runtime controls

| Capability | Control | Safe stop effect |
|---|---|---|
| Automatic onboarding shortlist | `VITE_WEDDING_AUTOMATIC_SHORTLIST_ENABLED=false` and rebuild UI | Stops new automatic launches; manual search remains available. |
| Online provider fallback | `OMNYID_WEDDING_ONLINE_FALLBACK_ENABLED=false` | Directory-only results and an honest shortfall receipt. |
| Online canonical enrichment | `OMNYID_WEDDING_ONLINE_CATALOG_ENRICHMENT_ENABLED=false` | Keeps local classification/deduplication and stored evidence; stops online resolution/enrichment calls. |
| Outreach drafting | `OMNYID_WEDDING_ADMIN_AI_ROUTING_ENABLED=false` | Draft endpoint returns unavailable before model spend. |
| External wedding send | `OMNYID_WEDDING_EXTERNAL_SEND_ENABLED=false` | Approval remains in history; dispatch fails through the normal append-only failure receipt path. |
| Event quote projection | `OMNYID_WEDDING_EVENT_QUOTE_PROJECTION_ENABLED=false` | Stops immediate projection and reconciliation-created decisions without deleting quote history. |

Outreach drafting also requires audit receipts and a positive daily request limit. Provider-specific
admin policies, rate limits, timeouts, bounded resolution calls, and usage receipts remain enforced
server-side. Semantic reranking has not been introduced, so it has no dormant execution path to
switch off.

## SLOs and alerts

The numerical contract is in the production policy. Initial objectives are directory shortlist P95
under 2 seconds, online fallback P95 under 10 seconds, and quote-to-DecisionOS P95 under 60 seconds.
Duplicate external sends and missed critical quote deadlines both have a zero tolerance budget.

Exported quote metrics:

- `omnyid_wedding_quote_events_seen_total`
- `omnyid_wedding_quote_decisions_projected_total`
- `omnyid_wedding_quote_projection_blocked_total`
- `omnyid_wedding_quote_decisions_resurfaced_total`
- `omnyid_wedding_quote_projection_latency_ms_sum`
- `omnyid_wedding_quote_projection_latency_ms_count`
- `omnyid_wedding_quote_projection_latency_ms_max` (gauge)
- `omnyid_wedding_quote_missed_critical_deadlines_total`

Page operations immediately when missed critical deadlines or duplicate sends increase. Alert when
blocked projections increase for 10 minutes, P95 projection latency exceeds 60 seconds for 15
minutes, provider failure/rate-limit ratios exceed 10% for 15 minutes, or daily estimated provider
spend reaches 80% of its configured budget. Never include query text, email bodies, vendor replies,
or wedding profile details in metric labels.

## Reconciliation and recovery

The server projects a newly inserted quote immediately. A bounded five-minute reconciliation loop
then scans private user history to repair missed projections after a crash and to resurface due
deferrals. It uses stable deterministic identities, ignores already materialized decisions, and
appends diagnostics or successors instead of rewriting history. Revised quotes resolve the earlier
decision as superseded before appending a successor request. The frozen fixture proves reconstruction
of intake, shortlist, selection, thread, draft, approval, send, reply, quote, decision, deferral,
resurface, supersession, resolution, and follow-up under duplicate and out-of-order replay.

## Threat model and controls

| Threat | Required control and verification |
|---|---|
| Prompt injection in vendor pages, email, or attachments | Treat retrieved content as evidence, never instructions; bound context to the affected vendor/thread; require structured output and pattern verification. |
| Malicious image URL or tracking pixel | Proxy only validated provider identifiers/URLs; enforce SSRF destination policy, content type/size limits, private caching, and no automatic fetch solely to fill a photo. |
| Unsafe HTML/email | Render sanitized text/approved markup only; never execute remote HTML, scripts, forms, or inline event handlers. |
| Attachment bomb/parser exploit | Enforce upload and decompression limits, MIME verification, parser isolation/timeouts, and failure receipts. |
| Cross-tenant leakage | Require authenticated tenant ownership before projection, private storage, retrieval, or dispatch; never project a public/unowned quote. |
| Forged provider receipt | Create receipts server-side and bind provider request identity to the authenticated user/workspace and operation. |
| Replay or double-send | Separate approval from send, use idempotency keys, and bind both events to the same immutable payload hash. Zero duplicate sends is an SLO. |
| Approval substitution | Reject execution when the approved payload hash/version differs from the dispatch payload. |
| Sensitive collaborator rationale | Store only decision-safe summaries in shared projections; retain private evidence references and enforce permission-scoped retrieval. |

Fixtures must be synthetic and sanitized. Logs and model prompts use the minimum fields necessary for
the current operation. AFP retention and deletion follow the user's existing data policy; cached
provider evidence carries source, authority, retrieval time, freshness, and supersession history.

### Dependency-audit disposition (2026-10-06)

- The refreshed Rust graph removes the previously reachable `lettre`, `h2`, `ammonia`, `quinn`,
  `rustls`, and `webpki` advisories. CI ignores `RUSTSEC-2023-0071` only because its `rsa` package is
  lockfile-only through disabled `sqlx-mysql`; `cargo tree -i rsa@0.9.10` and
  `cargo tree -i sqlx-mysql` both return no resolved dependency. Revisit immediately when upstream
  publishes a fixed RSA release or MySQL support is enabled.
- A compatible JavaScript lock refresh removes the reachable critical `seroval` and high PDF, XML,
  nanoid, and markdown/link findings and passes clean-install typecheck/build. Remaining audit output
  is TipTap 2's moderate `mergeAttributes` advisory plus `image-size` JXL/HEIF/ICNS denial-of-service
  advisories inherited through `pptxgenjs`. The present conversion code generates text-only slides
  and never invokes PPTX image parsing, so the wedding path is not exposed; this is a recorded
  repository-wide residual risk, not a green audit. Security approval or patched upstream packages
  are required before GA.
- The tracked secret-pattern scan returned no matches. Authorized hosted SAST/DAST remains a release
  gate and must not be inferred from dependency or unit-test results.

## Operator runbooks

### Provider outage or quota exhaustion

1. Confirm provider health, timeout, circuit/rate-limit, and usage receipts without exposing query text.
2. Disable online fallback if failures are broad or cost is unbounded.
3. Verify the response degrades to directory-only plus an honest incomplete/shortfall state.
4. Re-enable for a developer canary only after the provider and budget gates recover.

### Stuck search

1. Correlate the authenticated request fingerprint with provider receipts and latency.
2. Check the 12-second provider timeout, bounded call count, and running shortlist fingerprint.
3. Clear only a stale materialized running claim; preserve AFP/source evidence.
4. Retry once in a controlled account and verify no duplicate comparison is appended.

### Image failure spike

1. Disable the affected provider/photo policy, inspect proxy validation and content-type/size failures.
2. Confirm cards show labelled placeholders and that no paid call occurs solely for a missing photo.
3. Restore only verified media matched to the stable vendor id and slot.

### Duplicate quote or decision

1. Compare source quote ids, wedding plan ids, material hashes, and deterministic decision ids.
2. Leave ledger events intact; append a diagnostic/supersession repair if the projection is wrong.
3. Run frozen replay and reconciliation tests before re-enabling event projection.

### Missed resurfacing

1. Disable event projection only if the reconciler is creating unsafe duplicates.
2. Inspect held-state dates and all four safety boundaries; expired external deadlines must remain
   expired and trigger critical escalation.
3. Run reconciliation for the affected tenant and confirm one deterministic resurfaced successor.
4. Page operations because the missed-critical error budget is zero.

### Send uncertainty

1. Disable external send.
2. Check provider idempotency/request id and the immutable approved payload hash before retrying.
3. If provider delivery is unknown, do not retry automatically; surface a human resolution action.
4. Append the confirmed delivery/failure receipt and re-enable only after duplicate risk is cleared.

### Gmail token failure

1. Keep quote projection and existing history available; stop Gmail-dependent send/sync paths.
2. Ask the user to reconnect using the existing OAuth flow; never log tokens.
3. Run the controlled mailbox canary before restoring the cohort.

### Cost spike

1. Disable online fallback, enrichment, and outreach drafting in that order while keeping directory
   search and ledger history available.
2. Audit usage receipts by provider/operation/fingerprint, not private query text.
3. Re-enable only after rate, daily/monthly budget, cache, and fallback policy are verified.

### Rollback

1. Set all wedding trigger/execution flags false, leaving reads and AFP history intact.
2. Roll back application containers to the last proven SHA; never roll back by deleting ledger rows.
3. Verify `/healthz`, `/readyz`, DecisionOS bootstrap, database migrations, backup manifest, and one
   replay from the frozen fixture.
4. Restore capabilities one at a time through the rollout stages below.

## Staged rollout and evidence packet

Roll out strictly through developer canary, internal accounts, controlled beta, percentage rollout,
then GA. At every stage attach: commit SHA, config fingerprint with values but no secrets, migration
state, automated test results, ranking/eval measurements, SLO window, provider spend, known risks,
backup proof, restore/replay result, and rollback result. Stop the stage on any security finding at
the agreed release-blocking severity, SLO breach, unbounded spend, unexplained duplicate, or dishonest
provenance/placeholder.

Required hosted checks include Gmail reply/quote canary with controlled mailboxes and no real-world
vendor contact, watcher/DecisionOS bootstrap, photo proxy, provider policies, backup, restore, and
rollback. GA requires named product, engineering, security/privacy, and operations approvals. A CI
pass or local test does not substitute for those approvals.

## Ownership template

Record real people or on-call rotations in the release packet; do not commit personal contact details
to this repository.

| Area | Required owner |
|---|---|
| Product policy and cohort | Product |
| Runtime, data, and rollback | Engineering |
| Threat review and data incident | Security/privacy |
| Alerts, providers, backups, support escalation | Operations |

Open a data incident immediately for suspected cross-tenant exposure, leaked credentials, forged
receipts, or unauthorized external contact. Disable affected execution paths, preserve audit evidence,
follow the organizational incident process, and notify affected users according to applicable policy.

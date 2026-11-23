# Wedding Vendor Workflow — Production Task List

Status: starts only after the companion MVP plan passes
Recommended lead implementer: GPT-5.6 Sol, high reasoning; use GPT-5.6 Terra for isolated mechanical
refactors and test expansion after Sol defines the contract
Governing spec: `wedding-vendor-decisionos-mvp-to-production-spec.md`

Implementation status (2026-10-06): release-candidate contracts and local machine gates are
implemented under WED-147 and commit `f0eeb43` is deployed to the Oracle developer canary with a
passing backup/restore production proof. Measured SLO windows, accessibility
manual checks, staged cohorts, and accountable GA sign-offs remain external release gates and must
not be marked complete without their real evidence. Machine-readable policy:
`config/wedding_vendor_production_v1.json`; operator/security runbook:
`docs/wedding-vendor-production-operations.md`; frozen sanitized lineage:
`tests/fixtures/wedding_vendor_production_v1.json`.

## Production definition of done

The MVP workflow is production-ready when it is event-driven, pattern-governed, replayable,
idempotent, observable, secure, accessible, cost-controlled, operationally supported, and proven in
staged rollout. A polished card over a refresh-dependent or non-rebuildable workflow does not pass.

## Dependency map

```text
P0 accept MVP and freeze contracts
  -> P1 pattern registry + verifier
      -> P2 event-driven quote ingestion and resurfacing
          -> P3 vendor evidence/ranking quality
              -> P4 provider reliability and cost control
                  -> P5 lifecycle UX and accessibility
                      -> P6 ledger replay/recovery and security
                          -> P7 observability, evals, and SLOs
                              -> P8 staged rollout and operations
```

P3 and P4 may proceed in parallel after P2 only if they do not edit the same files. The final release
gate remains sequential.

## P0 — Accept the MVP and freeze evidence

Depends on: completed MVP plan

### Work

1. Re-run the entire MVP integration matrix against the current commit and hosted configuration.
2. Capture one sanitized AFP lineage from onboarding through quote resolution.
3. Freeze version 1 fixtures for:
   - intake profile;
   - directory-only search receipt;
   - online-shortfall receipt;
   - exactly-three comparison;
   - selection/request/draft/approval/send;
   - inbound reply and quote;
   - DecisionOS decision, deferral, resolution, and supersession.
4. Record all current provider flags, quotas, migrations, and known baseline failures without
   including secret values.
5. Confirm the implemented one-active-category replacement and honest-placeholder policies still
   match the specification. If product policy changes, version the contract and fixtures before any
   production refactor.

### Gate

The frozen fixtures replay successfully and no production task depends on undocumented MVP state.

## P1 — Implement the declared Decision Pattern contract

Depends on: P0

### Work

1. Create a controlled, versioned Decision Pattern registry using existing AFP-compatible optional
   fields and focused modules. Do not store JSX, arbitrary HTML, or a second copy of domain truth.
2. Register `wedding.vendor_selection@1` and `wedding.vendor_quote_response@1` with:
   - supported situation types;
   - required/optional inputs;
   - required evidence and freshness;
   - semantic slots;
   - allowed actions;
   - execution contracts;
   - postponement/deadline policy;
   - completion/supersession conditions;
   - projection recipe/version;
   - verification rules.
3. Add a deterministic completeness verifier with outcomes:
   - `VALID`;
   - `VALID_WITH_OPTIONAL_GAPS`;
   - `BLOCKED_MISSING_DATA`;
   - `BLOCKED_STALE_DATA`;
   - `BLOCKED_CONFLICT`;
   - `PATTERN_GAP`.
4. Block a complete-looking card when required evidence/actions/contracts are missing.
5. Persist pattern id/version on historical decision instances so replay remains stable after later
   pattern revisions.
6. Add contract tests and backward-compatibility fixtures for legacy MVP messages without pattern
   metadata.

### Gate

No wedding vendor decision can reach a user-visible DecisionOS surface without a registered pattern
and successful verification, and legacy MVP history still renders.

## P2 — Make quote detection, prioritisation, and resurfacing event-driven

Depends on: P1

### Work

1. Wire existing AFP ingestion/background watcher infrastructure to detect new or materially changed
   wedding vendor quotes without requiring the wedding UI to be open.
2. Keep the MVP projector idempotency key so watcher retries cannot duplicate decisions.
3. Trigger bounded synthesis for the affected quote/thread rather than a whole-ledger LLM call.
4. Feed the existing state synthesizer/continuity pipeline through a focused wedding adapter; do not
   place wedding-specific logic into the already oversized `state_synthesizer.rs`.
5. Extend decision metadata/scoring with deterministic:
   - quote validity/deadline pressure;
   - recovery time for alternative search/negotiation;
   - dependency impact;
   - financial exposure;
   - reversibility;
   - category priority;
   - material-change magnitude.
6. Implement the four-date safety envelope:
   `comfortable_resurface_at`, `latest_safe_decision_at`, `critical_at`, `external_deadline`.
7. Make `DEFER_DECISION` append a durable held state and automatically resurface on date, material
   change, risk threshold, or user request.
8. Respect the existing DecisionOS cognitive budget: at most three ordinary decisions, with critical
   exceptions recorded and explained.
9. Add supersession for revised quotes and idempotency for repeated email indexing/parsing.
10. Add crash/restart, duplicate event, out-of-order event, and clock-boundary tests.

### Gate

A quote arriving while the client is closed is visible in DecisionOS on the next open without a
manual wedding refresh, and deferral/resurfacing survives restart and replay.

## P3 — Raise vendor evidence and ranking quality

Depends on: P2

### Work

1. Preserve the current ranker as the baseline and build a representative, consent-safe evaluation
   corpus across category, geography, budget, guest count, sparse evidence, and provider mix.
2. Measure rather than guess:
   - hard-constraint precision/recall;
   - duplicate rate;
   - photo validity/identity rate;
   - top-three relevance judged from onboarding evidence;
   - directory-only completion rate;
   - online fallback rate;
   - unknown/conflict calibration;
   - user selection and request rates.
3. Separate admin-curated, operator-verified, vendor-replied, official-site, independent aggregate,
   auto-cached search, editorial, and inferred provenance in user-visible evidence labels.
4. Do not present auto-cached online entries as operator-curated directory vendors.
5. Production-harden online-to-directory enrichment rather than keeping provider results transient:
   - canonicalize by stable ids/place ids, normalized domains, and normalized name plus service area;
   - quarantine ambiguous matches rather than creating a likely duplicate;
   - apply field-level source-authority and freshness precedence;
   - allow newer credible evidence to become current while retaining superseded evidence/history;
   - prevent newer lower-authority evidence from overwriting operator/vendor/official truth;
   - monitor duplicate creation, conflicting facts, and canonical merge outcomes.
6. Add freshness policy per attribute and photograph. Revalidate live availability/price before a
   consequential booking action.
7. Measure the photo-administration lifecycle: attach/replace by stable `vendor_id` and slot, preview,
   provenance, broken-link handling, placeholder replacement, and assurance that media edits never
   insert a duplicate vendor. Add bulk import only if operations evidence justifies it.
8. Add a semantic rerank only if the evaluation shows a material gap that the existing deterministic
   ranker cannot close. If added:
   - rerank a bounded top-K only;
   - use structured output;
   - retain deterministic hard constraints;
   - persist evidence/reasoning/version;
   - fall back to deterministic ranking;
   - never store an inference as a user preference.
9. Add bias/diversity checks appropriate to vendor geography and category without manufacturing
   representation unsupported by available vendors.
10. Version the ranking policy and create successor comparisons only on material input/evidence change.

### Gate

The evaluated ranker meets predeclared thresholds, provenance is truthful, and an offline replay
reproduces the same top three for the same versioned inputs.

## P4 — Harden provider reliability, metering, and spend

Depends on: P2; may run alongside P3

### Work

1. Enforce admin-funded provider policies server-side at every call path, including photo retrieval
   and enrichment.
2. Add durable usage receipts for provider, request fingerprint, user/workspace, result count,
   latency, cache hit, fallback reason, and cost estimate without logging private query text.
3. Add per-user/workspace/provider rate limits, daily/monthly budgets, concurrency bounds, timeouts,
   bounded retries with jitter, and circuit breakers.
4. Make directory-first cache behaviour observable and verify no paid call on a complete directory
   result.
5. Add stale-while-revalidate only where the UI clearly labels freshness and the decision is not
   consequential.
6. Add provider health/admin surfaces using the existing wedding admin/provider stack.
7. Validate Google photo proxy SSRF/input controls, response content type/size, cache headers, and
   key secrecy.
8. Document degradation order: directory -> configured primary provider -> supported fallback ->
   honest incomplete state.
9. Do not call a paid provider solely because a suitable vendor lacks a photo; use the honest
   placeholder until verified media is attached or arrives during otherwise-required enrichment.
10. Load-test regional/provider failures and quota exhaustion.

### Gate

Spend cannot exceed configured bounds, provider outages degrade honestly, and usage can be audited
without exposing secrets or sensitive wedding context.

## P5 — Finish the decision/execution lifecycle UX

Depends on: P3 and P4

### Work

1. Apply progressive disclosure consistently:
   - ambient reassurance;
   - decision;
   - evidence on demand;
   - execution only after a semantic decision.
2. Ensure Wedding Home has one dominant "needs you" projection rather than duplicate quote,
   planning-thread, and decision-focus renderings of the same event.
3. Keep wedding-specific Home and global DecisionOS as two projections of one decision identity,
   not two state owners.
4. Preserve one active vendor category grid. Category intent from the master-agent or vendor search
   field replaces the active three-card projection and retains the prior comparison only as history.
5. Support semantic quote actions:
   `ACCEPT_VENDOR`, `NEGOTIATE_QUOTE`, `EXPLORE_ALTERNATIVE`, `DEFER_DECISION`, and evidence view.
6. For acceptance/negotiation, instantiate the pattern execution contract, persist the draft, show
   exact financial consequences, and require explicit send/commitment approval.
7. `EXPLORE_ALTERNATIVE` runs in the background and protects the current quote deadline; it must not
   create immediate user busywork.
8. Resolved workflows collapse to history/receipt and update wedding progress without permanent
   celebratory noise.
9. Complete WCAG 2.2 AA behaviour for keyboard, screen reader, focus restoration, tab order,
   contrast, status announcements, reduced motion, touch targets, and error association.
10. Validate phone, tablet, desktop, zoom to 200%, long vendor names, missing content, and localized
   dates/currency.
11. Keep presentation semantics separate from AFP meaning and pattern interaction contracts.

### Gate

Usability testing confirms that users can explain what happened, why the recommendation exists,
what is unknown, and what their action will do before they approve it.

## P6 — Prove ledger replay, recovery, privacy, and security

Depends on: P5

### Work

1. Build replay tests that delete materialized/local projection state and reconstruct:
   shortlist, selection, thread, draft versions, approval, send, reply, quote, decision, deferral,
   supersession, resolution, and follow-up from AFP plus declared indexes.
2. Verify stable card/decision/thread identity across renderer and pattern versions.
3. Test partial-failure recovery:
   - provider result persisted but comparison not projected;
   - draft persisted but UI closed;
   - send succeeds but receipt/contact projection fails;
   - quote parsed but decision projection fails;
   - decision resolves while a retry is in flight.
4. Add reconciliation jobs that append repairs/diagnostics rather than mutating history.
5. Threat-model:
   - prompt injection in vendor pages/emails/attachments;
   - malicious image URLs and tracking pixels;
   - HTML/email sanitisation;
   - attachment bombs and parser isolation;
   - cross-user/workspace/vendor data leakage;
   - forged provider receipts;
   - replay/double-send;
   - approval payload substitution;
   - sensitive rationale exposure to collaborators.
6. Enforce least-context retrieval and permission-scoped projections.
7. Redact secrets/PII from logs, metrics, test fixtures, and model prompts; define retention/deletion
   behaviour consistent with AFP/user-owned data policy.
8. Run dependency, SAST, secret, migration, and authorized dynamic security checks.

### Gate

Replay is deterministic, repair is append-only, security findings at the agreed severity threshold
are closed, and explicit approval always binds to the exact immutable payload sent.

## P7 — Add observability, quality evals, and SLOs

Depends on: P6

### Work

1. Define privacy-safe metrics and traces for each lifecycle transition and idempotency key.
2. Add dashboards/alerts for:
   - onboarding-to-shortlist completion and latency;
   - directory-only success and paid fallback rate;
   - photo failure/identity mismatch;
   - provider failure/rate-limit/circuit state;
   - duplicate/superseded comparison and quote decisions;
   - draft generation/persistence/send failure;
   - reply/quote detection delay;
   - DecisionOS surface delay and missed resurfacing;
   - deferral safety-envelope breach;
   - spend per completed shortlist and per vendor request.
3. Establish SLOs and error budgets, including:
   - P95 directory shortlist latency;
   - P95 online fallback latency;
   - quote-to-DecisionOS propagation;
   - duplicate external sends = zero;
   - safety-envelope missed critical deadline = zero.
4. Run deterministic and model-based evals against frozen and adversarial fixtures.
5. Add synthetic canaries using controlled vendors/mailboxes and no real-world external contact.
6. Add a release proof packet containing commit, configuration fingerprint, migrations, tests,
   eval metrics, SLO state, known risks, and rollback.

### Gate

Every material failure is detectable, attributable, and actionable before broad rollout.

## P8 — Stage rollout and operational ownership

Depends on: P7

### Work

1. Add feature flags/kill switches for:
   - automatic onboarding shortlist;
   - online provider fallback;
   - online catalog enrichment and duplicate quarantine;
   - outreach drafting;
   - external send;
   - event-driven quote projection;
   - semantic rerank if introduced.
2. Roll out in order: developer canary -> internal accounts -> controlled beta -> percentage rollout
   -> general availability.
3. At each stage, compare metrics to the frozen MVP baseline and stop on SLO/security/cost breach.
4. Verify database migrations, provider policy flags, secrets, Gmail sync, photo proxy, watcher,
   DecisionOS bootstrap, backup, and restore in the production environment.
5. Write operator runbooks for provider outage, stuck search, image failure spike, duplicate quote,
   missed resurfacing, send uncertainty, Gmail token failure, cost spike, and rollback.
6. Rollback must disable new triggers/execution while preserving all AFP history and valid receipts.
7. Define product/support ownership, escalation contacts, data incident process, and post-launch review.
8. Remove dead compatibility code only after telemetry proves no supported historical messages use it.

### Final gate

General availability requires signed product, engineering, security/privacy, and operations approval;
green automated gates; successful restore/replay drill; stable canary SLOs; bounded spend; and no
unresolved release-blocking defect.

## Required verification suite

Run the repository-authoritative commands plus focused new suites:

```text
cd solid-ui && npm run typecheck
cd solid-ui && npm run test:line-budget
cd solid-ui && npm run test:wedding
cd solid-ui && npm run test:decisionos-navigation
cd solid-ui && npm run build
cd typescript-sdk && npx tsc --noEmit
cargo check
cargo test
```

Also run:

- pattern contract/legacy compatibility fixtures;
- event ingestion/idempotency/restart tests;
- provider fault and metering tests;
- replay/reconciliation tests;
- accessibility automation plus manual keyboard/screen-reader checks;
- security tests and secret scan;
- load/soak tests;
- controlled hosted Gmail reply/quote canary;
- production backup/restore and rollback drill.

## WED-147 implementation evidence

This table distinguishes completed repository work from evidence that can only be produced by a
real hosted rollout. "Implemented" does not mean that a later hosted or human gate is waived.

| Phase | Repository status | Remaining production evidence |
|---|---|---|
| P0 | Complete: frozen sanitized lineage, machine policy, provider flags, baseline failures, and full local wedding/Rust verification are recorded. | Repeat the non-fixture matrix against the release SHA and hosted configuration. |
| P1 | Complete: both controlled patterns, deterministic verifier outcomes, persisted pattern metadata, legacy handling, and contract tests exist. | Observe the pattern-version mix during canary. |
| P2 | Complete: insert-time projection, five-minute reconciliation, deterministic identity, supersession, four safety dates, deferral resurface, restart, duplicate, and out-of-order tests exist. | Run the controlled closed-client mailbox canary and measure propagation latency. |
| P3 | Complete for the release candidate: the versioned deterministic ranker/provenance policy passes the synthetic consent-safe corpus for three categories and geographies with precision 1.0, recall 1.0, duplicate rate 0, photo identity 1.0, top-three relevance 1.0, and unknown-label precision 1.0. | Measure directory/fallback/selection/request outcomes and photo lifecycle on the controlled beta cohort. |
| P4 | Complete for code and policy: provider calls remain directory-first, server-bounded, metered, rate-limited, timeout-bounded, feature-flagged, and honestly degraded. | Run provider outage, quota exhaustion, regional fault, and sustained load tests against hosted configuration. |
| P5 | Complete for deterministic lifecycle/projection contracts: semantic actions, immutable approval boundary, one decision identity, one active category, and history/supersession behavior are contract-tested. | Complete WCAG 2.2 AA manual keyboard/screen-reader, device, zoom, localization, and moderated usability acceptance. |
| P6 | Complete for replay/reconciliation/approval and the documented threat model. Rust dependency audit has no reachable known vulnerability; tracked secret-pattern scan has no match; the Oracle backup/restore proof passes. | Resolve or formally accept the recorded upstream JavaScript audit risks, then run authorized SAST/DAST and the hosted rollback drill. |
| P7 | Complete for metric emission, zero-tolerance counters, numerical SLO policy, alerts/runbooks, and deterministic eval fixtures. | Collect stable canary SLO/error-budget windows and a hosted synthetic-canary proof packet. |
| P8 | Complete for kill switches, degradation order, rollout stages, rollback procedure, evidence template, and ownership roles. | Execute each cohort and obtain named product, engineering, security/privacy, and operations approvals. |

Known machine-gate exceptions are not hidden:

- `npm run test:line-budget` fails on committed/pre-existing oversized files; every new WED-147
  source/test module is below 999 lines and no cap was raised.
- `cargo audit` has a scoped `RUSTSEC-2023-0071` exception because `rsa` is present only in the
  lockfile through disabled `sqlx-mysql`; both are absent from the resolved build graph and no fixed
  RSA release exists. The reachable Rust graph otherwise passes the audit.
- The refreshed JavaScript lock removes the reachable critical `seroval` and high PDF/XML/markdown
  findings. It still reports the upstream TipTap 2 moderate finding and `image-size` high denial of
  service findings through `pptxgenjs`; the wedding workflow does not call that parser, but the
  repository-wide security/GA gate remains open until security accepts the bounded reachability or
  patched upstream packages are adopted.

## Production completion checklist

- [x] Pattern registry and verifier govern vendor selection and quote response.
- [x] Event-driven quote detection works with the client closed.
- [x] Deferral and safe resurfacing survive restart.
- [x] Ranking/provenance/photo quality meets measured release-candidate thresholds.
- [x] Online facts enrich canonical vendor rows without duplicates or loss of superseded evidence.
- [x] Stable vendor photo administration and honest placeholder replacement are operationally proven.
- [x] One active category and both-search-field replacement semantics remain contract-tested.
- [x] Provider calls are metered, bounded, observable, and honestly degraded.
- [x] One decision identity powers Wedding Home and DecisionOS projections.
- [ ] Accessibility and responsive acceptance pass.
- [x] AFP replay reconstructs every material state.
- [x] Approval binds to the exact immutable outbound payload.
- [ ] Threat model and required security checks pass.
- [ ] SLOs, alerts, canaries, runbooks, backup, restore, and rollback are proven.
- [ ] No new/refactored file exceeds 999 lines and line-budget caps were not relaxed.
- [ ] Staged rollout gates and accountable sign-offs are complete.

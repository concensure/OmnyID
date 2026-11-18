# Runbook threat model and remaining gates

Scope: WED-375 internal runtime and management APIs, November 2026. This is a
design review against the implemented boundaries, not a penetration-test report
or permission to enable live ingress, models or providers.

## Assets and trust boundaries

The authenticated account owns definitions, instances, traces, saved evidence,
questions, answers and schedules. The private AFP ledger is authoritative;
projections and cached responses must not grant authority. The public event
partition supplies data, not approval. A source body, model output or connection
metadata cannot select a capability, owner, definition revision or approval.

The trusted runtime receives owner from authentication or a reviewed daemon
partition. Server keys protect private content and record authenticity. Every
mutating runtime operation holds the account row and owner transaction lock.
Deletion cannot race an operation into recreating an erased private schema.

## Threats, controls and evidence

| Threat | Implemented boundary | Evidence / remaining work |
| --- | --- | --- |
| Forged events or owners | Dispatch reads an exact event from the owner partition; normalization copies bounded reviewed structure. Public events claiming a private follow-up type are rejected. | Foundation and event-adapter tests; audit upstream event-writing authorities before enabling hooks. |
| Fake due events | Due normalization reads the signed/encrypted private ledger through the store, which requires a delivered schedule record. A body supplied to public normalization cannot enter this path. | Control PostgreSQL tests include foreign owner and schedule-versus-delivery confusion. |
| Malicious definitions | Closed enums and fields, bounded steps and selectors, tool/follow-up allowlists, immutable successor chains and stale-parent rejection. | Foundation/storage tests. No arbitrary queries, executable schemas or named shell code. |
| Prompt injection | Source and answer text are facts only. Frozen tool identity and authority are resolved independently. No model executor is connected. | Policy injection tests. Model prompt/data separation and provider-specific injection evaluation remain rollout gates. |
| Capability escalation | Frozen tools intersect latest restrictions, one healthy owner connection and current account policy. Historical policy receipts are never execution grants. | Authority tests. Exact approved-input binding, dispatch-time revocation and provider idempotency remain unfinished. |
| Cross-tenant references | Owner-derived private schema, owner-partitioned public reads, authenticated route owner and instance-bound saved evidence. Missing and foreign records have the same public result. | Evidence, storage, runtime, control and API tests. Entity-specific resolvers still need their own authorization review. |
| Concurrent replay | Owner lock, deterministic IDs, revision checks and transactionally appended receipts. Exact deliveries return historical results; duplicate answers are rejected. | Concurrent dispatch, policy, question, schedule and completion tests. External tool retries are not implemented. |
| Answer substitution | Typed input event must match an open question, same owner/instance/step, exact field set, scalar schema, revision and deadline. No approval property is accepted. | Control and API tests. UI submission must retain these exact bindings. |
| Timer abuse | Declared types, bounded dates, separate expiry, stable cancellation keys and append-only successors. Scans are bounded hints; delivery rechecks current state/time/declarations. | Control tests. Shared daemon fairness, per-account scan budgets and operational rate limits remain prerequisites. |
| False completion | Complete requires the frozen prior-step sequence and committed completed traces, checks required facts, and evaluates all criteria against derived output summaries. Unknown outputs fail closed. | API/completion scenario covers success, failure, concurrent retry and foreign access. Business output schemas remain executor work. |
| Private-content leakage | Private records are encrypted and signed. Activity omits raw evidence, supplied answers, definitions and model/tool inputs. Normal detail is a summary; export is explicit. Responses are no-store. | Storage and API tests. Operator log review, full UI rendering review and telemetry redaction remain open. |
| Resource exhaustion | Definition/record/history/reference limits, read/decrypt caps, route body limit and owner rate limiting. | Foundation/evidence/management tests. Shared account decrypt/model budgets and retention are not yet complete. |
| Erasure bypass | Account deletion drops the private schema and removes legacy owner policy rows; runtime does not create schemas. | Storage, runtime, evidence, authority and control erasure tests. Recheck every future cache/projection/export store. |

## Explicit residual risks and rollout conditions

The shared account decrypt budget is not integrated; local hard caps are not a
substitute. Derived traces need a retention policy. No cache exists yet, and any
future cache must be owner-bound, immutable-version-bound and erased on deletion.
The public event adapters depend on trusted owner-partitioned persistence and do
not independently establish the truth of a vendor document or email.

The management flag permits owner controls but exposes no start, tool-dispatch
or model endpoint. Answering a question changes ledger state to Running; it does
not run the next step. A successful completion means the declared predicates
matched committed outputs, not that an external action occurred. Current starter
business outputs cannot be invented from trace status alone.

Keep live ingress, provider execution and model execution disconnected until
their respective executor, approval, budget, provenance, UI and security tasks
are verified. Do not treat this document, accepted feedback, an old policy receipt
or a cancelled/rescheduled timer as execution authority. Hosted shadow checks,
dependency scans, provider/sandbox evidence, accessibility and cross-review remain
separate checklist requirements.

## Dependency audit evidence — 2026-11-18

Candidate: `152d6f38980245bee25d39814f35b45bb00cec19`.
`cargo audit --json` reported six vulnerabilities in 533 dependencies; the
registry yanked-package check timed out. The advisory database fetched during
that attempt had commit `233155b4025b854c68a4b199c0e32d7fd53291a2` and last update
2026-11-17. A second run with `--no-fetch --no-yanked --json` reproduced the
advisories and saved `C:/temp/wt/runbook-audit-152d6f38.json`. Neither run is a
passing security result. Cargo manifests/lockfile are unchanged by this batch.

| Advisory | Locked dependency |
| --- | --- |
| RUSTSEC-2026-0533 | ammonia 4.2.4 |
| RUSTSEC-2026-0387 | crypto-bigint 0.5.5 |
| RUSTSEC-2026-0459 | libsqlite3-sys 0.30.1 |
| RUSTSEC-2026-0414 | pulldown-cmark 0.13.4 |
| RUSTSEC-2026-0433 | pulldown-cmark 0.13.4 |
| RUSTSEC-2023-0071 | rsa 0.9.10 |

The report also contains three unmaintained-package warnings and two unsoundness
warnings. These are dependency-wide findings, not an exploitability assessment.
The scan/abuse checklist gate remains open pending dependency remediation or
reviewed applicability decisions and a successful registry/yanked check. Do not
silence advisories merely to enable runbooks. Shared crypto, HTML/Markdown and
SQLite dependencies require their own regression coverage when upgraded.

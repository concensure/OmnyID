# WED-375 rollout evidence gates

These requirements separate each promotion boundary. WED-382 records completed
bounded internal HTTP draft and approval-tool cohorts plus an exact-source Oracle
release in Documents/verification/WED-382-release-evidence.json. Production
execution remains default-off. Internal acceptance does not authorize general
production actions, UI execution or arbitrary external-provider integrations.

## Separate promotion boundaries

1. Flags-off hosted shadow matching: freeze the source SHA and definition pack,
   capture expected and observed owner-scoped match/suppression counts, and prove
   zero started instances and zero provider calls. Report every discrepancy.
2. Internal deterministic-only allowlist: explicitly name test accounts, event
   kinds, definitions and duration. No model or tool dispatch. Require zero
   cross-owner reads/writes, duplicate effects, terminal reopens or policy bypasses.
   Inspect stale and denial metrics against the exercised cases, not just zeros.
3. Draft-only models: use a representative, versioned evidence corpus; compare
   Luna low/medium with the policy-permitted Sol medium escalation. Require valid
   schemas, grounded source references and no action authority on every accepted
   output. Record rejection/acceptance counts, latency, tokens, reserved and known
   spend by model. Provider failures and malformed output must not escalate.
4. Approval-gated sandbox tools: use a reviewed sandbox endpoint and test account,
   exact schemas and owner grants. Exercise revocation, changed arguments,
   approval replay, cancellation, timeout, transport ambiguity and result-write
   failure. Unknown outcomes must retain reservations and never resend. Verify
   the provider's observed effects against the saved receipt, not only HTTP status.
5. Reversible actions are a separate cohort and promotion decision, never an
   automatic consequence of passing any earlier gate. No currently registered
   production action is approved by this document.

## Reversible-action acceptance

Before enabling a particular action, record its exact capability/version,
provider/environment, test owners, argument schema, prior-state capture, expected
postcondition, compensation operation, cost ceiling, maximum exposure and the
operator responsible for rollback. Missing evidence blocks that action.

- Acceptance: exercise success, exact replay, changed input, simultaneous workers,
  expired/revoked approval and foreign owner. Require exactly one intended effect
  on success and zero effects for all denied cases. The saved receipt must match
  provider evidence and the committed step/provenance hashes.
- Undo: perform the compensation against a sandbox effect and independently read
  back the restored state. It must be idempotent, scoped to the same owner and
  resource, reject intervening conflicting edits, and require fresh approval when
  consequential. A local cancellation or Unknown receipt is never an undo.
- Error: inject pre-send failure, response loss, timeout after acceptance, and
  local commit failure. Require zero automatic resend or terminal reopen. An
  ambiguous effect blocks promotion until authenticated provider reconciliation
  or explicit operator resolution supplies evidence. Stop the cohort on any
  duplicate effect, cross-owner access, unexpected mutation or failed undo.
- Cost: set finite per-attempt, per-owner and cohort limits before execution.
  Reserve the worst-case reviewed cost before I/O, retain unknown spend, and
  reconcile known usage. Require zero cap bypasses in concurrency and failure
  cases. Stop on any unknown charge beyond its reservation or missing usage
  evidence; an estimate is not a provider invoice.

## Evidence and deployment

Each gate artifact names the full 40-character source SHA, clean worktree path,
commands/configuration, environment, accounts by non-secret reference, timestamp,
observed results, failure cases, limitations and reviewer decision. Do not reuse
build evidence across changed source candidates. Never put credentials, private
evidence bodies or model prompts in these artifacts.

A deployment is a distinct action after the reviewable candidate and required
checks exist. Apply AGENTS.md production gates, retain previous images and Caddy,
recreate Caddy when required, and record hosted checks and rollback references.
No hosted endpoint, test account, funding policy or rollout authorization is
invented when it is unavailable. A gate stays open instead.

## Shared model configuration (disabled until the model gate passes)

`OwnerRunbookModelProvider::new` remains BYOK-only. Trusted application
composition may select `with_shared_funding`; request bodies and model output
cannot select it. Shared funding additionally requires both
`OMNYID_OPENROUTER_FUNDED_ENABLED` and
`OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED=true`, an owner in
`OMNYID_RUNBOOK_ALLOWLIST`, and an explicitly compatible hosted account
configuration (OpenAI, the specified Luna base model, positive monthly budget).
The guarded draft HTTP route may compose this adapter only for the separately
reviewed exact-owner/definition/step cohort. No general production cohort is
enabled. Do not enable these controls for flags-off or deterministic-only cohorts.

The existing secret manager supplies the platform credential. The existing
funded-usage ledger and global advisory lock reserve the full attempt ceiling
against both the platform weekly cap and the owner's monthly cap before I/O.
Account policy is re-read under a row lock and existing monthly usage from
other inference paths is subtracted before admitting a reservation.
A validated response reconciles usage-derived cost; timeout, cancellation and
unknown outcomes retain the reservation. Usage-derived cost is not an invoice.
Account deletion removes Runbook funding owner links and correlation fields,
while retaining anonymous cost exposure so deletion cannot restore spent
platform allowance. Failed BYOK requests never fall through into shared funding. Sol escalation
retains the existing separate trusted policy and acceptance constraints.

Canonical quotation ingress uses the existing event-hook flag and allowlist.
It reads the persisted private record, emits a stable reference-only event and
only matches instances. HTTP replay must not create another normalization or
instance. Missing dates require the existing question flow; quote receipt
never grants booking, payment or availability authority.


## Model compatibility preflight — 2026-11-19

The configured IDs remain `gpt-6-luna` and `gpt-6.1-sol`. Official model
references confirm Luna low/medium and Sol medium reasoning support and
structured outputs. Both support Chat Completions, which the current draft-only
adapter uses without tools. Luna function calling at non-none reasoning and Sol
tool calling require Responses; this does not authorize adding tools to the model
cohort. Sources: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
and [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

This was a documentation check, not an inference test or funding/access proof.
No representative versioned corpus was found in the Runbook test/design paths.
Next, freeze a synthetic corpus covering sufficient, missing, contradictory and
instruction-injected evidence, with expected schema/source/authority outcomes;
then record bounded provider runs and application acceptance results for all
three model/effort configurations. Keep the model gate open until that evidence
exists. No API requests or production flags were changed by this preflight.

## Final evidence and promotion limits — 2026-11-19

Final source: `ae1ac01a2c285ac10b09404cffe3db67fbaaa034`. See
Documents/verification/WED-382-review.md and WED-382-semantic-review.json for
review scope, WED-382-model-evidence.json and WED-382-application-model-evidence.json
for actual provider/application results, WED-382-sandbox-evidence.json for the
independent effect journal, and WED-382-release-evidence.json for build/test and
Oracle deployment evidence. Historical preflight notes above are superseded by
these final-candidate results, not relabelled as final-source proof.

The 36 comparison outputs were structurally accepted; 12 drafts met expectations.
One conservative non-draft expectation deviation and earlier classification
instability are recorded. Only Luna-medium private drafts are accepted. The
12 tool scenarios produced exactly 6 journaled effects and denied real expiry.
External-provider interoperability, broad production activation, reversible
actions and UI execution remain separate unapproved promotion decisions.

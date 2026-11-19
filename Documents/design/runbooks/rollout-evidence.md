# WED-375 rollout evidence gates

These are acceptance requirements, not a claim that any cohort or deployment
has passed. All execution entrypoints remain disconnected. A successful local
review, model response or sandbox request does not enable production actions.

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

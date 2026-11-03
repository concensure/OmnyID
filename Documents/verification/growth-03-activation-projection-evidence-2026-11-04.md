# GROWTH-03 activation-projection evidence

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Branch: `agent/codex/GROWTH-001`
- Feature commit: `4c330a693b7ceae8afcf4c8f46d708e42385b714`
- Definition: `activation-v1`
- Production state: not deployed

## Implemented boundary

- Exact subtype plus content-kind checks admit only saved intake, meaningful budget decision,
  selected vendor follow-up and durable decision resolution. Login, home load, generated/unsaved
  output and partner-invite acceptance do not qualify.
- A server-side cursor reads the existing private tenant AFP ledger in timestamp/ID order. Source
  event uniqueness makes exact replay and onboarding reconciliation idempotent.
- The projection creates one tenant-scoped Wedding and one first activation. Each qualifying source
  adds one meaningful action to its Wedding's Australia/Sydney calendar day, even where the source
  emits both `budget_saved` and `decision_resolved` event types.
- Stored fields are limited to owner/Wedding scope, source ID, event name, timestamp, definition
  version and counts. No budget amount, vendor detail, decision text, message or profile value is
  copied into Growth tables.

## Evidence

- Three pure classifier tests passed for exact qualifying actions and fail-closed generated,
  partner-acceptance, subtype/content mismatch and invalid-plan inputs.
- A disposable tmpfs pgvector test applied all 139 migrations and proved: two qualifying sources
  created three typed events but two daily actions; cursor rewind added no duplicates; a source
  deleted before projection added nothing; partner-labelled activity in the unified ledger counted;
  and an unauthorised second tenant with the same plan label created no Wedding.
- The complete focused Growth set passed 16 tests. Migration-catalog parity, `cargo check --lib`
  and the two file-line-budget tests passed. New files are below 999 lines and the disposable
  container was removed.

## Release boundary

This schema and server path are committed but not deployed. Production activation metrics must not
be reported until a clean exact-SHA release applies migration 0139 and hosted shadow reconciliation
matches authorised AFP source counts.

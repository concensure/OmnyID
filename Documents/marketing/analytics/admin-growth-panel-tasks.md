# Admin Growth Analytics — Dependency-Ordered Tasks

Companion: `admin-growth-panel-spec.md`
Recommended branch: `agent/codex/GROWTH-001`
Recommended worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
Frozen implementation base: `8291a0c59be5217c49871db3c8f04cb68401b8d4` (the completed WED-329
Countdown handoff, which includes the WED-328 Growth plan)

Create one task per row in `.agent/TASKS.yaml` before implementation. Freeze the full
post-Batch-2 handoff SHA as the base. Do not use the dirty primary checkout.

## Dependency graph

```text
GROWTH-00 audit/definitions
  ├─ GROWTH-01 ingest idempotency
  ├─ GROWTH-02 identity/attribution
  ├─ GROWTH-03 AFP activation projection
  └─ GROWTH-04 payment projection
       └──────────────┐
GROWTH-05 spend import│
       └──────────────┴─ GROWTH-06 KPI/cohort engine
                            ├─ GROWTH-07 admin API
                            ├─ GROWTH-08 dashboard
                            └─ GROWTH-09 quality/export
                                  └─ GROWTH-10 shadow/release
GROWTH-11 Meta API is optional after GROWTH-10
```

## P0 — Reliable measurement foundation

### GROWTH-00 — Freeze contracts and evidence

Depends on: none

- Register the programme and file scopes in `.agent/TASKS.yaml`.
- Record the exact base SHA/worktree.
- Audit current event names, AFP source subtypes, canonical Wedding ID, partner grants,
  auth events and Stripe event shapes in executable fixtures.
- Write `growth-events.v1` and `growth-kpis.v1` definitions.
- Decide APP/OAIC retention and the consent basis for a 30-day browser attribution ID.
- Mark historic acquisition as unavailable where it cannot be reconstructed.

Acceptance:

- Every canonical event maps to a real source or is explicitly absent.
- Activation v1 has an exact allowlist and excludes page loads/unsaved AI output.
- Primary unit is a distinct Wedding plan; partner joins cannot increment acquisition.
- No private Wedding field appears in the event schema.

### GROWTH-01 — Make public measurement replay-safe

Depends on: GROWTH-00

- Add a stable bounded client event ID and schema version to `/wedding/e`.
- Persist the supplied ID with unique `(visit_id, event_id)` semantics.
- Preserve batch retry and `sendBeacon` behaviour.
- Add retention for raw sessions/events and a batched cleanup path.
- Keep GPC/DNT and known-bot suppression.
- Extend first-party capture to approved public root pages only where the metadata and
  privacy contract applies; do not add third-party trackers.

Acceptance:

- Exact replay stores one event.
- A new event in the same visit stores once.
- Unknown props, PII-like props, invalid paths and oversized batches are dropped.
- Root and Wedding capture do not create two visits during one same-origin transition.

### GROWTH-02 — Consent-aware attribution and Wedding identity

Depends on: GROWTH-00, GROWTH-01

- Add acquisition touch and identity-link migrations.
- Support same-session attribution immediately.
- Add a 30-day first-party identifier only behind the approved consent state.
- Carry only an opaque visit/acquisition reference into registration.
- Resolve campaign fields server-side and link the new user to the canonical Wedding
  after Wedding creation.
- Implement first-touch and last-non-direct-touch pure functions.
- Record partner acceptance as engagement, never acquisition.

Acceptance:

- Paid visit → direct return → registration preserves both documented models.
- Direct never overwrites last non-direct.
- Unknown is not classified as Instagram organic.
- GPC/DNT/opt-out creates no cross-session identity link.
- Swapping a visit or Wedding ID across tenants fails closed.

### GROWTH-03 — Project activation and meaningful activity from AFP

Depends on: GROWTH-00, GROWTH-02

- Add a cursor-based projector from exact approved AFP source kinds.
- Map saved plan, meaningful budget save, vendor save and decision resolution.
- Store source IDs and counts only; exclude values/content.
- Create one `wedding_created`, one first activation and one meaningful-activity row per
  Wedding/calendar day where appropriate.
- Version activation definition and effective dates.

Acceptance:

- Login/home load does not activate.
- Unsaved/generated output does not activate.
- Duplicate source message does not activate twice.
- Either partner can create later meaningful activity for the same Wedding.
- Cross-tenant or deleted source references do not project.

### GROWTH-04 — Payment and refund reconciliation

Depends on: GROWTH-00, GROWTH-02

- Project signed, accepted `billing_events` into growth-safe success/refund rows.
- Resolve actual configured product/price and tax/refund facts; no A$39 hardcode.
- Identify first qualifying purchase per Wedding and 30-day maturity.
- Reconcile duplicate Stripe webhook IDs and reversals.
- Add configurable payment/service variable costs with revision history.

Acceptance:

- Checkout start is not revenue.
- Duplicate success counts once.
- Refund adjusts net revenue and paid state under the documented rule.
- Test-mode transactions remain excluded.
- Missing cost inputs produce `profitability incomplete`, not an estimate.

### GROWTH-05 — Manual spend and Meta CSV import

Depends on: GROWTH-00

- Add spend import/row/adjustment/audit migrations.
- Build bounded upload, mapping preview, validation and commit endpoints.
- Support date/platform/account/campaign/ad-set/creative/placement/spend/currency,
  impressions, clicks and platform LPV where present.
- Preserve source currency plus reviewed AUD conversion metadata.
- Detect aggregation grain and prevent mixed-grain double counting.
- Add manual row entry and append-only correction.

Acceptance:

- Importing the same file twice does not double spend.
- Formula-like cells are safe in preview/export.
- Unsupported/missing IDs stay at the available grain.
- Mixed total/detail rows require an explicit non-double-counting choice.
- Every correction identifies operator, time and reason.

### GROWTH-06 — KPI, cohort and rollup engine

Depends on: GROWTH-02, GROWTH-03, GROWTH-04, GROWTH-05

- Implement pure, unit-tested KPI definitions.
- Add Sydney-time date boundaries including DST transitions.
- Build incremental daily rollups and rebuild/checkpoint command.
- Calculate current/previous periods, maturity and completeness.
- Add weekly signup cohorts and days 1–7 return.
- Keep Meta-reported and first-party LPV separate.

Acceptance:

- A$200 / 100 sessions = A$2 per visit.
- A$200 / 10 activated Weddings = A$20 per activation.
- Zero denominator and zero activations return typed unavailable states.
- Immature 7/30-day cohorts are provisional/excluded.
- Partner joins and duplicate events cannot change acquisition counts.
- Rollup rebuild and incremental output match exactly.

## P1 — Admin analytics interface

### GROWTH-07 — Server-enforced admin API

Depends on: GROWTH-06

- Add Growth routes under the existing authenticated operator router.
- Reuse `operator_access_allowed`; do not rely on hidden navigation.
- Provide overview, campaign, cohort, benchmark, quality and CSV export endpoints.
- Use server pagination/filtering and bounded date ranges.
- Audit imports, exports and benchmark changes.

Acceptance:

- Anonymous, ordinary and cross-account users receive 401/403.
- Responses contain definitions, numerators, denominators and completeness.
- Raw AFP/private Wedding content is never returned.
- Export output includes definition version and filters.

### GROWTH-08 — Growth dashboard in existing Usage admin

Depends on: GROWTH-07

- Add `Admin → Growth → Campaign analytics` to the existing operator shell.
- Implement Executive, Campaign, Cohort, Benchmarks and Data quality views.
- Use existing cards, tables, filters and status components; use A2UI descriptions where
  useful without moving calculations client-side.
- Add daily/weekly/monthly, source, paid/organic, campaign, landing page, lead magnet,
  attribution model and cohort filters.
- Provide table alternatives for charts and mobile stacking.

Acceptance:

- KPI cards expose result, numerator/denominator, comparison, target and tooltip.
- Unknown and incomplete are not rendered as zero.
- Campaign drilldown does not download raw event history.
- Keyboard, screen-reader and 375px flows pass.
- Refresh/filter changes preserve focus and route state.

### GROWTH-09 — Benchmarks, diagnostics and export

Depends on: GROWTH-07, GROWTH-08

- Add revisioned operator targets and historical baseline selection.
- Add sample-size/maturity warnings and optional intervals where valid.
- Show ingestion/import/aggregation freshness, duplicate discards, unmatched spend,
  unattributed percentage, bot/test exclusions and payment discrepancies.
- Export filtered campaign/cohort reports with definitions.

Acceptance:

- No fabricated benchmark ships.
- Small samples cannot display an unqualified success verdict.
- Meta/first-party discrepancies remain separate.
- Export is formula-safe and admin audited.

## Release and optional work

### GROWTH-10 — Disposable end-to-end, shadow and release

Depends on: GROWTH-09

- Extend the disposable Postgres + real router + browser harness.
- Seed Instagram paid, direct return, registration, partner join, activation, later-day
  return, payment, refund and duplicate import fixtures through real routes.
- Compare API/UI totals to authorised SQL source records.
- Run false-default hosted shadow and inspect no-content analytics properties.
- Complete privacy/security/accessibility review.
- Build and deploy only from a clean exact-SHA release checkout.

Acceptance:

- All acceptance scenarios from the source prompt pass.
- Hosted source SHA and runtime manifest match.
- Non-admin access fails on hosted environment.
- Dashboard totals reconcile; known unavailable history stays unknown.
- Rollback disables the panel without deleting source records.

### GROWTH-11 — Optional read-only Meta API

Depends on: GROWTH-10

- Add only after manual import works reliably.
- Keep credentials server-side and least-privilege.
- Show connection and last-sync status.
- Reuse the same spend rows, grain checks and audit trail.

This task must not block the core dashboard.

## Required checks per slice

- Focused Rust unit tests and `cargo check --lib`.
- Disposable Postgres migration/route/projection tests.
- SolidJS state/component tests, typecheck and production build.
- Wedding/public measurement smoke tests.
- Accessibility browser tests at desktop and 375px.
- File line budget: every new file below 999 lines.
- `git diff --check` and clean exact-SHA release proof.

## Human actions that may genuinely remain

- Approve the consent/retention wording and APP/OAIC assessment before 30-day linking.
- Supply or authorise a Meta read credential only for optional GROWTH-11.
- Enter business targets and cost assumptions; the agent must not invent them.

Everything else in P0/P1 is autonomous implementation and testing work.

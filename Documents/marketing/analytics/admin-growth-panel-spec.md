# OmnyID Admin Growth Analytics — Implementation Specification

Status: Proposed for implementation
Source brief: `admin growth panel prompt.md` in the primary project checkout
Target: existing authenticated OmnyID admin workspace
Primary customer unit: one distinct Wedding plan/workspace, not one login

## 1. Outcome

Give an authorised OmnyID operator a reliable answer to:

1. What did a qualifying landing visit cost?
2. What fraction of eligible visits became a newly registered Wedding plan?
3. What fraction of registered Wedding plans activated within seven days?
4. What did each activated Wedding plan cost?
5. What fraction returned for meaningful planning on a later day in days 1–7?
6. What fraction paid, at what acquisition cost and with what defensible margin?

The panel is a deterministic reporting projection. Routine capture, attribution,
aggregation, filtering and KPI calculations do not call an LLM.

## 2. Recommended implementation setup

- Primary agent: Codex implementation agent using GPT-6 Astra at high reasoning.
- Review: Claude for architecture/privacy review, then Codex adversarial tests.
- Branch: `agent/codex/GROWTH-001`.
- Isolated worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`.
- Base: the final clean WED-328 commit after its tests and handoff are committed.
- Do not build in the dirty primary checkout and do not transplant another worktree wholesale.
- Freeze the full 40-character base SHA in `.agent/TASKS.yaml` before coding.

Why this agent: the work is mainly Rust/Postgres identity reconciliation, privacy-safe
event projection, deterministic financial calculations and integration tests, with a
bounded SolidJS admin surface. It benefits more from implementation and adversarial
reasoning than presentation-only generation.

## 3. Repository audit

| Requirement | Existing implementation | Reuse | Missing work |
| --- | --- | --- | --- |
| Landing tracking | `wedding/assets/js/measure.js`, `POST /wedding/e`, migration `0132_wedding_site_measurement.sql` | Yes | Stable client event IDs, replay idempotency, consent-aware persistent attribution and root-site coverage |
| Campaign capture | Five UTM fields, referrer class/host, intent, landing path and click-ID-presence boolean | Yes | First-touch/last-non-direct models, 30-day consented lookback, campaign/ad-set/creative identifiers and visit-to-registration link |
| Registration | Real `/auth/register`; source affects verification experience | Yes | Server-authoritative `registration_completed` projection and acquisition linkage; source is not attribution today |
| Verification | Real auth token flow and `users.email_verified` | Yes | Idempotent `email_verified` growth event |
| Wedding identity | Wedding plan/workspace IDs already appear in Wedding AFP metadata | Yes | One canonical acquired-Wedding identity projection, partner membership reconciliation and duplicate-account rules |
| Activation | Persisted budget, vendor, task, decision and plan AFP records exist | Yes | Versioned eligible-action map and one first-activation projection per Wedding plan |
| Retention | AFP records have authoritative timestamps | Yes | Subsequent-calendar-day meaningful-activity projection and mature cohort calculations |
| Payment | `billing_subscriptions`, idempotent `billing_events`, signed Stripe webhook handling | Yes | Growth-safe payment/refund projection, first-purchase cohort logic, net revenue and cost configuration |
| Advertising spend | None | No | Manual entry, Meta CSV preview/import, correction audit and consistent-grain controls |
| Admin access | Existing authenticated Usage operator surface and server-side `operator_access_allowed` | Yes | Growth route, read/export endpoints, finer audit records and an explicit Growth navigation item |
| Current analytics | `/admin/wedding/site-stats` returns event and channel counts | Partial | Funnel, campaign, cohort, benchmark, quality, KPI and maturity views |
| Privacy | GPC/DNT suppression, allowlisted event/props, cookie-free session visit ID | Yes | Consent decision for 30-day linkage, deletion/retention rules and export controls |
| Batch 2 measurement | Counts-only profile import events are allowlisted | Yes | Map as product engagement diagnostics, never as Wedding facts |

Important defects to address before KPI use:

- `record_wedding_site_events` creates a new server ULID for every received event, so a
  replayed beacon can double count.
- `wedding_site_sessions` stores first touch for one tab visit, but no authorised link
  joins it to registration or a Wedding plan.
- Returning direct visits cannot support a truthful 30-day first-touch model while the
  identifier remains session-storage-only.
- `wedding_binder_submitted` is not proof that a PDF was downloaded.
- Account creation, verification, activation, retention and payment are not one funnel.
- Historic visitor attribution cannot be reconstructed where it was never recorded.

## 4. Architecture

### 4.1 Authorities

- AFP remains authoritative for persisted Wedding planning actions.
- Auth tables remain authoritative for account registration and verification.
- Wedding membership/metadata remains authoritative for the distinct Wedding plan.
- Stripe `billing_events` remains authoritative for accepted payment-provider events.
- `wedding_site_sessions/events` remains the first-party public-site measurement input.
- Growth tables are rebuildable, privacy-minimised reporting projections and operator
  configuration, not a second copy of private Wedding content.
- Spend imports are authoritative only for the exact source rows and grain an operator
  reviewed and committed.

### 4.2 Proposed modules

- `src/growth_analytics/definitions.rs`: versioned event and KPI definitions.
- `src/growth_analytics/attribution.rs`: pure first/last-touch calculations.
- `src/growth_analytics/cohorts.rs`: activation, maturity and return windows.
- `src/growth_analytics/kpis.rs`: zero-safe money/rate calculations.
- `src/db/growth_analytics.rs`: bounded queries and projections.
- `src/server/growth_admin_routes.rs`: server-enforced admin read/import/export routes.
- `solid-ui/src/lib/growthAnalyticsApi.ts`: strict response normalisation.
- `solid-ui/src/lib/growthAnalyticsState.ts`: display-ready deterministic state.
- `solid-ui/src/components/admin-growth/`: focused views below 999 lines each.

Integrate the UI into the existing Usage/operator workspace as
`Admin → Growth → Campaign analytics`. A shareable internal URL may use
`/workspace/?view=usage&admin=growth`; it must not create a second admin shell.

### 4.3 Data model

Use additive migrations after current migration `0136`.

`growth_event_projection`

- `event_id`, `schema_version`, `event_type`, `occurred_at`.
- nullable `visit_id`, `user_id`, `wedding_id`, `attribution_id`.
- `source_kind`, `source_id`, unique `(source_kind, source_id, event_type)`.
- allowlisted JSON metadata only; no names, emails, Wedding facts or money amounts
  belonging to the couple.

`growth_acquisition_touch`

- opaque touch ID, eligible visit ID, occurred time, landing path.
- source, medium, campaign, content and term.
- optional bounded platform campaign/ad-set/creative IDs.
- touch class (`paid`, `organic`, `search`, `direct`, `referral`, `unknown`).
- consent basis and expiry; never store raw click IDs.

`growth_identity_link`

- visit/acquisition ID to user and canonical Wedding ID.
- link reason, timestamp, consent basis and revocation/deletion state.
- unique constraints prevent one event from acquiring the same Wedding twice.

`growth_activation_definition`

- version, effective period and allowlisted source event mappings.
- initial v1 eligible actions: first saved plan, meaningful budget save, vendor save,
  decision resolution or another explicitly reviewed persisted planning output.
- page loads, login, unsaved AI output, background synthesis and partner acceptance do
  not activate a Wedding.

`growth_spend_import`, `growth_spend_row`, `growth_spend_adjustment`

- immutable import receipt plus validated rows.
- date, platform, account, campaign/ad-set/creative IDs and names, placement.
- spend, source currency, AUD conversion value/source/date.
- impressions, clicks and platform landing views when supplied.
- source row digest and a declared aggregation grain.
- corrections append an adjustment; they do not mutate the original row.

`growth_benchmark_revision`

- KPI key, scope, value, unit, direction, source/rationale and effective dates.
- revision history and operator ID.
- no fabricated default industry benchmarks.

`growth_daily_rollup`

- date in Australia/Sydney, dimensions, mature/provisional counts and financial sums.
- rebuilt incrementally from the projection; admin page reads rollups, not raw AFP.

### 4.4 Event compatibility map

| Canonical growth event | Current source | Implementation rule |
| --- | --- | --- |
| `landing_page_view` | `wedding_landing_view` | Map compatibly; dedupe by stable client event ID/session |
| `quiz_started` / `quiz_completed` | Existing same-name public events | Retain; no answer values |
| `binder_downloaded` | No authoritative event | Record only after a successful download response, not form submit |
| `registration_completed` | Successful new-user insert | Append server-side once; existing-account response is excluded |
| `email_verified` | Successful token verification | Append server-side once |
| `wedding_created` | First canonical Wedding plan/workspace | Project once per Wedding, not per partner |
| `wedding_plan_saved` | Confirmed Wedding AFP profile/plan | Map source message ID idempotently |
| `budget_saved` | Meaningful persisted budget AFP event | Count the action, never the amount |
| `vendor_saved` | Favourite/shortlist AFP transition | Count only durable save, not search result display |
| `decision_resolved` | Durable decision resolution AFP event | Count once per decision version/outcome |
| `meaningful_activity` | Derived eligible actions | One Wedding/day rollup; source references stay internal |
| `payment_succeeded` | Signed, accepted Stripe event | Use successful transaction, not checkout start |
| `payment_refunded` | Signed refund/reversal event | Reconcile revenue and conversion state explicitly |

Partner invitation/acceptance is engagement, not another acquired Wedding.

### 4.5 Attribution

Support two separately labelled models:

- First touch: earliest eligible non-expired marketing touch before registration.
- Last non-direct touch: latest eligible non-direct touch before registration.

Default click lookback is 30 days. Do not silently introduce a 30-day browser ID.
The current session-only visit can support same-session attribution. A cross-session
lookback requires explicit first-party analytics consent and a random, expiring local
identifier. With GPC/DNT, opt-out or missing consent, retain aggregate session counts
but do not link anonymous history to the registered account.

At registration, the browser may submit only an opaque visit/acquisition reference.
The server resolves campaign fields from its stored session and binds them after the
new user and canonical Wedding identity exist. It must not trust UTM fields supplied
directly as proof of attribution.

Direct traffic does not overwrite first touch or last non-direct touch. Unknown stays
unknown. Meta-reported attribution and OmnyID first-party attribution remain separate.

### 4.6 KPI definitions

Every API result includes definition version, timezone, attribution model, report
window, numerator, denominator, maturity and completeness.

- Cost/LPV = matched paid spend / deduplicated eligible first-party landing sessions.
- Signup rate = newly acquired Wedding registrations / eligible landing sessions.
- Activation rate = Weddings with first v1 activation within seven days / mature new
  registered Weddings.
- Cost/activated Wedding = matched spend / distinct activated acquired Weddings.
- Seven-day return = activated Weddings with meaningful activity on a later Sydney
  calendar day in days 1–7 / mature eligible activated Weddings.
- Signup-to-paid and activated-to-paid use successful first purchase within 30 days.
- Paid CAC = matched spend / distinct newly acquired paying Weddings.

Organic cost values are `N/A`. Zero activations show `No activations`. Immature cohorts
are provisional or excluded from final rates. Never label a days 1–7 return window as
strict Day-7 retention.

Revenue reports use gross success minus refunds and taxes where data exists. Margin is
unknown until operator-configured payment and service costs are complete.

### 4.7 Spend import

Phase 1 is mandatory:

1. Upload a CSV to a bounded server endpoint.
2. Parse without spreadsheet execution.
3. Show field mapping, currency, row grain and validation errors.
4. Escape cells beginning `=`, `+`, `-` or `@` in exports.
5. Commit with an idempotency digest.
6. Append corrections with operator/time/reason.

Reject imports that mix campaign, ad-set and ad totals in a way that double counts.
Keep incomplete rows at their supported grain. Phase 2 Meta API access is optional and
must not delay P0/P1.

## 5. Admin experience

### Executive overview

- Six KPI cards with result, numerator/denominator, previous period, change, target,
  completeness and definition tooltip.
- Funnel: sessions → registered Weddings → activated → returned → paid.
- Unknown and provisional states are visible, never converted to zero.

### Campaign comparison

- Server-paginated sortable table at the available campaign grain.
- Source, spend, visits, cost/visit, signups, activation, return, purchase, CAC/revenue.
- Separate lead-magnet segments for Quiz, Binder and planning tools where events exist.

### Cohorts

- Weekly Sydney-time signup cohorts with maturity.
- Activation, later-day return and 30-day payment conversion.
- Optional Day-1/strict Day-7/Day-30 only when definitions and data support them.

### Benchmarks

- Historical baseline, comparable previous period and operator-entered targets.
- Direction, sample size, maturity and optional uncertainty interval.

### Data quality

- Latest ingestion/import/aggregation times.
- Unattributed percentage, duplicate events discarded, unmatched spend, immature
  cohorts, payment reconciliation, bot/test exclusions and consent restrictions.
- Meta/first-party discrepancies are side-by-side, not merged.

All five views are mobile-readable, keyboard operable and use existing OmnyID admin
components. Charts have tabular equivalents. A2UI may describe cards/tables/actions,
but calculations and access checks remain server-side.

## 6. Privacy and security

- Server checks authenticated operator allowlisting on every growth route.
- CSV import/export and benchmark mutations create operator audit records.
- No email, name, guest identity, allergies, preferences, messages, quotes, contract
  content or Wedding budget amount enters growth event metadata.
- Account deletion severs user/Wedding identity links according to the documented
  retention policy while retaining only legally justified de-identified aggregates.
- Raw public measurement retention remains bounded; rollups outlive raw rows only when
  they cannot identify a person or Wedding.
- Internal/test traffic uses an explicit exclusion flag/rule, not heuristic deletion.
- Third-party pixels and Meta CAPI are out of scope until consent and APP/OAIC review.
- CSV size, row count, encoding, formula injection and decompression limits fail closed.
- Report exports require operator permission and record filters/definition versions.

## 7. Performance

- Incrementally project source events using unique source IDs and cursors.
- Aggregate daily in Australia/Sydney while storing canonical timestamps in UTC.
- Use indexed dimensions and rollups for dashboard reads.
- Never download raw AFP history to the browser.
- Backfill only verifiable registration, AFP and billing facts. Historic acquisition
  remains unknown when no eligible touch was recorded.

## 8. Rollout

- False-default `OMNYID_GROWTH_ANALYTICS_ENABLED` gates UI and admin APIs.
- Event hardening and source projections can run dark before UI activation.
- Manual spend import ships before optional Meta API integration.
- Shadow results must reconcile with SQL fixtures and a small operator-reviewed sample.
- Release evidence binds migration, definitions, tests and hosted commit SHA.

## 9. Definition of done

An authorised operator can import Meta spend, select a campaign and attribution model,
and see mature, explainable visit, registration, activation, return and paid outcomes.
Every number exposes its numerator, denominator, maturity and definition. Duplicate
events/imports do not change totals. A non-admin cannot read or export any result. No
private Wedding content is present in the analytical projection.

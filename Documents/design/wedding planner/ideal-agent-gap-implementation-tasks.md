# Ideal wedding agent gap implementation tasks

Status: implementation plan

Planning task: WED-229

Target programme: WED-230 through WED-240

Base branch: `agent/codex/WED-215`

Implementation base: the reviewed WED-215 branch after WED-228 zoom/reflow hardening. Do not
develop from, merge, or copy the WED-187 worktree wholesale.

Recommended implementation model: `gpt-6-astra` with high reasoning. This programme crosses AFP
contracts, privacy boundaries, deterministic replay, graph evaluation, Rust services and A2UI, so
the flagship complex-reasoning/coding model is the best fit. The recommendation is based on the
[current official OpenAI model guidance](https://developers.openai.com/api/docs/models); confirm
workspace availability before starting each slice. Use the current `agent/codex/WED-215` advanced
worktree only until its review is complete, then branch each implementation slice from the reviewed
commit identified in the dependency table below.

Source briefs reviewed in full:

- `ideal agent features.md` in the WED-187 wedding-planner design folder
- `ideal agent features - gap analysis.md` in the same folder

This document is intentionally stored at the equivalent path in the advanced isolated worktree.
The two WED-187 files are design inputs, not an implementation base.

## 1. Objective

Close the gap between today's deterministic wedding-planning builders and an agent that can:

1. remember a user's exact, durable constraints;
2. evaluate new evidence against those constraints;
3. explain budget and timing trade-offs using the user's priorities;
4. identify critical-path work before it becomes urgent;
5. interpret vendor change messages into bounded decision options; and
6. offer one approval-safe intervention through existing DecisionOS/A2UI surfaces.

The result must be a reusable planning-intelligence layer. Wedding is the first adapter, not a
parallel subsystem. A future event, renovation, travel, or procurement template should be able to
reuse the same constraint, dependency, cost-trade-off, and intervention contracts.

## 2. Current baseline and delta from the WED-187 analysis

The source gap analysis remains accurate about missing semantic joins. Several foundations have
advanced since it was written and must be consumed rather than recreated.

| Area | Current WED-215 foundation | Remaining gap |
| --- | --- | --- |
| Preferences | Bounded server interpreter, versioned facet vocabulary, hard-constraint and trade-off output, result-only import, user-confirmed profiles, immutable feedback signals | General remarks are not durable typed constraints and are not evaluated against quote/change evidence |
| Quotations | Generic source ingestion, exact anchors, revisions, comparison, review, decision, closure, attachment policy and existing OCR/parser boundaries | Quote rationale does not join constraint memory, cross-category priorities, or milestone urgency |
| Vendor responses | Claimed AFP, secure-link portal, upload, Gmail/federation convergence and canonical review-only response contract | A non-quote change message is not classified into affected object, replacement options and urgency |
| Decision surfaces | Shared Decision Card, DecisionOS projection and A2UI closure adapter | Upstream does not yet emit a recommended option with constraint, cost and timing evidence |
| Budget | Committed/estimated/paid totals, forecast range, unknown buffers, scenarios and payment-review tasks | Forecast drivers are not named by category and no priority-weighted offset proposal exists |
| Timeline | Lead-time windows, Gantt rows, final-phase coordination and due-date pressure | No milestone dependency graph, slack computation or critical-path projection exists |
| Relationship state | Guest, seating, dietary/accessibility, collaboration and knowledge-graph builders | Guest/person requirements are not checked against vendor or venue capabilities |
| Preference conflict | Deterministic partner-conflict builder and AFP projection exist | The builder still has no production surface owner |
| Outreach | Draft-only, explicit approval, deterministic receipts and retry lineage | No constraint-conflict vendor ask is generated from a decision evaluation |

WED-215 and WED-227 are mandatory dependencies. Do not add a second quotation normaliser, OCR
service, vendor response portal, comparison card, email transport, approval framework, knowledge
graph, task system, or agent UI.

## 3. Non-negotiable architecture principles

### 3.1 AFP remains the durable source of truth

- Every remembered constraint, supersession, evaluation and intervention is append-only.
- A projection may be rebuilt from AFP messages in shuffled order with duplicate delivery.
- Logical retry identity is deterministic; retries do not create a second remembered fact.
- Corrections and removals are successors, never in-place history edits.
- Current state selects the latest valid successor while retaining provenance.

### 3.2 Extraction is not authority

- Deterministic parsing handles known structured fields first.
- The existing metered LLM ladder may propose closed-vocabulary records only.
- Every extracted claim needs an exact source anchor and source reference.
- A model cannot silently promote a remark to a hard constraint or invent a person relationship.
- User-authored explicit language may be saved directly with user authority; ambiguous model
  interpretations require confirmation.

### 3.3 The planning core is template-neutral

Core contracts should use `planning.*`, `decision.*`, or existing `quotation.*` namespaces.
Wedding-specific adapters may supply vocabulary, labels, category rules and presentation metadata.
They must not copy core state or create a wedding-only truth store.

### 3.4 Consequential actions remain approval gated

- An intervention is a proposal until the user approves it.
- Vendor communication reuses existing outreach/clarification and response contracts.
- Nothing in this programme books, pays, signs, accepts commercial terms, or infers consent.
- A remembered preference may change ranking or surface a warning; it cannot send a message.

### 3.5 Vendor context is least privilege

With explicit user permission, a vendor may receive only the minimum decision-relevant projection:
the selected requirement, approved question, relevant date/count/range, and bounded option context.
The projection must be purpose-bound, expiring, revocable and version-bound. It must reject:

- competitor identities, quotes, scores or relative rank;
- private notes, relationship conflicts or unselected preferences;
- the full plan, graph, budget or guest list;
- raw source conversations where a bounded requirement is sufficient; and
- inferred sensitive attributes or hidden model reasoning.

### 3.6 File and UI boundaries

- Every new source or document file stays at 999 physical lines or fewer.
- Existing files already above 999 lines stay line-neutral or shrink through extraction.
- Use existing Decision Cards and A2UI components before creating a new renderer.
- New visual primitives require a demonstrated schema gap and accessibility tests.

## 4. Proposed generic contracts

Exact JSON schemas are frozen in WED-230 before persistence. The following fields define the
minimum design direction and may be narrowed during review.

### 4.1 `planning.constraint.v1`

```text
constraint_id                 stable logical identity
template_id                   wedding or another template adapter
plan_id                       tenant-private plan reference
subject_ref                   plan, person, event, object, vendor category, or selected option
kind                          closed vocabulary identifier
operator                      requires, excludes, prefers, limits, separates, or relates
value                         typed scalar, range, enum, reference, or bounded list
strength                      hard, strong, or nice
authority                     user, deterministic, confirmed_interpretation, or imported
privacy                       couple_private, plan_private, or shareable_with_approval
source_ref                    immutable AFP/source reference
source_anchor                 exact user/vendor wording excerpt
observed_at                   when the statement was made
effective_window              optional start/end
status                        proposed, confirmed, superseded, removed
supersedes                    prior logical record when applicable
```

The core schema stores typed values, not arbitrary interpretation prose. Wedding vocabularies map
examples such as maximum centrepiece height, step-free access, speech duration, venue co-location,
dietary need and seating separation onto versioned kinds.

### 4.2 `planning.constraint_evaluation.v1`

```text
evaluation_id                 deterministic constraint + candidate + evidence revision identity
constraint_ref                exact active constraint
candidate_ref                 quote option, venue, vendor response, milestone, or decision option
result                        satisfied, conflict, unknown, or not_applicable
severity                      blocking, decision_relevant, or informational
constraint_evidence_ref       remembered statement source
candidate_evidence_ref        exact quote/vendor/directory source
explanation_code              closed deterministic reason
evaluated_at                  projection time
```

Only explicit evidence may produce `satisfied` or `conflict`. Missing evidence produces `unknown`,
never a negative inference.

### 4.3 `planning.cost_tradeoff.v1`

```text
candidate_decision_ref        proposed choice and revision
incremental_cost              exact amount/currency or unknown
forecast_before/after         ranges with source inputs
offset_options                bounded alternatives with category, saving range and evidence refs
priority_impact               stated priority preserved, improved, reduced, or unknown
unknown_cost_drivers          uncontracted categories/items named from actual plan state
assumptions                   machine-readable bounded assumption codes
```

An offset is advice, not an automatic budget edit. It must never claim savings unsupported by a
current quote, package, category allowance or conservative range.

### 4.4 `planning.milestone_dependency.v1`

```text
milestone_id                  stable template-neutral milestone identity
depends_on                    predecessor milestone ids
duration_or_lead_time         bounded duration/range with evidence source
earliest/latest dates         derived from wedding/event date and dependency graph
slack_days                    deterministic computation or unknown
state                         not_started, active, blocked, complete, waived
blocking_refs                 tasks, decisions, people, vendor evidence or counts
prepared_next_action          internal research/compare/draft proposal only
```

Cycles, missing dates and ambiguous completion fail closed. A node is critical only when the graph
and dates support the label; ordinary urgency must not be presented as critical-path evidence.

### 4.5 `quotation.vendor_change.v1`

```text
response_ref                  canonical WED-220 response/revision source
affected_object_ref           existing plan object or explicit unresolved label
change_kind                   unavailable, substituted, price_changed, timing_changed, scope_changed
original_term                 exact source-anchored term
replacement_options           bounded source-anchored options
cost_delta                    exact amount/currency or unknown
deadline                      exact date or unknown
requires_user_decision        boolean
```

It is review-only. It does not mutate the quotation or plan until the user accepts a separately
presented decision and the existing successor path records the change.

### 4.6 `decision.intervention.v1`

An intervention joins one decision with constraint, cost, dependency and vendor-change evidence.
It contains a neutral option list, at most one recommended option when evidence supports it,
reason codes, unknowns, consequence summary and one prepared next action. It projects through the
existing Decision Card and A2UI schemas.

## 5. Dependency order

```text
WED-230 contract and current-state audit
  |
  +--> WED-231 typed constraint ledger
  |      +--> WED-232 bounded capture and confirmation
  |              +--> WED-233 constraint and relationship evaluation
  |                      +--> WED-234 constraint-conflict interventions
  |
  +--> WED-235 priority-weighted cost trade-offs
  |
  +--> WED-236 milestone dependency and critical path
  |
  +--> WED-237 vendor change interpretation
  |
  +--> WED-238 preference-conflict surface owner

WED-234 + WED-235 + WED-236 + WED-237 + WED-238
  --> WED-239 unified intervention Decision Card/A2UI projection
  --> WED-240 evaluation, security review and staged rollout
```

Tasks may proceed in parallel only when their file scopes do not overlap and WED-230 schemas are
frozen. Integration into WED-239 waits for each producer's deterministic replay contract.

## 6. Detailed task slices

## WED-230 - Freeze reusable planning-intelligence contracts

### Scope

- audit current AFP message conventions, reference semantics and A2UI/Decision Card slots;
- reconcile preference interpreter output with saved AFP profile records;
- define schemas and fixtures for constraint, evaluation, trade-off, dependency, vendor change and
  intervention records;
- define stable IDs, successor rules, privacy classes and exact allowed references; and
- prove a non-wedding fixture can consume the generic contracts.

### Likely files

- `schemas/planning-constraint.v1.json`
- `schemas/planning-intervention.v1.json`
- `src/planning_intelligence/` with bounded modules
- `typescript-sdk/src/planning-intelligence.ts`
- shared Rust/TypeScript fixtures under existing fixture conventions

### Acceptance

- Rust and TypeScript accept/reject the same fixtures and fingerprint;
- unknown fields and open-ended kinds fail closed;
- no wedding-only field enters a generic schema;
- privacy and authority cannot be relaxed by a client payload; and
- all feature flags default off.

## WED-231 - Persist an append-only typed constraint ledger

### Scope

- add additive persistence for canonical AFP constraint messages if generic message storage cannot
  answer active/superseded queries efficiently;
- build deterministic projectors for active, superseded and removed constraints;
- preserve exact source anchors and observed time;
- support subject references for plan, person, object, milestone and option without embedding PII in
  identifiers; and
- expose authenticated plan-private list and append routes using existing ownership checks.

### Safety rules

- no destructive migration or conversation-history backfill;
- imported/model-proposed constraints remain proposed until authority permits confirmation;
- person constraints default couple-private; and
- removal creates a successor tombstone rather than erasing evidence.

### Tests

- shuffled/duplicate replay, exact retry, successor, removal and cross-tenant denial;
- forged authority/privacy rejection;
- source-anchor and source-reference validation; and
- real disposable-Postgres HTTP tests.

## WED-232 - Capture remarks as bounded, confirmable constraints

### Scope

- add a reusable remark-to-proposal interpreter on the existing metered wedding LLM ladder;
- provide deterministic extraction for supported structured controls;
- require closed vocabulary, exact substring anchors and bounded typed values;
- add a small confirmation surface in the current wedding home/intake flow; and
- append confirmed constraints through WED-231.

### Initial wedding vocabulary

- accessibility and step-free requirements;
- co-location/travel exclusions;
- duration and physical-dimension limits;
- dietary/alcohol requirements;
- seating separation and attendance relationships;
- style/colour/shape preferences; and
- explicit category priority trade-offs.

Sensitive health diagnoses, inferred family relationships, emotions and protected attributes are
out of scope. Store the operational requirement, such as step-free access, not an inferred cause.

### Tests

- exact-anchor positive cases and prompt-injection/unknown-kind negative cases;
- ambiguity asks a question instead of saving;
- hard-strength escalation requires explicit confirmation;
- LLM outage retains the user's remark without inventing a typed record; and
- AFP retry identity remains deterministic.

## WED-233 - Evaluate constraints and relationship requirements

### Scope

- evaluate active constraints against current quote options, directory evidence, guest requirements
  and venue capabilities;
- connect guest accessibility/dietary requirements to relevant venue/catering options without
  exposing guest-private data in vendor projections;
- add `constraint_conflict` to the recommendation domain;
- replace graph-degree-only evidence with source-facing labels where a constraint evaluation exists;
- leave unknown evidence unknown; and
- material quotation successors invalidate affected evaluations by revision binding.

### Tests

- centrepiece height conflict, step-free venue conflict, venue-travel exclusion and unknown evidence;
- person requirement aggregates without names when names are unnecessary;
- stale quote/directory revisions cannot satisfy current evaluation;
- deterministic results under input order changes; and
- no private source text enters metrics or vendor context.

## WED-234 - Turn constraint conflicts into approval-safe interventions

### Scope

- create a decision intervention from a WED-233 conflict;
- show the exact remembered user statement, current conflicting evidence and unknowns;
- offer bounded options such as accept, reject, ask vendor, or amend the constraint;
- prepare a vendor question through the existing clarification/outreach draft path; and
- invalidate the draft when its constraint, quote or grant revision changes.

### Acceptance

- no message sends without existing approval and provider receipt flow;
- a vendor ask contains only the approved bounded requirement/question;
- selecting an option appends a decision, not a hidden constraint mutation; and
- comparison/quote history remains visible.

## WED-235 - Add priority-weighted continuous budget advice

### Scope

- name uncontracted categories and unresolved fee drivers from actual budget/quote state;
- consume confirmed category priority trade-offs from the constraint ledger;
- calculate conservative incremental cost for a candidate decision;
- generate zero or more evidenced offset candidates from current packages, allowances or ranges;
- rank offsets by preserving higher-priority categories, not by maximizing raw savings; and
- require acknowledgement before a selected over-budget option advances.

### Non-goals

- no autonomous reallocation, purchase, deposit, payment or vendor negotiation;
- no fabricated market saving; and
- no single-point forecast where uncertainty requires a range.

### Tests and metrics

- currency isolation, arithmetic invariants, unknown costs and stale quote invalidation;
- preference order changes ranking deterministically;
- no offset appears without source evidence;
- aggregate correction and acceptance counts contain no amount or identity labels.

## WED-236 - Build milestone dependencies and critical-path projection

### Scope

- define a versioned wedding milestone template as an adapter over generic dependencies;
- connect guest count, accommodation blocks, stationery, invitations, vendor final counts and event
  date where genuine prerequisites exist;
- merge explicit saved task/calendar completion without rewriting user data;
- calculate earliest/latest dates and slack;
- surface one critical or near-critical item in PersonalOS; and
- prepare the next internal research/compare action using current vendor-search tooling.

### Acceptance

- cycles, absent wedding date and unresolved predecessor state are explicit blockers;
- "critical path" appears only from computed zero/negative slack;
- manual dates override template suggestions with provenance;
- completed/waived milestones remain in history and leave the active path; and
- no provider search or message runs without the existing user action.

## WED-237 - Interpret vendor change messages

### Scope

- classify canonical WED-220 responses as quote, clarification, change proposal or unclassified;
- for change proposals, extract affected object, original term, replacement options, cost delta and
  deadline using exact anchors;
- evaluate replacement options against constraints, palette/style facets, budget and days-to-event;
- create a review proposal without mutating the active quotation; and
- after user acceptance, reuse the existing quotation successor and stale-decision lifecycle.

### Tests

- unavailable flower with two substitutions, timing change, price change and ambiguous object;
- email/portal/AFP channel equivalence and deduplication;
- attachment anchor validation and scanner/parser unavailable fallbacks;
- urgency uses exact event date without fabricated deadlines; and
- no response transport state becomes booking or acceptance evidence.

## WED-238 - Wire the existing preference-conflict builder

### Scope

- audit `buildWeddingPreferenceConflictState` against WED-230 contracts;
- give it one owner in the current wedding home/DecisionOS projection;
- migrate its AFP projection to generic constraint/intervention references where compatible;
- show both partners' values and compromise options without averaging them; and
- delete only genuinely redundant adapters after migration evidence.

### Acceptance

- no duplicate conflict card across refresh/replay;
- dismiss/defer/resolve states survive reload;
- partner-private source text is not vendor-shareable; and
- the builder is either reached by production code or removed with equivalent functionality proven.

## WED-239 - Project a unified intervention through Decision Card and A2UI

### Scope

- adapt `decision.intervention.v1` to the existing shared Decision Card;
- use existing A2UI `comparison_table`, `constraint_badges`, `stat_row`, `insight_line`, `callout` and
  standard action contracts where available;
- display recommendation, reasons, cost range, timing, unknowns and evidence separately;
- preserve alternatives even when one option is recommended;
- provide one primary action and bounded secondary actions; and
- ensure vendor comparison and outreach state remain visible after action.

### Accessibility and reflow

- 320 CSS-pixel/400%-equivalent reflow without horizontal overflow or vertical text stripes;
- 200% text spacing and long unbroken source labels;
- keyboard order, focus return, reduced motion and serious/critical Axe checks;
- status is not conveyed by colour alone; and
- vendor/private evidence labels use plain language rather than graph mechanics.

## WED-240 - Evaluate, review and release in stages

### Required suites

- shared-schema cross-language fixtures;
- deterministic/shuffled/duplicate AFP replay;
- disposable Postgres tenant and revision tests;
- ClamAV clean/infected/unavailable boundaries using the existing scanner;
- full wedding unit, relevant Rust, SDK, browser, migration, build and line-budget checks;
- adversarial extraction and privacy tests; and
- synthetic end-to-end scenarios for every ideal from the source brief.

### Human evaluation

Independent reviewers must assess:

- constraint extraction accuracy and false hard-constraint rate;
- whether cited memory is faithful and non-creepy;
- usefulness and mathematical clarity of budget offsets;
- correctness of critical-path wording;
- vendor context minimisation;
- accessibility, couple usability, vendor usability and permission wording; and
- whether recommended options preserve meaningful alternatives.

### Rollout

- separate flags for constraint capture, evaluation, cost trade-offs, critical path, vendor changes
  and unified interventions;
- dark packaging first with every flag false;
- synthetic tenant, then allowlisted couple, then permissioned vendor canary;
- content-free aggregate metrics only;
- kill switches disable projection/action without deleting AFP history; and
- no enablement while WED-225/WED-226 or applicable mail/provider gates remain blocked.

## 7. Golden scenarios

1. **Remembered centrepiece limit:** an exact earlier remark becomes a confirmed soft or hard
   dimension constraint; a later 650 mm option conflicts and offers an approval-gated lower-height
   vendor question.
2. **Accessibility conflict:** an unnamed aggregate step-free requirement conflicts with verified
   stairs-only ceremony access; missing accessibility data remains unknown.
3. **Budget offset:** a photographer upgrade shows exact incremental cost, names uncontracted cost
   drivers and offers only source-backed lower-priority offsets.
4. **Accommodation critical path:** a wedding date and invitation dependencies produce computed
   slack; accommodation becomes critical only when the dependency graph supports it.
5. **Vendor substitution:** a florist change message yields two exact-anchored options, evaluates
   palette/shape/cost/date evidence and remains review-only.
6. **Partner preference conflict:** two confirmed preferences produce compromise options without
   averaging or exposing private remarks to vendors.
7. **Cross-channel replay:** equivalent secure-link, email and claimed-AFP content converges on one
   vendor change proposal and one intervention.
8. **Stale authority:** a quotation successor, revoked grant or amended constraint invalidates the
   old recommendation and any unsent draft.
9. **Non-wedding reuse:** a procurement fixture uses the same constraint, cost, dependency and
   intervention contracts with different vocabulary/presentation metadata.

## 8. Verification commands per slice

Use the smallest focused commands first, then the full boundary before review:

```powershell
npm --prefix solid-ui run typecheck
npm --prefix solid-ui run test:wedding
npm --prefix solid-ui run test:wedding:e2e -- <focused-spec>
cargo test --test <focused-integration-target> -- --nocapture
$env:TEST_DATABASE_URL = "<disposable postgres only>"
$env:CLAMD_HOST = "<test clamd endpoint only>"
./scripts/verify-quotation-vendor-portal-readiness.ps1
npm --prefix solid-ui run build
git diff --check
```

A conditional skip is not a pass. Do not point `TEST_DATABASE_URL` at Oracle or any persistent
application database. Generated evidence must bind the exact commit it verifies.

## 9. Pull request boundaries

Use one reviewable PR per WED-230 through WED-240 slice. Each PR must record:

- schema and authority changes;
- privacy and vendor-context impact;
- files changed and line counts;
- deterministic, database, browser and build evidence;
- feature-flag state;
- unresolved assumptions or human-review gaps; and
- the next dependency-unblocked task.

Do not combine the entire programme into a single implementation branch. Do not enable a later
producer because its UI looks complete: release follows evidence, not visual availability.

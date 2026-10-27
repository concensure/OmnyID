# Professional Wedding Planner Workspace — Detailed Task Plan

Status: proposed implementation plan

Parent: WED-274

Specification: `wedding-planner-professional-workspace-spec.md`

Build base: `6af9203` on `agent/codex/WED-215`

Implementation model: `gpt-6-astra`, high reasoning

## 1. Delivery rules

1. Work from `agent/codex/WED-215` at `6af9203` or a reviewed descendant containing it.
2. Do not copy another worktree wholesale. Compare commits and transplant only reviewed dependencies.
3. Reuse the ordinary Wedding template and current AFP projections. A professional mode is not a parallel CRM.
4. Keep one Wedding AFP ledger per client. A practice index contains only permission-safe operational summaries.
5. Register each implementation slice in `.agent/TASKS.yaml` before editing shared contracts.
6. Inspect current implementations before adding schemas, routes, components or migrations.
7. Extend event schemas versionedly; never rewrite append-only history in place.
8. Put every external send, quote acceptance, hold conversion, booking and payment-state change behind explicit authority and clear copy.
9. Use A2UI for contextual state cards and typed commands, not arbitrary HTML or core navigation.
10. Keep new files below 1,000 lines. Split large domains and do not bloat existing large modules.
11. Preserve unrelated dirty work and stage only the named slice.
12. Keep new rollout flags off by default. Existing mail relay and ranking-policy gates remain unchanged.

## 2. Definition of a vertical slice

A slice is complete only when it contains:

- versioned contract or a documented reuse decision;
- server-side authority and idempotency;
- deterministic projection;
- accessible responsive UI for the permitted role;
- empty/loading/error/stale/conflict states;
- focused unit and integration tests;
- relevant browser coverage;
- migration and rollback notes when storage changes;
- task, decision and handoff updates;
- a selective commit with no unrelated paths.

After every slice run, at minimum:

1. affected Rust unit/integration tests;
2. affected frontend tests;
3. TypeScript typecheck;
4. line-budget check;
5. production build when a buildable surface changed.

Run the full Wedding test suite and relevant Rust test groups at each milestone and before any deployment.

## 3. Dependency map

```text
WED-275 Contracts and reuse inventory
  ├─ WED-276 Practice shell and mode switching
  │    └─ WED-277 Client grants, invitations and template adaptation
  │          ├─ WED-278 Unified enquiry pipeline
  │          └─ WED-279 Calendar, capacity and date holds
  ├─ WED-280 Supplier profile and package consolidation
  │          └─ WED-281 Itemised quote and normalised client view
  │                    └─ WED-282 Booking and payment tracking
  └────────────────────────────────────┐
                                       └─ WED-283 hardening and dark release
                                              └─ WED-284 allowlisted cohort
```

Existing vendor activation, quote, attachment, relay, task, budget and document work are dependencies to consume, not repeat.

## 4. WED-275 — Contracts, reuse inventory and authority model

### Goal

Establish the smallest event and permission additions needed for a professional practice to project authorised client plans.

### Depends on

- WED-262 vendor onboarding/value discovery specification;
- WED-271 secure attachments and relay foundations;
- WED-273 vendor catalogue/lifecycle projection;
- current Wedding tasks, quote, budget, document and decision projections.

### Work

1. Inventory all current AFP event kinds, projection keys, route guards, account/plan identifiers and UI stores relevant to Wedding.
2. Produce a reuse table marking each requirement `reuse`, `extend` or `new` with evidence by path and test.
3. Define versioned schemas for:
   - practice identity;
   - practice member grant/revocation;
   - wedding collaboration grant/revocation;
   - client plan indexing;
   - workflow assignment;
   - availability policy/exception;
   - date hold lifecycle;
   - itemised quotation revision;
   - booking confirmation;
   - payment schedule/evidence state.
4. Define capabilities for owner, lead planner, coordinator, finance-only, read-only, couple owner/co-owner and vendor representative.
5. Define a field allowlist for the practice client index. Explicitly exclude message bodies, documents, guest lists and sensitive private notes.
6. Define command envelopes with actor, practice, plan, expected event/projection version and idempotency key.
7. Define revocation behaviour for HTTP reads, search, websocket updates, cached projections, attachment URLs and exports.
8. Record the architecture decision that each client remains an ordinary Wedding plan.
9. Add contract tests for schema validation, unsupported version rejection and authority matrices.

### Likely files

- AFP schema/event registry modules;
- new focused practice/collaboration contract modules;
- auth capability modules;
- schema fixtures and contract tests;
- `.agent/DECISIONS.md`.

Do not add practice UI or production routes in this slice.

### Acceptance

- No duplicated wedding state is proposed.
- Permission tests cover allow and deny for every role/resource class.
- Revoked grants cannot access cached or newly requested data.
- Cross-plan summary fields are enumerated rather than open-ended JSON.
- All new schemas remain template-neutral where the event is not Wedding-specific.

### Verification

- schema/registry tests;
- focused Rust auth tests;
- migration check if persistence is introduced;
- line budget.

## 5. WED-276 — Professional mode, practice shell and client switcher

### Goal

Add an opt-in practice shell around existing templates without altering the ordinary couple experience.

### Work

1. Add a `professional_planner` capability/entitlement guarded by a dark flag.
2. Add a practice bootstrap route and deterministic projection for membership and permission-safe client summaries.
3. Add an explicit context switcher for:
   - personal account;
   - personal Wedding plan;
   - each authorised professional practice.
4. Build responsive practice navigation:
   - desktop: Home, Clients, Inbox, Calendar, Suppliers, Settings;
   - mobile: Home, Clients, Inbox, Calendar, More.
5. Preserve the existing mobile bottom menu and safe-area behaviour.
6. Build Practice Home with fixtures first:
   - highest-priority item;
   - today/next-seven-days agenda;
   - replies and approvals;
   - hold expiry/conflict;
   - due payment evidence;
   - client stages.
7. Derive priorities server-side from deterministic state; A2UI renders the typed result.
8. Add breadcrumbs and stable deep links containing practice and selected plan context.
9. Persist list filters/scroll state so Back returns to the prior working position.
10. Add clear empty states for no practice, no clients, no urgent work and insufficient permission.

### UX constraints

- Never infer the active practice merely from previously cached state.
- Always show current practice/client in the header.
- One primary action per viewport region.
- Every count opens its exact filtered source list.
- Technical errors map to user-safe recovery copy with a correlation ID only when useful.

### Acceptance

- A user with a personal wedding and a practice cannot confuse their contexts.
- A normal couple without the capability sees no professional navigation.
- Switching context cancels or namespaces in-flight queries and clears unauthorised cached detail.
- 360px, keyboard and 400% zoom layouts remain usable.
- Context is retained across refresh and rejected if the server grant no longer exists.

### Verification

- projection/auth tests;
- context-switch unit tests;
- browser back/deep-link tests;
- mobile and zoom browser tests;
- typecheck, Wedding tests and production build.

## 6. WED-277 — Client onboarding, grants and ordinary-template adaptation

### Goal

Let a practice add or accept clients while keeping the couple's Wedding plan authoritative.

### Work

1. Implement three entry paths:
   - couple invites planner;
   - planner invites couple to a new client shell;
   - authorised planner-managed client.
2. Show exact requested permissions before invitation acceptance.
3. Add grant expiry, reduction and revocation controls.
4. Add a client list with display label, date status, stage, owner, next action, deadline, last contact and safe risk indicators.
5. Add stage, owner, date and attention filters with shareable URLs.
6. Open a selected client in the existing Wedding template rather than a cloned planner template.
7. Add a compact authority banner and client switcher without consuming mobile working space.
8. Reuse existing Wedding Tasks, Timeline, Vendors, Budget, People and Documents.
9. For decisions, distinguish planner proposal, couple approval and planner-authorised completion.
10. Support transfer from planner-managed to couple co-owned without rewriting event history.
11. Add confirmation dialogs for revocation, ownership transfer and client removal from a practice index.

### Security tests

- guessed plan/practice IDs;
- removed team member;
- expired invitation;
- reused invitation token;
- finance-only user opening messages or People;
- read-only mutation attempt;
- cache and websocket leakage after revocation;
- cross-client attachment and search access.

### Acceptance

- There is one client plan, not planner and couple copies.
- The couple can inspect and revoke planner access.
- Planner-created history remains auditable after the couple joins.
- Removing a client from the practice does not delete the wedding plan.
- Sensitive scopes are separate from generic plan access.

### Verification

- auth and invitation integration tests;
- Wedding projection compatibility tests;
- browser invite/accept/revoke flows;
- all Wedding tests, typecheck and build.

## 7. WED-278 — Unified enquiry pipeline and deterministic next actions

### Goal

Project every authorised enquiry into one operational list while preserving the existing conversation ledger and draft-first permissions.

### Work

1. Reuse existing Response Queue and vendor response events; do not create a new message table.
2. Implement a practice inbox index with client, vendor, category, state, owner, due/reminder, last contact and unread state.
3. Implement deterministic enquiry state and next-step derivation.
4. Add assignment and reassignment events.
5. Add filters for client, owner, state, vendor category, due window and unread.
6. Build desktop split-pane and mobile stacked detail views.
7. Preserve list filter, selected row and scroll position after detail actions.
8. Show conversation, attachments, permissions, reminders, tasks, quote and hold state in one coherent detail surface.
9. Reuse draft-first enquiry controls:
   - recipient;
   - exact content;
   - attachments;
   - approximate budget sharing;
   - phone sharing;
   - reminder preference;
   - sender identity.
10. Label actions by consequence: `Prepare enquiry`, `Review enquiry`, `Send enquiry`, `View conversation`, `Review response`, `Compare quote`.
11. Add idempotent handling for inbound retries, duplicate webhooks, bounces and delivery state.
12. Add service-target policy without presenting it as a contractual promise.

### AI boundary

An LLM can propose category, summary and reply. It cannot send, assign authority, select shared fields or change state without an accepted typed command.

### Acceptance

- An inbox row opens the exact client/vendor conversation.
- Every actionable row has one explainable next step and owner.
- Couple and vendor identities cannot be confused in sender or reply-to presentation.
- Provider acceptance, delivery evidence and actual response are distinct.
- A client without permission never appears in index counts or search.

### Verification

- next-step table tests;
- duplicate/retry/bounce integration tests;
- forged inbound and cross-tenant tests;
- mobile composer and attachment tests;
- SMTP/provider tests required by existing relay documentation;
- all Wedding tests, typecheck and build.

## 8. WED-279 — Planner capacity, calendar and date holds

### Goal

Provide dependable working-hours, blocked-time, operational buffers and temporary holds without confusing them with wedding dates or confirmed bookings.

### Work

1. Extend the existing calendar projection rather than creating an unrelated calendar store.
2. Add timezone-aware weekly working-hour policies.
3. Add dated exceptions and blocked intervals.
4. Add setup, teardown and travel buffers with explicit applicability.
5. Project authorised milestones, appointments, site visits, holds and bookings.
6. Implement agenda-first mobile UI and accessible week/month desktop views.
7. Add filterable overlays and an accessible non-grid list equivalent.
8. Implement the hold state machine with expiry jobs and idempotent transitions.
9. Add deterministic overlap detection for resources and buffers.
10. Display conflict explanations without disclosing another client's private details.
11. Add `Offer date hold`, `Accept hold`, `Release hold` and `Convert hold` confirmations.
12. Require booking evidence before conversion to a confirmed booking.

### Edge cases

- daylight-saving boundary;
- all-day and overnight work;
- recurring policy changed after a hold;
- two tabs accepting the same resource;
- expiry and acceptance racing;
- revoked planner acting on a hold;
- vendor in a different timezone;
- partial-day setup/teardown conflict.

### Acceptance

- Planner, supplier, couple-preference and hold states are visibly distinct.
- No hold silently confirms a booking.
- Conflicting writes fail safely with refreshed state and a useful explanation.
- Expiry is repeatable and does not emit duplicate events.
- Mobile users can perform every action without a dense grid.

### Verification

- property/table tests for intervals and timezones;
- concurrency/idempotency tests;
- projection rebuild tests;
- keyboard/screen-reader calendar tests;
- typecheck, Wedding tests and production build.

## 9. WED-280 — Supplier profile, packages, reviews and practice relationships

### Goal

Consolidate reusable supplier information into one maintained business profile while keeping fit and client-specific history separate.

### Work

1. Reuse vendor claim, verification, profile dashboard, gallery and catalogue routes.
2. Add versioned reusable package structures with price presentation, inclusions, exclusions, optional items and validity.
3. Add availability-policy links without claiming a date is free unless supported by current evidence.
4. Define review provenance and moderation states before displaying new reviews.
5. Add practice relationship projection for permitted private notes, clients used for and last contact.
6. Keep notes scoped to the practice; never show them to a vendor or another practice.
7. Build one supplier detail layout used from catalogue, shortlist, selected client and practice Suppliers.
8. Label:
   - business identity verification;
   - source freshness;
   - preference fit;
   - availability confirmation;
   - paid sponsorship.
9. Add media responsive sizes, lazy loading and stable dimensions.
10. Ensure the profile's main actions reflect client state rather than generic `Reach out` wording.

### Acceptance

- A vendor edits one business profile, not a profile per client.
- Packages can seed but do not replace a client-specific quote.
- A verified source is not labelled a verified match.
- Paid placement does not affect fit scoring without explicit labelled policy.
- Private practice notes cannot leak across tenants or into vendor responses.

### Verification

- profile/package schema tests;
- ownership and tenant tests;
- image/performance checks;
- claim-to-profile-to-client enquiry browser flow;
- typecheck, Wedding tests and build.

## 10. WED-281 — Itemised quotes, expiry and normalised couple projection

### Goal

Let a supplier prepare a clear itemised quote efficiently and let the couple/planner compare the original and normalised evidence fairly.

### Work

1. Extend the existing quotation domain rather than introducing a vendor-only quote model.
2. Add vendor-authored line items:
   - description;
   - quantity and unit;
   - integer minor-unit amount and currency;
   - tax treatment;
   - discount;
   - inclusion/exclusion;
   - optional/conditional status;
   - source package when applicable.
3. Add assumptions, capacity/date context, expiry, revision and payment schedule.
4. Permit PDF/DOCX/TXT/image attachments through the existing secure attachment flow.
5. Generate a preview with recipient and exact shared information before sending.
6. Persist immutable revisions and link superseding quotes.
7. Extract each document once; store structured evidence and regenerate comparisons only when facts change.
8. Show the original in Documents and the normalised view alongside it.
9. In Response Queue/Home, open normalised quote detail inline instead of redirecting to a generic queue.
10. Distinguish confirmed, inferred, conditional, optional, excluded and missing amounts.
11. Explain recommendation and uncertainty in user-facing language with evidence links.
12. Add expiry reminders and prevent acceptance of a superseded/expired revision without a deliberate exception flow.

### Fairness corpus

Run current reviewed venue quote fixtures and the five fictional Priya Raman/Daniel Whitfield samples. Record:

- extraction completeness;
- arithmetic agreement;
- missing-cost detection;
- condition/option separation;
- comparable totals;
- evidence citations;
- recommendation consistency;
- abstention when evidence is insufficient.

### Acceptance

- Vendors can protect internal methodology while couples see transparent charge composition.
- Original evidence and normalised data remain linked.
- Conditional items do not appear as guaranteed totals.
- The UI never invents suitability, availability or final cost.
- Accepting a quote creates booking pending, not booked.

### Verification

- quote arithmetic and currency tests;
- parser/extraction fixtures;
- incremental invalidation tests;
- attachment and malware-scan tests;
- quote revision/concurrency tests;
- Wedding tests, relevant Rust quotation tests, typecheck and build.

## 11. WED-282 — Quote acceptance, booking confirmation, deposits and balances

### Goal

Close the loop from accepted quote to explicit booking and permission-safe payment tracking.

### Work

1. Reuse closure and evidence projections.
2. Add a server-authoritative booking policy describing required evidence.
3. On quote acceptance, show exactly what happens and what does not happen.
4. Create `booking_pending` and notify the authorised supplier/planner; do not claim confirmation.
5. Permit a supplier to confirm the booking only when configured conditions are met or an authorised exception is recorded.
6. Convert/release related holds idempotently.
7. Create payment-schedule items from the accepted quote with user review.
8. Project deposits and balances into Budget, Documents, Inbox and practice Home from the same events.
9. Add evidence upload/association and correction through superseding events.
10. Add overdue/reminder logic with quiet hours and notification idempotency.
11. Do not take a card/bank payment in this slice.
12. Use clear actions: `Review booking terms`, `Confirm booking`, `Record payment evidence`, `View balance`.

### Acceptance

- Quote accepted, booking confirmed and money paid are separate visible states.
- Amounts and totals use integer minor units and deterministic arithmetic.
- A finance-only collaborator sees only its allowed summary/evidence.
- A correction preserves history.
- The same deposit/balance status appears consistently in all projections.

### Verification

- booking-policy state-table tests;
- concurrent acceptance/expiry tests;
- hold conversion tests;
- money/currency property tests;
- evidence authorisation tests;
- projection consistency tests;
- Wedding tests, Rust tests, typecheck and build.

## 12. WED-283 — Security, accessibility, observability and dark release

### Goal

Prove the integrated system while all external-risk features remain dark.

### Autonomous work

1. Threat-model practice, client, supplier and admin boundaries.
2. Test IDOR, stale grants, websocket leakage, attachment URLs, search, exports and cache invalidation.
3. Test forged inbound email/provider events, duplicate delivery, retry, bounce and unauthorised send.
4. Verify per-recipient/per-plan encryption design and server-only least-privilege SeaweedFS credentials.
5. Run axe/static checks plus keyboard, focus, zoom, contrast and reduced-motion browser suites.
6. Add structured metrics for state transition failures, projection lag, conflict, expiry jobs and notification dedupe.
7. Add `/healthz`/`readyz` dependency checks without exposing secrets or client data.
8. Add migration forward/backward compatibility and projection rebuild evidence.
9. Test feature flags off, mixed versions and rollback.
10. Produce a deployment manifest and frozen candidate SHA.

### Genuine human gates

Only request human action for:

- hosted accessibility acceptance using assistive technology not available to automation;
- planner, couple and vendor subjective usability acceptance;
- permission wording approval;
- authorised live email provider delivery/receipt where sandbox evidence cannot prove it;
- security/privacy sign-off;
- payment-provider approval if payment execution is later proposed.

Each gate must state why a human is required, current automated evidence, exact target/actions, objective pass/fail, recovery, resume condition and blocking scope.

### Acceptance

- All autonomous checks are complete before a human checklist is issued.
- No gate contains vague coding or configuration work the agent can perform.
- Candidate SHA, build artefacts, migrations, flags and test reports are frozen.
- External mail, holds/bookings and payment tracking can each be disabled independently.

## 13. WED-284 — Allowlisted professional-planner cohort

### Goal

Validate value and operational safety with a small, reversible cohort before broader availability.

### Work

1. Select only authorised participants and record consent/scope.
2. Enable practice shell first; keep external send and other risky capabilities independently gated.
3. Observe at least seven days or a documented representative planning cycle.
4. Track:
   - next-action coverage;
   - time to first meaningful enquiry action;
   - assignment and reminder use;
   - quote completeness;
   - hold conflicts/expiry;
   - booking-state corrections;
   - permission revocation;
   - accessibility/support incidents;
   - notification duplicates;
   - model cost by plan/practice.
5. Interview planner and participating clients/vendors with scenario-specific questions.
6. Review any incident before expanding the allowlist.
7. Publish a go/hold/rollback decision tied to the candidate SHA and evidence.

### Acceptance

- No cross-client or cross-role disclosure occurs.
- Users can find the next action without facilitator guidance.
- Booking and payment labels are not misunderstood.
- Rollback is exercised or credibly demonstrated.
- Expansion criteria and stop conditions are explicit.

## 14. Test matrix

| Area | Minimum evidence |
| --- | --- |
| AFP | schema validation, idempotency, ordering and projection rebuild |
| Authority | allow/deny matrix, revocation, cross-tenant IDOR, cache/websocket isolation |
| Practice shell | mode switch, deep link, refresh, browser Back, empty states |
| Client plan | invitation, transfer, scope reduction and ordinary-template parity |
| Inbox | deterministic next steps, assignment, reminders, retries, bounces |
| Calendar | timezone/DST, overlap, buffers, expiry race and mobile agenda |
| Supplier | claim, edit, packages, media, source/fit label separation |
| Quote | extraction, arithmetic, optional/conditional items, revision and expiry |
| Booking | acceptance versus confirmation, required evidence and hold conversion |
| Payments | minor-unit arithmetic, evidence, correction, overdue/reminder dedupe |
| Attachments | allowed types, size, malware, content-disposition and tenant access |
| Accessibility | keyboard, focus, screen reader, 200/400% zoom, 360px, contrast |
| Performance | bounded summaries, pagination/virtualisation, lazy media, no N+1 client load |
| Build | typecheck, all Wedding tests, relevant Rust tests, production build, line budget |

## 15. Required scenario tests

1. A planner with a personal wedding switches into a practice and back without mixed data.
2. A couple invites a planner, limits access, then revokes it while the planner has another tab open.
3. A planner creates a client shell; the couple later joins and sees the full auditable history.
4. A coordinator sees two due enquiries, reassigns one and sends neither accidentally.
5. A vendor responds with an attachment; duplicate provider delivery creates one message.
6. A planner opens the normalised quote inline and traces a total to the original document.
7. A hold overlaps a setup buffer; the UI explains the conflict without naming the other client.
8. A hold expires while another tab tries to convert it; exactly one valid outcome is recorded.
9. A quote expires after review; the user is offered a revision request rather than silent acceptance.
10. The couple accepts a quote; all roles see booking pending until required confirmation exists.
11. A deposit evidence correction preserves both records and updates every projection consistently.
12. A finance-only user cannot read conversations, guest details or unrelated documents.
13. At 400% zoom, client names and actions wrap normally instead of forming vertical text stripes.
14. A keyboard user answers a dynamic card and focus remains on the changed control or announced result.
15. With every professional flag off, the existing couple and vendor experiences are unchanged.

## 16. Migration and compatibility rules

- Prefer additive nullable columns and new event versions.
- Backfill indexes from authoritative ledger events with resumable, idempotent jobs.
- Do not infer permission grants during backfill.
- Keep old clients able to ignore new event kinds.
- Validate forward and rollback paths on a production-like copy with no plaintext export.
- Record row counts and projection checksums without user content.
- Never deploy a migration and dependent binary without an ordered rollback plan.

## 17. Suggested commit boundaries

Use small commits with the task ID, for example:

1. `docs(WED-275): record practice authority decision`
2. `feat(WED-275): add practice collaboration contracts`
3. `test(WED-275): cover practice authority matrix`
4. `feat(WED-276): add guarded professional workspace shell`
5. `feat(WED-277): project authorised client weddings`

Do not combine contracts, migrations, an entire workspace and deployment evidence in one opaque commit.

## 18. Deployment checklist

Before any Oracle deployment:

1. Freeze and record the candidate SHA.
2. Confirm it descends from `6af9203` and includes only reviewed dependencies.
3. Confirm unrelated dirty files and source datasets are absent from the build context.
4. Run focused tests for every changed slice.
5. Run all Wedding tests, relevant Rust tests, typecheck, production build and line budget.
6. Validate migrations against a disposable Postgres instance and current production schema shape.
7. Confirm flags are off in the image and environment unless their evidence gate is approved.
8. Deploy selectively with a rollback image/tag.
9. Verify `/healthz`, `/readyz`, runtime SHA and smoke routes.
10. Confirm ordinary couple and vendor journeys still work with professional flags off.
11. Record machine-readable proof and update `.agent/HANDOFF.md`.

## 19. Completion definition

The program is not complete because pages exist. It is complete when an allowlisted planner can operate multiple authorised weddings from one coherent mobile-friendly workspace, each couple still owns one ordinary Wedding plan, suppliers can move an enquiry through quote and booking without identity confusion, all financial and booking consequences are explicit, and the evidence in Sections 14–18 passes on a frozen candidate.

# Professional Wedding Planner Workspace Specification

Status: implementation started; WED-275 contract foundation, professional runtime still dark

Program: WED-274

Prepared: 2026-10-27

Build base: `6af9203` on `agent/codex/WED-215`

Recommended implementation model: `gpt-6-astra`, high reasoning

Implementation contract: [WED-275 reuse inventory and authority model](wedding-planner-professional-workspace-contracts.md).
The executable registry reconciles the illustrative names below with existing AFP kinds and reuses
canonical quotation and booking evidence. No professional routes or UI are enabled by this foundation.

## 1. Purpose

OmnyID should support a professional wedding planner or coordinator without creating a second wedding-planning product. A professional uses the same Wedding template as a couple, with a thin practice layer for switching between authorised client weddings, triaging enquiries, coordinating dates and seeing the next action across clients.

This specification takes useful workflow ideas from the live [Weddly app](https://tryweddly.com/app), inspected on 2026-10-27, and from the supplier promises supplied with this brief. It is competitive inspiration, not a screen-by-screen copy or a source of truth. OmnyID's AFP authority model, existing Wedding surfaces, quote intelligence, vendor portal and design system remain authoritative.

The outcome must feel like one connected service:

- a couple owns or co-owns a wedding plan;
- an authorised planner works inside that same plan;
- a supplier sees only the enquiry, context and permissions addressed to that supplier;
- every role sees the same underlying facts projected for its job;
- actions have explicit consequences and never hide a send, booking or payment behind vague copy.

## 2. Product principles

### 2.1 Adapt, do not fork

A professional planner account is an ordinary OmnyID account with an optional `professional_planner` capability. Each client wedding is an ordinary Wedding template instance with its own account- and plan-scoped AFP ledger.

The practice workspace is a portfolio projection over authorised wedding plans. It must not:

- copy client histories into a parallel CRM;
- put every client in one shared wedding ledger;
- introduce separate task, document, budget, quote or vendor truth;
- silently turn the planner into the owner of the couple's information;
- require a supplier to maintain a different profile for each planner.

### 2.2 One fact, role-appropriate projections

The same AFP events drive:

- the couple's Wedding Home, Tasks, Timeline, Vendors, Budget and Documents;
- the planner's client portfolio, inbox, calendar and selected-client workspace;
- the supplier's enquiry, quote, hold and booking views;
- authorised administrative evidence without exposing message plaintext by default.

A2UI should render contextual cards, action sheets, forms and state summaries where it is suitable. Business transitions remain server-authoritative and deterministic.

### 2.3 Explicit authority

Every mutation records actor, authority, plan, source, timestamp and idempotency key. The UI must distinguish:

- `You can edit`;
- `You can propose`;
- `Waiting for the couple`;
- `Waiting for the supplier`;
- `Read only`.

Drafting is not sending. Quote acceptance is not automatically a confirmed booking. Recording a deposit is not taking a payment.

### 2.4 Obvious next actions

Every actionable row has one plain-language next step, an owner and an optional due time. Counts and status chips open the exact filtered list that produced them. There are no decorative counters, orphan pages or actions whose consequence is unclear.

## 3. Existing foundations to reuse

Implementation must first consume the current contracts rather than reimplementing them:

| Capability | Existing foundation | Required adaptation |
| --- | --- | --- |
| Wedding plan | Wedding template and account-scoped AFP projections | Add collaboration grants and planner context |
| Tasks and timeline | Wedding task, completion, responsibility, deadline and timeline projections | Aggregate authorised next actions without copying tasks |
| Couple decisions | Decision cards and one-at-a-time decision flow | Add planner proposal/approval authority labels |
| Vendor discovery | Vendor catalogue, search and lifecycle projection | Add practice relationship filters and client context |
| Vendor ownership | Claim flow, profile dashboard, gallery and verification evidence | Add calendar policy and reusable packages |
| Enquiries | Response Queue, secure vendor response and attachment flows | Add practice inbox, assignment and deterministic next step |
| Email privacy | Sender identity and masked-relay design | Reuse only after relay security gates pass |
| Quotes | Vendor response, quotation extraction, normalisation and comparison | Add supplier-authored itemisation and expiry |
| Documents | Wedding document storage and quote projections | Keep originals plus normalised views in the client plan |
| Booking closure | Closure state and evidence projections | Add explicit supplier confirmation and hold conversion |
| Budget | Budget tracker/evidence hub and quote/deposit projections | Add cross-client due-item summaries with scoped detail |
| Billing | Existing subscription foundation | Add planner entitlement only after value proof |

If an existing schema lacks a field, extend it versionedly. Do not replace an existing event merely to make a dashboard easier to query.

## 4. Account, practice and plan model

### 4.1 Entities

- **Account:** the authenticated human or service identity.
- **Practice:** an optional professional workspace with a display name, members and role grants.
- **Wedding plan:** one Wedding template instance and its AFP ledger.
- **Client relationship:** a scoped link between a practice and a wedding plan.
- **Vendor identity:** one claimed supplier business, independent of any planner or couple.

The same person may have a personal wedding and belong to one or more practices. A visible mode switcher must say, for example, `My wedding` and `Harbour & Pine Events`; it must never infer the mode from the last URL alone.

### 4.2 Client creation paths

1. **Couple invites planner:** the couple chooses a scope and the planner accepts.
2. **Planner invites couple:** the planner creates a client shell, records the authority basis and invites the couple to claim/co-manage it.
3. **Planner-managed client:** allowed only with an explicit managed-service authority state and visible audit history. The couple can later join without rewriting prior events.

No path should require duplicate onboarding. Existing couple knowledge is reused after consent; otherwise the planner records only the minimum needed to begin.

### 4.3 Roles

Initial roles:

- practice owner;
- lead planner;
- coordinator;
- finance-only;
- read-only collaborator;
- couple owner/co-owner;
- vendor representative.

Permissions are capabilities, not UI assumptions. Sensitive categories such as health, family conflict, financial evidence and private messages require separate scopes where current AFP policy requires them.

### 4.4 Practice coordination ledger

A small practice ledger may hold practice membership, grants, assignments and cross-plan index facts. The index may contain only data necessary to operate the portfolio, such as:

- plan identifier and client display label;
- wedding date or date status;
- current stage;
- assigned planner;
- next-action type and due time;
- unread/action-needed counts;
- permission-safe financial due totals.

It must not duplicate message bodies, full guest lists, documents, private notes or extracted quote content. Opening a client retrieves authorised projections from that client's ledger.

## 5. Information architecture

### 5.1 Practice-level navigation

Desktop:

1. Home
2. Clients
3. Inbox
4. Calendar
5. Suppliers
6. Settings

Mobile bottom navigation:

1. Home
2. Clients
3. Inbox
4. Calendar
5. More

The existing persistent mobile bottom-navigation behaviour is retained. `More` contains Suppliers, team, practice settings and account/mode switching.

### 5.2 Selected-client navigation

Selecting a client opens the existing Wedding template with:

- a persistent client label and switcher;
- an authority badge;
- breadcrumbs that include practice and client context;
- the existing Wedding Home, Plan, Vendors, Budget, People and Documents surfaces;
- a reliable return to the same practice list, filters and scroll position.

Deep links carry stable practice, plan and resource identifiers. Browser Back must not unexpectedly exit the workspace or lose a filter.

### 5.3 Navigation contract

Every primary action must satisfy all of these:

- the label describes the immediate consequence;
- the destination or inline result is visible before commitment;
- the page provides the action needed to progress the state;
- a user can identify the current client and role;
- completion returns to a meaningful state, not a generic home page.

Examples: `Prepare enquiry`, `Review enquiry`, `Send enquiry`, `Offer date hold`, `Release hold`, `Send quote`, `Confirm booking`, `Record payment evidence`.

## 6. Core surfaces

### 6.1 Practice Home

The home view answers “What needs me now?” rather than presenting vanity metrics.

Order:

1. one highest-priority action card;
2. today and next-seven-days agenda;
3. enquiries awaiting a reply or approval;
4. date-hold expiries and conflicts;
5. deposits/balances due or needing evidence;
6. compact client-stage overview.

Each item shows client, vendor when relevant, reason, owner, due time and action. A user can reassign, defer or complete it in place when authority permits.

### 6.2 Clients

Client rows/cards show:

- couple or client display name;
- wedding date or `Date not decided`;
- planning stage;
- assigned planner;
- next action and due date;
- last meaningful contact;
- permission-safe risk indicators.

Filters include stage, planner, date range and attention state. `Add client` presents the three authority-aware creation paths. Whole cards may be clickable, but destructive or state-changing controls remain separate.

### 6.3 Unified Inbox

The inbox projects authorised enquiry and conversation events across clients. It is not a separate message store.

List columns or mobile row fields:

- client;
- supplier;
- category;
- state;
- next step;
- owner;
- due/reminder;
- last contact;
- unread state.

The detail uses a desktop split pane and a mobile stacked view. It includes conversation, attachments, exact sharing permissions, quote/hold state, reminders and task linkage. Returning to the list preserves filters and position.

### 6.4 Calendar and capacity

The planner calendar combines permission-safe projections of:

- wedding milestones;
- appointments and site visits;
- planner weekly working hours;
- blocked days;
- setup and teardown windows;
- travel buffers;
- supplier date holds and expiries;
- confirmed bookings.

Agenda is the default on small screens; week/month views are available when space permits. Availability belongs to an identity and must not be conflated:

- planner availability controls planner work;
- supplier availability controls supplier fulfilment;
- couple date preference is a planning constraint;
- a hold is temporary evidence, not availability or booking.

Conflict checks are deterministic and timezone-aware. The system explains the conflicting blocks and does not silently override them.

### 6.5 Suppliers

The practice supplier view reuses the public/vendor catalogue and account-scoped lifecycle events. It adds authorised relationship context such as clients used for, last enquiry and reusable private practice notes where policy allows.

A supplier page can combine:

- verified identity and source labels;
- photos and video previews;
- packages and itemised inclusions;
- capacity, service area and availability evidence;
- review provenance;
- contact and masked-response options;
- enquiry, quote, hold and booking history for the selected client only.

Source verification must never be presented as suitability verification. Paid placement must not silently influence recommendations; sponsorship is labelled and kept out of fit scoring.

### 6.6 Vendor workspace

Claimed vendors reuse the existing vendor portal and profile dashboard. The cohesive supplier journey is:

1. claim or authenticate the business;
2. correct the prefilled profile;
3. add photos, packages and policies;
4. set working hours, exceptions and operational buffers;
5. receive enquiries in one list with a next step;
6. reply through protected OmnyID messaging or an approved sender identity;
7. prepare an itemised quote with an expiry date;
8. offer or release a date hold;
9. confirm a booking after explicit acceptance and required conditions;
10. track scheduled deposits and balances.

Calendar and financial modules are progressive disclosures. A newly claimed vendor can complete one high-value action without finishing every setting.

## 7. Workflow contracts

### 7.1 Deterministic next step

`next_step` is derived from authoritative state, required approvals, missing inputs, reminders and deadlines. An LLM may explain it but cannot choose the state transition.

Illustrative priority:

1. security or permission block;
2. overdue human approval;
3. unread response or quote;
4. expiring hold or quote;
5. scheduled follow-up due;
6. task deadline;
7. optional profile improvement.

Ties use due time, then stable event ordering. Users may override owner or reminder, not falsify the underlying state.

### 7.2 Enquiry state

`new -> triaged -> waiting_on_client | ready_to_prepare -> draft -> approved_to_send -> sent -> awaiting_response -> response_received -> quote_received -> decision_pending -> accepted | declined | expired -> booking_pending -> booked | lost | cancelled`

Transitions record who acted and what evidence supported the transition. Draft-first is the default. Before sending, the couple or authorised planner sees recipient, exact content, attachments and fields shared.

### 7.3 Date hold state

`requested -> offered -> held -> expiring -> converted | released | expired`

A hold contains start/end, timezone, expiry, applicable resource and authority. It never blocks another client invisibly: conflicts display to authorised staff without revealing the other client's private details.

### 7.4 Quote state

`draft -> approved_by_vendor -> sent -> received -> normalised -> reviewed -> accepted | declined | expired | superseded`

The supplier quote supports line items, quantity/unit, tax treatment, discounts, inclusions, exclusions, assumptions, optional items, expiry, payment schedule and attachments. The supplier's internal pricing method need not be public, but the price and what it covers must be clear.

The couple retains the original document and a normalised, evidence-linked view. Uncertain or missing facts remain visibly unconfirmed.

### 7.5 Booking state

Quote acceptance creates `booking_pending`, not `booked`. A booking becomes confirmed only after the configured evidence is present, such as supplier confirmation, signed terms or a deposit condition. The UI states exactly what remains.

### 7.6 Deposits and balances

Initial payment tracking is a ledger and reconciliation feature, not a payment processor:

`expected -> invoiced -> due -> evidence_pending -> part_paid | paid | overdue | waived | refunded`

Amounts use integer minor units, currency and immutable calculation inputs. Status changes link to evidence and support corrections through superseding events. Taking money requires a separately approved payment integration.

## 8. AFP event design

Names are illustrative and must be reconciled with the event registry before implementation:

- `practice.created.v1`
- `practice.member.granted.v1`
- `practice.member.revoked.v1`
- `wedding.collaboration.granted.v1`
- `wedding.collaboration.revoked.v1`
- `practice.client.indexed.v1`
- `workflow.item.assigned.v1`
- `workflow.next_action.changed.v1`
- `availability.policy.recorded.v1`
- `availability.exception.recorded.v1`
- `date_hold.requested.v1`
- `date_hold.offered.v1`
- `date_hold.accepted.v1`
- `date_hold.released.v1`
- `date_hold.expired.v1`
- `date_hold.converted.v1`
- `vendor.package.revised.v1`
- `quotation.draft.revised.v1`
- `quotation.sent.v1`
- `quotation.accepted.v1`
- `booking.confirmed.v1`
- `payment_schedule.item.recorded.v1`
- `payment_evidence.recorded.v1`
- `payment_state.changed.v1`

Events are append-only, versioned and idempotent. Projection rebuilds must be deterministic. Cross-plan queries use authorised indexes and then fetch details from the source plan; they do not create a second truth.

## 9. A2UI contract

A2UI is appropriate for role- and state-dependent composition such as:

- the highest-priority card;
- an enquiry next-action panel;
- a hold-expiry warning;
- a quote summary and evidence disclosure;
- an authority/approval request;
- a contextual checklist inside a client plan.

The server sends allowlisted component types and typed data. It does not send arbitrary HTML, CSS, script or opaque technical errors. Client actions submit typed commands with actor, plan, expected state version and idempotency key. The server reauthorises every command.

Stable navigation, data tables, calendar primitives and accessibility semantics should remain normal application components rather than being regenerated by a model.

## 10. AI boundaries and cost discipline

LLMs may:

- classify an incoming message into a proposed category;
- draft or revise a reply after a meaningful user request;
- extract a quote once into structured evidence;
- summarise relevant client context from scoped AFP objects;
- explain a deterministic ranking or next step in user-facing language.

LLMs must not:

- decide permission or disclose unapproved context;
- determine calendar conflicts;
- perform financial arithmetic;
- send a message;
- accept a quote;
- confirm a booking or payment;
- invent supplier availability, prices, reviews or fit.

Drafts are AFP events with source references, model/version, cost, approval state and revision lineage. Reusable prompt prefixes are cached. The system retrieves relevant structured objects instead of replaying full histories. Quote extraction is incremental and comparisons regenerate only when inputs change. Per-account and per-plan budgets degrade gracefully to simpler models or user-approved top-ups.

`gpt-6-astra` with high reasoning is recommended for implementation because this work crosses AFP contracts, tenancy, projections, Rust and TypeScript UI. Runtime inference remains governed by the existing model policy and should use the least expensive model that passes the task-specific evaluation; the implementation-model choice does not change production model policy. OpenAI's current model catalogues are available in the [API model documentation](https://developers.openai.com/api/docs/models) and [Codex model documentation](https://developers.openai.com/codex/models).

## 11. Security and privacy

### 11.1 Tenant isolation

- Every practice, plan, conversation, document and vendor route authorises the authenticated actor server-side.
- IDs are opaque; knowledge of an ID grants nothing.
- Cross-client list projections contain only allowlisted summary fields.
- Search, exports, reminders, websocket updates and attachment URLs are scoped identically to primary reads.
- Staff role changes revoke derived access promptly.

### 11.2 Messaging

- In-app or masked-email replies are the default only after relay gates pass.
- A vendor may choose an approved own-email sender or a vendor/location mask according to the reviewed mail design.
- Couple contact fields are off by default and shared per enquiry.
- Attachments use existing type, size, malware-scan and content-disposition controls.
- Duplicate inbound mail, forged provider events, retry storms, bounces and abuse are handled idempotently.

### 11.3 Encryption and storage

Message and document keys follow per-recipient/per-plan access rather than a universal operator-decryptable application key. SeaweedFS credentials remain server-only, rotated and least-privileged; browsers receive short-lived authorised object access, never storage credentials. Audit logs avoid plaintext messages and secrets.

### 11.4 Sensitive planner visibility

A planner does not automatically gain every field a couple has disclosed to OmnyID. Invitations show requested scopes. The client can inspect, reduce or revoke access, with consequences explained before confirmation.

## 12. Visual and interaction design

Use `docs/DESIGN_SYSTEM.md` section 11:

- Warm Porcelain `#FAF7F2` page background;
- Deep Teal `#0F5F5A` primary action;
- Ink Blue `#274B77` secondary action;
- Soft Warm Gray `#E8E2D9` dividers;
- white cards and warm dark text;
- 8–12px card and button radii, not pill-shaped cards;
- one primary action per viewport region;
- minimum 44px targets, preferably 48px on touch surfaces.

State uses colour plus icon and text. Cards use a consistent content/footer layout so actions align. Pending chips are actionable only when they navigate or filter. Tables collapse into semantic cards on mobile; they do not force horizontal scrolling for core actions.

Material changes require a confirmation dialog with large `Cancel` and consequence-specific confirmation buttons. Persistent inline help appears at the point of use. Technical identifiers, stack traces and provider errors never reach the user.

## 13. Accessibility and performance

Required checks include:

- keyboard-only operation and visible focus;
- focus restoration after partial rerenders;
- screen-reader names, state and live-region restraint;
- 200% and 400% zoom without one-character text columns;
- 360px mobile layout and safe-area support;
- reduced-motion behaviour;
- WCAG AA contrast;
- touch-target spacing;
- virtualised or paged large client/inbox lists;
- lazy, responsive media with reserved dimensions;
- agenda-first calendar fallback when a grid is unusable.

The initial portfolio response should contain summaries, not every client's full plan. Detail is fetched on demand and cached within its permission lifetime.

## 14. Notifications and service levels

Reminders project from AFP events and appear in all authorised surfaces consistently. Users choose in-app/email channels, quiet hours and escalation rules. Suggested response targets are configurable practice policy, not claims that a vendor has breached a contract.

No automated reminder is sent externally without the configured authority. Duplicates are prevented through stable notification keys. Unanswered enquiries explain the available next action: remind, try another route, shortlist another supplier or close the enquiry.

## 15. Measurement

Measure product value without inventing sales claims:

- median time from enquiry receipt to first meaningful action;
- percentage of items with owner and next step;
- draft-to-approved and sent-to-response times;
- quote completeness and normalisation coverage;
- hold expiry outcomes;
- time from quote acceptance to booking confirmation;
- on-time deposit/balance evidence;
- planner active clients and weekly retained use;
- permission revocations, send cancellations and support incidents.

Analytics use minimised identifiers and do not copy message or document contents.

## 16. Rollout and feature flags

Suggested flags:

- `OMNYID_WEDDING_PRO_PRACTICE_ENABLED`
- `OMNYID_WEDDING_PRO_INBOX_ENABLED`
- `OMNYID_WEDDING_PRO_CALENDAR_ENABLED`
- `OMNYID_VENDOR_DATE_HOLDS_ENABLED`
- `OMNYID_VENDOR_ITEMISED_QUOTES_ENABLED`
- `OMNYID_WEDDING_PAYMENT_TRACKING_ENABLED`

All default off outside tests. Existing relay, vendor-mail and ranking-policy flags remain independently controlled. This program does not satisfy or bypass their rollout gates.

Release order:

1. contract tests and synthetic practices;
2. internal staff use with no external send;
3. invited planner/couple usability;
4. vendor sandbox and provider-authorised smoke tests;
5. small allowlisted planner cohort;
6. measured expansion with rollback evidence.

Required evidence includes tenant-isolation review, hosted accessibility, planner/couple/vendor usability, permission wording approval, relay security when enabled, provider delivery evidence when enabled, and an observed allowlisted cohort.

## 17. Non-goals for the first release

- marketplace ranking auctions or undisclosed paid placement;
- full accounting, payroll or tax software;
- card or bank payment processing;
- public review collection without provenance/moderation design;
- automatic booking based only on quote acceptance;
- universal calendar synchronisation before core holds are reliable;
- replacing specialist floor-plan or event-production tools;
- exposing one client's details in another client's conflict warning.

## 18. Acceptance criteria

The specification is realised when:

1. a planner can switch between a practice and personal Wedding contexts without data leakage;
2. each client remains one normal Wedding plan and AFP source of truth;
3. authorised clients appear in a useful portfolio with owner, next action and due state;
4. an inbox item opens the exact conversation and can progress without hunting for another page;
5. calendar capacity, buffers and holds are distinct, conflict-aware states;
6. suppliers can maintain one reusable profile and packages, then respond and quote per client;
7. an itemised quote is retained as original evidence and a normalised couple-facing projection;
8. acceptance, booking confirmation and payment evidence remain separate explicit events;
9. mobile navigation and every primary button have a predictable destination or inline result;
10. couple, planner, team and supplier permissions are inspectable and revocable;
11. A2UI never bypasses server authority or leaks technical messages;
12. focused tests, full Wedding tests, relevant Rust tests, typecheck, production build, line budget and rollout evidence pass.

## 19. Build-base rule

Implement from commit `6af9203` on `agent/codex/WED-215`, or from a reviewed descendant that contains it. Do not build from or copy another worktree wholesale. Before each slice, compare the selected base, consume only missing reviewed dependencies and preserve unrelated uncommitted work. New source and document files must remain below 1,000 lines; split by domain instead of enlarging already-large modules.

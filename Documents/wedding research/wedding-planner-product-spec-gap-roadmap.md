# OmnyID Wedding Planner Product Spec And Gap Roadmap

Source basis: `ideal wedding planner.md`, recent wedding planner implementation decisions, and the current direction to keep the homepage structure while tightening the square cards and top decision surface.

## Product Position

OmnyID Wedding Planner should feel less like a chatbot, checklist, or vendor directory and more like a calm wedding operating system. The user should not have to manage the wedding like a project manager. The product should remember preferences, constraints, family context, vendor facts, budget risk, and unresolved decisions, then surface only the few items that need human judgement.

The planner should keep the current homepage as the familiar entry point. The homepage should not become a dense dashboard. It should show a quick status snapshot first, then the few decisions that deserve attention.

## What We Are Keeping

- Current wedding homepage layout and overall bento-style surface.
- Square snapshot cards for budget, guests, dates, vendors, and adjacent status.
- The top decision surface, but reframed as simple attention guidance instead of a technical queue.
- The AFP ledger model as the durable backbone for plans, decisions, tasks, files, permissions, outreach, and memory.
- DecisionOS integration for ranked decisions and approval-style work.
- PersonalOS-style attention narrowing: three important things, not a giant checklist.
- A2UI-compatible view state: interfaces should be renderable by agents and humans from structured state.
- Progressive disclosure: ordinary users see plain language first; advanced proof, packet, source, and audit details stay behind reveal controls.
- User-facing wording: no visible "AFP message", "packet format", "second order loop", or raw technical labels.
- Family and guest boundary management as a first-class wedding need, not a generic guest list.
- Budget, guests, seating, helpers, timeline, vendors, documents, and family boundaries as separate focused surfaces.

## What We Are Leaving Out For Now

- A full homepage redesign.
- A 47-question onboarding form.
- A chatbot-only planning model.
- A generic vendor marketplace as the main product.
- Raw technical proof surfaces on the main user view.
- A bureaucratic permissions UI that makes family boundaries feel legalistic.
- Fully automated sensitive changes without human approval.
- Complex vendor or family automations that act externally before the couple approves.
- Perfection-grade wedding ontology UI. The ontology should be inferred and used quietly before it is exposed.

## Current Progress

### Homepage And Snapshot Cards

The homepage now keeps the familiar surface while making the square cards more meaningful. The budget card is moving toward the target model:

- Budget
- Committed
- Expected final
- Remaining exposure or forecast risk

The guests card is moving away from a vague count and toward:

- Total guests
- Replies received
- Awaiting replies
- Attending count

The date card is actionable and should continue to link into calendar/timeline context.

### Decision Focus

The top decision surface has been reframed as:

> Three things worth your attention

This better matches the research direction:

- reduce decision fatigue
- recommend the next useful action
- explain why an item matters
- avoid overwhelming users with all background state

Current focus actions are:

- Compare
- Show me why
- Decide later
- Review top decisions

### Budget Foundation

The budget system has started moving beyond a simple total. It already has concepts that can support:

- target budget
- committed amount
- expected final amount
- remaining amount
- imported quotes and contracts
- category allocation

The next product step is to make these concepts user-visible and action-connected in every place where budget appears.

### Guest, Family, And Boundary Foundation

Guest and boundary work has begun, including the idea that family rules, helper permissions, invitation scope, and sensitive changes should be modeled as durable objects rather than loose notes.

This is essential because wedding planning conflict often comes from unclear authority, not missing information.

### Documents And Imports

The planner supports the product direction that uploaded guest lists, budgets, spreadsheets, contracts, and vendor quotes should be saved for later and synthesized into workspace state.

The remaining gap is making every imported file visibly connected to the surfaces it influences.

## Core Product Gaps

### 1. Durable "Decide Later"

Current gap: "Decide later" is visible, but it needs a durable action path so the planner knows the couple intentionally deferred something.

Needed behavior:

- save the deferral as a structured action
- keep the item out of the immediate top-three surface for an appropriate period
- preserve the reason and evidence
- bring it back before its due date or when a dependency changes

### 2. Budget Intelligence V2

Current gap: the planner has budget tracking pieces, but the user still needs richer practical guidance.

Needed behavior:

- show budget, committed, paid, estimated, remaining, and forecast
- include tax, service charge, gratuity, delivery, alterations, travel, overtime, and contingency
- normalize vendor quotes into comparable fields
- show monthly cash required
- show safe, balanced, and stretch plan versions
- warn when one choice makes later needs unaffordable
- connect budget tradeoffs to stated priorities

### 3. Wedding Experience Model

Current gap: preferences are captured, but the system needs a clearer inferred model of the couple's desired wedding.

Needed behavior:

- infer atmosphere, values, social style, sensory priorities, and friction tolerance
- link preferences to evidence
- flag conflicts between decisions and stated style
- use the model to explain recommendations in plain language

### 4. Relationship Memory And Guest Boundaries

Current gap: guest and family information needs to become enforceable relationship memory.

Needed behavior:

- household grouping
- per-event invitation state
- children and plus-one rules
- family suggestion flow
- approval queue for sensitive changes
- couple-only rationale notes
- family-facing page with only approved non-private information

### 5. Two-Person Couple Workload

Current gap: the planner must treat the couple as a small team, not one owner plus helpers.

Needed behavior:

- show each partner's open tasks
- show overdue items and estimated workload
- support decision owner plus consulted partner
- flag workload imbalance neutrally
- create a weekly 10-minute planning agenda

### 6. Vendor Communication Loop

Current gap: vendor follow-up exists, but the loop should be stronger.

Needed behavior:

- record last contact date per user and vendor
- ingest replies into the right vendor, quote, contract, or decision
- draft next reply
- wait for approval before sending
- close the loop after response or decision

### 7. Every Surface Must Lead Somewhere

Current gap: some labels, dates, files, buttons, and cards still risk feeling decorative.

Needed behavior:

- dates open calendar or task context
- budget figures open budget context
- guest figures open guest management
- document references open the file or file library
- vendor prompts open draft approval
- done tasks open completed task history

## Most Urgent Build Order

1. Make "Decide later" a real wedding action with typed metadata and navigation.
2. Finish budget intelligence v2 from the user's point of view: forecast, uncertainty, cash timing, and quote comparison.
3. Make guest and family boundary actions fully durable, including approval-required changes.
4. Connect every snapshot number and date to the relevant working surface.
5. Strengthen vendor follow-up with last-contact state, draft approval, and reply ingestion.
6. Add a lightweight Wedding Experience Model that turns preferences into recommendation constraints.
7. Add couple workload balance and a weekly planning agenda.
8. Continue moving advanced proof, source, provenance, and confidence details behind reveal controls.

## Homepage Direction

Keep the current homepage. Tighten it rather than replacing it.

The top order should be:

1. Snapshot cards: budget, guests, date, vendors, and immediate plan health.
2. Three things worth your attention.
3. Contextual surfaces that open only when needed.

The homepage should answer in seconds:

- How much money is left?
- How many guests are unresolved?
- How long until the wedding?
- What needs a human decision?
- What is the planner quietly watching?

## Definition Of Done For The Next Product Pass

- Every visible button performs a meaningful action or is clearly disabled with a plain reason.
- Every visible date opens calendar/task context.
- Every visible file reference opens a file or file list.
- Every decision focus item supports compare, explanation, and durable deferral.
- Budget surfaces distinguish budget, committed, paid, expected final, and risk.
- Guest and family boundary surfaces can create or request changes, not only display them.
- Sensitive changes create approval records.
- Private rationale stays couple-only by default.
- Advanced technical details remain available but hidden from the normal user path.

## Backend Provider Metering Requirement

Every admin-funded wedding provider call must produce a per-user external-tool usage event. Provider integrations should use `wedding_shared_tool_usage_event` before writing to `user_external_tool_usage_events`, so Maps, WeatherAPI, Twilio, Stripe, and Cloudinary usage is recorded with:

- the user id
- the provider id
- the wedding planner template scope
- the wedding plan id when available
- the operation performed
- quantity and estimated cost
- provider request id when available

This keeps the admin shared-tool toggles honest: enabling a provider for all users or for wedding planner only must also make its usage visible in the Usage admin panel.

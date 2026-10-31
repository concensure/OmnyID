# Family Boundaries Specification

Status: implementation specification
Task: WED-306
Architecture: AFP ledger authority, deterministic projections, A2UI actions
Scope: existing Wedding Guests, RSVP, Seating, Budget, Tasks and People surfaces

## Outcome

Family Boundaries lets a couple involve relatives and household representatives without allowing suggestions to silently change the official guest list. It extends the canonical Wedding guest projection; it does not create another guest database.

The default card is a compact summary:

- Family boundaries — Manage requests and family permissions.
- Requests — number needing review.
- Households — invitation household count.
- One clear disclosure action opens the detailed controls.

## Product principles

1. Anyone with an appropriate grant may suggest; only an authorised actor may approve.
2. A request is not an effective guest-list change.
3. Approval revalidates the current allocation, policy revision and downstream impact atomically.
4. Household membership, invitation grouping and information visibility are separate concepts.
5. Private contact, dietary, accessibility, conflict and seating information is minimum-necessary and false-default for sharing.
6. Rules are structured for deterministic evaluation. Free text explains intent but is not the enforcement mechanism.
7. The current state is projected without an LLM. An LLM may help explain or draft, but cannot approve, authorise or infer sensitive facts.

## Existing foundations to reuse

- `weddingBoundaryLedgerState.ts`: typed policies, households, guests, invitations, requests and rationales.
- `weddingBoundaryTopologyState.ts`: deterministic guest/household/permission graph.
- `weddingGuestBoundaryDraftState.ts`: current couple-side guest and rule commands.
- RSVP capability and response routes: scoped, revocable household invitation access.
- Seating constraints and guest tracking: downstream projections over the same person and invitation references.
- `WeddingBoundaryManagementCard`: existing request/rule UI and AFP command wiring.

No new local-only boundary store is permitted. Device storage may hold an unsaved form draft only and must never grant authority.

## Information architecture

### Summary card

The collapsed card shows only:

- feature name and plain-language purpose;
- information tip explaining suggestion versus approval and privacy;
- pending request count;
- canonical household count;
- chevron/disclosure control.

Selecting Requests opens the detail view with requests expanded. Selecting Households opens household/visibility details. Zero is described as “Nothing needs review”, not as an error.

### Detail view

The expanded view contains:

1. Requests needing review.
2. Households requiring attention.
3. Effective rules and their source scope.
4. Add request and structured Add rule actions.
5. Visibility and permission summary.
6. Private downstream impact preview when a decision affects RSVP, seating, catering exposure or invitations.

Advanced audit identifiers remain outside the everyday couple view.

## Canonical entities

| Entity | Authority and purpose |
| --- | --- |
| `family_group` | Reusable allocation and policy scope across households. |
| `household` | Invitation group and representative references; not a visibility grant by itself. |
| `guest` | Canonical person reference used by Guests, RSVP and Seating. |
| `boundary_rule` | Typed condition, effect, scope, authority, status and version. |
| `permission_grant` | Principal, allowed action, record scope, expiry and revocation. |
| `boundary_request` | Proposed mutation and current lifecycle; never an effective guest change by itself. |
| `boundary_decision` | Authorised outcome, reviewed version and public explanation. |
| `boundary_exception` | Narrow override of an overridable parent policy, with expiry. |

Sensitive values belong in separately controlled records. Immutable events should contain identifiers and redacted impact facts, not copied private notes.

## Rule model

Every enforceable rule has:

- type: plus-one, allocation, invitation, visibility, deadline, seating or communication;
- scope: wedding, family group, household or guest;
- condition and effect: allow, deny, limit, require approval or notify;
- authority and approval policy;
- version and effective period;
- visibility;
- status: draft, active, superseded or archived;
- override policy.

Precedence is type-aware:

1. system privacy and security constraints;
2. non-overridable wedding limits;
3. authorised narrow exceptions;
4. individual, household and group policy;
5. wedding defaults.

A more specific invitation rule cannot override an unrelated privacy denial.

## Request lifecycle

`draft -> pending -> approved | partially_approved | declined | withdrawn | expired | auto_blocked`

Submission requires an idempotency key. Approval requires:

- current request status is pending;
- actor is authorised for the target and action;
- expected rule and allocation versions still match;
- duplicate-person and capacity checks pass;
- any elevated two-partner approval policy is satisfied;
- guest mutation and capacity reservation commit in one transaction;
- one AFP decision event and deterministic downstream reconciliation receipt are written.

Retries return the existing result. A stale approval returns a reviewable conflict and does not partially mutate the guest list.

## Approval levels

- Automatic: own spelling/contact correction or an RSVP within an existing entitlement.
- Single approval: plus-one, replacement, allocation or scoped helper grant within configured limits.
- Elevated approval: hard-cap exception, material confirmed-invitation change or private-data disclosure.

Elevated approval may require both partners. Creating the first approval does not apply the change.

## Cross-feature reconciliation

One accepted change may produce several projections, but not several user actions.

| Accepted change | Automatic projection |
| --- | --- |
| Add guest | Guest and invitation entitlement; guest/count/task summaries refresh. |
| Approve plus-one | Authorised slot and invitation workflow; no RSVP is invented. |
| Remove guest | Impact review for RSVP, seat and catering commitment before effect. |
| Increase allocation | Group capacity and remaining-seat summary. |
| Seating separation | Couple-only seating constraint without disclosing the reason. |
| Revoke helper | Immediate grant invalidation and removal from future authorised actions. |

Approval does not send an invitation, commit spending or change a vendor contract unless the preview includes a separately approved command for that action.

## Meal-choice relationship

Meal choices use the same Wedding ledger but are not boundary rules. The current catalogue must come from explicit structured venue/package evidence, vendor conversation, run sheet, or couple manual entry. The couple confirms the catalogue before RSVP publication.

Guest meal selection references one confirmed option. Dietary/allergy and accessibility notes remain distinct sensitive fields and are never inferred from a meal choice.

Changing a confirmed catalogue previews affected RSVP responses and does not silently rewrite them.

## Authorisation and privacy

- Server validates account, wedding, household, invitation, actor and action for every command.
- Household membership does not reveal another adult's contact, health, dietary or private seating data.
- Family helpers see only assigned aggregates, requests and fields.
- Couple members may have full visibility but separately configured approval authority.
- Planner access is explicit, scoped, expiring and revocable.
- Capability links are digest-only, bounded, rotatable and revocable.
- Deletion follows the account and guest retention policy, with sensitive records purgeable while the event trail retains redacted referential evidence.

## A2UI contract

The projector may emit:

- `wedding.boundary.open_summary`
- `wedding.boundary.review_requests`
- `wedding.boundary.open_households`
- `wedding.boundary.propose_request`
- `wedding.boundary.propose_rule`
- `wedding.boundary.preview_decision`
- `wedding.boundary.confirm_decision`
- `wedding.boundary.withdraw_request`

The resolver maps each intent to an existing or new authoritative command. A2UI contains labels and record references, not hidden authority.

## Accessibility and mobile requirements

- The mobile Wedding shell has no desktop outer glass border or wasted horizontal inset.
- Internal cards retain boundaries where they clarify grouping.
- Summary metrics are two columns at 320 px and remain readable at 200% text zoom.
- Disclosure, metrics and actions are keyboard and screen-reader operable.
- Status is expressed in text as well as colour.
- Focus moves to the opened section and returns to the trigger when closed.
- Destructive or material changes use large Cancel and Confirm actions and describe downstream effects.

## Non-goals for the first release

- No automatic identity merge based on names.
- No LLM policy adjudication.
- No family-wide access inferred from a shared surname or address.
- No automatic invitation send, vendor commitment or spend commitment.
- No replacement of the canonical guest, RSVP or seating projections.

## Release criteria

1. Existing boundary records project into the compact card without migration loss.
2. Cross-tenant, cross-wedding and revoked actors cannot read or mutate records.
3. Duplicate submission and concurrent final-seat approval tests are deterministic.
4. Stale policy/allocation approval is refused with a reviewable explanation.
5. RSVP, seating, budget exposure and task summaries reconcile from one accepted change.
6. 320/375 px, 200% text zoom, keyboard, focus and screen-reader checks pass.
7. Policy V2 and unrelated provider flags remain unchanged unless their own rollout criteria are met.

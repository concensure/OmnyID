# Wedding RSVP specification

Status: implementation specification
Work item: WED-303
Implementation branch: `agent/codex/WED-303`
Build baseline: `f119f48ee96a44117b52eba3c60966af86cf794f`
Source direction: `Documents/design/wedding planner/RSVP feature.md`

Focused invitation UX extension: `microwedding-invitation-rsvp-ux-spec.md` selects three incremental workflows—household preflight/test, durable confirmation/edit and evidence-based follow-up—without replacing this authority.

## 1. Outcome

OmnyID turns an invitation into one private, structured guest workflow. A response updates the couple's existing guest list and all projections that depend on it: Wedding Home, catering counts, seating, reminders, decisions and approved vendor briefs.

RSVP is not a separate application or guest database. It extends the existing Wedding AFP guest graph, `WeddingGuestTrackingState`, People/Guests surfaces, seating projector and Home guest tile.

The product should let a straightforward guest respond in about a minute, while still handling households, multiple events, children, plus-ones, dietary needs, accessibility needs and later amendments safely.

## 2. Principles

1. AFP is authoritative. Every durable invitation, response, amendment, approval and reminder receipt is an account- and wedding-scoped AFP event.
2. One fact has one source. Guest View and Wedding Home use the same response projector and never maintain independent counts.
3. A2UI proposes bounded actions. A2UI can render or suggest `open_rsvp`, `record_manual_response`, `review_late_change` and `prepare_reminder`; it cannot bypass entitlement checks, approval or the AFP writer.
4. Responses are per person and per event. A household shortcut may set several answers, but it emits individually attributable guest-event changes.
5. Unknown is not no. Pending, incomplete, changed, locked and disputed states remain explicit.
6. Sensitive data is minimised. Dietary/allergy, accessibility and contact details are couple-only by default and shared with a vendor only through an explicit, previewed approval.
7. Deterministic operations do not use an LLM. Entitlement checks, counts, deadlines, completeness, seating effects and exports are code. A small model may draft optional reminder wording only after the user asks.
8. Mobile and assistive technology are first-class. The primary flow works at 320 CSS pixels, at 200% text zoom, by keyboard, and with meaningful names/status announcements.
9. No guest is enrolled in marketing. RSVP does not require an OmnyID account and guest contact data is not a lead source.
10. Connected facts reconcile automatically. A response updates every dependent projection with an explanation; the couple should never reconcile Home, Guests and Seating by hand.

## 3. Existing system to extend

The current implementation already provides:

- AFP-backed guest profiles, households, event invitations and boundary policies;
- imported guest-list projection;
- per-person manual RSVP changes in Guests;
- attendance, decline, pending, meal and access aggregates;
- People/Guests views, Home guest tile and seating projections;
- guest follow-up and final-count task generation;
- RSVP readiness and production-gate state;
- A2UI metadata on guest actions.

WED-303 must extend these contracts. It must not add a second RSVP table, browser-only response ledger, duplicate People page or separate Home counter.

## 4. User journeys

### 4.1 Couple prepares invitations

The couple imports or adds named guests, groups them into households, selects event entitlements, configures controlled questions and chooses an RSVP deadline. OmnyID previews exactly what each household can see and change.

Publishing creates a random invitation capability, not a sequential guest identifier. A printed QR code and copied link resolve to the same capability. Creating a preview sends nothing.

### 4.2 Guest responds

The guest opens a mobile page showing the couple/event identity and only named recipients within the capability scope. They can use a household shortcut, but attendance remains per person and per event.

Conditional sequence:

1. attendance for each entitled event;
2. attendee-only meal selection;
3. structured dietary/allergy category, `None`, and optional detail;
4. optional private accessibility requirement;
5. only configured travel/accommodation/custom questions;
6. review and submit.

Declining guests do not see meal or transport questions that no longer apply. A guest can save a partial response and return before the deadline.

### 4.3 Couple records an offline response

The existing Guests view remains the fallback for phone, SMS, paper or in-person answers. The response is recorded as `couple_manual`, not misrepresented as guest-submitted.

### 4.4 Response arrives

One accepted command appends AFP response events. The shared projector updates:

- the matching rows and status summary in Guests;
- the Home guest tile without a reload-dependent local override;
- seating eligibility and unassigned-attendee counts;
- catering and dietary/accessibility projections;
- outstanding reminder candidates;
- late-change or missing-detail exceptions;
- final-count decisions and budget effects.

The UI explains material consequences, for example: “Alex is attending. Guest count is now 74; one meal choice is still needed.”

### 4.5 Guest changes a response

Before the configured lock, a valid capability can append a new version. The previous response remains auditable. After the lock, a change becomes a reviewable exception and must not silently change committed catering or seating facts.

## 5. Canonical domain model

Existing boundary objects remain the guest graph. The RSVP extension adds lifecycle detail rather than replacing them.

### Wedding event

- stable `event_id` within the wedding plan;
- label, start time and optional response deadline;
- controlled question set and meal choices;
- vendor/catering cut-off, when known.

### Guest profile

- stable opaque `person_id`;
- display name and household reference;
- age band where operationally required;
- private contact, meal, dietary and accessibility fields;
- no public sequential identifier.

### Event invitation

- opaque `invitation_id`, `event_id`, `person_id`;
- entitlement and invitation state;
- plus-one and children permissions;
- lifecycle source, viewed/responded/locked timestamps, prior status and revision;
- guest visibility limited to the invitation capability.

### RSVP response

The production guest submission is an append-only AFP event containing:

- random response ID and capability reference digest;
- wedding, invitation, person and event references;
- `attendance`: yes, no or unanswered;
- controlled answers and encrypted/private sensitive detail;
- source: guest, couple manual, import or system correction;
- submitted timestamp, version and idempotency key;
- references to the superseded response when amended;
- validation result and downstream-impact summary.

The current invitation record can carry compatible lifecycle fields during the incremental rollout. A later response object must project into the same `WeddingGuestTrackingState` contract.

### Capability grant

- at least 128 random bits, stored as a digest;
- household/invitation scope, expiry and revocation timestamp;
- one active capability can cover several named recipients but never another household;
- rate-limit and suspicious-use metadata;
- token values never appear in AFP, logs, analytics or URLs after exchange.

## 6. State machine

Operational states are derived, not manually reconciled:

| State | Meaning |
| --- | --- |
| Not sent | Guest exists but has no issued invitation |
| Invited | Capability issued or paper invitation recorded |
| Viewed | Link opened where disclosed and appropriate |
| Incomplete | Attendance exists but required attendee details are missing |
| Responded | Required answers are complete |
| Changed | A later answer superseded a response and consequences are visible |
| Locked | Cut-off passed; changes need review |

Attendance is a separate per-event value: pending, attending or not attending. “Viewed” never implies consent or attendance. “Responded” is only complete when all configured required fields for that guest-event response are valid.

## 7. Projection and reconciliation rules

The response projector is a pure deterministic function over scoped AFP objects and imported evidence.

1. Coalesce versions by stable logical ID and authoritative revision/timestamp.
2. Preserve multiple invitations for one person; never use `person_id` alone as the invitation key.
3. Derive per-event rows, then derive each guest's overall display state.
4. Count a person once in headline guest totals, while showing event-specific counts separately.
5. An attending guest missing a required meal or answer is `Incomplete`, not fully responded.
6. A decline releases projected seating availability but does not cancel vendor commitments.
7. A post-cut-off amendment creates an exception and keeps the committed value visible until approved.
8. Imported and manual responses carry provenance labels.
9. Home, Guests, People, Seating, catering and tasks consume this same projection.
10. Replaying the same response is idempotent and cannot double-increment counts.

## 8. Couple-facing surfaces

### Wedding Home guest tile

The existing tile remains the entry point. It shows total named guests, replies received, awaiting replies, attending count and incomplete/changed attention when present. Counts update whenever the workspace AFP query refreshes after a response event.

### Guests view

Extend the current Guest Operations card with:

- consistent summary filters: attending, awaiting reply, needs details, declined;
- status per guest with household, event and provenance;
- missing-detail prompts rather than a false “complete” state;
- private-data labels on dietary/accessibility detail;
- manual entry using the same authoritative writer;
- late-change review and history in later slices.

### People page

People remains a navigation/aggregate surface. Its reply badge uses the same projector and opens the filtered Guests view.

### Seating and catering

Only attending guests are offered for seating. Sensitive requirements are not placed in general exports. The couple previews a minimum-necessary vendor brief before explicit approval.

## 9. Guest-facing surface

The guest page is a small public entry point backed by server-validated capabilities. It must:

- require no OmnyID account;
- avoid third-party trackers by default;
- return generic errors for invalid, expired and revoked links;
- render only the permitted household/event fields;
- use accessible controls, progress text and review summary;
- support slow connections and a no-animation mode;
- show a clear collection notice before sensitive fields;
- make optional OmnyID attribution visually secondary.

Client state is a draft convenience only. The server revalidates entitlement, required fields, version and lock status before appending AFP events.

## 10. Privacy and security

- Default guest profile visibility is couple-only. Invitation-safe names and entitlements are projected separately for the capability.
- Allergy, dietary, accessibility, phone and email data are private fields. At-rest and message-level protection follows the account/wedding key architecture.
- A vendor receives only approved logistics fields required for its role; it does not receive the whole guest profile.
- Show an exact sharing preview and recipient before vendor export.
- Record consent/collection notice version with sensitive submissions where required.
- Support correction, retention and deletion workflows without erasing required audit facts.
- Hash capability tokens; redact message bodies, answers and tokens from telemetry.
- Enforce account, wedding, invitation and guest-event scope server-side.
- Rate-limit open and submit endpoints; use idempotency and CSRF-safe request design.
- Do not expose whether a guessed guest or wedding exists.
- Do not use guest details for marketing or model training.

## 11. A2UI contract

Allowed intent examples:

- `wedding.rsvp.open_guest_filter`
- `wedding.rsvp.record_manual_response`
- `wedding.rsvp.prepare_reminder`
- `wedding.rsvp.review_incomplete`
- `wedding.rsvp.review_late_change`
- `wedding.rsvp.preview_vendor_brief`

Each intent carries bounded IDs already visible in the projection. The resolver checks scope and maps it to existing navigation or authoritative commands. No A2UI payload may contain a bearer token, private note or unapproved vendor data.

## 12. LLM and token policy

Core RSVP collection requires zero model calls. Optional reminder or guest-message drafting may use `openai/gpt-5-mini` through the existing provider abstraction because it is a low-risk editing task. The prompt uses a cached template plus only the relevant household/event facts. Generated text is an AFP draft with source references, model/cost metadata, approval state and revision history. Nothing is sent without explicit approval.

## 13. Accessibility and mobile requirements

- 44 CSS pixel minimum targets and no horizontal page scrolling at 320 pixels;
- status is conveyed by text/icon as well as colour;
- household shortcuts do not hide individual names or choices;
- errors link to the affected field and focus remains stable after updates;
- live regions announce save/submission results without replacing the whole page;
- semantic fieldsets/legends for each guest and event;
- no drag-only operation;
- 200% text zoom and forced colours retain readable controls;
- dates include full readable text, not colour-only urgency.

## 14. Rollout and evidence

1. Land shared couple-side projection and persistence fixes with flags unchanged.
2. Add server capability/command contracts and adversarial isolation tests.
3. Add guest page behind a false-default feature flag.
4. Run disposable-Postgres, expiry/revocation, replay, late-change and privacy tests.
5. Run mobile browser/accessibility and household usability scenarios.
6. Hosted shadow with publishing and notifications disabled.
7. Allowlisted pilot; only then consider broader rollout.

Production readiness requires evidence for capability entropy, cross-household refusal, idempotency, version conflicts, lock handling, encrypted sensitive fields, exports, audit receipts, manual fallback and at least the scenario matrix in the task document.

## 15. Success measures

- response completion rate and median completion time;
- incomplete-answer rate by configured question;
- reminder-to-response conversion without duplicate contacts;
- count agreement across Home, Guests, Seating and exports;
- number of manual reconciliations required (target: zero);
- late-change exceptions resolved before supplier cut-offs;
- cross-tenant/cross-household disclosure incidents (target: zero);
- percentage of sensitive exports with a recorded preview and approval (target: 100%).

## 16. Out of scope for the first slice

- public RSVP publishing and live bearer capabilities;
- SMS/provider sending;
- multilingual generation;
- vendor delivery of dietary/accessibility briefs;
- free-form form building;
- analytics based on guest identity;
- automatic changes to contracted vendor quantities.

These remain dependency-ordered tasks, not implied production features.

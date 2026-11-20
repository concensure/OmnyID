# Microwedding invitation and RSVP UX extension specification

Status: implemented and released on Oracle; public capability/reminder send remains off and reviewed test-to-self is allowlisted
Work item: WED-385 planning slice; WED-386 implementation
Extends: `wedding-rsvp-spec.md` and the existing WED-303 implementation
Research input: `microwedding invitation wedding research.md`

Implementation checkpoint (WED-386): the existing publishing panel and public route now consume one pure household-experience projection in explicit preview, test and production modes. RSVP setup remains the canonical AFP source for guest-facing event facts; a 15-minute data-only Test fragment cannot satisfy the production capability token shape and performs no open/respond request. Optional test-to-self delivery binds an exact draft and approval to the authenticated couple address and stores separate provider receipts with `changes_household_lifecycle=false`. Capability open returns scoped guest-safe latest responses including lock evidence; returning confirmation supports changed-person-only append revisions, impact receipts, partial recovery and late-change contact guidance. The existing due-only follow-up surface consumes capability/provider/response/reminder evidence and reuses bounded actions.

Hosted checkpoint (2026-11-21): exact application/static SHA `23b9c57007188e460135f0e0c71806180f69d7a9` is live. An allowlisted synthetic couple and two named guests passed preview/test, append-only response and revision-3 returning-confirmation journeys. Private-answer plaintext stayed absent, the test envelope had no submit action, the provider accepted the reviewed test message, exact replay was suppressed and ledger deltas proved that test delivery did not alter household lifecycle facts. The production capability was revoked after proof. Full redacted evidence and rollback identifiers are in `Documents/verification/WED-386-hosted-release-evidence.md`.

### Canonical guest-facing event-field map

| Guest fact | Canonical field | Derived action |
| --- | --- | --- |
| Host identity | `wedding_rsvp_setup.host_label` | Heading/sender recognition |
| Event | `event_id`, `event_label` | Capability and invitation scope |
| Date | `event_date` | Add to calendar when present |
| Local time | `event_local_time` | Readable local start and calendar start |
| Time zone | `event_time_zone` | Explicit local-time context |
| Venue | `venue_name` | Place label |
| Address | `venue_address` | Directions destination and calendar location |
| Deadline | `response_deadline` | Response and deterministic follow-up policy |

Directions are derived only from `venue_address`; calendar data is derived only from the date/time/time-zone/venue fields above. Neither derived URL is persisted as a second event authority. Legacy setup records project the new fields as null and show the single most material preflight gap instead of inventing facts.

## 1. Outcome

Lift the invitation-to-reply experience for intimate and small weddings without replacing OmnyID's existing RSVP workflow.

The couple should be able to check exactly what one household will receive, the guest should be able to return to a trustworthy record of what they submitted and amend it safely, and the couple should see one actionable follow-up view based on durable evidence.

This is an extension of the existing AFP-backed guest, household, event, capability, response, reminder and decision authorities. It is not a new invitation builder, guest database, RSVP ledger or communications system.

## 2. Why these three workflows

The supplied research is directional and qualitative. Its strongest repeated finding is that recognisable delivery, correct named-household replies and clear confirmation matter more than ornamental invitation features. The current product already implements much of the underlying RSVP flow, so the highest-value remaining increments are:

| Priority | Workflow | Existing foundation | Valuable remaining delta |
| --- | --- | --- | --- |
| 1 | Preview and test the real household experience | `buildWeddingRsvpInvitationPreviews`, setup review and protected-link creation | Render the actual guest-facing experience before publish, validate identity/event/action details, and support a clearly marked test-to-self path |
| 2 | Return to confirmation and edit safely | Household-scoped capability, named per-person/event response, review receipt and immediate amendment | Reopening the same valid link shows the latest non-sensitive response summary, confirmation state and a bounded amend action instead of an apparently blank form |
| 3 | Act on the right household next | Capability open evidence, canonical response projection, reminders and decision UI | One evidence-based lifecycle projection and decision card distinguishing issued, provider accepted, opened, incomplete, responded and needs follow-up |

These workflows improve confidence at the three highest-friction moments: before sending, after replying, and when deciding whom to chase.

## 3. Existing system to extend

Implementation must consume, not duplicate:

- the canonical wedding plan, event, guest profile, household and event-invitation AFP objects;
- the existing RSVP setup projection in `weddingRsvpSetupState.ts`;
- `WeddingRsvpPublishingPanel` and its household previews;
- the digest-only RSVP capability service and `/wedding/rsvp/capabilities/open` and `/respond` routes;
- append-only `wedding_rsvp_response.v1` responses, revision checks, idempotency and impact receipts;
- `WeddingRsvpResponseState`, Guest Operations, Home, People, seating and reminder projections;
- existing approved-message/provider receipt infrastructure for any test delivery;
- `WeddingDecisionRsvpFollowUp` and the existing bounded actionable-UI resolver.

No new store may become authoritative for event facts, guest names, invitation entitlement, delivery state or responses. Browser state is draft convenience only.

## 4. Product and AFP rules

1. AFP remains authoritative. Durable setup, send approval, provider receipt, capability open, response, amendment and follow-up decisions are scoped events or projections of existing events.
2. Preview is a projection, not a copy. Date, time, venue, directions, calendar data, household names and eligibility come from current canonical objects.
3. A test is not a guest event. Preview opens and test-to-self delivery must never mark the household as opened, sent or responded.
4. Evidence labels are literal. “Provider accepted” is not “delivered”; “opened” means the protected link was opened, not that an email was read; “responded” comes only from canonical response completeness.
5. The existing capability and response commands remain the only public write path. A returning guest cannot widen household or event scope.
6. Original responses are append-only. An amendment creates a new revision and impact receipt; it never overwrites history.
7. Sensitive answers stay couple-only. A returning public link must not return decrypted dietary, allergy, accessibility or private free text. It may state that a private answer was saved and allow the guest to replace it.
8. Decision surfaces lead to a bounded action. Cards say what changed, why it matters and what one action is available; they do not create generic duplicate tasks.
9. No account, marketing consent or app installation is required for a guest.
10. Core projections and validation use deterministic code and zero model calls.

## 5. Workflow 1 — preview and test the real household experience

### 5.1 Couple journey

From the existing household row, the couple selects **Preview as this household**. OmnyID renders the same responsive component and projection the guest route will use, in a preview boundary that cannot submit.

The preflight shows:

- recognisable host/couple label;
- household label and every named eligible person;
- only the events and questions those people are entitled to see;
- date, readable local time, venue and address from the canonical event;
- visible RSVP, Directions and Add to calendar actions when their source facts exist;
- deadline, privacy notice and a plain-link/contact fallback;
- any plus-one or child entitlement exactly as the server will enforce it.

The card calls out blocking mismatches, for example “Venue address is missing, so Directions will not be shown” or “Sam has no event invitation.” It must not invent missing details.

### 5.2 Test modes

Two distinct actions are allowed:

1. **Open test view** — local/no-send preview using a short-lived preview grant or authenticated preview projection. It is labelled Test and does not increment guest open evidence.
2. **Send test to me** — optional delivery to an authenticated couple address through the existing message approval and provider-receipt flow. The exact recipient, subject, sender/host label and body are previewed before approval. The message and link are visibly marked Test and cannot submit a production RSVP.

Creating a production household link remains separate. A preview or test must never silently publish or send it.

### 5.3 Preflight decision interface

The existing setup review becomes an actionable card:

- state: Ready to test / Needs details / Ready to create link;
- reason: the most material missing or conflicting fact;
- primary action: Preview as [household];
- secondary action when ready: Send test to me;
- consequence: “No guest status changes during preview or test.”

## 6. Workflow 2 — durable confirmation and safe editing

### 6.1 First submission

The current review-and-submit sequence stays. After the server accepts all intended person/event commands, the receipt displays:

- host and event identity;
- each named person and their attendance per eligible event;
- non-sensitive choices such as meal selection;
- “Private detail saved” rather than private plaintext;
- submitted time and response revision;
- any remaining incomplete item;
- **Edit RSVP** using the same still-valid household capability.

The receipt must not claim the whole household was saved if one person/event command failed. Partial failure shows the saved rows and an actionable retry for the unsaved row.

### 6.2 Returning through the same link

When a valid capability is reopened, the server returns a guest-safe latest-response projection alongside current invitation entitlement:

- attendance, non-sensitive controlled answers, revision and completion state;
- a boolean/label that a private answer exists, never its plaintext;
- current lock/deadline status;
- superseded/amended indicator where applicable.

The landing state is **Your latest RSVP**, not an empty form. The guest can:

- leave the response unchanged;
- choose **Edit RSVP** before the lock;
- replace a private answer after an explicit “re-enter to replace” explanation;
- use **Contact the couple** when the capability is valid but editing is locked or an entitlement looks wrong.

The amendment is validated against current household, person and event scope and appends the next response revision. Downstream impact is explained using the existing response receipt.

### 6.3 Capability expiry and correction

A response confirmation remains durable only while the capability is valid. Expired/revoked links retain the current generic safe error and couple-contact fallback; they do not disclose prior answers. The couple can regenerate a scoped link without copying the response into a new store.

## 7. Workflow 3 — evidence-based RSVP follow-up

### 7.1 Canonical lifecycle projection

Derive one household/event lifecycle from existing evidence:

| State | Required evidence |
| --- | --- |
| Not issued | Eligible invitation exists, no active capability or recorded paper/send event |
| Link created | Active capability exists; no send is implied |
| Provider accepted | Approved delivery has an accepted provider receipt |
| Delivery failed | Provider receipt records failure |
| Opened | Production capability open event exists; email-read tracking is not inferred |
| Incomplete | At least one response exists but required named person/event detail is missing |
| Responded | All required named person/event responses are complete |
| Needs follow-up | Deterministic deadline/quiet-hour/prior-reminder policy says action is due |
| Locked change | A requested amendment falls after the configured lock |

Several evidence badges may coexist; do not compress them into a misleading linear funnel.

### 7.2 Couple-facing decision card

Extend the existing RSVP follow-up decision surface rather than adding a dashboard. It shows:

- one headline count for households requiring action now;
- the highest-impact household and why it needs attention;
- source evidence, such as “link opened 4 days ago; no complete reply; deadline in 3 days”;
- one primary action: Preview reminder, Record phone reply, Fix delivery, or Review incomplete answer;
- a defer/keep-open action;
- the effect of the action and whether external sending still requires approval.

Households that are complete or not yet due remain out of the action list. A phone response uses the existing couple-manual response command and truthful provenance.

### 7.3 A2UI intents

Reuse the existing resolver with bounded identifiers already present in the projection. Add only if absent:

- `wedding.rsvp.preview_household_experience`
- `wedding.rsvp.send_test_to_self`
- `wedding.rsvp.open_latest_confirmation`
- `wedding.rsvp.review_household_follow_up`

No A2UI payload contains a raw capability, private answer, contact address not already visible to the couple, or unapproved message body.

## 8. Accessibility and mobile acceptance

- Works at 320 CSS pixels and 200% text zoom without horizontal scrolling.
- Preview and production modes have persistent text labels, not colour alone.
- Named people and events use semantic fieldsets and legends.
- Receipt focus moves to its heading and status is announced once.
- Returning/edit state is keyboard reachable and does not reset answers on validation error.
- Directions and calendar actions have readable fallback text when unavailable.
- A test message and test page announce Test in the title, heading and accessible name.

## 9. Privacy and security acceptance

- Production and preview/test grants are different types and cannot be exchanged across endpoints.
- Preview/test traffic cannot mutate guest lifecycle evidence or responses.
- Public open returns only capability-scoped latest response data.
- Private answer plaintext, capability tokens and contact data are absent from logs, analytics and AFP public fields.
- Reopen/amend preserves expiry, revocation, rate limiting, idempotency and stale-revision protection.
- Cross-household, forged invitation/event, replay and post-lock edits fail closed with constant-shape errors.
- Any test delivery has exact-recipient/content approval and a durable provider outcome.

## 10. Illustrative acceptance scenarios

### A. Preview catches a missing event fact

The Rivera household has Alex and Sam invited to Dinner. The venue has no address. Preview shows both names and Dinner, disables Directions with a truthful explanation, and leaves production status unchanged. After the canonical venue address is added, the same preview shows Directions without copying the address into invitation state.

### B. Returning guest sees a trustworthy confirmation

Alex and Sam submit attendance and meal choices; Alex also submits a private allergy note. Reopening the valid link shows both attendance answers, meal choices, revision and “Private detail saved.” It does not return the allergy plaintext. Editing Sam's meal appends a new response revision and leaves Alex's original response intact.

### C. Follow-up is evidence based

Household A has provider acceptance and a production-link open but no complete response. Household B has a complete response. Household C has a delivery failure. The card recommends reviewing A or fixing C according to deadline policy, excludes B, and never labels provider acceptance as delivery or link-open as email-open.

## 11. Explicitly deferred

- ornamental invitation themes, animation, music and a large template catalogue;
- a parallel invitation-design document model;
- inferred email opens or cross-site tracking pixels;
- direct SMS sending without an approved provider and consent model;
- multilingual generation;
- guest accounts or social profiles;
- free-form question builders;
- returning display of decrypted private answers;
- automatic reminders or external sends without exact approval.

## 12. Success measures

- preview-to-link creation completion rate;
- percentage of published households previewed or test-opened first;
- response completion and amendment success rate;
- return-link sessions that reach confirmation without duplicate submission;
- false follow-up rate for already complete households (target: zero);
- agreement between lifecycle card, Guest Operations and canonical response projection;
- cross-household disclosure and preview/test mutation incidents (target: zero).

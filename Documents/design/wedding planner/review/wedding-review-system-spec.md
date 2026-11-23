# OmnyID Weddings review system specification

Task: WED-360  
Status: implementation specification  
Source brief: `review system requirements.md` supplied 11 November 2026

## 1. Outcome and non-goals

The review system lets a couple publish an attributable account of using OmnyID
or a canonical Sydney venue while making the exact experience, evidence state,
date and remaining uncertainty visible. It turns relevant past experience into
questions for the current couple; it does not turn a past review into current
price, policy, availability or package evidence.

The MVP supports:

- one planner review per wedding workspace;
- one current venue contribution per wedding and canonical venue, including
  contributions made by either partner;
- public wedding-held and booking-experience reviews with truthful labels;
- private resource, enquiry and tour feedback;
- moderator verification/publication, author correction/withdrawal, vendor
  reporting and attributed replies;
- derived public counts, eligible score and review evidence for the existing
  directory, comparison, profile and DecisionOS surfaces.

The MVP excludes imported ratings, incentives, public tour/enquiry scores,
automated moderation, AI-authored public summaries, review-driven organic
ranking and review recording/transcription. External review links may be shown
with their source, but never enter OmnyID totals.

## 2. Repository findings and reuse map

The supplied brief correctly says a new review object is needed, but the
surrounding capabilities already exist. The implementation must use these
authorities rather than create parallel identities, vendors, evidence stores,
messages or publishing systems.

| Dependency | Existing authority and entry points | Decision | Review-system use |
| --- | --- | --- | --- |
| Account and wedding workspace | `src/server/auth.rs::authenticated_user`, tenant-private AFP schemas, established `wedding_plan_id` + `response_workspace_id` checks in `wedding_boundary_routes.rs` and RSVP routes | Reuse | Every authenticated mutation binds the authenticated user and the same wedding identity tuple. Partner submissions resolve to the same plan, not a browser key. |
| Vendor and venue identity | `wedding_vendors` and `wedding_vendor_photos` from migration 0088; owner publication projection from 0102/0157; public API and HTML in `wedding_vendor_claim_routes.rs` and `wedding_vendor_directory_page.rs` | Reuse/extend | `vendor_id` is the only venue subject ID. Optional `room_id` is context, never a second venue aggregate. Directory/profile cards read the review publication projection. |
| Enquiry, booking and event evidence | `wedding_enquiry_envelopes`, vendor email threads/provider events, quotation closure evidence, Limited Specials booking/hold events and canonical wedding-date AFP records | Reuse | These may establish enquiry, booking or timing only to the degree their state proves it. They never prove event delivery by themselves. |
| Private review content and typed links | tenant-private AFP messages through `store_private_app_message`, `supertags`, typed references and reference-target indexes | Extend | Each review revision is a `wedding_review` AFP document. Relational rows store lifecycle/control facts and the private AFP message reference, not an immutable copy of the narrative. |
| Evidence uploads | `file_upload_routes.rs`, private message attachments, SeaweedFS object storage, signed attachment access and account-deletion cleanup | Reuse/extend | Verification evidence remains a private attachment owned by the author. Review metadata holds revocable attachment references; audit events never contain files, contact details or narrative text. |
| Invitations and preferences | existing outbound approval, provider delivery evidence, user communication choices, vendor notification preferences, idempotency/rate limiting and digest-only scoped capabilities used by RSVP and vendor feeds | Reuse/extend | Review invitations get a distinct, narrow capability. They cannot grant vendor-management access. One reminder after seven days is the pilot default; submission, decline, opt-out or withdrawal suppresses it. |
| Operator moderation | operator authentication used by admin Wedding routes; reasoned revision publishing pattern in `wedding_vendor_publication_revisions` and the vendor publication panel | Extend | A dedicated review queue uses the same operator boundary and reason-code approach. Paying vendors receive no moderation privilege. |
| Vendor replies and reports | authenticated vendor ownership/membership roles and accepted publication permission patterns in `wedding_vendor_portal_routes.rs` | Extend | An owner or `manager`/`profile_editor` may report or submit an attributed reply. They cannot see private identity/evidence, approve reviews or change review visibility. |
| Public directory and comparison | server-rendered directory/profile pages, public vendor API, vendor comparison A2UI | Extend | Add count, sparse-score treatment and `Read wedding reviews` without changing existing price or availability provenance. A failure to load reviews must not break vendor discovery. |
| DecisionOS and enquiry draft | existing decision evidence components, `ui_decision_routes.rs`, vendor research and human-approved enquiry flow | Extend | Only published review observations may be cited. A review can suggest a question and prepare a draft after AFP writeback; it never sends or changes ranking. |
| Quote and availability evidence | quotation analysis/closure and Limited Specials authorities | Reuse | Render beside reviews as separate current claims. Never merge old price or availability wording into current quote/calendar facts. |
| Analytics | existing admin operational aggregates and optional product analytics consent | Extend | Store content-free counts and durations only. No review text, evidence, display label or private reviewer ID enters product analytics. Operational moderation metrics do not become public tracking. |

No existing table or module is a wedding-review authority. Search-provider
`rating` fields are third-party discovery hints and must not be reused as
OmnyID review totals.

## 3. Pilot decisions

### Segment and roles

- Pilot segment: five operator-selected, active Sydney **Venue** records that
  are meaningfully comparable by location/guest capacity and have a verified
  canonical listing. The selected IDs are configuration/data, not code.
- Roles: authenticated wedding owner or linked partner (author), authorised
  operator (moderator), authorised vendor manager/profile editor (reply/report),
  and anonymous public reader.
- Historical invitation window: the previous 12 months. A direct past-client
  submission may be older, but its date and evidence must remain explicit.

### Experience and score rules

| Experience | Public eligibility | Aggregate eligibility |
| --- | --- | --- |
| Planner task completed | Planner review after canonical activity or documented pilot verification | Planner aggregate only, if introduced later |
| Binder, quiz or demo | Resource-specific private/public feedback | Never planner or venue aggregate |
| Wedding held at venue | Public after delivery evidence and moderation | Yes, venue wedding-experience score |
| Booking upcoming/cancelled/refunded | Public after relationship evidence and moderation | No |
| Enquiry or tour | Private feedback in MVP | No |

Ratings are unselected initially. A 1–5 integer score is required only for a
public planner review or venue wedding-held review. Booking-experience text may
be public, but any captured score is excluded from the wedding-experience
average and compact aggregate. Average and count use the identical set of
current, published, eligible, scored wedding-held reviews and round to one
decimal using deterministic decimal half-up arithmetic.

Below three eligible scored reviews, compact cards show `N wedding reviews`
and no aggregate score; profile detail may show each eligible score. Zero is
`No wedding reviews on OmnyID yet`. Venue-space context is displayed inside a
review, but the pilot aggregates on canonical `vendor_id` only.

### Required fields

- subject kind and canonical subject reference;
- experience kind/status and month/year (exact day remains private by default);
- rating where required;
- `What should the next couple ask before booking?` narrative;
- optional concise experience summary and structured context such as guest
  band, space, wet-weather or price-change topic;
- intended audience (`private_feedback` or `public_review`);
- public display choice (`first_names`, `first_name_and_initial`, or
  privacy-preserving `OmnyID couple`);
- explicit publication acknowledgement and exact public preview;
- evidence state and revocable private attachment references kept separate.

## 4. Canonical objects and AFP mapping

`wedding_reviews` is the lifecycle/control record. Its uniqueness constraints
prevent a second active contribution for the same wedding/subject. It contains
no narrative or proof. `wedding_review_revisions` links an immutable revision
number to its tenant-private AFP message and optional purgeable evidence
references. `wedding_review_publications` is the operator-approved public
projection. Invitations, moderation decisions, vendor replies and content-light
events are separate tables with narrow permissions.

Private revision AFP contract:

- type: `document`;
- kind/subtype: `wedding_review` / `wedding_review_revision`;
- supertags: `wedding_review`, `review:<review_id>`, plus subject kind;
- references: typed `wedding_plan`, `wedding_review`, and optional
  `wedding_vendor`/`wedding_vendor_room` targets;
- metadata: review ID, revision, audience and content schema version only;
- content: narrative, rating, display choice, experience context and private
  attachment IDs;
- `store_in_relational=true` in the tenant-private schema.

Meaningful transitions append `wedding_review_event` facts containing actor
role, review/revision reference, transition, policy outcome/reason and timestamp.
They contain no review text, proof, contact detail or private display identity.
Agent-generated question suggestions must first be written as a private AFP
artifact and then shown through existing DecisionOS evidence components.

## 5. Lifecycle, concurrency and idempotency

Review status:

`draft -> submitted -> evidence_requested | moderation_pending -> published | rejected`

Additional transitions:

- submitted/pending/published -> withdrawn;
- published -> restricted -> restored;
- published -> edit_pending while the prior safe publication remains visible;
- edit_pending -> published (new revision) or rejected (prior publication stays);
- any visible version exposing personal information may be restricted
  immediately by an operator; author withdrawal removes it immediately.

Verification is independent: `unreviewed`, `pending`, `verified_activity`,
`verified_booking`, `verified_wedding_held`, `insufficient`, `conflicted`.
Invitation origin is also independent: `in_app`, `operator`, `vendor_standard_link`,
`profile_direct`, or `off_platform`.

Every mutation accepts an idempotency key and expected revision. Row locks plus
partial unique indexes enforce one current planner review per workspace and one
current venue review per wedding/vendor across partner accounts. Replayed
requests return the same receipt. Stale revisions return conflict without
changing content, public counts or notifications.

## 6. Eligibility and verification

Verification is claim-specific:

- planner: canonical completion of venue comparison, RSVP receipt/run-sheet
  activity, or documented human pilot evidence;
- wedding held: canonical vendor plus event date in the past and minimal
  post-event delivery evidence such as a redacted post-event message/invoice;
- booking: executed contract, payment record, confirmed booking event or
  reliable equivalent;
- enquiry/tour: canonical enquiry delivery, reply or tour correspondence.

A wedding date, vendor invitation or authenticated account alone is not
delivery proof. Vendors may point an operator to a record but cannot decide
verification. Probable duplicates enter an operator-only reconciliation queue;
private match signals are not exposed.

Pilot evidence retention: delete verification attachments 90 days after the
final verification/dispute decision unless an active appeal, explicit longer
author permission or legal hold applies. Public review text remains until
withdrawn/replaced. Content-light transition records retain for 24 months by
pilot policy, subject to privacy review. Withdrawal removes public/search/cache
projections immediately and queues attachment deletion. This is a product
default, not a declaration of Australian legal compliance.

## 7. Invitations, moderation and disputes

- Invitations are neutral and name the subject/experience.
- A vendor standard link may reach all eligible couples in a defined period;
  selective positive-only invitation campaigns can be suspended.
- Pilot cadence: initial invitation plus at most one reminder seven days later.
- Suppress after submission, decline, opt-out, invalid/expired capability or
  duplicate wedding/subject detection.
- Public submission requires a preview and separate action from private
  feedback. No AI draft, vendor text or unanswered invitation can publish.
- Moderator reason codes include eligibility, evidence, duplicate, conflict,
  personal_information, abuse, unsupported_claim, correction_required and
  policy_other. Apply the same rules to positive/critical and paid/unpaid.
- Acknowledge a report/appeal within five business days and target a reasoned
  outcome within ten. Sensitive cases use the existing admin/support path.
- Vendor replies are attributed, versioned and moderated under the vendor
  publication permission. A reply never alters the score or review text.

## 8. Public and decision projections

- Directory/comparison: count and score only when the sparse threshold permits;
  `Read wedding reviews` opens inline/detail evidence.
- Venue profile: current public reviews, experience label, month/year,
  verification explanation, vendor reply, report action, recent/low-to-high
  ordering, and distribution when volume is useful.
- DecisionOS: one dated observation and caveat, with `Review evidence`; it may
  generate an approved enquiry question but cannot send or change ranking.
- Review outages fail open for the rest of directory, quote, booking and
  availability functionality.

`Read the couple's story` is deliberately deferred. It must not appear until a
real couple story, specific excerpt permission, assistance disclosure and
withdrawal propagation exist. A placeholder or invented story is prohibited.

## 9. Privacy, security and deletion

- Public endpoints return approved projection fields only and use conservative
  caching invalidated on restriction, correction or withdrawal.
- Evidence access requires the author or an authorised operator reviewing that
  revision; vendors receive no proof or hidden reviewer identity.
- Capability tokens are random, digest-only, expiring, rate-limited, scoped to
  review submission and never interchangeable with vendor/calendar grants.
- Review text/evidence is excluded from analytics, logs, immutable events,
  LLM context and directory search until publication permits it.
- Account deletion removes tenant-private review content/evidence and withdraws
  publications before aggregate rebuild. Minimal non-content audit facts may
  remain only under the documented retention policy.
- Featured excerpts, caches, search indexes, aggregate rows and DecisionOS
  citations consume the same invalidation event.

## 10. Release acceptance

Release requires disposable-Postgres tests for cross-tenant refusal,
partner-account deduplication, idempotent invitation/submission, aggregate
eligibility, edit/withdraw/restrict/restore propagation, evidence ACLs and
vendor inability to moderate. Add mobile/keyboard/touch tests, public metadata
and empty-state tests, exact-SHA builds, migration proof and hosted flag-off
security checks before a five-venue pilot. Establish a baseline before claiming
reviews change activation, shortlists or enquiries.


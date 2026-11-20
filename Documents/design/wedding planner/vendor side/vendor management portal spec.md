# OmnyID Weddings — Vendor Management Portal Specification

**Version:** 1.1 — Repository-reconciled implementation specification  
**Status:** VMP-01–VMP-10 implemented and released; quote-comparison extension WED-383 implemented with Oracle release pending  
**Target:** OmnyID Weddings, initially Sydney  
**Primary users:** Wedding venue operators and other wedding suppliers  
**Design philosophy:** Minimum administration, trustworthy availability, vendor-controlled publishing, AFP-native operations.

---

## 1. Product objective

Build a vendor management portal through which businesses can maintain their contact details, business profiles, availability calendars, photographs, directory listings and wedding enquiries.

The portal must provide two complementary experiences:

1. **Full vendor workspace:** Authenticated management of profiles, resources, calendars, enquiries, publishing and account settings.
2. **Secure quick-link workspace:** Limited, mobile-friendly actions without requiring the recipient to log in.

Vendor information must flow into OmnyID's existing couple-facing directory, search, comparison cards, matching and enquiry workflows.

The system should reduce vendor administration while improving the quality and freshness of information available to couples.

### Success criteria

- A vendor can claim and update an existing profile without re-entering information.
- A vendor can update several dates through a secure link in under a minute for a typical simple calendar change.
- Couples can distinguish vendor-indicated availability from confirmed booking availability.
- Public information is controlled, previewable and consistently displayed.
- Vendor enquiries are associated with the existing OmnyID messaging and quotation workflows.
- No independent, competing implementation of AFP core functions is introduced.

## 2. Approved product decisions

| ID | Confirmed decision |
|---|---|
| D1 | All wedding vendor categories supported, with wedding venues prioritised for category-specific capabilities. |
| D2 | Secure quick links for limited actions; authenticated login for full portal administration. |
| D3 | Multi-resource-ready calendar data model, initially presented through a date-level interface. |
| D4 | Manual OmnyID calendar management first; external integrations in a later phase. |
| D5 | Vendors select publishable fields subject to platform rules, with directory and comparison-card previews. |
| D6 | Basic enquiry inbox using existing communications infrastructure and existing quotation-engine functionality. |
| D7 | Core business profile, calendar and basic management free; advanced quotation and automation features premium. |
| D8 | Public availability includes evidence freshness and request-to-confirm actions; no unconditional instant-booking claims. |

These decisions take precedence over optional alternatives in the earlier requirements discussion.

## 3. Mandatory architectural instructions

**ARCH-001 — Preserve AFP**

The implementation MUST respect OmnyID's existing Agent Federation Protocol (AFP) architecture.

Use existing canonical entities, kinds, supertags, hierarchical relationships, typed references, append-only ledger events, command-processing mechanisms, agent message conventions and access-control architecture wherever applicable.

Do not treat the vendor portal as a standalone CRM database disconnected from AFP.

**ARCH-002 — Reuse before implementing**

Before writing new functionality, the development agent MUST inspect the existing repository for:

- Vendor data models and directory/listing services.
- Authentication and role-based authorisation.
- Business claim or identity-verification capabilities.
- Calendar, task and scheduling functions.
- Messaging, communication and enquiry workflows.
- Quotation creation, ingestion and normalisation.
- Media uploading, storage and asset management.
- Public search, listing and comparison-card projections.
- Notification, audit and agent-execution infrastructure.

For each capability, document whether to **reuse unchanged, extend, adapt or implement new**.

Existing functions should be extended rather than replaced whenever compatible with the new requirements.

New functionality must not introduce duplicate canonical records, competing event ledgers, parallel permission systems or redundant infrastructure.

**ARCH-003 — Preserve existing contracts**

Do not break existing wedding planning, public directory, vendor discovery, messaging, quote comparison or authentication functionality.

Provide backward-compatible migration and adapter strategies wherever necessary.

**ARCH-004 — AFP write discipline**

All authoritative business-state mutations must use established AFP write mechanisms.

The user interface and agents must not bypass command validation, permissions, ledger recording or projection updates.

**ARCH-005 — Human approval**

Externally consequential agent actions, including sending enquiries, committing prices, accepting bookings and cancelling confirmed arrangements, require appropriate explicit authorisation recorded in AFP.

Agent-generated content must be recorded using the established AFP message mechanism before display, where required by the existing architecture.

## 4. User types and permissions

| Role | Core permissions |
|---|---|
| Public visitor | View approved directory and comparison-card information; submit enquiries through the existing public workflow. |
| Quick-link holder | View or modify only the specified resource, dates and actions allowed by the issued capability. |
| Vendor Staff | Manage delegated calendar resources and enquiries; access only authorised operational information. |
| Vendor Manager | Manage calendars, enquiries, routine business details, media and publishing when delegated. |
| Vendor Owner | Full business administration, team access, publishing, link issuance and billing permissions. |
| OmnyID Administrator | Claim verification, directory moderation, support and dispute handling under audited administrative permissions. |

Permissions must be checked server-side against the organisation, resource, action and applicable scope. Possessing a valid user session must not automatically grant access to every vendor record.

OmnyID administrators should not have unrestricted access to private customer information merely because they can moderate public listings.

## 5. Information architecture and user experience

### 5.1 Full vendor workspace

Use five primary navigation areas:

**Overview**
- Pending enquiries and actions.
- Availability freshness.
- Profile completeness.
- Relevant performance indicators.
- Notifications and important exceptions.

**Availability**
- Monthly date calendar.
- Resource selector.
- Bulk date-status editing.
- Calendar quick-link management.
- Verification history and conflicts.

**Enquiries**
- New and active enquiries.
- Couple requirements where sharing is authorised.
- Message threads.
- Enquiry status and follow-up actions.
- Entry point to the quotation engine.

**Public Profile**
- Business and contact details.
- Vendor-category-specific attributes.
- Media gallery.
- Publication settings.
- Directory and comparison-card previews.

**Settings**
- Team and permissions.
- Notification preferences.
- Security and quick-link access.
- Subscription and billing.
- Business ownership and account administration.

The navigation may adapt to existing OmnyID UI conventions. It must not introduce unnecessary navigation depth or duplicate functionality already available elsewhere.

### 5.2 UX requirements

- Mobile-first layouts for routine calendar updates.
- Responsive desktop workspace for more involved management.
- One clear primary action on each screen.
- Save confirmations and recoverable validation errors.
- Batch date selection and editing.
- Clear distinction between draft and published content.
- Plain-language availability states.
- Contextual help rather than lengthy onboarding.
- Progressive disclosure of category-specific and advanced commercial settings.
- Consistent terminology across vendor and couple-facing views.

## 6. Functional requirements

### FR-001 — Business claim and onboarding

**Priority: P0**

The portal must support vendors already present in the OmnyID directory and businesses registering independently.

Requirements:

1. Identify and reuse an existing vendor record when a business is claimed.
2. Prevent duplicate vendor organisations and public listings through identity and duplicate checks.
3. Verify the claimant's authority before assigning owner permissions.
4. Allow unclaimed directory information to be reviewed before submission.
5. Preserve existing directory references, historical enquiries and provenance.
6. Support multiple users per organisation.
7. Allow one user to manage more than one authorised business.
8. Allow vendors to complete onboarding progressively.

Initial unclaimed-vendor calendar links may be issued only after the intended recipient's authority has been sufficiently established for the limited actions granted.

**Acceptance:** A verified vendor claims a pre-existing business and sees its existing profile without creating a second canonical business record.

### FR-002 — Business and contact details

**Priority: P0**

Support the following structured fields:

- Trading name and appropriate legal business identifiers.
- Vendor category and relevant subcategories.
- Business website and official social media accounts.
- Operating and service locations.
- Public address or geographical service area.
- Public contact email and telephone.
- Private administrative email and telephone.
- Authorised contact persons and their roles.
- Business description and short introduction.
- Services, packages and specialisations.
- Category-specific attributes.
- Business operating status.

Australian Business Number (ABN) information may be stored where relevant, but must not be treated as proof of account ownership on its own.

Private contact details must not automatically become public.

All editable fields should preserve source, update history and the responsible actor through existing AFP mechanisms.

### FR-003 — Category-specific vendor attributes

**Priority: P0 foundation; progressive category coverage**

Maintain a shared vendor entity and extend it with structured category-specific attributes.

Examples:

**Wedding venue:** Guest capacity, spaces, ceremony options, accommodation, accessibility, catering arrangements and minimum-spend indicators.

**Photographer:** Coverage hours, photography style, team availability, travel area and deliverables.

**Celebrant:** Service area, ceremony types, language and booking availability.

**Florist:** Delivery area, installation capability, event capacity and package options.

Do not create separate, incompatible vendor management systems for different categories.

Unknown or inapplicable attributes should remain unpopulated rather than being assigned misleading defaults.

### FR-004 — Availability calendar

**Priority: P0**

Provide an editable date-level calendar with the following internal statuses:

- **Unknown:** No sufficiently authoritative availability information.
- **Available:** Vendor has indicated that the resource can potentially accept relevant bookings.
- **Tentative Hold:** A date or capacity is provisionally reserved, subject to conditions or expiry.
- **Confirmed Booking:** An actual booking has been recorded.
- **Unavailable:** The resource cannot accept the relevant booking.

Each availability record should be associated with a specific resource or service capacity wherever applicable.

Required actions:

1. View dates by month.
2. Select individual dates or date ranges.
3. Change availability status in bulk.
4. Record a hold expiry where applicable.
5. Display the last vendor verification date.
6. Record changes through AFP.
7. Reject unauthorised modifications.
8. Detect contradictory states and concurrent edits.
9. Prevent casual status changes from silently cancelling confirmed bookings.
10. Support a vendor-level summary derived from relevant resources.

The absence of a calendar record MUST NOT be interpreted as availability.

Where capacity, event size or resource requirements are unknown, the system must avoid claiming that the entire venue is definitively available.

### FR-005 — Resource and capacity model

**Priority: P0 data model; P1 advanced interface**

The underlying model must support:

- One business with multiple locations.
- One location with multiple bookable resources.
- Shared resources and mutually exclusive bookings.
- Resource capacity and date-level constraints.
- Vendors that accept more than one booking per day.
- Resource-specific holds and booking evidence.

For the first release, provide a simple resource selector and date calendar. Advanced capacity allocation, hourly inventory and complex resource combinations may be deferred.

Confirmed bookings must not be overwritten simply because a vendor performs a bulk calendar update.

### FR-006 — Calendar management links

**Priority: P0**

The authenticated portal must allow authorised users to generate, view, renew and revoke scoped calendar-management links.

Support at least two distinct link capabilities:

**Read-only availability link:** Permits viewing specified calendar information without modification.

**Limited editing link:** Permits specified availability updates for authorised resources and dates.

Each issued link should carry server-enforced metadata such as:

- Grant identifier.
- Issuing organisation and actor.
- Intended recipient, where known.
- Allowed resources.
- Allowed operations.
- Issued and expiry times.
- Revocation status.
- Security and audit metadata.

**Recommended initial security defaults:**

- Cryptographically strong unpredictable tokens.
- Store token hashes rather than plain tokens wherever compatible with established infrastructure.
- Default 30-day expiry for edit links, with renewal available through the approved contact channel.
- Immediate revocation and rotation.
- Rate limiting and abuse detection.
- Email verification for initial authority establishment or elevated-risk actions.
- No unredacted token values in application logs, analytics or referrer information.
- No account ownership changes, billing updates, public publishing or cancellation of confirmed bookings through ordinary calendar-edit links.

A bearer link can be forwarded. The system must not claim it can prevent forwarding absolutely; controls must limit the consequences of unauthorised possession.

Quick links must use the existing AFP permission and event infrastructure, not a parallel authentication or record-writing system.

### FR-007 — Availability publication

**Priority: P0**

Couple-facing directory and comparison views must receive only an authorised, privacy-safe availability projection.

Display information such as:

- Vendor-indicated availability when relevant.
- Last verification date.
- Whether availability requires confirmation.
- A clear request-to-confirm action.

Public interfaces must not disclose private customers, internal booking titles, pricing arrangements or restricted resource details.

A date marked Available must not create an automatic booking commitment.

If availability is stale, contradictory or unknown, the UI should prompt the couple to request confirmation.

Suggested initial reminder policy: invite active vendors to verify availability every 14 days. An unverified 30-day-old indication should be treated as potentially stale for public presentation. These intervals are configurable product defaults, not guarantees of accuracy.

Distinguish `last_updated_at`, `vendor_verified_at` and any genuine external confirmation timestamps.

### FR-008 — Public profile and publishing controls

**Priority: P0**

Support two public presentation targets using the same canonical information:

1. Vendor directory listing.
2. Couple-facing comparison card.

Allow vendors to:

- Select which eligible optional fields are public.
- Choose eligible fields for comparison-card display.
- Edit descriptions and highlights.
- Preview both presentation formats.
- Save drafts.
- Submit or publish permitted changes.
- Pause a listing where allowed.
- See whether content is pending review.

Publication states should include Draft, Pending Review where required, Published, Paused and Archived.

A vendor cannot independently change platform-generated verification status, paid-placement disclosures, independent reviews or comparison methodology.

Public profile information should be validated for completeness, accuracy and publication permissions.

**Pricing:** Allow vendors to publish suitable starting prices, ranges or indicative amounts with clear assumptions. Do not expose internal pricing formulas unless the vendor intentionally authorises publication.

Where information is withheld, use labels such as “Pricing on enquiry”, rather than inventing estimates or treating missing values as zero.

### FR-009 — Media management

**Priority: P0**

Support:

- Photograph and logo uploading.
- Media library viewing.
- Hero-image selection.
- Gallery reordering.
- Cropping or suitable presentation adjustments.
- Image captions and alt-text fields.
- Public/private and publication-target controls.
- Media replacement, unpublishing and deletion requests.
- Copyright and usage-permission confirmation.

Prefer the established OmnyID media and object-storage infrastructure. Reuse upload processing, access controls, image transformations and attachment handling.

Keep original media separate from appropriately optimised display derivatives where required.

Implement server-side file validation and safe handling of uploaded content.

Native video hosting is outside the first-release scope. Approved video links may be supported.

### FR-010 — Basic enquiry management

**Priority: P0**

The vendor portal must extend OmnyID's existing messaging and vendor-enquiry workflows.

Display:

- Enquiry source and receipt date.
- Couple's requirements where disclosure is authorised.
- Wedding date and requested services.
- Number of guests where relevant.
- Budget context if authorised.
- Existing conversation messages.
- Enquiry status.
- Assigned vendor contact.
- Next follow-up action.

Suggested stages include New, Contacted, Quoted, Site Visit, Booked and Closed/Lost. The workflow must allow appropriate non-linear transitions.

Avoid constructing an independent inbox or copying messages into a second system of record.

A vendor's response must be associated with the existing conversation and enquiry identity.

### FR-011 — Quotation engine integration

**Priority: P0 integration; P1 premium expansion**

The vendor portal must provide access to existing quotation functionality.

Where the quote engine already supports a capability, reuse or extend it rather than reimplementing it.

Basic enquiry management remains free.

Advanced features can become premium, including:

- Rules-based quotation generation.
- Package and price calculations.
- Automated quote preparation.
- Quote version management.
- AI-assisted enquiry processing.
- Follow-up automation.
- Advanced conversion reporting.

The portal must not silently send agent-generated correspondence or make binding commercial commitments.

AI suggestions must be differentiated from vendor-authorised statements.

### FR-011A — Couple quote normalisation, scenarios and comparison

**Priority: P0 extension of the existing quotation engine**

Provide one dedicated couple-facing **Quotes** section, separate from the
per-vendor **Quote received** lifecycle status, plus a public no-login quote
comparison page. Both surfaces must extend the canonical quotation normal form
and deterministic calculation rules; neither may introduce a parallel quote
store, calculator or decision ledger.

**Capture and evidence**

- Accept canonical authenticated PDF/DOCX/text uploads, vendor email/message
  sources and manual entry. The public page accepts paste, local email/text and
  selectable-text PDF files without uploading the file; scanned or unreadable
  PDFs receive an honest manual-entry fallback.
- Extract or enter rates, guest limits, minimum spend, inclusions, exclusions,
  optional and mandatory items, fees, GST, deposit, payment dates, cancellation
  terms and quote validity when stated.
- Let the couple correct extracted values while retaining the immutable original
  source, exact source snippets and correction provenance. Unknown values remain
  unknown and must never be coerced to zero.

**Common comparison basis**

- Use one event date, guest count, duration and required scope for every option.
- Apply per-person rates, fixed hire, minimum spends, eligible add-ons, service
  fees and explicitly excluded GST deterministically according to stated terms.
- Check date/rate eligibility, capacity and minimum/maximum guest constraints
  before describing an option as viable.
- Keep deposits and payment timing visible but do not add a deposit to the event
  total when it is already part of that total.

**Gaps and scenarios**

- Mark each compared item included, excluded, optional or unknown. Separate
  source-backed quoted costs, scenario calculations and estimated extras, and
  state when a total is incomplete.
- Allow optional items to be added, removed and given a different quantity.
  Recalculate both totals, their difference and each remaining-budget amount
  live. Preserve the vendor's original quote and label every edited projection
  **Scenario estimate** until the vendor confirms a revision.
- A mandatory or bundled item cannot be silently deducted; explain the quoted
  dependency. A changed date, headcount, duration, quantity or rate outside the
  stated terms is **Vendor confirmation needed**. Unknown fees stay unknown.
- Explain each material change and surface relevant booking, expiry and
  cancellation terms.

**Decision support**

- Show options side by side with the material trade-off, a recommendation that
  is explicitly conditional on the common scope and stated evidence, and the
  single missing fact most likely to change the choice.
- If staffing or another material fee is unknown, retain that uncertainty in
  both displayed totals and the recommendation.
- Let the couple save a preference, confirm a choice or keep it open through the
  existing wedding-scoped AFP decision authority. Public no-login choices are
  device-only and must not imply a booking, payment or vendor contact.

**Deterministic acceptance cases**

1. Venue A charges A$120 per guest with a A$5,000 food-and-drink minimum;
   Venue B charges A$150 per guest. With equivalent scope and no other known
   charges, at 30 guests A is A$5,000 and B is A$4,500; at 40 guests A remains
   A$5,000 and B is A$6,000. The decision card explains the crossover.
2. Eligible food and drinks are A$5,200, including a removable A$400 upgrade,
   under a A$5,000 minimum. Removing the upgrade shows A$4,800 eligible spend,
   a A$200 minimum-spend adjustment and a A$5,000 **Scenario estimate**, while
   retaining the A$5,200 original quote.

### FR-012 — Notifications and reminders

**Priority: P0 basic; P1 advanced automation**

Basic notifications:

- New enquiries.
- Outstanding enquiry follow-ups.
- Calendar update reminders.
- Expiring tentative holds where applicable.
- Public-profile publication or verification issues.
- Important account-security notifications.

Start with established email and in-app notification services.

Vendors should be able to configure non-essential notification preferences.

Distinguish operational notifications from promotional communication and apply appropriate consent and unsubscribe requirements.

Do not implement an independent notification scheduler if an existing AFP-linked scheduling service can be extended.

### FR-013 — Vendor overview and performance

**Priority: P1, with limited P0 indicators**

Show lightweight operational indicators:

- New and unresolved enquiries.
- Calendar last verified.
- Profile completion.
- Published listing status.
- Enquiry responses.
- Basic enquiry-to-booking progression where measurable.

More advanced insights may include listing impressions, comparison-card views, enquiry conversion and quote conversion.

Clearly distinguish observed metrics from estimates and incomplete attribution.

Referral and cobranded campaign sources should be retained where available, including the link or campaign that led a vendor to claim or use OmnyID.

### FR-014 — Free and premium entitlements

**Priority: P0 foundation**

The following should be available free:

- Claiming and maintaining a business profile.
- Basic contact details.
- Manual calendar management.
- Limited secure calendar links.
- Photo management within fair-use limits.
- Public-profile publishing.
- Basic enquiry viewing and status management.

Premium functionality should focus on saving significant administrative time or improving enquiry conversion.

Use the existing entitlement and billing architecture if present.

Free functionality should remain operational when a subscription is downgraded. Paid automations should stop or revert gracefully without deleting canonical vendor records.

### FR-015 — Administration and recovery

**Priority: P0**

Provide existing administrative tooling, extended as needed, for:

- Ownership verification and disputes.
- Listing duplication and merge review.
- Reported content and media.
- Public listing moderation.
- Revoked or compromised quick links.
- Incorrect availability claims.
- Support and audit review.
- Privacy, export and deletion workflows.

Do not build a new administrative system where established OmnyID admin capabilities can be extended.

## 7. Logical data model

This is a conceptual extension map, **not an instruction to create new tables or duplicate existing AFP kinds**.

The implementation agent must map these concepts to the repository's established data structures.

| Concept | Key relationships |
|---|---|
| Vendor Organisation | Users, listings, locations, services and enquiries. |
| Vendor Membership | Person, organisation, role and authorised actions. |
| Business Listing | Organisation, category, public content and publication state. |
| Vendor Location | Organisation, physical address/service area and resources. |
| Bookable Resource | Location/vendor, capacity, calendar and constraints. |
| Availability Evidence | Resource, date, state, source, verification, expiry and actor. |
| Calendar Capability Grant | Issuer, recipient/scope, permissions, expiry and revocation. |
| Vendor Media | Organisation, media asset, rights, metadata and display order. |
| Publication Revision | Listing, field visibility, review status and published version. |
| Enquiry | Existing wedding/couple, vendor, conversation and enquiry status. |
| Quote | Existing enquiry, quotation versions and approval records. |
| Notification | Recipient, trigger, delivery record and preferences. |

Represent these using existing AFP typed references and canonical object conventions.

### Mandatory provenance metadata

For consequential information, retain where applicable:

- Entity and record identifier.
- Actor identity or delegated capability.
- Authoritative source.
- Observed and updated timestamps.
- Vendor verification timestamp.
- Effective date and expiry.
- Source reference.
- State or version.
- Relevant permissions.
- Related enquiry, booking, hold or message.
- Confidence or verification status when the data is inferred.

Do not confuse an agent inference with a vendor statement or an externally confirmed outcome.

## 8. State and consistency rules

### 8.1 Availability

- Unknown is the default when reliable data is absent.
- Available is vendor-indicated, not contractually guaranteed.
- Tentative Hold may carry an expiry.
- Confirmed Booking requires appropriate booking evidence or authorised entry.
- Unavailable records the resource's restriction.
- Expired holds must transition according to explicit rules and must not automatically assert availability without supporting evidence.
- Contradictory updates must be resolved through established conflict handling.
- A resource-level booking does not automatically make an entire multi-resource venue unavailable.
- Public availability is calculated using relevant resource capacity, date, restrictions and evidence freshness.

### 8.2 Publishing

- Draft content does not affect public projections.
- Publishing requires appropriate role permissions.
- Review-gated fields remain unpublished until approved.
- Public cards and directory pages must derive from the same effective published version.
- Unpublishing a photograph must remove it from all relevant public views once projection invalidation has completed.
- Pausing a listing must not destroy historical enquiries or correspondence.

### 8.3 Messaging and quotations

- Drafting does not mean sending.
- Sending must use an authorised communication workflow.
- Vendor replies must remain associated with their originating conversation.
- An indicative quotation must remain distinct from a formally accepted commercial agreement.
- Booking confirmation and payment acceptance must not be inferred merely from a positive email or an available calendar date.

## 9. Primary user journeys

### Journey A — Claim an existing listing

1. Vendor opens an OmnyID claim invitation or claim page.
2. OmnyID identifies the existing business record.
3. Vendor reviews available information.
4. The system verifies the claimant's authority.
5. The verified account is associated with the canonical vendor organisation.
6. Vendor selects missing information and completes a short onboarding process.
7. Vendor previews and publishes eligible information.
8. Claim and publication events are recorded through AFP.

**Expected outcome:** Existing directory records are retained and a manageable account is established without duplicate business creation.

### Journey B — Update calendar without login

1. Vendor receives an authorised calendar link.
2. The system validates expiry, revocation and permissions.
3. A simple calendar displays only the permitted resources.
4. Vendor selects one or more dates.
5. Vendor selects the new status.
6. The server validates the change, including confirmed-booking conflicts.
7. The permitted change is recorded using AFP.
8. The vendor receives confirmation.
9. Relevant read models and availability freshness are updated.

**Expected outcome:** A small number of actions enables routine updates without exposing unrestricted administrative functions.

### Journey C — Edit the public listing

1. Vendor opens Public Profile.
2. Existing canonical data and current publication settings are displayed.
3. Vendor modifies eligible fields and selects visibility.
4. Vendor selects a hero image and gallery order.
5. Vendor previews the directory and comparison-card formats.
6. System validates publication requirements.
7. Vendor publishes or submits for review.
8. The effective published projection updates using the existing directory pipeline.

**Expected outcome:** The vendor controls eligible public information while OmnyID preserves data consistency and independent trust indicators.

### Journey D — Receive and respond to an enquiry

1. Couple submits an enquiry through an existing OmnyID workflow.
2. Enquiry is linked to the vendor and wedding context.
3. Vendor receives notification.
4. Vendor reviews the brief and relevant availability.
5. Vendor replies through existing messaging capability.
6. Advanced quotation options are available through the established quote engine.
7. Enquiry stage and follow-up data are updated.
8. Actions and messages remain traceable through AFP.

**Expected outcome:** A complete enquiry-to-response history is available without duplicate communication stores.

## 10. Security, privacy and quality requirements

### Security

- Authorisation must be enforced on every private read and mutation.
- Strict tenant separation between vendor organisations.
- Scoped, expiring and revocable quick links.
- No sensitive data exposed through public projections.
- Server-side validation for all mutations.
- Idempotency and version/concurrency controls for repeat or simultaneous submissions.
- No unrestricted agent authority over vendor records.
- Audit records for ownership, grants, publication and consequential actions.
- Safe media upload and access control.
- Session and token handling must follow existing security conventions.
- Appropriate privacy retention and deletion procedures.

### Reliability

- Avoid lost updates when two staff members edit the same resource.
- Preserve confirmed-booking information during bulk edits.
- Allow users to recover from validation failures.
- Handle projection delays without falsely claiming that an update has already propagated publicly.
- Failed notification delivery must not roll back an otherwise successful calendar update unless the operation expressly requires notification as part of its transaction.
- Use existing retry, outbox or event-delivery infrastructure where available.

### Accessibility and performance

- Aim for WCAG 2.2 AA accessibility.
- Calendar controls must support keyboard interaction and not rely on colour alone.
- Clearly label booking statuses.
- Design quick-link updates for mobile screens.
- Optimise gallery images and public directory performance.
- Establish measurable performance budgets after reviewing the current stack.

## 11. Acceptance test scenarios

| ID | Test | Expected result |
|---|---|---|
| AT-01 | Verified vendor claims an existing listing. | Existing canonical entity reused; no duplicate business created. |
| AT-02 | Unauthorised claimant requests vendor ownership. | Request rejected or routed to verification; existing owner permissions unchanged. |
| AT-03 | Vendor updates multiple dates. | Correct authorised resources updated and AFP history preserved. |
| AT-04 | Vendor attempts to overwrite a confirmed booking through bulk edit. | Operation blocked or requires the separate authorised booking-change workflow. |
| AT-05 | Two users update the same date concurrently. | Version conflict handled; no silent loss of a consequential update. |
| AT-06 | Expired/revoked calendar link is opened. | No protected calendar access or write permitted. |
| AT-07 | Link intended for Vendor A is used against Vendor B. | Access denied. |
| AT-08 | Staff member attempts an owner-only operation. | Access denied and appropriately recorded. |
| AT-09 | Vendor changes a private email address. | Public listing does not expose it. |
| AT-10 | Vendor unpublishes a photograph. | Photo disappears from all applicable public projections and is not exposed through unauthorised asset access. |
| AT-11 | Vendor publishes a revised profile. | Directory and comparison card use the approved published version. |
| AT-12 | Vendor has no availability records. | Public status is Unknown, not Available. |
| AT-13 | Resource capacity is insufficient for the requested wedding. | System does not claim confirmed suitability merely because a date is open. |
| AT-14 | Vendor receives an enquiry. | Existing communication workflow and canonical enquiry record are used. |
| AT-15 | Agent drafts a vendor response. | Draft is recorded through AFP and is not externally sent without appropriate approval. |
| AT-16 | Free vendor opens a premium quotation feature. | Entitlement checked; clear upgrade path offered without corrupting existing data. |
| AT-17 | Vendor ownership changes. | Prior access and quick links revoked according to the approved transfer process. |
| AT-18 | Vendor has two independent venue spaces. | Booking one space does not automatically block the other. |
| AT-19 | Couple compares the A$120/A$5,000-minimum venue with the A$150 venue at 30 and 40 guests. | Totals are A$5,000/A$4,500 then A$5,000/A$6,000; the decision support explains why the lower stated option changes. |
| AT-20 | Couple removes a A$400 minimum-eligible upgrade from A$5,200 eligible spend. | Original remains A$5,200; scenario shows A$4,800 plus A$200 minimum adjustment = A$5,000 and is labelled Scenario estimate. |
| AT-21 | Couple removes a mandatory/bundled item or changes the event outside quoted limits. | The item is not silently deducted; the explanation and Vendor confirmation needed state remain visible. |
| AT-22 | Couple opens the public page without signing in and adds an email, text file, selectable-text PDF or manual terms. | Comparison remains usable without an account; source text stays on-device until explicit contextual analysis and an unreadable PDF receives an honest fallback. |

Automated integration and regression tests must accompany the implementation. Security-critical access tests must run server-side, not only in UI tests.

## 12. Implementation sequence

### Phase 0 — Mandatory repository audit

Before implementation:

1. Inspect AFP core contracts and existing wedding modules.
2. Inventory entities, components, APIs, commands, events and projections.
3. Identify reusable functionality.
4. Document gaps, risks and migrations.
5. Produce a Reuse and Extension Matrix.
6. Establish regression tests for affected existing workflows.

**Exit requirement:** No new module is approved until existing capabilities have been assessed.

### Phase 1 — Vendor foundation

Implement or extend:

- Organisation ownership and claim workflow.
- Vendor roles and permissions.
- Profile and contact management.
- Category metadata.
- Vendor workspace shell.
- Basic account settings.

### Phase 2 — Calendar and secure links

Implement or extend:

- Resource-aware availability model.
- Date-level calendar UI.
- Batch status changes.
- Quick-link issuance, renewal and revocation.
- Server-enforced capability permissions.
- Availability freshness and public projection.
- Reminder scheduling.

### Phase 3 — Publishing and media

Implement or extend:

- Business profile editing.
- Media upload and gallery.
- Field-level publication controls.
- Directory and comparison-card previews.
- Publication revision and moderation.
- Existing directory projection update mechanisms.

### Phase 4 — Enquiry workflow and entitlements

Implement or extend:

- Basic vendor enquiry inbox.
- Existing messaging and quotation-engine integration.
- Basic vendor dashboard.
- Free/premium entitlement boundaries.
- Relevant notifications and attribution.
- Dedicated couple quote comparison through the existing quote engine, including
  original-versus-scenario evidence, live optional-item edits and AFP choice
  projection.

### Phase 5 — Validation and release

- Functional and integration testing.
- AFP ledger and read-model consistency checks.
- Access-control and token-security testing.
- Performance and accessibility testing.
- Data migration and rollback validation.
- Pilot with a small set of venue operators and other suppliers.
- Monitor update completion, repeated usage, enquiry conversion and support incidents.

## 13. Explicitly deferred functionality

Unless existing capabilities can be exposed at minimal cost, do not include the following in the initial build:

- Full two-way Google or Microsoft calendar synchronisation.
- Instant wedding booking or payment capture.
- Complex hourly inventory and automated resource allocation.
- Standalone CRM replacement.
- Native video hosting.
- Unrestricted agent-driven negotiation.
- Native mobile applications.
- Large-scale vendor marketing automation.
- Complete advanced subscription analytics.
- New alternative implementations of existing AFP infrastructure.

These should remain compatible future extension points.

## 14. Mandatory developer deliverables

The development agent must provide:

1. **Repository audit:** Existing modules and relevant code paths.
2. **Reuse and Extension Matrix:** Reuse, extend, adapt or new, with rationale.
3. **Implementation plan:** Ordered tasks, dependencies and affected functions.
4. **AFP mapping:** Existing canonical entities, kinds, events, references and permissions to be used.
5. **UI implementation:** Responsive portal and secure quick-link interface.
6. **Integration evidence:** Public directory, comparison cards, availability, enquiries and quotation-engine connectivity.
7. **Tests:** Unit, integration, security and regression coverage.
8. **Migration and rollback notes:** Including preservation of existing data.
9. **Deployment evidence:** Build, test, deployment and relevant monitoring results.
10. **Completion report:** Implemented, reused, deferred and unresolved items.

Any new AFP kind, core interface, command mechanism or persistence abstraction must be justified against the existing implementation before introduction.

## 15. Definition of done

The first release is complete only when:

- An authorised vendor can manage its business from an existing canonical record.
- The vendor can manage relevant dates in the full portal or through a secure scoped link.
- Calendar updates cannot silently override confirmed bookings.
- Vendor-selected public information appears consistently in the existing directory and comparison-card interfaces.
- Photographs can be uploaded, selected and published with proper permissions.
- Basic enquiries use the existing messaging and quotation infrastructure.
- Core profile and calendar features are available without premium subscription requirements.
- AFP data, events, permissions and provenance remain authoritative.
- Security and regression tests pass.
- No avoidable duplicate implementations or competing systems of record have been introduced.

**Final implementation instruction:** Preserve OmnyID's existing architecture and working functionality. Make the smallest coherent set of changes that delivers the complete vendor workflow. Prioritise dependable state, operational clarity and code reuse over introducing new frameworks or unnecessary feature complexity.

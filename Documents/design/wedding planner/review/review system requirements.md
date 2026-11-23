OmnyID Weddings Review System

Product requirements brief for the implementation spec

Status: Proposed requirements. The pilot defaults and implementation choices identified below are for confirmation during specification. This brief uses the existing OmnyID decision UI guidance, trust research and vendor portal decisions. Repository and deployed behaviour were not inspected.

1. Purpose and scope

Help Sydney couples judge whether OmnyID can help with their own planning and whether a venue suits their wedding. A couple should be able to tell who supplied a claim, what OmnyID checked, when the experience took place and what still requires confirmation. Turn relevant past experiences into questions couples can ask before committing.

The MVP covers two public subjects: reviews of the OmnyID planner and reviews of Sydney venues. Support private feedback about earlier venue interactions and planning resources where useful. Use one Sydney search segment with genuinely comparable venues for the venue pilot. Reuse the existing vendor taxonomy so other supplier categories can follow when their eligibility and verification rules are defined. Defer review incentives, imported or syndicated ratings, public enquiry or tour scores, automated moderation and AI-generated public summaries. Independently hosted review links are optional, clearly attributed links.

2. Eligibility, verification and rating rules

ID

Experience

Eligibility and verification

Public treatment

R01

OmnyID planner use

A real planning task, such as using a venue comparison, receiving RSVPs or using a run sheet. Use reliable existing activity or documented human pilot confirmation.

Planner review only. Identify the task and disclose founder assistance or material affiliations where applicable. A hand-picked quote is labelled Featured couple story and requires specific publication permission.

R02

Binder, quiz or demo only

Confirm the actual resource or demo used. A download establishes access.

Resource-specific feedback. Statements about wedding-day use require actual use. Exclude from planner and venue rating totals.

R03

Wedding held at venue

Accept eligible couples who booked through OmnyID or directly. Match canonical venue and event and check evidence of completion, such as redacted post-event correspondence or a post-event invoice that establishes delivery.

Wedding held · verified by OmnyID. Eligible for the venue's wedding-experience rating when published. Show event month/year and review date as appropriate.

R04

Booking made, upcoming or ended before wedding

A contract, payment record or reliable equivalent establishes the client relationship. Capture upcoming, cancelled or other relevant status accurately.

Booking verified. Allow publication of firsthand booking, change, cancellation or refund experience under this label. Exclude from the wedding-experience aggregate. Allow a new revision after the event with additional verification.

R05

Enquiry or tour only

Existing enquiry or tour evidence may establish the interaction. A verified email establishes control of the address.

Private feedback in the MVP. Exclude from public wedding scores and prevent any interpretation that an event occurred.

R06 — Verification is claim-specific. Keep verification state, publication state and invitation origin distinct. A vendor invitation, elapsed wedding date or authenticated account alone cannot establish event delivery. A badge describes the relationship or experience checked. The couple's narrative remains attributed to them. Use an existing authoritative signal if it actually proves the claim. Otherwise request minimal redacted evidence or keep verification pending. A vendor may help locate a record, with appropriate authority, while OmnyID makes the verification decision.

R07 — One contribution per experience. Count one current rating per wedding and canonical venue and one planner review per wedding workspace, including contributions from both partners. Support off-platform submissions without creating a duplicate wedding workspace. Have moderators reconcile probable duplicates without exposing private matching data. Handle linked or merged venue profiles using canonical IDs and preserve valid reviews without double-counting. Compute the venue average and count from the same set of currently published, eligible, scored wedding-held reviews. Define the rounding rule once. Treat zero reviews as an empty state and display the count with any score. Suggested pilot display below three scored reviews: show the count and review links on compact cards, with individual scores visible on the profile. Apply the rule consistently.

3. Collection and publication

R08 — Neutral, low-friction invitations. Use the existing messaging or in-app notification flow after a meaningful planner milestone or a completed venue experience. Offer a direct Write a review route on venue profiles for past clients. For historical seeding, ask pilot venues to invite all eligible couples they can appropriately contact within a defined window, suggested as the past 12 months. Let venues share a standard link without handing over their mailing list. Invitations and reminders must follow existing authorisation, communication preferences and applicable channel rules. A suggested pilot default is one reminder, with suppression after submission, decline or opt-out. Rate-limit and deduplicate across partner accounts and channels. Permit a narrowly scoped review invitation link if existing access mechanisms support it. Vendor management links and review-submission permissions have different scopes.

R09 — Couple authorship and explicit publication. The form identifies the reviewed subject, experience and intended audience. Use an unselected rating and neutral prompts such as “What should the next couple ask before booking?” Offer optional context such as guest-count band, reception space, price changes or wet-weather arrangements. Explain verification uploads separately. Let the reviewer choose a public display name or privacy-preserving label and preview exactly what will be public. Use distinct actions for Send private feedback and Submit for public review, with the latter explaining moderation. Vendor-authored content, unanswered invitations, internal feedback and AI drafts cannot become couple reviews. Obtain separate approval for a featured excerpt or case study and disclose any material assistance or relationship. Provide withdrawal and correction routes.

R10 — Moderation and disputes. OmnyID moderators review eligibility, evidence, duplicates, conflicts of interest, personal information, abuse and applicable content rules. Apply the same rules to favourable and critical submissions, including for paying vendors. Provide reason codes, author notifications and an appeal or correction route. Vendors may report and post a clearly attributed reply through existing vendor authentication and publishing permissions. They cannot access reviewer identity or evidence beyond what the reviewer publishes, approve or edit reviews, or control their visibility. Use a documented criterion for any temporary restriction during a dispute. Escalate sensitive disputes through the existing admin/support path. Preserve the author's meaning. Route substantive edits back to the author or obtain explicit approval of the edited version.

R11 — Lifecycle and access. Specify transitions for draft, submitted, evidence requested, moderation pending, published, rejected, restricted, restored and withdrawn. Maintain a distinct verification result and version. Drafts and pending edits remain private. Define when the previous published version stays visible during edit review, including immediate restriction if it exposes personal information or the author withdraws it. Only the authorised reviewer can submit, revise or withdraw their review. Only authorised moderators can determine eligibility and public visibility. Count and display projections must reflect moderation, correction and withdrawal together. Provide status and safe retry when a submission or publication step fails.

4. Public and decision UI

Surface

Default evidence and action

Planner landing and feature pages

One permissioned story where it demonstrates a specific workflow. Show the task, what changed and any material pilot assistance. Use Read the couple's story to disclose more. Keep featured stories distinct from any wider reviews list.

Venue result and comparison card

Count and, when eligible under the display rule, rating. Read wedding reviews opens detail. Keep price provenance and date availability alongside their own claims. Retain the vendor portal's last-verified and request-to-confirm model. Missing review coverage displays as No wedding reviews on OmnyID yet.

Venue profile

Show review count, eligible score when applicable, date/context, verification explanation, replies and Report review. Keep booking-only experiences clearly labelled. Provide recent and low-to-high views when aggregate scores are shown, and a ratings distribution when useful at pilot volume or beyond. External review links identify their source and never enter OmnyID totals.

DecisionOS recommendation

Include a review only when it helps with the couple's current decision. Show the relevant observation, date and important caveat, with Review evidence for the public source. For example, one couple's report about a wet-weather room can suggest Ask about wet-weather backup. It cannot confirm the current package, quote, policy or availability.

R12 — Evidence hierarchy and control. Use existing A2UI and contextual decision UI components. Keep a compact card decision-complete with relevant evidence and material uncertainty visible. Reveal the underlying public review on demand. Preserve conflicting evidence and distinguish past experience, current vendor confirmation, indicative quote and agent inference. Existing fit criteria drive comparison. Review counts, vendor payment and missing reviews must not silently alter organic rankings in the MVP. Apply existing sponsorship disclosure wherever relevant. A review-derived suggestion may create a draft through the existing enquiry workflow. The couple reviews and explicitly approves the exact recipient and message version before any send.

5. AFP, reuse and privacy

R13 — Map before building. The spec must identify the existing module, source of truth and permissions for each dependency: account and wedding workspace, vendor and venue/space records, booking or enquiry status, invitations and preferences, upload and evidence access, admin moderation, directory publishing, A2UI/DecisionOS evidence, quote and availability projections, and analytics. Mark each dependency Reuse, Extend or New with reason. Identify actual entry points, owners and relevant migrations. Reuse stable IDs and typed references. Where a new review object is necessary, use the existing AFP object, supertag and typed-reference conventions. Keep one authoritative review and revision history. Keep search, comparison and public profile views as derived projections.

R14 — Audit with minimal retained data. Append meaningful transitions with actor/role, timestamp, target/revision reference, policy outcome and reason where relevant. This includes submission, evidence decision, publication, material correction, restriction, restoration and withdrawal. Persist agent-generated outputs through the existing AFP writeback before displaying them. Store review text and verification material according to the existing visibility and deletion model. Keep proof documents, private contact information and other removable sensitive content out of immutable event payloads. Use protected storage and revocable or purgeable references, with minimal audit facts retained under applicable policy. Restrict proof access to authorised reviewers of evidence. Public projections, model context and analytics must exclude private proof by default. Define retention, access audit, withdrawal and deletion propagation through indexes, caches and featured excerpts.

R15 — Failure and compatibility. Reuse existing concurrency, queue and idempotency mechanisms. Duplicate clicks, retries or concurrent partner submissions must not create duplicate ratings or notifications. Handle expired links, upload failures and moderation retries without exposing private state. Existing vendor records with no review data must remain usable. Review outages must leave the directory, quote and calendar flows available wherever the existing architecture supports it. Specify backfill only for records with demonstrated provenance and publication permission.

6. Pilot and release acceptance

Start manually with roughly five comparable venues and existing OmnyID test couples. Suggested collection targets are ten verified wedding reviews across the pilot segment and one documented planner story, with wider collection based on usefulness. Track invitation-to-submission rate, verification completion, moderator handling time, coverage across comparable venues, source comprehension, shortlist changes and qualified enquiries. Keep analytics free of private review text and evidence. Establish a baseline before attributing any change in enquiries or planner activation to reviews.

Acceptance case

Expected outcome

Same couple submits twice from different accounts and an invitation is retried

At most one eligible rating enters the aggregate and invitation retries do not create duplicate reminders.

Couple has a contract but wedding has yet to occur or was cancelled

Booking experience can be published with the correct label. Wedding-experience score is unchanged.

Venue sends invitations only to known happy clients or requests removal of eligible criticism

OmnyID can stop the selective campaign and retains its own eligibility and moderation control. The couple has an independent submission route.

Reviewer withdraws a published review or a moderator restores it

Review visibility, rating, count, search and any featured excerpt reconcile as applicable. Prior sensitive evidence stays inaccessible to public users.

Review describes last year's price or rain plan

UI attributes it to that past wedding and shows current quote or availability evidence separately.

Agent suggests asking about a review detail

The draft follows AFP writeback and the existing human approval gate. Opening evidence never sends a message.

Couple tests a mobile comparison with a venue that has few or zero reviews

They can identify the count, source, experience type and which details still require confirmation, with accessible keyboard and touch actions.

Decisions to record in the implementation spec

Name the pilot segment and participating roles. Confirm required fields, review window and reminder cadence, sparse-score threshold, venue versus venue-space display, qualifying activity signals, accepted proof and retention, escalation ownership, dispute response targets, edit and deletion propagation, and the exact event and permission mappings. Record which choices follow established project policy and which are new pilot defaults.

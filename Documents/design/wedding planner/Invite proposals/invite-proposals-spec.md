# Invite Proposals specification

Status: category-opportunity implementation complete; hosted release pending
Tasks: WED-333 foundation, WED-338 category opportunity extension
Product surface: Wedding Home vendor card
Source of truth: the account-scoped Wedding AFP ledger

## 1. Outcome

Invite Proposals lets a couple describe a vendor need once, publish it to the
matching category of verified claimed vendors, and compare structured
responses without creating another inbox, quote store, booking system, or AFP
ledger. A couple can also give one unclaimed vendor an expiring private link.

The existing vendor card has two modes:

1. **Find vendors** searches and compares the directory.
2. **Invite Proposals** prepares a reusable category brief, previews exactly
   what will be shared, publishes it without contacting a named vendor, and
   projects replies into the existing Documents and vendor lifecycle surfaces.

The supplied feature document is product guidance. Existing OmnyID authorities
win where its proposed nouns or flows differ from the implemented system.

## 2. Non-goals

- No reverse auction, public tender board, or price-only competition.
- No parallel AFP ledger, vendor inbox, shortlist, Documents store, budget, or
  booking record.
- No claim that a vendor is available because its website or listing exists.
- No automatic broadcast and no external action when a brief is merely saved.
- No numeric “vibe” score or opaque paid-placement influence.
- No disclosure of private couple context that is absent from the approval
  preview.

## 3. Reused project authorities

| Need | Existing authority to reuse |
| --- | --- |
| Couple facts | Wedding need-to-know and preference AFP objects |
| Vendor discovery | Existing directory-first vendor search and ranking policy V2 |
| Shortlist | Existing vendor comparison choice and favourite projection |
| Draft and permissions | Existing vendor outreach flow and enquiry-permission state |
| Human approval | Existing approval request and explicit send action |
| Email/thread | Existing vendor outreach and secure relay thread |
| Unclaimed vendor | Existing scoped quotation-response/referral capability |
| Proposal files | Existing attachment, ClamAV, parser and Documents projection |
| Quote understanding | Existing quote intelligence normalization |
| Comparison | Existing comparison artifact and decision cards |
| Budget/booking | Existing quote acceptance, booking and budget projections |
| Next action | Existing Today decision queue and vendor follow-ups |

`wedding_vendor_listing_proposal` is not this feature. That route proposes a
change to a directory listing and must not be overloaded with couple enquiries.

## 4. Couple experience

### 4.1 Entry

The heading of the existing Wedding Home vendor card becomes an accessible tab
list. Switching tabs does not navigate, refresh the page, discard search state,
or create an event.

### 4.2 Reusable brief

The brief projects only relevant facts already in the wedding ledger:

- vendor category and request;
- date or season;
- broad location;
- guest count;
- relevant category allocation, not the full wedding budget;
- style and priorities; and
- deal-breakers relevant to this vendor category.

Unknown material facts stay labelled unknown. The UI asks for only facts that
materially affect a proposal. It must not invent values from defaults or other
accounts.

### 4.3 Category opportunity

The couple chooses the vendor category, not a recipient list. The server makes
an open opportunity visible only to authenticated vendors whose verified,
claimed, active listing has a compatible category and service area. Publishing
does not send an enquiry and does not change a vendor to Enquired.

For an unclaimed vendor, the couple can create a 256-bit random capability URL.
Only its SHA-256 digest is stored. The link expires after 14 days, has no index
or cache permission, is throttled, and is revoked when the couple closes the
opportunity. It grants access only to the share-approved brief and one proposal
submission surface; it is not a listing claim or account session.

### 4.4 Sharing preview

Before publication, the couple sees:

- the category;
- exact brief;
- every shared context field;
- every attachment;
- whether phone contact is allowed; and
- that publication does not contact a vendor.

Approximate category budget and phone sharing default off. Saving a private
draft or publishing an opportunity cannot imply that vendors were contacted.
Any later named-vendor enquiry continues to require the existing exact-content
approval boundary.

### 4.5 Responses and comparison

Vendor responses create a tenant-private AFP Documents projection. A
structured proposal may contain price, inclusions, exclusions, assumptions,
availability evidence, validity date, attachments and questions. Quote files
are normalized once and reused until their source facts change.

Availability states are evidence-based:

- not checked;
- likely, with the source and date;
- vendor confirmed, with timestamp;
- temporary hold, with expiry and conditions; or
- booked, only after booking conditions are met.

The comparison states what is confirmed, missing, conditional, and materially
different. It never promotes a source-verified listing to a suitability-verified
match.

### 4.6 Closing the loop

The couple can ask a question, decline, shortlist, accept a quote, or proceed to
booking through existing actions. Accepting a quote must atomically reproject
the booking, category commitment, task status and decision record, with a
visible explanation. The Today queue shows the next useful action rather than a
new proposals inbox.

## 5. AFP objects and events

### 5.1 Private proposal draft and category opportunity

Subtype: `wedding_vendor_proposal_invitation_draft`

Required content:

- `wedding_plan_id` and `response_workspace_id`;
- stable brief ID and revision;
- vendor category and request text;
- selected category and optional broad service location;
- explicit sharing booleans;
- source references for projected facts;
- `approval_status: pending_user_approval`;
- `external_action: false`; and
- creation timestamp.

The draft routes only to the couple, decision queue and knowledge graph. It
contains no provider receipt and does not set the vendor lifecycle to enquired.

Every publish and close transition is first-class tenant-private AFP evidence.
The server-side opportunity index is its operational routing projection and
contains only routing and aggregate fields:
owner, wedding/workspace IDs, category, broad location, the share-approved
brief, status and expiry. Response content is written to the couple's private
AFP schema. The global response row keeps only a fingerprint and routing IDs.

### 5.2 Named-vendor enquiries

If a couple proceeds from a proposal to a named-vendor enquiry, the existing
vendor outreach draft/thread records the exact revision, permission
fingerprint, recipient and provider receipt. Retries use the existing
idempotency boundary. The category opportunity is discovery, not permission to
send externally.

### 5.3 Proposal response

Responses remain vendor-scoped events on the existing thread. Structured
proposal fields are projections of response evidence and attachments, never a
second mutable source of truth.

## 6. Privacy and security

- All reads and writes remain tenant and wedding scoped.
- Do not expose family boundaries, contact details, exact finances, health,
  identity documents or private inspiration unless explicitly selected.
- A vendor sees no other recipients.
- Unclaimed-vendor capability URLs are random, expiring, revocable, single
  purpose, stored only as digests and never written to ordinary logs.
- Public capability responses carry `no-store`, `no-referrer`, `noindex`,
  `nofollow` and `noarchive` headers.
- Attachments use the existing allowlist, size limits, ClamAV and private object
  storage path.
- Forged, replayed, expired and cross-tenant responses fail closed.
- Rate limits apply per account, wedding, vendor and destination.
- Paid placement, if introduced later, must be labelled and cannot alter
  evidence-backed ranking silently.

## 7. A2UI and mobile rules

The server/ledger owns semantic state and A2UI projects it. The mobile surface:

- keeps 44px minimum targets;
- uses a two-option tab list that fits at 320px;
- uses stacked fact cards, category selection and sharing controls;
- keeps primary action consequences explicit;
- preserves focus when state changes;
- announces save, error and selection-limit messages; and
- never relies on swipe alone.

## 8. AI and token policy

No LLM is needed to switch modes, project known facts, validate or publish a
brief, match a claimed listing by category/service area, or compare exact
structured fields.

If the couple asks for wording help, use the existing funded AI gateway and the
project-approved low-cost model (`google/gemini-3.5-flash-lite` through
OpenRouter), subject to its current availability and policy. Send only the
structured relevant facts, use a reusable prompt prefix, generate only on an
explicit request, and store model, token cost, sources, approval status and
revision in AFP. Never generate on each keystroke.

## 9. Rollout

Opportunity publication remains false-default and account-allowlisted. A pilot
uses at most 10 couples and 15 claimed vendors over 30 days. Publication and
private-link creation do not contact vendors automatically; named-vendor email
continues to use the separately reviewed outreach policy.

Pause new invitations when enough useful proposals exist. “Enough” is an
explainable policy based on received comparable proposals, not an LLM guess.

## 10. Acceptance criteria

- Tabs work in place, by pointer and keyboard, without losing search results.
- A private brief is built from the same wedding ledger and clearly labels
  missing facts.
- No vendor is contacted by saving or editing.
- Claimed vendors see only open opportunities matching their category and
  service area.
- Exact category, content and shared fields are shown before publication.
- Sent invitations reproject through existing Enquired/vendor follow-up state.
- Vendor replies, proposal files and normalized quotes reproject through the
  existing conversation, Documents and quote comparison surfaces.
- Unclaimed vendors use an expiring, revocable, non-indexable scoped response
  capability whose plaintext is never stored.
- The couple can close an opportunity and revoke every link atomically.
- Admin sees category-level counts for opportunities, replies, claimed-vendor
  views and links created, without couple or proposal content.
- Quote acceptance updates connected records without manual reconciliation.
- Tenant isolation, replay, expiry, accessibility, mobile and false-default
  rollout tests pass.

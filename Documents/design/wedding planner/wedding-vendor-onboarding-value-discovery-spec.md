# Wedding Vendor Onboarding and Value Discovery Specification

Status: proposed after WED-262

Owner: Wedding vendor experience

Implementation branch: `agent/codex/WED-215`

Implementation worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-215`

Nominated build base: `f6b00e8a4dabf319ac7a8aefd7cece87cb9c89a9`

## 1. Purpose

Turn a sceptical wedding vendor into a successful first-time user, then a paying customer, by
helping them complete one valuable real enquiry with minimal setup. OmnyID must demonstrate saved
time, clearer pricing and better follow-through before it asks for payment.

The supplied `wedding vendor UX design.md` is inspirational guidance, not a replacement for the
current product, AFP contracts, claim flow, security controls or production evidence. This work
extends the existing vendor claim, portal, masked-reply, quote-intelligence and couple workflow.
It must not create a parallel wedding planner, CRM or directory.

## 2. Product thesis

The shortest credible vendor journey is:

1. recognise the cost of slow or inconsistent enquiry handling;
2. see an immediate example using the vendor's existing public listing or a pasted enquiry;
3. claim or authenticate with the lowest safe amount of friction;
4. complete one real enquiry without migrating a CRM;
5. approve transparent prices and a professional response;
6. see what was saved or improved;
7. encounter a paid limit only after meaningful value has been delivered.

Vendors remain the principal commercial customer. Couples remain protected users whose context is
shared only per enquiry and with explicit permission. Payment cannot buy an organic suitability
ranking, fabricate availability or turn an indicative price into a promise.

## 3. Recommended model and development base

Use **GPT-6 Astra with high reasoning** for the cross-cutting implementation and review work. This
slice spans AFP event design, identity and ownership boundaries, quote normalisation, responsive
portal UX, billing entitlements and conversion measurement. Official OpenAI documentation describes
GPT-6 Astra as its most capable model for demanding reasoning, coding, research and document work:
<https://developers.openai.com/api/docs/models/gpt-6-astra>.

This recommendation is for development, not a mandate to use Astra for every runtime operation.
Runtime generation must continue through the existing model ladder and budgets. Deterministic
validation, reusable prompt prefixes, cached structured facts and no-model fallbacks remain
mandatory. Claim verification, consent, delivery, price approval and billing decisions must never be
delegated to an LLM.

Build from the committed WED-262 implementation base in the existing advanced isolated worktree.
Do not copy or merge `.worktrees/WED-187` or another agent worktree wholesale. Selectively consume a
reviewed dependency only when it is absent from the nominated base.

## 4. Personas and jobs

### 4.1 Owner-operator

- Needs to answer on a phone between jobs.
- Wants a useful draft and quote without learning a CRM.
- Needs private pricing logic and explicit approval before anything is sent.
- Pays when the product saves repeated admin time or prevents a lead being lost.

### 4.2 Sales or events coordinator

- Handles a shared inbox and multiple packages.
- Needs assignment, handoff, response deadlines and auditability.
- Pays for team workflow, templates, analytics and controlled knowledge reuse.

### 4.3 Established multi-location business

- Needs location-specific availability, packages and sender identity.
- Requires role separation, exports, retention and security evidence.
- Pays for governance and reliable throughput, not organic ranking preference.

## 5. Entry paths

All entry paths converge on the same claimed vendor identity and AFP ledger.

| Entry | First useful outcome | Authentication boundary |
| --- | --- | --- |
| “Is this your business?” on an unverified listing | Preview and correct existing public details | Claim proof before publish |
| Vendor login | Resume the last enquiry or onboarding step | Existing vendor session |
| Invitation from a couple enquiry | Review the exact permitted context and prepare a response | Signed, expiring invitation then claim/sign-in |
| Paste or forward an owned enquiry | Produce a structured brief and draft response | Sign-in before saving or sending |
| Marketing example | Private sample quote or response preview | No customer data; sign-in to persist |

Google, Apple or business email may provide low-friction authentication where the repository's
existing identity stack supports it. Authentication is not ownership proof. Domain email, DNS/meta
proof or connected business social proof remain separate, auditable claim methods.

## 6. First-session experience

### 6.1 Before account creation

Show a useful, bounded preview using public listing fields or vendor-supplied text. Do not ask for a
full profile, subscription or CRM connection. Clearly label public facts, vendor input, unknowns and
generated suggestions.

### 6.2 After claim or sign-in

Pre-fill what is already known and ask the vendor to confirm only the fields needed for the next
action:

- business/contact identity;
- service category and operating locations;
- capacity or service limits relevant to the enquiry;
- package names and vendor-approved price ranges;
- availability source or “confirm manually”; and
- preferred reply sender: own connected email or reviewed vendor mask.

The first-session primary action is **Complete this enquiry**, not “finish setup”. Optional profile
completion is contextual and can be deferred.

### 6.3 One real enquiry

The vendor can paste, forward or open an OmnyID enquiry. The system projects:

- couple facts explicitly shared for this vendor;
- questions to answer;
- unknown or withheld facts;
- a draft response;
- an optional vendor-approved quote draft; and
- the exact sender, recipient, attachments and disclosed information.

The vendor edits and approves. Typing, formatting and field changes do not call a model. A meaningful
regenerate action may call the existing ladder and must append a revision event.

## 7. Canonical AFP objects and events

AFP is the source of truth. Portal screens, email views, metrics and future templates are projections.
Required concepts are generic enough for non-wedding templates:

- `vendor_identity` and `vendor_claim_evidence`;
- `vendor_profile_revision`;
- `commercial_enquiry` with permission snapshot and source references;
- `commercial_requirement_fact` with authority, confidence and scope;
- `vendor_response_draft` and immutable revisions;
- `vendor_quote_draft`, vendor approval and normalized user projection;
- `commercial_message_sent` and delivery receipt;
- `commercial_follow_up` and outcome;
- `vendor_value_event`; and
- `vendor_entitlement_snapshot` and subscription lifecycle events.

Every generated draft records the prompt-prefix identifier, input fingerprint, selected structured
facts, source references, model/provider, token/cost estimate, approval status and revision parent.
No raw full history is replayed into a prompt.

## 8. Value discovery

The vendor dashboard begins with the next useful action and a small proof-of-value strip:

- response time compared with the vendor's baseline;
- drafts or quotes completed;
- minutes saved, shown as an estimate with methodology label;
- enquiries awaiting an answer;
- follow-ups due; and
- known outcomes such as site visit, quote accepted or booking.

Do not invent conversion uplift. Before sufficient observations, say “baseline forming” and show the
events used. Vendors may record outcomes for enquiries that arrived outside OmnyID so value is not
limited to marketplace leads.

## 9. Pricing and conversion

Ask for payment after a meaningful milestone, such as the first approved response/quote or the free
monthly allowance. The paywall must state:

- what has already been completed;
- the next action affected;
- the free and paid limits;
- whether a draft can still be exported;
- month-to-month terms and cancellation; and
- that payment does not buy organic ranking.

Good paid value includes reusable vendor-approved packages, shared-inbox assignment, response and
follow-up automation with approval, branded quote output, team roles, reporting and higher bounded
usage. Locked features may be previewed but cannot block correction of public contact details,
privacy requests or data export.

## 10. Portal information architecture

Mobile order:

1. next enquiry/action;
2. exact couple-shared context;
3. response or quote editor;
4. send/approval preview;
5. follow-up;
6. proof of value; and
7. optional profile and plan prompts.

Desktop may add a compact navigation rail for Inbox, Quotes, Follow-ups, Profile, Insights and Plan.
Do not require the dashboard for ordinary replies: secure email and signed-link actions remain valid
projections of the same conversation.

Use existing Wedding surface tokens and the 8–12 px card-radius rules. Controls need 44 px minimum
targets, visible focus, clear consequence labels, short mobile copy and no horizontal overflow.

## 11. A2UI and existing foundations

Use allowlisted A2UI primitives for read-only, portable projections such as:

- enquiry fact list;
- unknown/withheld callout;
- stat row;
- quote comparison or package table;
- next-action card; and
- approval summary.

Use the existing portal/editor components for rich text, attachments, identity proof and payment
inputs where A2UI does not provide safe input semantics. Do not create new decision, comparison or
quote card types until the existing foundational cards have a demonstrated schema gap.

Reuse the current claim flow, ownership proof, vendor profile editor, email architecture, attachment
pipeline, quote intelligence, normalized quote projection, masked sender work, DecisionOS and billing
entitlements. OCR, when needed, uses the existing OCR add-on and malware scan path.

## 12. Privacy, security and trust

- A couple permission snapshot is immutable for each enquiry revision.
- Withheld fields are absent from vendor payloads, prompts, logs and exports, not merely hidden in CSS.
- Vendor mask delivery stays disabled until Email Worker ingress, abuse controls and review gates pass.
- A vendor sees only conversations for the claimed business/location and authorized staff role.
- Attachments retain MIME, size, malware and ownership checks.
- Public listing edits require claim authority and an append-only audit event.
- Pricing calculations may remain vendor-private, but the couple-facing normalized quote shows what is
  included, excluded, conditional and unverified.
- No credential, token, backend address or internal error appears in browser assets or user copy.
- Account export and deletion cover profile, enquiry, quote, outcome and billing projections.

## 13. Measurement

Measure product events with consent and tenant scoping:

- started-to-claimed conversion;
- time to first useful preview;
- time to first approved response;
- first quote completion;
- seven-day return;
- free-limit encounter;
- trial-to-paid conversion;
- response time and outcome coverage; and
- correction, undo, complaint and deletion rates.

Never treat email opens, inferred emotions or couple-sensitive data as sales scoring without a new
approved purpose and permission.

## 14. Rollout and gates

1. Local deterministic fixtures and dark AFP projections.
2. Internal vendor personas using synthetic enquiries.
3. Authorized vendor usability sessions.
4. Allowlisted vendors with sends disabled, then explicit-send only.
5. Paid-plan preview without charging.
6. Authorized payment sandbox and cancellation/export test.
7. Small cohort with support and rollback.

Release requires accessibility, vendor usability, security/privacy, provider smoke, permission copy,
hosted shadow and allowlisted-cohort evidence. Policy V2 and vendor mail remain disabled until their
existing criteria are met.

## 15. Engineering constraints

- No new file exceeds 999 physical lines.
- Existing oversized files are split or held line-neutral; do not add new responsibilities to them.
- New source modules should normally remain below 500 lines.
- No vendor source dataset is packaged in the application worktree.
- Every mutation is authorized, replay-safe and auditable.
- Frontend state cannot declare a claim, send, booking, payment or entitlement complete.
- Technical errors are translated into user-facing recovery text.
- Required focused tests, wedding tests, relevant Rust tests, typecheck, production build, CSP/site
  smoke and line-budget checks run for every slice.

## 16. Acceptance outcomes

- A new vendor can reach a useful private response/quote preview before completing a long profile.
- A claimed vendor can complete one real owned enquiry without CRM migration.
- Couple permissions remain exact and vendor-specific end to end.
- A vendor can see evidence of saved time and completed work without fabricated uplift.
- Payment is requested transparently after value and cannot influence organic matching.
- The same AFP workflow supports Wedding and future OmnyID templates.

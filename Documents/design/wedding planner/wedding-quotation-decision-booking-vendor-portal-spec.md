# Decision and Booking Closure with Lightweight Vendor Response Portal - Specification

Prepared: 2026-10-17

Status: proposed for implementation

Programme: WED-215

Source brief: `wedding quotation normalisation.md`

Companion plan: `wedding-quotation-decision-booking-vendor-portal-tasks.md`

## Model and build nomination

Use **GPT-6 Astra with high reasoning** (`gpt-6-astra`) as the primary implementation
agent. This work crosses AFP lineage, tenancy, capability-link security, quote and
contract evidence, email/federation reconciliation, A2UI, accessibility, and rollout
controls. OpenAI describes GPT-6 Astra as its flagship model for complex reasoning and
coding: <https://developers.openai.com/api/docs/models>.

This is an implementation-agent recommendation. It does not change OmnyID's runtime
model policy. Runtime extraction and drafting must continue through the shared wedding
LLM ladder, with deterministic validation and a no-model fallback. No LLM decides that
a contract is accepted, money was paid, or a booking is confirmed.

Create a clean worktree named `OmnyID-WED-215` on branch `agent/codex/WED-215` from
exact commit **`052acc73316f864500703cb975f72a77e889ee82`** (`WED-213 record dark Oracle
quotation release`). Do not implement in the dirty WED-187 worktree. The nominated
commit contains the generic quotation, clarification, closure, vendor-context, replay,
and dark-release foundations and already descends from the committed vendor-claim
baseline.

Before implementation, reconcile any completed WED-187 work through reviewed commits.
Only merge work that is complete and tested; do not copy its 48-path dirty state. If a
required WED-187 change is not committed, defer the dependent portal slice instead of
reimplementing it. The final implementation base must retain `052acc7` in its ancestry.

## 1. Outcome

Weeks 3-6 complete the purchasing loop started by quotation intelligence:

1. the couple reviews evidence and makes a revision-bound vendor decision;
2. OmnyID tracks contract, deposit, confirmation, cancellation, and refund evidence as
   distinct facts;
3. the couple can approve a minimum, field-level context grant for one vendor;
4. a claimed vendor can respond through its AFP identity;
5. an unclaimed or email-first vendor can use an optional secure response link or reply
   by email;
6. all response paths converge on one quotation/clarification successor flow; and
7. the booking produces an idempotent budget commitment and planning follow-ups only
   when confirmation evidence exists.

The portal is a transaction surface, not a new CRM. It is optional, narrowly scoped to
one vendor and one commercial thread, and cannot expose the couple's comparison or
private reasoning. Email remains a supported route.

The capability stays template-neutral. Wedding is the first adapter; later OmnyID
templates can supply their own requirements, timeline, and budget projections without
forking decision closure or the response portal.

## 2. Current-state audit

### 2.1 Clean quotation foundation at `052acc7`

The nominated branch already provides:

- template-neutral quotation contracts, validation, calculation, comparison, and replay;
- immutable source preparation using the existing parser, OCR, and ownership boundary;
- source-linked review successors;
- approval-bound clarification drafts and Gmail send reconciliation;
- a deterministic closure state machine for selection, contract, deposit, booking,
  cancellation, refund, and supersession;
- the wedding budget/timeline closure adapter;
- a field-allowlisted, expiring, revocable vendor-context grant and projection;
- quotation review, clarification, and closure components;
- DecisionOS/A2UI projection adapters using existing primitives; and
- independent feature flags, readiness states, verification tooling, and a dark Oracle
  deployment with all quotation flags disabled.

This programme integrates and exposes those foundations. It must not replace them.

### 2.2 Existing vendor and communication foundations

The committed lineage and WED-187 ledger contain useful building blocks:

- vendor claim tables and states, user `vendor` role, verification methods, and hashed
  magic-link storage;
- `/workspace/vendor.html`, claim intake, licensed photo management, and signed vendor
  AgentCard publication;
- vendor AgentCards advertising `wedding_enquiry` and
  `wedding_enquiry_response` capabilities and an encryption public key;
- a ciphertext-only `wedding_enquiry_envelopes` schema;
- AFP federation send/receipt/retry infrastructure;
- existing wedding outreach, explicit approval, inbound reply matching, and quote
  attachment ingestion;
- Cloudflare/Resend provider configuration and relay persistence foundations; and
- platform transactional mail through Cloudflare, separate from the vendor relay.

These are foundations, not proof that a complete vendor response workspace exists.
The audited WED-187 tree currently exposes a claim/photo flow, while the enquiry inbox,
client-side decryption, and response dashboard described by WED-170/WED-171 are not all
present as an end-to-end runtime path. Task DBV-00 must re-audit the exact integration
base and classify every dependency as reusable, incomplete, or absent before coding.

### 2.3 Email and Cloudflare constraints

The previously exposed transactional Cloudflare token on Oracle returned HTTP 401 and
Cloudflare error 1000 when checked on 2026-10-17. It is not usable. No token value was
read into local output or recorded in this document.

This result does not release the existing vendor-relay gates. Cloudflare Email Routing
inventory/security work remains separate from platform account mail. Implementation
must not silently substitute account transactional mail for the vendor relay. Until a
new credential, routing inventory, inbound signature validation, independent security
review, and canary are complete, use only the currently approved explicit-user email
path and keep vendor-relay features disabled.

## 3. Governing principles

### 3.1 AFP is the commercial source of truth

- Every decision, grant, response, evidence item, and state transition is an append-only
  AFP fact.
- Corrections and changes create successors with parents and typed references.
- Relational tables may index delivery, token use, and replay state but are projections,
  not an alternative history.
- A2UI and portal screens render AFP-derived state; browser state alone cannot complete a
  workflow transition.

### 3.2 One fact lineage, permissioned views

There is one enquiry/quotation/clarification/closure lineage. Couple, vendor, and email
views are projections from it. The system must not create unreconciled vendor and couple
copies of price, inclusion, availability, contract, or booking facts.

### 3.3 Explicit human authority

The couple must approve:

- outbound clarification content and recipient;
- the exact context fields shared with a vendor;
- vendor selection;
- contract acceptance/review acknowledgement;
- any record that a deposit was paid without machine-verifiable evidence; and
- booking, cancellation, or refund facts that rely on user testimony.

The vendor must explicitly submit its response. Draft generation never sends, accepts,
or books automatically.

### 3.4 Determinism at decision boundaries

Models may propose source-linked response fields, a concise summary, or an editable
draft. Versioned code owns:

- grant enforcement and redaction;
- state transitions and stale-revision rejection;
- monetary arithmetic and budget effects;
- question resolution and material-change detection;
- idempotency, replay, and ordering; and
- whether evidence is sufficient to offer a closure action.

### 3.5 Reuse project core

Do not build another OCR service, parser, sender, inbox protocol, queue, auth system,
claim system, AgentCard format, decision-card framework, A2UI renderer, budget ledger,
or wedding planner. Extend small capability modules and adapters around existing core.

## 4. Scope

### 4.1 Weeks 3-4: decision and booking closure

In scope:

- revision-bound shortlist/preference/selection actions;
- contract receipt and evidence review;
- explicit material-difference acknowledgement;
- deposit request and paid-record tracking without payment execution;
- booking confirmation with source or explicit-user evidence;
- deterministic budget commitment and planning task projection;
- cancellation, refund, and supersession successors;
- stale decision replacement after quote or contract changes;
- DecisionOS/A2UI presentation in wedding and future template adapters; and
- metrics for time-to-decision and clarification-to-booking.

### 4.2 Weeks 5-6: lightweight vendor response portal

In scope:

- one-transaction response links with short expiry and revocation;
- claimed-vendor authenticated AFP response;
- vendor preview of exactly what the couple chose to share;
- answers to outstanding questions;
- structured quotation fields and revised quotation/document submission;
- existing OCR/parser use for uploaded quote revisions;
- availability, price, inclusion, and booking-confirmation responses;
- safe draft/save/submit lifecycle;
- email as a first-class alternative path;
- acknowledgement and durable provider/AFP receipts; and
- a minimal transaction history limited to that vendor's own facts.

### 4.3 Out of scope

- payment collection, escrow, or bank/card integrations;
- e-signature or legal advice;
- a vendor CRM, lead pipeline, campaign tool, or generic mailbox;
- compulsory vendor signup or app installation;
- vendor access to competitor identity, pricing, ranking, or assessment;
- vendor access to private notes, hidden preferences, unrelated plan data, or the
  couple's full budget;
- automated negotiation, discounting, or contract acceptance;
- a new OCR/model stack or email provider;
- a second wedding planner or wedding-specific quotation engine; and
- enabling the currently gated vendor relay as a side effect.

## 5. Actors and access modes

| Actor/mode | Authentication | Permitted transaction scope |
| --- | --- | --- |
| Couple/user | Existing OmnyID session | Own tenant, decision, grants, and closure |
| Claimed vendor | Existing account plus active claim and signed AgentCard binding | Own listing and explicitly addressed transactions |
| Federated vendor agent | Verified AFP sender domain/signature and AgentCard capability | Addressed encrypted AFP thread only |
| Secure-link vendor | Opaque, hashed, short-lived capability plus challenge | One grant, vendor, thread, and allowed action set |
| Email-only vendor | Existing approved outbound/inbound provider path | Message/thread matched response only |
| Operator | Existing admin role | Support metadata; no routine decrypted commercial access |

Claim status alone is not authority to read a transaction. Vendor identity, target vendor,
thread, active grant, and requested action must all match.

## 6. Canonical state model

### 6.1 Decision state

Decision state is distinct from closure state:

```text
review_required
  -> comparable
  -> clarification_pending (optional, repeatable)
  -> preferred
  -> selected_for_follow_up
```

A quotation or contract successor can return the decision to `review_required`. A single
quotation can be reviewed and selected, but must not receive a comparative winner claim.

### 6.2 Closure state

Reuse the generic closure state machine already implemented at `052acc7`:

```text
selected
  -> contract_received
  -> contract_reviewed
  -> deposit_requested (optional)
  -> deposit_recorded_paid (optional)
  -> booking_confirmed
  -> cancelled / refunded / superseded
```

Invalid leaps fail closed. A deposit may be scheduled or recorded without being a fee.
It changes total cost only when evidence explicitly classifies it as a fee. No transition
executes a payment.

### 6.3 Vendor response state

```text
invited -> opened -> draft_saved -> submitted -> accepted_into_review
                                      |              |
                                      +-> superseded +-> rejected_with_reason
expired / revoked / consumed
```

`submitted` means a vendor response was durably received. It does not mean the couple
accepted a term or the quotation engine confirmed it. Response fields pass through the
same validation, evidence, review, successor, and re-evaluation path as email/upload facts.

### 6.4 Booking truth

`booking_confirmed` requires all of:

- the active selected quotation version;
- reviewed material contract differences, if a contract exists;
- one or more bounded evidence references or explicit user authority;
- expected-state and expected-version matches; and
- an idempotent AFP transition receipt.

Only this state creates the template adapter's budget commitment. A vendor saying
"confirmed" is evidence offered to the couple; it does not unilaterally bind the user.

## 7. AFP event and reference contract

Prefer the generic quotation kinds already implemented. Add only missing integration
kinds after DBV-00 proves they are needed.

| Kind | Authority | Required references |
| --- | --- | --- |
| `quotation_vendor_selected` | user | comparison and exact quotation version |
| `quotation_closure_transition` | user/system with evidence | previous transition, quotation version, sources |
| `quotation_context_grant` | user | approval receipt, vendor, thread, allowed fact IDs |
| `quotation_context_grant_revoked` | user | active grant |
| `quotation_vendor_response_invited` | user/system after approval | grant, clarification, vendor, delivery receipt |
| `quotation_vendor_response_draft` | vendor | invite/grant and vendor identity |
| `quotation_vendor_response_submitted` | vendor | active invite/grant and response fingerprint |
| `quotation_vendor_response_received` | system | submission plus channel receipt |
| `quotation_vendor_response_reviewed` | user | received response and successor quotation/review |

If existing `wedding_enquiry_response` can carry the response without losing generic
quotation semantics, use it as a transport envelope and reference the generic response
event. Do not change the AFP v1 envelope or duplicate content into metadata.

Required reference roles include `quotation`, `quotation_version`, `comparison`,
`clarification`, `grant`, `vendor`, `thread`, `source`, `approval`, `delivery_receipt`,
and `parent`. Canonical references and typed references must agree.

## 8. Vendor context grant

Extend, do not replace, `src/quotation/vendor_context.rs`.

A grant binds:

- issuing tenant/user and approval receipt;
- exact target vendor identity and optional claimed Agent ID;
- quotation, version, commercial thread, and clarification;
- purpose: `resolve_quote_gaps`, `submit_revision`, or `confirm_booking_details`;
- explicit shareable fact IDs and question IDs;
- allowed actions;
- projection schema and fingerprint;
- issued/not-before/expiry timestamps;
- single-use or bounded-reuse scope; and
- revocation/consumption state.

The projection allowlist may include only the vendor's own quotation facts, approved
requirements relevant to that transaction, approved questions, and user-approved package
change requests. Prohibited classes remain prohibited even if a malformed grant names
them.

The couple sees a field-by-field preview before approval. Grant changes produce a new
approval-bound grant; they never mutate the old one.

## 9. Secure response link

The link is a capability, not a login replacement or bearer access to a whole account.

Requirements:

- at least 256 bits of CSPRNG entropy;
- store only a keyed hash and bounded lookup prefix;
- bind to grant, vendor, thread, actions, and projection fingerprint;
- short default lifetime, no more than seven days for quote clarification;
- one-time challenge before showing commercial context;
- rotate after privilege or recipient change;
- revoke on grant revocation, quote supersession, vendor claim dispute, or booking close;
- single-use submission nonce with replay-safe receipt return;
- no token or private fields in logs, analytics, Referer, HTML, or URLs after exchange;
- exchange into an HttpOnly, Secure, SameSite=Strict scoped session;
- CSRF protection on mutations;
- rate limits by token prefix, IP hash, vendor, and thread; and
- generic errors that do not disclose vendor, couple, or transaction existence.

Where the existing magic-link table cannot represent these bindings and lifecycle rules,
add a quotation response-capability table. Do not overload authentication magic links in a
way that grants account access.

## 10. Response channel convergence

### 10.1 Claimed/local vendor

An authenticated claimant with an active claim and matching vendor AgentCard reads the
permissioned projection and submits a signed `wedding_enquiry_response` or equivalent
AFP response. Client-side encryption is required where the existing enquiry protocol
requires it.

### 10.2 Federated vendor

Use the existing AFP federation verifier, nonce/replay checks, delivery receipts, and
AgentCard capability discovery. A federation receipt proves transport acceptance, not
commercial acceptance.

### 10.3 Secure-link vendor

The link exchanges to the transaction-scoped session. Its submitted structured response
is attributed to the capability/vendor and becomes a private AFP response event. It never
impersonates a signed vendor Agent.

### 10.4 Email-only vendor

Reuse the approved send and inbound matching path. The email includes only approved
questions and a link, if authorized. A normal email reply is prepared as an immutable
source and processed through existing parsing/extraction/review. Do not require portal use.

### 10.5 Reconciliation

All channels produce a canonical response fingerprint over vendor, thread, active grant,
question answers, structured fields, attachments, and channel receipt. Duplicate email,
portal, and AFP delivery cannot create multiple active commercial facts. A materially
different later response creates a successor.

## 11. Vendor portal experience

The portal shows only:

- vendor identity and transaction-safe couple label;
- request purpose and expiry;
- the vendor's own active quotation/version;
- approved relevant requirements;
- outstanding approved questions;
- response status and the vendor's own prior submissions; and
- a clear email alternative.

The portal supports:

1. answer yes/no/unknown or bounded structured questions;
2. enter amount, currency, tax, unit, quantity basis, date, and availability using typed
   controls;
3. add a bounded free-text explanation;
4. upload a revised quote using existing ingestion/OCR/parser capability;
5. preview the exact submitted facts and evidence;
6. save a draft where identity mode permits; and
7. submit once with an idempotent receipt.

The portal must never show "you are losing to Vendor A", competitor totals, internal
scores, inferred budget pressure, hidden preferences, or unapproved reasons for delay.

## 12. Couple experience and A2UI

### 12.1 Reuse existing cards

Reuse `QuotationReviewCard`, `QuotationClarificationCard`, `QuotationClosureCard`, the
quotation DecisionOS adapter, and foundational decision-card patterns. Do not create a
new foundational comparison or booking card.

Allowed patterns remain:

- `review` for response and contract evidence;
- `clarify` for unresolved facts;
- `compare` and `choose` for the active quotations;
- `approve_act` for send/grant/selection authority; and
- `record` for deposit, confirmation, cancellation, and refund evidence.

### 12.2 A2UI composition

Use current allowlisted A2UI primitives wherever they express the state:

- `comparison_table` for active quote facts;
- `stat_row` for total, deposit, and due date;
- `constraint_badges` for confirmed needs and blockers;
- `insight_line` for material changes;
- `callout` for uncertainty, expiry, and non-payment language;
- `action_chips` for review, clarify, select, share, revoke, and record actions; and
- `decision` for explicit user choices.

Actions must bind exact quotation, comparison, closure, and projection revisions. New
A2UI input primitives require a demonstrated gap, a narrow schema, renderer allowlisting,
accessibility tests, and safe fallback. Portal forms may use existing typed Solid controls
when A2UI does not safely represent data entry.

### 12.3 Accessibility

Support keyboard-only use, visible focus, screen-reader labels and live regions, text/icon
status rather than colour alone, 44px targets, error summaries linked to fields, mobile
360px layout without horizontal overflow, and focus restoration after dialogs/drawers.

## 13. API boundaries

Suggested generic routes, subject to DBV-00 contract reconciliation:

- `POST /quotation-decisions/{comparison_id}/select`
- `POST /quotations/{quotation_id}/closure-transitions`
- `POST /quotation-context-grants`
- `POST /quotation-context-grants/{grant_id}/revoke`
- `POST /quotation-context-grants/{grant_id}/invites`
- `POST /quotation-response-links/exchange`
- `GET /quotation-response-session`
- `PUT /quotation-response-session/draft`
- `POST /quotation-response-session/submit`
- `GET /api/vendor/quotation-responses`
- `POST /api/vendor/quotation-responses/{invite_id}/submit`

Authenticated couple/vendor routes use existing session and role middleware. Public link
exchange is isolated, aggressively rate-limited, and returns only a scoped session. Routes
orchestrate small services; they do not contain arithmetic, permission policy, parsing, or
UI construction.

Mutations require stable idempotency keys, expected revisions, bounded bodies, tenancy or
capability validation, and audit-safe errors. Cross-tenant and wrong-vendor results are
indistinguishable from absence.

## 14. Persistence and projections

Use existing private AFP storage for commercial events and attachments. Additive relational
projections may hold:

- response-capability hash, prefix, lifecycle, and bindings;
- invitation delivery/reconciliation status;
- response session nonce and expiry;
- submission idempotency fingerprint; and
- privacy-minimised operational counters.

No relational column stores competitor comparison content, raw email bodies, private
notes, or a second authoritative quote. Tables require tenant/vendor/thread indexes,
uniqueness constraints, bounded retention, and cleanup behaviour. Migrations are additive,
reversible where possible, and tested through the migration catalog.

## 15. Security and privacy

- Validate source and attachment ownership before dereferencing.
- Treat quote, contract, contact, budget, requirement, and response content as private.
- Preserve existing E2EE boundaries; do not claim portal traffic is E2EE where the server
  processes plaintext structured fields.
- Never log tokens, message bodies, extracted text, model prompts/output, contract terms,
  email addresses, presigned URLs, or decrypted AFP payloads.
- Sanitize file names and render all vendor/user text as text, never unsanitized HTML.
- Reuse SSRF and active-content protections for source ingestion.
- Scan and bound uploads; reject unsupported/encrypted files honestly.
- Prevent IDOR across tenant, vendor, thread, quotation, grant, and attachment dimensions.
- Reject stale grants, replies against superseded quotes, and mismatched AgentCards.
- Audit grant issue/revoke, link exchange, submission, review, and closure without content.
- Operators cannot use support tooling to bypass a user's grant.
- Export/delete flows must include capability metadata and private AFP lineage as required
  by existing account policy.

Independent security review is required before secure links or vendor relay are enabled.

## 16. Failure behaviour

| Failure | User/vendor-visible result | Invariant |
| --- | --- | --- |
| Grant expired/revoked | Link unavailable; request a new invite | No context leaks |
| Wrong vendor/claim disputed | Generic unavailable response | No identity oracle |
| Stale quote or comparison | Refresh/review successor | No stale selection |
| Duplicate submit | Original durable receipt | No duplicate facts |
| Ambiguous external send | Pending reconciliation | No blind resend |
| OCR/parser unavailable | Upload retained with manual-review blocker | No invented fields |
| LLM unavailable/invalid | Typed manual form and source review | No unvalidated fact |
| Attachment rejected | Specific safe validation error | Other response data remains draft |
| Email reply unmatched | Existing manual triage path | No guessed thread |
| AFP federation failure | Durable failure receipt/retry | No false sent state |
| Contract terms changed | Review-required state | No silent booking |

## 17. Metrics

Collect aggregate, content-free measures:

- time from first complete quote to preferred and booked states;
- clarification exchanges per verified booking;
- qualified enquiry to verified booking rate;
- vendor active time per response where measurable without surveillance;
- portal invite open, submit, expiry, revocation, and email-fallback rates;
- response-channel distribution and duplicate-reconciliation count;
- extraction field accuracy and manual correction rate;
- stale/replay/cross-tenant rejection counts;
- contract material-change rate; and
- closure-to-budget projection latency and idempotency conflicts.

Do not label an email open as vendor intent, and do not place private identifiers or
commercial values in metric labels.

## 18. Rollout and release gates

All new switches default off and remain independent:

- decision closure UI integration;
- context-grant creation;
- claimed-vendor AFP response;
- secure response links;
- vendor structured quote upload;
- vendor email invitation; and
- booking-to-template projection.

Release sequence:

1. deterministic replay and fixtures;
2. local UI and accessibility evidence;
3. disposable-Postgres tenant/capability HTTP tests;
4. security and privacy review;
5. allowlisted internal synthetic transactions;
6. claimed-vendor canary without email relay;
7. allowlisted secure-link canary;
8. email-path canary only after its independent provider gates; and
9. time-bounded cohort with documented rollback.

Do not enable a feature merely because code is deployed. Retain the current quotation
readiness state as unverified until WED-213's hosted shadow, Postgres, provider, security,
and cohort evidence is complete.

## 19. Evaluation scenarios

### Scenario A: decision becomes stale

The couple selects a venue, then receives a materially different quote. The prior choice
is retained as history, the active decision returns to review, and no booking transition
can cite the stale version.

### Scenario B: contract differs from quote

The contract adds a mandatory fee. OmnyID shows the exact source-linked change, requires
review, updates comparable cost only after validation, and blocks booking confirmation
until acknowledged.

### Scenario C: claimed vendor responds through AFP

The matching vendor sees only granted questions and its own quote, submits signed answers,
and receives a durable receipt. The couple reviews a quotation successor; competitor data
never appears.

### Scenario D: unclaimed vendor uses secure link

The vendor exchanges a valid one-transaction capability, answers questions, uploads a
revision, and submits once. Replay returns the same receipt. Expiry, revocation, wrong
vendor challenge, and superseded quote all fail closed.

### Scenario E: vendor replies by email

The vendor ignores the portal and replies normally. Existing inbound matching creates a
source, extraction proposes anchored facts, and the couple reviews the same successor
flow as a portal response.

### Scenario F: booking confirmation

Evidence-backed confirmation creates one budget commitment and required wedding tasks.
A retry creates neither duplicate spend nor duplicate tasks. Cancellation/refund creates
successors and does not erase the history.

The couple must never reconcile these connected facts by hand. The authoritative AFP
transition updates the booking projection, category budget commitment, related task status,
and decision record in one idempotent fan-out, then shows a concise explanation of every
projection changed. Accepting a quote is not itself proof of a confirmed booking: without
the configured confirmation evidence it creates or advances only `booking_pending`.

### Scenario G: permission minimisation

A grant contains two approved requirements and three questions. The portal receives only
those fields. Attempts to request budget, score, private note, full plan, or competitor
fields are rejected even if named in a tampered payload.

## 20. AI context, token and draft governance

These rules apply to Wedding Planner and to later OmnyID templates that reuse the quotation and
outreach engine. They reduce repeated inference without weakening grounding or silently substituting
lower-quality commercial conclusions.

### 20.1 Retrieve structured facts, not wedding transcripts

- Couple requirements and preferences remain typed, versioned AFP facts (`wedding_intake_profile`,
  planning constraints, confirmed preference profiles and explicit feedback signals).
- Vendor requirements, directory attributes, availability and quotation facts remain separate AFP
  objects with source references and authority state.
- An inference request receives only the fields relevant to its declared purpose. It must not replay
  an unbounded wedding thread or infer a private field from conversational history.
- Relational indexes and caches are tenant-scoped, rebuildable projections. They never become a
  second authority for a preference, price, approval or booking state.

### 20.2 Reusable prompts and safe caching

- Standard enquiry and extraction instructions use stable, versioned prompt-prefix IDs. Couple or
  vendor-private values appear only in the variable suffix and must never enter a shared cache key.
- Provider prompt caching may be used only where the provider supports it, the stable prefix meets
  its cache threshold, and cache accounting is returned. Short prompts should not pay a cache-write
  premium merely to claim caching.
- Deterministic enquiry templates are the zero-token fallback. They use the same validated structured
  facts and never reduce an unknown commercial fact to a confident statement.

### 20.3 Generate only after meaningful action

- A draft is generated when the couple explicitly chooses Prepare enquiry, Retry or Update draft.
- Typing, formatting, toggling an accordion or moving focus never calls a model.
- Changing a sharing decision invalidates the preview. A budget choice that changes message content
  requires an explicit Update draft action before Send can become available.
- An unchanged persisted AFP draft is reused after refresh. It is not regenerated to repaint a card.

### 20.4 Incremental quotation processing

- A quote source is extracted once per immutable `source_version_id`, parser version, registry
  fingerprint and content hash. Corrections append a successor; they do not overwrite extraction.
- Normalised quotations carry a material fingerprint. An unchanged fingerprint is a no-op.
- A comparison AFP message is content-addressed from its candidates and material payload. It is
  regenerated only when a quotation version, event basis, requirement or comparison policy changes.
- The original file remains available beside the normalized projection so a couple can verify the
  extraction without another model call.

### 20.5 Account and wedding budgets

- Platform-funded wedding inference checks both the existing per-account budget and a bounded
  per-wedding share before a provider call. Usage receipts record actual input/output tokens and
  estimated cost against both identities.
- At a hard limit, outreach falls back to the evidence-safe deterministic template and quote
  extraction returns manual review required. Neither path fabricates a cheaper inference result.
- The provider ladder begins with the suitable lower-cost model. A paid top-up or operator-approved
  budget override may raise the existing account limit, but cannot relax evidence, privacy,
  validation or approval rules.

### 20.6 Generated drafts are auditable AFP events

Every user-visible generated draft is persisted before display and includes:

- immutable source references and the exact structured fields used;
- model name, versioned prompt-prefix ID, input fingerprint, input/output tokens and estimated cost;
- `pending_user_approval`, `approved_and_sent` or a terminal/rejected approval state;
- a monotonically increasing revision and a reference to the superseded draft; and
- the recipient, exact content, attachments, reply route and permission snapshot.

Edits are not model calls. A meaningful checkpoint or send appends a successor draft, and the send
receipt references the exact approved revision.

### 20.7 Trust and consent at the decision point

Comparison, normalized-quote, enquiry-preview and unanswered-enquiry surfaces answer authenticity,
payment influence, price accuracy, data sharing, phone pressure, AI grounding and non-response
questions where each concern becomes relevant. Before send, the couple sees the recipient, exact
message, attachments and shared facts. Approximate budget and phone contact are opt-in, reminders are
explicit, and protected OmnyID replies are the default intent. If the reviewed masked-reply service
is disabled, the send fails closed until the couple deliberately chooses a connected-email route.

## 21. Definition of done

- The implementation extends the generic quotation capability from a clean `052acc7`
  descendant and consumes reviewed WED-187 work rather than copying dirty files.
- AFP replay reconstructs decision, grant, response, and closure state deterministically.
- Claimed AFP, secure-link, and email responses converge on the same review/successor path.
- Booking evidence creates one source-linked commitment and never executes payment.
- Vendor projections are field-allowlisted, expiring, revocable, and competitor-blind.
- Email remains supported and the portal remains optional.
- Existing OCR, parser, auth, claim, AgentCard, sender, reply, DecisionOS, A2UI, and wedding
  adapters are reused.
- Security, cross-tenant, replay, upload, accessibility, mobile, and failure tests pass.
- All flags default off; release evidence and rollback are documented.
- No new file exceeds 999 lines, and no existing oversized file gains new responsibilities.
- `.agent/TASKS.yaml`, `.agent/DECISIONS.md`, and `.agent/HANDOFF.md` reflect the actual
  evidence rather than manually declaring deployment health.

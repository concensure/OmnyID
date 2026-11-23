# Wedding Vendor Comparison and Response Workflow Specification

Status: proposed implementation specification
Prepared: 2026-10-05
Source brief: `Documents/prompt/Wedding Planner evolvement.md`
Companion plans:

- `wedding-vendor-mvp-task-list-gpt-5-6-terra.md`
- `wedding-vendor-production-task-list.md`

Catalog snapshot: `wedding-vendor-database-current.csv`, queried from the configured local `afp`
PostgreSQL database on 2026-10-05. It contains 20 active vendors, all in `Venue`, and no rows with an
attached photo at snapshot time. This is a point-in-time local-development snapshot, not a claim
about a separately hosted production database.

## Model recommendation (one line)

Use GPT-5.6 Terra at high reasoning for the bounded MVP and GPT-5.6 Sol at high reasoning for the cross-cutting production pass, while leaving mechanical tests/refactors on Terra: official pricing is $2/$12 per million input/output tokens for Terra versus $4/$20 for Sol, and OpenAI publishes role guidance rather than a defensible task-specific accuracy percentage ([Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)).

## 1. Outcome

After the MVP task plan is complete, a user who finishes wedding onboarding can:

1. receive exactly three suitable vendor choices for one wedding vendor category;
2. see a vendor photograph when one is available, otherwise an unmistakably labelled placeholder;
3. understand why each choice fits the onboarding answers and what remains unverified;
4. choose a populated vendor directly to begin an availability, quotation, or purchasing request;
5. review and explicitly approve the exact outbound message before it is sent;
6. receive real vendor replies and quotes in the existing wedding workflow; and
7. see every unresolved wedding vendor quote surfaced as DecisionOS follow-up work.

The production task plan then turns this working vertical slice into an event-driven, replayable,
observable, accessible, secure, and operationally supportable release.

## 2. Governing architecture

The implementation must preserve the existing OmnyID core:

- The append-only AFP ledger is authoritative.
- The UI is a deterministic projection, not an independent workflow authority.
- Existing AFP messages are never mutated; corrections and transitions append successor messages.
- Existing message fields remain backward compatible and any new fields are optional.
- A decision and its execution are separate facts.
- Material recommendations retain evidence references.
- Online facts such as availability, price, quote validity, and photographs carry provenance and
  freshness; they are not promoted to permanent truth without evidence.
- External contact and sends remain approval-gated.
- Indexes, caches, the vendor directory, and local projections are rebuildable aids rather than a
  second authoritative decision ledger.
- No LLM invents card structure or workflow at runtime. The LLM may draft or reason inside a
  declared contract.

The intended MVP flow is:

```text
onboarding answers persisted to AFP
  -> choose the next vendor category
  -> query OmnyID vendor directory only
  -> apply the existing eligibility/availability/utility/evidence ranker
  -> if fewer than 3 suitable vendor choices, run online fallback once
  -> canonical merge and rerank
  -> enrich the canonical vendor rows under authority/freshness rules
  -> persist source notes + exactly-3 comparison artifact
  -> render the existing vendor choice cards
  -> user selects Contact / Check availability / Request quote
  -> persist draft -> show draft -> explicit Send -> persist receipt
  -> vendor reply or quote enters AFP
  -> quote decision request becomes visible to DecisionOS
  -> user decides -> downstream reply execution -> follow-up/closure
```

## 3. Existing implementation to reuse

This specification does not authorize a replacement subsystem. The following current code is the
starting point.

| Capability | Existing implementation | Required change |
| --- | --- | --- |
| AFP wedding intake | `weddingIntakeProfileAfpProjectionState.ts`, persisted `wedding_intake_profile` messages | Use this as the answer source; do not copy answers into a new authoritative profile table. |
| Intake-to-search query | `weddingVendorSearchLaunchState.ts` and `defaultWeddingVendorSearchQueryFromIntake()` in `ResponseQueueView.tsx` | Trigger once after a complete eligible onboarding; scope to one category. |
| Provider planning/execution | `weddingVendorSearchProviderPlanState.ts`, `weddingVendorSearchExecutorState.ts`, `wedding_vendor_search_routes.rs` | Add an optional directory-only first pass and retain the current online provider fallbacks for the shortfall pass. |
| Vendor directory | `wedding_vendors` access through `search_wedding_vendor_directory()` | Continue querying first; do not replace it with a new shortlist store. |
| Canonicalisation/evidence | `wedding_vendor_search_routes/{canonical_resolution,entity_merge,source_classification}.rs`, `wedding_vendor_evidence.rs` | Reuse for merged directory/online candidates and provenance. |
| Ranking | `weddingVendorRankingState.ts` | Reuse the eligibility -> availability -> utility -> evidence -> actionability funnel; add selection policy, not a second scorer. |
| Comparison artifact | `weddingVendorSearchArtifactState.ts` | Enforce exactly three active cards in one active category and explicit photo/placeholder state. |
| Vendor card | `WeddingVendorChoiceCard.tsx` | Keep and tighten direct request actions and image failure behaviour. |
| Outreach | `useWeddingVendorOutreachOwner.ts`, `weddingVendorOutreachFlowState.ts`, `weddingVendorOutreachAfpState.ts`, `wedding_vendor_outreach_routes.rs` | Persist generated draft before showing it and retain explicit-send approval. |
| Reply matching | `imap_sync.rs`, migration `0093`, `weddingVendorContactProjectionState.ts` | Reuse for real Gmail replies and thread continuity. |
| Quote ingestion/reply | `weddingVendorQuote*` state modules and `WeddingVendorQuoteReplyCard.tsx` | Project every unresolved quote into a DecisionOS-readable decision request. |
| Wedding home follow-up | `WeddingVendorFollowUpPanel.tsx`, `WeddingResponseWorkspaceView.tsx` | Keep as the wedding-specific projection; avoid duplicating it in DecisionOS. |
| DecisionOS queue | state synthesizer, continuity payload, `decisionOsQueueBootstrapState.ts`, `DecisionQueueView.tsx` | Feed it AFP decision requests derived from quote events; do not add a parallel queue database. |

## 4. Confirmed current gaps

The current code is close, but it does not yet meet the requested MVP contract:

1. Vendor search is user-triggered rather than a reliable post-onboarding transition.
2. The backend skips paid providers based on raw result count, not whether three results are suitable
   after applying the existing ranking and completeness rules.
3. A comparison can contain more or fewer than three choices: it currently combines up to three
   bookable and three verify candidates, plus booked candidates.
4. `WeddingVendorChoiceCard` already has a generated placeholder fallback, but the artifact does not
   yet model vendor media as an explicit `photo` or `placeholder` state or make later photo attachment
   to the stable vendor identity an acceptance-tested workflow.
5. A generated outreach draft is not appended to AFP at the moment it becomes user-visible; the
   existing owner persists it immediately before send.
6. Wedding quote messages address `agent://decision-queue`, but the current state synthesizer only
   promotes `decision_request` messages into its decision queue. Addressing a recipient is not the
   same as a working projection.
7. State synthesis is currently narrow/on-demand, so automatic event-driven quote promotion belongs
   in the production pass after the MVP projector is proven.
8. The repository's line-budget test currently fails on pre-existing files. The applicable project
   rule is stricter than the user's 3,000-line ceiling: wedding-scoped source/test files must stay
   below 1,000 lines. New work must not normalize or increase the existing violations.

## 5. Confirmed product decisions

### Decision A: how many categories should onboarding populate?

Confirmed: create and display one three-choice shortlist for one category at a time. On initial
onboarding completion, use the highest-priority unbooked category; if venue is unbooked and no
higher explicit priority exists, venue is first.

- Pros: fastest useful loop; one clear comparison; bounded provider cost; fits the three-decisions
  philosophy; easier to evaluate end to end.
- Cons: other selected categories are not visible until the user explicitly requests one.
- Alternative: three choices for every selected category immediately.
- Alternative pros: broader instant coverage.
- Alternative cons: much higher search cost, more cognitive load, more stale results, and a larger
  test matrix before the basic request/quote loop is proven.

Category choice and replacement rules:

1. A category requested through either the master-agent search bar or the vendor search field wins.
2. Otherwise use the highest onboarding priority that maps to an unbooked checklist category.
3. Otherwise use the first unbooked category in the existing wedding vendor checklist.
4. A requested category replaces the three currently displayed cards with three choices from the
   requested category. Do not append categories or show two category grids at once.
5. Persist the previous comparison as AFP-backed history; replacement changes the active projection,
   not ledger history.
6. Never silently choose when category intent is ambiguous; ask one plain-language question.

### Decision B: what counts as the required photograph?

Confirmed alternative: allow an honest, clearly labelled category/vendor placeholder when no usable
vendor photograph is stored. A placeholder must never be described as a vendor photograph or used
as evidence about the venue, product, quality, style, or service.

- Pros: the shortlist remains usable with sparse catalog media, does not spend on online search only
  to obtain an image, and cannot confuse an illustrative image with vendor evidence.
- Cons: the initial comparison is less visually informative until a verified photo is attached.

Use the existing `wedding_vendor_photos` relationship, keyed by stable `vendor_id` and photo `slot`,
for later media. The admin workflow must make it easy to select an existing vendor, preview and add or
replace a photo URL plus alt text/source metadata, and save it without creating another vendor row.
After refresh/reprojection, the verified slot-one photo replaces the placeholder on the same vendor.
Photo enrichment must retain source URL/provider, retrieval time, vendor identity match, and licence
or usage metadata when supplied.

## 6. MVP functional contract

### 6.1 Onboarding readiness

The automatic shortlist may run only when the AFP-backed intake provides:

- wedding plan/workspace identity;
- a usable location or service area;
- at least one resolvable vendor category;
- the existing ranking inputs available from onboarding, such as guest count, budget comfort,
  priorities, atmosphere, date/season, and category preferences.

Missing optional preferences reduce evidence confidence; they must not be invented. Missing location
or category blocks automatic search and produces one actionable onboarding prompt.

The automatic trigger must be idempotent by wedding plan, category, material intake hash, and ranking
policy version. Refreshes and retries must not create duplicate artifacts or consume paid-provider
credits again for an unchanged completed shortlist.

### 6.2 Database-first retrieval and online fallback

The first pass queries only the existing OmnyID vendor directory. It is then normalized and ranked by
the existing ranking funnel.

A candidate is "MVP suitable" only when all of the following hold:

- it is not excluded by an existing hard constraint;
- it belongs to the target category and has no known service-area conflict;
- it is not already booked/selected for this wedding;
- it has a stable vendor/canonical identity and source provenance;
- it has at least one usable request route: email, phone, verified website/contact form, or an
  existing supported vendor thread;
- it has enough source evidence for the current ranker to place it in `bookable` or `verify`;
- any unknown availability is labelled unknown and the primary action requests availability/quote
  rather than claiming it is available.

Do not create a new fit formula or tune arbitrary thresholds in the MVP. Suitability consumes the
existing ranker groups, hard constraints, confidence, evidence, and next-action outputs.

If the directory produces three suitable choices, no online provider is called. If it produces
fewer than three, run the existing provider plan once, merge directory and online evidence through
the current canonicalisation path, rerank, and fill only the shortfall. The final comparison is
always reranked as one set; directory results receive no artificial score bonus merely for being
local.

Missing photos alone do not make otherwise suitable directory vendors unsuitable and must not
trigger paid online fallback. If three suitable choices still cannot be produced, do not manufacture
vendors, availability, prices, or rationale. Persist a blocked/incomplete search receipt and show
the user what is missing and how to retry or broaden the area.

Every online result is also enrichment input for the vendor directory, not merely transient card
content. Before an upsert, reuse the existing canonical resolution, entity merge, source
classification, and evidence code. Match in this order where available: canonical/vendor id,
provider place id, normalized website/domain, then normalized name plus service area. An ambiguous
match is retained as pending evidence and must not create a duplicate row.

Attribute updates are field-level and provenance-aware. Official/operator-verified or vendor-replied
evidence outranks aggregates and search caches; within the same compatible authority, the newer
credible observation becomes the materialized current value. A merely newer low-authority source
must not overwrite stronger truth. Retain the prior observation in evidence/history, including
source URL, source class/authority, observed/retrieved time, confidence, and validity where known.
Online contacts, URLs, service areas, photo slots, and other facts enrich the resolved vendor row;
they do not create a second row for the same business.

### 6.3 Exactly-three comparison

The active comparison contains exactly three unique candidates for the target category.

- Order: existing ranker order among suitable candidates.
- Booked and excluded candidates do not enter the active three.
- Each card displays a rank, vendor name, photograph, fit/evidence explanation, confidence,
  availability state, unverified facts, source access, and one dynamic request action.
- The photograph position displays a verified vendor photo when present; otherwise it displays a
  clearly labelled placeholder. A broken/unsafe image falls back to that placeholder without
  removing an otherwise suitable vendor.
- Facts, inferences, recommendations, and unknowns remain distinguishable.
- The comparison artifact and its selected state remain append-only/rebuildable through AFP.
- A later material intake, availability, or evidence change creates a successor comparison and
  retains the former comparison as history.

### 6.4 Direct choice and request execution

The user can act from a populated card without re-entering the vendor details.

Primary action semantics:

- unknown availability -> `CHECK_AVAILABILITY_AND_REQUEST_QUOTE`;
- known/likely available but unquoted -> `REQUEST_QUOTE`;
- a current quote already exists -> `REVIEW_QUOTE`;
- a supported purchase/booking step exists -> `START_PURCHASE_OR_BOOKING`, still subject to the
  applicable approval and financial policy.

The existing card may render friendly labels, but AFP records semantic intent. Pressing the action:

1. creates or retrieves the stable vendor thread;
2. retrieves only the bounded onboarding/vendor context needed for the message;
3. generates the draft through the existing admin-funded outreach endpoint;
4. appends the draft AFP message before the editor displays it;
5. displays the exact persisted payload for review/editing;
6. requires an explicit user Send action;
7. sends through the connected provider;
8. appends delivery success/failure and provider receipt; and
9. creates/updates the existing vendor-contact follow-up projection.

No purchasing commitment, deposit, contract acceptance, or send may occur from the initial card
click alone.

### 6.5 Quote-to-DecisionOS projection

Every unresolved `wedding_vendor_quote_received` AFP event must have one stable, idempotent
DecisionOS decision request derived from it.

MVP pattern metadata:

```text
pattern_id: wedding.vendor_quote_response
pattern_version: 1
situation_type: vendor_quote_received
source_ref: incoming quote AFP id
decision_id: stable from quote id + wedding plan
allowed_actions:
  - ACCEPT_VENDOR
  - NEGOTIATE_QUOTE
  - EXPLORE_ALTERNATIVE
  - DEFER_DECISION
```

Required decision evidence:

- vendor identity/thread;
- quote amount/currency and source attachment/message;
- scope/inclusions when known;
- validity deadline and freshness when known;
- relevant category and overall budget context when known;
- preference/priority references used in the recommendation;
- unknown, stale, or conflicting fields.

For MVP, the projector emits an ordinary AFP `decision_request` compatible with the existing state
synthesizer and DecisionOS continuity queue. It must reference, not duplicate, the quote truth. The
existing DecisionOS refresh path must then show the quote as unresolved follow-up work and open the
wedding quote thread/card. Resolution, deferral, and send append successor events; they never mutate
the quote or remove history.

The production plan replaces the refresh-dependent bridge with event-driven detection, pattern
verification, safety-envelope scheduling, and automatic resurfacing.

## 7. AFP and projection invariants

- Intake answer source: existing `wedding_intake_profile` AFP message.
- Search execution receipt: contains directory/live provider use, source counts, skip/fallback
  reason, query fingerprint, policy version, and timestamps.
- Comparison: references search evidence and candidate identities; it does not copy a second vendor
  directory into the card.
- Selection/request intent: an append-only decision/action message referencing comparison and
  candidate.
- Draft: immutable versioned AFP message; edits create successor versions at meaningful checkpoints.
- Approval: explicit user approval of the exact payload/version.
- Send: separate success/failure event with provider receipt.
- Quote: incoming evidence event with source/attachment references and freshness.
- Decision request: references quote, pattern id/version, allowed actions, and current lifecycle.
- Deferral/resolution: successor AFP events with stable decision/thread identity.
- Local storage may improve responsiveness but cannot be the only durable copy of selection,
  generated draft, approval, send, quote, or decision status.

## 8. UX acceptance criteria

### MVP happy path

1. Complete onboarding with location, category, priorities, atmosphere, budget/date/guest context.
2. Without typing another search query, the wedding home shows one shortlist for the chosen category.
3. Exactly three unique vendor cards render.
4. Each card shows either a verified vendor photograph or an honest labelled placeholder.
5. Card explanations cite actual onboarding/evidence inputs and expose unknown availability honestly.
6. Selecting the request action opens the existing composer with a persisted, personalised draft.
7. Send is impossible until the exact draft is visible and the user acts explicitly.
8. After Send, the composer collapses to a receipt/follow-up state.
9. A real inbound vendor reply appears in the existing follow-up surface.
10. A real quote produces one unresolved DecisionOS queue item linked to the wedding quote workflow.
11. Resolving or deferring it changes the projected lifecycle without deleting history.
12. Requesting another category in either supported search field replaces the active three cards
    with three from that category while preserving the former comparison as history.
13. Adding a verified photo to an existing vendor through the admin catalog replaces that vendor's
    placeholder after refresh without changing `vendor_id` or creating a duplicate vendor.

### Required failure paths

- incomplete onboarding;
- directory returns zero, one, two, or three suitable choices;
- online provider disabled, rate-limited, empty, duplicated, or unavailable;
- image URL fails to load;
- attempted online enrichment ambiguously matches more than one vendor;
- missing vendor email but supported website/phone route exists;
- draft generation fails;
- AFP draft persistence fails;
- Gmail is disconnected;
- send succeeds but contact projection fails;
- duplicated inbound reply/quote;
- quote lacks amount, validity date, attachment text, or budget context;
- state/DecisionOS refresh repeats.

Every failure state must state what failed, why if known, and the next safe action. Partial results
must never be described as a complete shortlist or complete decision.

## 9. Non-functional requirements

- User-visible first directory-only shortlist target: P95 under 2 seconds on warm local data.
- Online fallback target: P95 under 10 seconds, with visible progress and cancellation-safe state.
- No more than one paid fallback execution for an unchanged onboarding/category fingerprint.
- No duplicate comparison, outreach, quote decision, or send receipt under retries.
- Purpose-bounded context retrieval; do not prompt with the whole wedding profile.
- Secrets stay server-side; photo proxy and provider policy checks remain intact.
- No new third-party package for this slice unless unavoidable and approved.
- Use existing wedding design tokens and A2UI/bespoke renderer decision already present in the repo;
  do not build a third comparison renderer.
- All new and refactored files must meet the repository's focused limit of at most 999 lines, which
  is stricter than the requested 3,000-line ceiling.
- Do not add logic to already oversized files without extracting a focused module and reducing the
  touched file. Do not raise line-budget caps to make tests pass.

## 10. Scope boundaries

MVP includes one active category shortlist at a time, explicit category replacement, direct request
drafting/sending, reply continuity, quote surfacing in DecisionOS, evidence/provenance, failure
handling, and focused tests.

MVP does not include autonomous booking/payment, every vendor category at once, a new vendor CRM,
a new authoritative DecisionOS database, a second ranking algorithm, broad wedding home redesign,
or unconstrained LLM-generated workflows.

Production includes event-driven pattern orchestration, replay/recovery, quality evaluation,
observability, accessibility, security hardening, cost controls, operational readiness, and rollout.

## 11. Release gates

MVP cannot be called complete unless:

- the exact-three/photo/direct-request/DecisionOS scenarios pass with non-fixture data;
- relevant unit, integration, and browser tests pass;
- `npm run typecheck`, focused wedding tests, the line-budget test, production UI build, Rust checks,
  and affected SDK checks pass;
- all pre-existing line-budget failures touched by the work are remediated, and unrelated baseline
  failures are explicitly recorded rather than hidden;
- no provider secret or private wedding context is logged;
- a replay from AFP reproduces the shortlist/request/quote-decision lifecycle;
- the implementation record lists every changed file, test command, known limitation, and rollback.

Production cannot be called complete until the second companion task plan's rollout, monitoring,
security, recovery, and SLO gates pass in the hosted environment.

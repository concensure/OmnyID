# WED-275: reuse inventory and practice authority contract

Implementation base: `f1f9c82`, the documentation-only descendant of `6af9203`.
Contract status: local foundation; no practice route or user interface is enabled.

## Reuse inventory

Paths are relative to the repository root. Existing tests are evidence locations, not a claim
that an unexecuted suite passed. The original specification's dotted event names were illustrative.
Existing AFP kinds use snake_case with an independent version in metadata/content.

| Requirement | Decision | Existing implementation and verification | Professional adaptation |
| --- | --- | --- | --- |
| Account and private ledger | Extend | `src/server/auth.rs`: `authenticated_user`, `thread_messages_for_headers`, `store_private_app_message`; `src/db.rs`; `tests/quotation_decision_api.rs` | Preserve authenticated account IDs. Resolve a `PlanRef` to an existing owner account and AFP thread before querying. Add a separate collaboration-aware guard; do not weaken the current owner-only guard. |
| Wedding template | Reuse | `solid-ui/src/lib/weddingPlanningTemplateState.ts`, `weddingCalendarProjectionState.ts`; `solid-ui/tests/wedding-calendar-projection-state.test.ts` | An ordinary client plan remains the source. Never install a second planner template or copy client history. |
| Tasks and assignments | Extend | `weddingTaskResponsibilityProjectionState.ts`, `weddingTaskCompletionProjectionState.ts`, `weddingTaskDateProjectionState.ts` under `solid-ui/src/lib/` | Existing `wedding_helper_responsibility` and `wedding_task_completion` remain readable. New generic `workflow_item_assigned` references the existing task; no task table. |
| Calendar | Extend | `solid-ui/src/lib/weddingCalendarProjectionState.ts`, `src/calendar_event_profile.rs`; calendar projection tests | Add resource policy, exception and hold events. WED-279 must resolve IANA zones and evaluate DST, recurrence and overlaps; structural validation here does not prove availability. |
| Vendor lifecycle | Reuse | `solid-ui/src/lib/weddingVendorLifecycleState.ts`; `solid-ui/tests/wedding-vendor-lifecycle-state.test.ts` | Consume `wedding_vendor_outreach_sent`, `wedding_vendor_quote_received`, `wedding_vendor_booking_confirmed`, `wedding_vendor_booking_cancelled`, `wedding_vendor_follow_up_reminder`, `wedding_vendor_contact_reference`. Portfolio entries retain source event IDs. |
| Enquiries and relay | Extend | `src/server/wedding_vendor_outreach_routes.rs`, `src/server/vendor_email_worker_ingress.rs`, `src/wedding_vendor_email_contract.rs`; `tests/vendor_email_worker_ingress_api.rs` | Aggregate permitted existing conversations. Sending still requires exact draft/content authority and existing relay gates. |
| Vendor identity and profile | Reuse | `src/server/wedding_vendor_claim_routes.rs`, `src/server/wedding_vendor_ownership_routes.rs`, `solid-ui/src/components/vendor/VendorClaimFlow.tsx`; `tests/wedding_vendor_ownership_api.rs` | Vendor proof is bound to a claimed identity and exact addressed resource, not membership of a practice. |
| Secure attachments | Reuse | `src/server/quotation_vendor_attachment_routes.rs`, `src/server/file_upload_routes.rs`, `src/quotation/response_capability.rs`; `tests/quotation_response_capability.rs` | Existing capability, scanner and content controls remain. Add current plan/grant checks before every download; a URL is not continuing authority. |
| Itemised quotations | Reuse/extend | `src/quotation/contracts.rs`, `vendor_response.rs`, `vendor_revision.rs`, `validation.rs`; `tests/quotation_contracts.rs`, `quotation_vendor_response.rs` | Reuse `NormalisedQuotation`, `LineItem`, `Money`, `ScaledQuantity`, `TaxRule`, `CommercialTerm`, source/version lineage and expiry. A practice quotation link references a canonical revision; it does not define another vendor quote object. WED-281 adds authored package lineage and presentation if needed. |
| Quotation AFP and replay | Reuse | `src/quotation/afp.rs`, `replay.rs`; `tests/quotation_afp.rs` | Preserve normalisation, correction, comparison, review, vendor selection and closure kinds. Do not rename existing events to match the illustrative spec. |
| Booking confirmation | Extend | `src/quotation/closure.rs`, `closure_evidence.rs`; `tests/quotation_closure.rs`, `quotation_closure_evidence.rs` | Link a canonical closure transition and validated evidence. A linked ID must be resolved to the same plan/quote/version by WED-282; shape validation cannot prove a booking. |
| Payment evidence and Budget | Extend | `src/quotation/closure_evidence.rs`, `solid-ui/src/lib/weddingBudgetEvidenceHubState.ts`, `weddingBudgetTrackingState.ts`; `solid-ui/tests/wedding-budget-evidence-hub.test.ts` | Retain existing deposit evidence. Add schedule, balance and correction events in the client ledger, using existing integer `Money`. No payment execution. |
| Practice identity and membership | New | `src/practice/{contracts,events,authority,validation}.rs`; `src/practice/{tests,event_tests}.rs` | Strict, versioned practice contracts and a deny-by-default role/capability intersection. No new persistence in WED-275. |
| Collaboration and client index | New | Same practice modules and tests | Explicit owner-authorised grant for each account/practice/plan; enumerated summary DTO; no arbitrary JSON. |
| UI storage | Extend | `solid-ui/src/lib/accountScopedStorage.ts`, `weddingProjectionStorageState.ts`; `solid-ui/tests/account-scoped-storage.test.ts` | Current account-only cache names are insufficient for professional mode. WED-276/277 must add practice, owner, plan, thread and authority revisions and clear on context change. |

## Identifier and source-of-truth rules

`PlanRef { account_id, plan_id, thread_id }` explicitly separates the owner tenant, logical
template instance and underlying AFP thread. The adapter must resolve this tuple from current
server data; values submitted by the browser cannot select another owner's data. Current Wedding
code is often account-scoped and does not yet supply that collaboration adapter. Do not assume
an account ID is a plan ID or expose another account through `thread_messages_for_headers`.

Practice-only events (identity, membership and resource availability policies) live in a practice
coordination ledger. Plan-scoped events live in the original client ledger. `practice_client_indexed`
is a rebuildable summary reference; only its allowlisted/redacted projection may be cached in the
practice index. Quotations, payment evidence, documents and conversations remain in the source plan.
Grant provenance is owner-authorised there; practice membership cannot manufacture a client grant.

## Versioned registry

`PracticeEvent` has `schema_version = practice.event.v1`; `CommandEnvelope` has
`schema_version = practice.command.v1`. Rust's strict serde types are the executable schemas.
`decode_event` rejects unknown fields, kinds, unsupported versions, invalid scope and invalid
domain values, with a 128 KiB limit. `PRACTICE_EVENT_KINDS` enumerates the registry; tests round-trip
every registered payload. Wire parsing is not authorisation or reference verification.

| Payload kind | Scope | Contract / reuse |
| --- | --- | --- |
| `practice_created` | Practice | Display name, explicit owner |
| `practice_member_granted` / `practice_member_revoked` | Practice | Subject, role, capabilities, effective/expiry time; revocation links the prior grant event |
| `plan_collaboration_granted` / `plan_collaboration_revoked` | Client plan | Same generic grant contract, bound to exact practice and `PlanRef` |
| `practice_client_indexed` | Source plan / redacted practice projection | `ClientSummary` |
| `workflow_item_assigned` | Client plan | Existing item ID, assignee, superseded assignment |
| `availability_policy_recorded` / `availability_exception_recorded` | Practice resource | Weekly minute windows, IANA zone, explicit buffers; dated interval exception |
| `date_hold_transition` | Client plan | Resource, UTC-offset interval, zone, expiry, expected/target state; canonical booking reference for conversion |
| `quotation_revision_linked` | Client plan | Reference existing quotation/version/event, optional superseded version |
| `booking_confirmation_linked` | Client plan | Reference existing closure transition and validated evidence IDs |
| `payment_schedule_item_recorded` | Client plan | Existing quotation version, integer Money, due time, optional superseded event |
| `payment_evidence_recorded` | Client plan | Existing secure source/version, integer Money, optional correction lineage |
| `payment_state_changed` | Client plan | Expected/target state, evidence IDs, optional correction lineage |

All events include actor, practice, plan where required, authority revisions, event ID, timestamp,
idempotency key and source event IDs. Later adapters wrap these payloads in the existing signed AFP
envelope with matching kind/subtype, private metadata and encryption policy. Generic kinds stay
template-neutral. Existing quotation/closure schemas retain their original versions.

## Authority rules

The effective permission is the intersection of the role ceiling, explicit membership capability,
explicit plan collaboration capability, live validity, exact subject and exact context. Every
membership and collaboration change advances its own authority revision. Revocation or reduction
invalidates old revisions even if the browser retains a previously allowed payload.

| Role | Maximum authority; every client permission still needs an explicit grant |
| --- | --- |
| Practice owner | Manage practice and team; planner capabilities only for explicitly granted clients |
| Lead planner | Assign/edit planning work, propose decisions, send approved enquiries and accept quotes/holds only with their separate capabilities; cannot confirm supplier bookings |
| Coordinator | Planning edits/assignments, proposals, scoped conversation reads and sends; no financial evidence, sensitive notes or quote acceptance |
| Finance-only | Minimal client index, financial summary, financial evidence and payment tracking; no conversations, documents, guests or quote detail |
| Read-only | Explicitly granted client reads; no mutation or management |
| Couple owner/co-owner | Server-proven ownership of the selected plan, explicit resource capabilities and collaboration management; no practice administration or supplier confirmation |
| Vendor representative | Server-proven, exact addressed resource capability; no client portfolio, guest list, private notes or general plan access |

The test matrix covers all 8 roles × 18 resources × 8 actions, including positive and negative
guard decisions. SensitiveNotes, Conversation, Guests, Documents, FinancialSummary and
FinancialEvidence are separate resources. No generic `Plan/Read` implies them. There is no payment
execution capability. `Booking/Confirm` belongs to a supplier representative and still requires
the canonical booking policy and evidence checks in WED-282.

`AuthoritySnapshot` is intentionally not deserializable. A future route must construct it from
current authenticated server replay, including the live grants, not accept a snapshot from a client.
Membership cannot use a couple/vendor role. Grants are bound internally to practice, plan and,
for vendor access, exact resource. Stale or missing grants fail closed.

## Client index field allowlist

`ClientSummary` contains only `plan`, `client_label`, `wedding_date`, `stage`,
`assigned_planner_id`, `next_action`, `next_action_due_at`, `unread_count`,
`action_needed_count`, `financial_due` and `source_projection_version`.

Labels and dates are bounded. Next actions and stages are enums. Financial due entries use
existing `Money` plus due timestamp, with at most 20 entries. No contact details, message bodies,
guest lists, original documents, private notes, extracted quote text or free-form action prose
are allowed. Unknown fields are rejected instead of silently ignored.

`project_client_summary` first requires current `ClientIndex/Read` authority for the source plan.
It removes unread counts without conversation permission, financial due totals without financial
summary permission and next actions/deadlines without their source-resource permission. Mixed
action counts and generic approval prompts are suppressed unless all contributing resource permissions are present. Missing
permission is `None`, never a misleading zero. Adapters must filter before counts, pagination,
search ranking or export so inaccessible plans do not leak through aggregate totals.

## Commands, retries and revocation

Commands carry authenticated actor binding, practice, full optional `PlanRef`, exact resource,
capability, expected authority revisions, expected projection version and idempotency key.
Routes must derive the required capability from the typed operation; callers cannot choose a
weaker capability to authorise a stronger payload.

In one transaction, the future persistence adapter must:

1. Resolve actor and context, then load current grants and revisions with the append lock.
2. Authorise the typed operation and validate its payload and source references.
3. Use `command_digest` to hash the complete typed command and payload; look up the receipt under actor, practice,
   owner account, plan, thread and idempotency key.
4. Use `check_command_revision`: exact retry returns the previous receipt, changed payload under
   the same key conflicts, and a new stale projection command conflicts.
5. Append one event and receipt, update the projection version and publish invalidation atomically.

The revision helper does not itself perform persistence, transaction locking or duplicate delivery
handling. Those are integration requirements for the later vertical slices, not completed runtime
features. Reauthorise even an exact retry; a revoked actor cannot read an old receipt.

| Surface | Required revocation behaviour |
| --- | --- |
| HTTP / search | Load current authority before query and serialization; omit inaccessible rows and counts |
| Websocket | Recheck before every delivery; discard queued messages and unsubscribe on revision change |
| Cache | Bind entries to actor, practice, owner/plan/thread and both revisions; reauthorise before reuse; purge on revoke/switch |
| Attachments | Authorised proxy lookup on each fetch; no unrevocable bearer URL as a grant; expire/invalidate any issued token |
| Exports | Recheck at job start, each source read and final download; cancel/purge on revoke |
| In-flight UI | Cancel/namespace requests, discard late results from the old context and clear private detail |

The pure guard is tested for these surfaces. Real HTTP/websocket/cache invalidation and recipient
key changes remain WED-277/WED-283 work. Revocation cannot erase plaintext already legitimately
downloaded or remembered by a recipient; it stops future service access. Do not claim otherwise.

## Compatibility, rollout and review

No migration, endpoint, feature flag, external send, hold, booking or payment execution is added.
Old AFP messages and existing couple/vendor routes are unchanged. Reverting the new module and its
`lib.rs` registration removes the executable foundation; no database rollback is needed.

Before WED-276/277, settle the server-owned plan-reference mapping and transactional grant/revision
store. Do not serve synthetic contracts as live authority. Before WED-279, add timezone resolution,
interval conflict checks and expiry/acceptance race handling. Before WED-281/282, resolve canonical
quote/closure/evidence references and enforce revisions, currencies, evidence and booking policy.

The base commit was absent from GitHub's Checks API (422 on this session); recent remote CI runs
were older failed commits. The Deployments API returned no entries. No hosted-health assertion
follows from local checks, and this work does not change the existing release gates.

## WED-276 integration checkpoint

The WED-275 compatibility statements above describe that contract-only slice. WED-276 now adds
`src/practice/bootstrap.rs`, `src/server/practice_routes.rs`, migration 0122 and the Solid practice
entry point. Bootstrap uses current stored grants in one repeatable-read transaction, intersects
membership and per-client authority before serialising counts or actions, and responds with
`Cache-Control: no-store, private`. Unknown/malformed index content fails closed. Priority order is
permission, approval, reply/quote, hold, payment evidence, follow-up, task; deadline and full plan tuple
break ties deterministically.

The SQL tables are rebuildable indexes, not a second Wedding history. They are initially empty and
have no public write API. WED-277 must resolve plan ownership and transactionally project authorised
source events and revocations into them before any real account is allowlisted. `source_event_id`
is a provenance reference, not proof validated by this read-only slice. Do not manually seed live grants.

UI responses are held only in memory. Switching, hidden tabs and errors clear private detail; every
refresh and Back navigation rechecks the server. Abort generations reject late responses. URLs retain
explicit practice/owner/plan/thread and filters; browser history retains scroll and authority identity,
not client summaries. Scroll is reused only when account, practice and grant revisions still match.
Visible tabs recheck every 30 seconds; this is not push revocation. Websocket cancellation and live
source-event integration remain WED-277/WED-283 requirements.

Rollback disables the practice flag and removes consumers while retaining the additive empty/index
tables. No source AFP history is rewritten or deleted. Full thread reads remain owner-only until
WED-277 adds explicitly scoped access. Existing couple/vendor workflows are unchanged apart from the
capability-guarded navigation link. Browser evidence uses fixtures; the disposable PostgreSQL HTTP
check exercises authentication, current index grants and immediate denial on subsequent reads.

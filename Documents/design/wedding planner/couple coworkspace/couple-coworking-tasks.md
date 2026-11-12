# Couple coworking implementation tasks

Dependency order is authoritative. Task: WED-365.

Status: implementation started 12 November 2026. Checked items are repository
claims only; hosted and full-account release gates remain separate.

## Phase 1 — Shared-scope foundation

### COW-01 — Route and object inventory (P0)

- [x] Map budget, guest/RSVP, seating, vendor/quote, task/decision, run-sheet,
  document, database, search and AI routes to their current ownership check.
- [x] Classify each as membership-ready, owner-only or browser-local.
- [x] Acceptance: every shared object has one named canonical authority and no
  proposed duplicate store.

### COW-02 — Canonical WeddingScope resolver (P0)

- [x] Extract the membership resolution in `wedding_partner_sharing_routes.rs` into
  a reusable server service returning canonical owner/plan/workspace/member/
  role/revision.
- [x] Require an active membership and exact scope IDs in the membership query.
- [x] Add owner bootstrap through the same path.
- [ ] Tests: owner, partner, revoked member, guessed plan/workspace and role
  escalation.
- Depends on COW-01.

Implementation evidence: `0171_wedding_scope_revision.sql`,
`src/server/wedding_scope.rs`, and the refactored
`wedding_partner_sharing_routes.rs`. Unit coverage proves bounded IDs,
revisioned cache names and role behaviour; disposable-Postgres route coverage
remains open.

### COW-03 — Cross-domain server enforcement (P0)

- Apply `WeddingScope` to existing shared-domain routes in small domain slices;
  bind scope in each read/update SQL statement.
- Remove authenticated fallbacks to legacy global or owner-only browser keys.
- Invalidate scope-revision caches on acceptance and revocation.
- Tests use two couples and separate browser/session contexts.
- Depends on COW-02.

### COW-04 — Invitation and membership UX (P0)

- Surface existing invite, accept, member list, leave/revoke and expiry states
  inside Wedding sharing settings.
- Explain equal Wedding access versus separate personal accounts before
  acceptance.
- Enforce the initial two-partner limit without weakening existing restricted
  external capabilities.
- Depends on COW-02.

### COW-05 — Selected-contact sharing (P0)

- Connect existing encrypted contact grants to role filters and a field-level
  preview/confirmation UI.
- Show provenance and shared-by identity; do not expose the source contact ID
  through an unrestricted personal-contact fetch.
- Support explicit update and revoke of the shared snapshot.
- Depends on COW-02.

## Phase 2 — Core Wedding collaboration

### COW-06 — Canonical shared projections (P0)

- Make Budget, Guests/RSVP, Seating, Vendors/Quotes, Tasks/Decisions, Run sheet
  and Documents resolve the same plan for both partners.
- Make Database view list authorised Wedding projections beside that account's
  personal databases without copying records.
- Tests: values and progress match across partners; personal objects differ.
- Depends on COW-03.

### COW-07 — Actor, revision and recoverability (P0)

- Add actor/provenance presentation from existing AFP/event facts.
- Require expected revision for money, confirmed decisions, guest state and
  other protected writes; show a merge/review surface on conflict.
- Prefer archive/restore over destructive deletion.
- Depends on COW-06.

### COW-08 — Assignments, comments and joint decisions (P1)

- Reuse existing task ownership, comments/messages and DecisionOS records.
- Allow assign-to-self, partner or both; attach discussions to source objects.
- Do not copy tasks into both accounts.
- Depends on COW-06 and COW-07.

### COW-09 — Shared activity and catch-up (P1)

- Project content-light shared activity with actor and object references.
- Generate "Since you were last here" only from authorised Wedding events.
- Add per-account read cursor without changing shared event truth.
- Depends on COW-07.

## Phase 3 — AI and publication boundary

### COW-10 — Wedding-scoped retrieval (P0)

- Apply `WeddingScope` before search, embedding retrieval, document preview,
  model context, agent memory and tool execution.
- Namespace caches by canonical scope plus membership revision.
- Adversarial tests cover guessed IDs, prompt injection and stale caches.
- Depends on COW-03.

### COW-11 — Private-to-shared proposal (P1)

- Reuse change proposals/approval to preview exact fields and audience before a
  personal draft or selected fact is written to Wedding AFP.
- Never disclose the private source narrative to the partner.
- Depends on COW-10.

## Phase 4 — Live delivery and external roles

### COW-12 — Permission-filtered live updates (P1)

- Reuse existing event/sync transport; filter every subscription and replay by
  active scope and membership revision.
- Stop delivery promptly after revocation and reconcile offline conflicts.
- Depends on COW-03 and COW-07.

### COW-13 — Narrow external collaboration (P2)

- Extend current RSVP, vendor, helper and run-sheet capabilities only where a
  separately approved role needs additional actions.
- Never implement these roles as full partner membership.
- Depends on the corresponding capability contracts.

## Release gates

- Disposable full-account harness: Mia/Jordan and Priya/Sam in four isolated
  browser contexts, including swapped plan/object IDs.
- Cross-account privacy suite covers reads, writes, search, AI, exports,
  attachments, background jobs, caches and revocation.
- No personal content appears in logs, analytics or shared notifications.
- Migration rollback/restore and exact-SHA hosted evidence are recorded.
- Product-owner decisions for permanent deletion and separation policy remain
  open; they do not block non-destructive collaboration.

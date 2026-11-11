# Wedding review system delivery tasks

Task: WED-360  
Dependency order is authoritative. An unchecked item is not a release claim.

## REV-01 — Reuse map and policy contracts

- [x] Audit existing account/workspace, vendor, enquiry/booking, attachment,
  moderation, publishing, DecisionOS and analytics authorities.
- [x] Record pilot segment, roles, fields, score eligibility, sparse threshold,
  reminder cadence, retention and dispute defaults.
- [x] Add typed subject, experience, verification, lifecycle and reason-code
  contracts with exhaustive transition/aggregate tests.

## REV-02 — Canonical metadata and AFP revision authority

- [x] Add an additive migration for review lifecycle metadata, revision AFP
  pointers, scoped invitations, moderation, public projections, vendor replies
  and content-light events.
- [x] Enforce one canonical planner review per wedding workspace and one
  venue contribution per wedding/canonical vendor across partner accounts.
- [ ] Store every private draft/submitted revision through the existing
  tenant-private AFP writeback with typed references and attachments.
- [ ] Add expected-revision and idempotency receipts; prove retries/concurrent
  partner submissions cannot duplicate a rating or notification.

Depends on REV-01.

## REV-03 — Eligibility and evidence

- [ ] Reuse canonical planner activity, enquiry, quote/booking and event-date
  evidence without treating them as stronger claims than they prove.
- [ ] Add author/operator-only proof attachment access and revocable deletion
  scheduling through the existing upload/object-store authority.
- [ ] Implement claim-specific verification and probable-duplicate review while
  keeping private match signals out of public/vendor responses.

Depends on REV-02.

## REV-04 — Couple submission and status surfaces

- [ ] Add authenticated create/edit preview with unselected rating, neutral
  prompts, display choice and separate private/public actions.
- [ ] Add correction, withdrawal, safe retry and status/history surfaces.
- [ ] Add direct venue-profile review route and optional narrow invitation-link
  exchange without creating a duplicate workspace.

Depends on REV-02 and REV-03.

## REV-05 — Invitations

- [ ] Reuse existing approved outbound messaging, preferences, rate limits and
  delivery evidence for neutral invitations.
- [ ] Enforce one reminder after seven days and suppression after submission,
  decline, opt-out, expiry or duplicate detection.
- [ ] Keep vendor standard links distinct from vendor-management capabilities
  and record invitation origin separately from verification.

Depends on REV-02.

## REV-06 — Operator moderation and disputes

- [ ] Add an operator-only queue for eligibility/evidence/duplicate/privacy and
  policy review with reason codes and access audit.
- [ ] Publish/reject/restrict/restore without changing author meaning; route
  substantive edits back to the author.
- [ ] Add report/appeal/correction handling and evidence purge scheduling.

Depends on REV-03 and REV-04.

## REV-07 — Vendor reply/report boundary

- [ ] Let authenticated vendor managers/profile editors report a review and
  submit a clearly attributed reply.
- [ ] Prevent vendors from seeing hidden identity/evidence, editing reviews,
  deciding eligibility or suppressing critical reviews.

Depends on REV-06 and existing vendor membership permissions.

## REV-08 — Public projections and deterministic aggregates

- [ ] Project only current published revisions and rebuild count/score from the
  same eligible scored wedding-held set using one-decimal half-up rounding.
- [ ] Add zero/sparse/full states to directory, comparison and profile pages;
  keep reviews out of organic ranking.
- [ ] Propagate correction/withdrawal/restriction to aggregate, cache, search,
  DecisionOS citation and any excerpt.

Depends on REV-06.

## REV-09 — DecisionOS evidence and approved questions

- [ ] Cite a dated public review observation only when relevant to the current
  decision and label the past-experience caveat.
- [ ] Write any generated question into AFP before display and use the existing
  human-approved enquiry workflow; opening evidence must never send.

Depends on REV-08.

## REV-10 — Analytics, pilot and release

- [ ] Add content-free invitation, submission, verification, handling-time,
  coverage and qualified-enquiry aggregates; exclude text/evidence/private IDs.
- [ ] Run cross-tenant, duplicate, retry, moderation, deletion, accessibility,
  outage and exact-SHA hosted checks with reviews unable to break directory,
  quotes, availability or booking.
- [ ] Select five comparable Sydney venue IDs and begin only after operator,
  privacy/security and hosted false-default evidence is reviewed.

Depends on REV-01 through REV-09.

## Deferred — real couple story only

- [ ] Add `Read the couple's story` only after an actual story exists and the
  couple grants separate excerpt/case-study publication permission.
- [ ] Disclose the specific workflow, material founder/pilot assistance and
  withdrawal path; connect withdrawal to every landing-page excerpt/cache.

This section is deliberately deferred. Do not create placeholder testimony,
invent a couple, or publish the control merely because the review system ships.

## Current implementation evidence

- `src/wedding_reviews.rs` contains the typed pilot policy, legal lifecycle
  transitions, aggregate eligibility and deterministic one-decimal rounding.
- Migration 0161 adds only lifecycle/control metadata, tenant-private AFP
  revision pointers, purgeable evidence references and approved public
  projections. Narrative is absent from lifecycle/audit tables.
- Review policy unit tests: 9/9 pass.
- Migration/privacy contract tests: 4/4 pass.
- Docker Desktop was unavailable, so disposable-Postgres execution of migration
  0161 remains required before REV-02 can be called database-complete.

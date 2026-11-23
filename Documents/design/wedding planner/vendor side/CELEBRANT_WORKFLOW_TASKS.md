# Celebrant workflow implementation tasks

Dependency order is authoritative. Task: WED-365.

## P0 — Safe acquisition workflow

### CEL-BULK-01 — Verified inventory and truthful states

- [x] Audit vendor, verification, consultation, management-link, special-date
  and operational-metric authorities.
- [x] Add feature/readiness facts to the operator projection so disabled
  telephony is distinguishable from an individual setup gap.
- Acceptance: the UI never equates listing, register verification, link open,
  consultation opt-in, publication or call completion.

### CEL-BULK-02 — Bounded batch link preparation

- [x] Add an operator-only 1–100-record batch endpoint that reuses the existing
  grant transaction and returns plaintext links once.
- [x] Preserve existing active links by default; require the existing explicit
  per-vendor replacement confirmation to rotate one.
- [x] Add selection and once-only invitation copying to the existing admin
  panel, with no ordinary CSV/token export.
- [x] Add disposable-Postgres concurrency and authenticated router coverage.
- Depends on CEL-BULK-01.

### CEL-BULK-03 — One-workflow register verification

- [x] Surface the official register link and existing verification command in
  each operator row.
- [x] Show pending, verified, not found and requires-review independently of
  invitation/participation state; preserve source/date/operator audit.
- Depends on CEL-BULK-01.

### CEL-BULK-04 — Outreach lifecycle

- [x] Add content-light manual outreach facts: channel, sent date, status,
  follow-up due and opt-out. Do not store social-message content.
- [x] Generate truthful personalised copy from the existing active link without
  regenerating it; provide status filters and exceptions.
- Depends on CEL-BULK-02.

### CEL-BULK-05 — Self-service consent and recovery

- [x] Add explicit consultation participation accept/decline/pause state and
  recovery guidance to the mobile flow.
- [x] Keep public phone/display choices owner-confirmed and distinct from
  register verification.
- Depends on CEL-BULK-03.

## P1 — Acquisition efficiency

### CEL-BULK-06 — Minimal listing preview

- [x] Reuse admin vendor enrichment to search duplicates and preview a minimal,
  unpublished Celebrant record from name plus source URL.
- [x] Preserve claims and existing fields; never infer register verification.
- Depends on CEL-BULK-01.

### CEL-BULK-07 — Unified entry, separate authorities

- [x] Add a capability-scope manifest and present consultation plus wedding-date
  modules only when their existing independent authorities are granted.
- [x] Reuse vendor-special slots for ceremony dates; do not copy dates into
  consultation windows or broaden legacy tokens.
- Depends on CEL-BULK-05 and the vendor-special capability contract.

### CEL-BULK-08 — Funnel and follow-up operations

- [x] Extend existing content-free metrics with discovered/listed/invited/opened/
  configured/opted-in/published/engaged counts and exception filters.
- [x] Keep `tel:` clicks distinct from connected/completed calls.
- Depends on CEL-BULK-04 and CEL-BULK-05.

## P2 — Deferred marketing extension

### CEL-BULK-09 — Co-branded Binder

- [ ] Map existing Binder generation and vendor publication/licence authorities.
- [ ] Add approved business name/logo configuration only after a separate
  publication and asset-rights review. It must not block calendar onboarding.

## Release

- [ ] Run Rust/TypeScript/public-site checks, disposable PostgreSQL, mobile
  browser journeys and exact-SHA Oracle proof.
- [ ] Verify production flags and telephony separately; do not call a disabled
  or untested callback path production-ready.

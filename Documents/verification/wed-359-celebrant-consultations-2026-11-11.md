# WED-359 celebrant consultations verification

Date: 11 November 2026

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/WED-359`

## Implemented

- Public, account-free Talk to a celebrant page with truthful empty, live and
  scheduled states.
- Twilio Verify boundary before request creation; no verification code is
  stored by OmnyID.
- Encrypted callback phone storage and content-light lifecycle events.
- Atomic live capacity and scheduled-slot reservation.
- First-available reassignment after a pass or expired hold, without silently
  rerouting a visitor who chose a specific celebrant.
- Vendor recurring hours, one-off open/unavailable exceptions, live sessions,
  accept/pass/cancel/outcome controls and proposed rescheduling in the existing
  vendor portal.
- Couple accept/decline response to a proposed new time.
- Official-register evidence remains separate from live consultation readiness
  and wedding-date availability.

## Local evidence

- Solid TypeScript check: pass.
- Vite production build: pass (existing chunk-size warning only).
- Cargo library check using shared target directory: pass.
- Celebrant frontend and contract tests: 3/3 pass.
- Wedding line-budget tests: 2/2 pass.
- Full Wedding test suite: 2,271/2,271 pass.
- Public Wedding smoke suite: pass.
- Public page metadata smoke: 78 pages pass after adding the missing Twitter
  metadata to the celebrant page.
- JavaScript syntax checks for the public celebrant and directory modules: pass.

## Hosted activation boundary

The Oracle environment has the encryption-key file authority, but its current
configuration does not contain the celebrant rollout flag, callback token
pepper, Twilio Account SID, Twilio auth token or Twilio Verify Service SID.
No secret values were printed or copied during this inspection.

The release may safely ship the migration, public resource and false-default
routes. The callback API must remain disabled until the missing secrets are
provided and a controlled Twilio sandbox verification plus real callback are
observed. Provider acceptance alone is not a connected call.

## Deliberately open

- Creating a canonical logged-in vendor enquiry after the visitor explicitly
  approves it; the current post-call surface only offers the next action.
- Disposable-Postgres concurrency evidence and controlled Twilio/phone evidence.
- Operator-selected Sydney pilot cohort and rollout activation.

## Celebrant directory and scoped-calendar continuation

- The approved vendor crawler fetched and extracted all 16 imported official
  URLs without a blocked page. Fifteen sites support a celebrant profile. Enzo
  Weddings Hunter Valley is a venue and is corrected to `Venue` rather than
  inventing a celebrant service.
- Reviewed sources and own-word curation are stored under
  `Documents/design/wedding planner/celebrants-enrichment-2026-11-11/`. Raw
  crawler caches are ignored. Scraped testimonials and unlicensed images are
  not republished; an initials image state remains until owner approval.
- The integrated directory now provides celebrant category filtering, profile
  cards and detail pages with evidence-backed summaries, strengths, ceremony
  types, contacts and consultation status.
- Admin can generate one expiring private link and QR code per celebrant, see
  aggregate link/open status, rotate the prior link and revoke the current
  link. The link manages only that celebrant's consultation windows and live
  state; it cannot access callback leads or another listing.
- Continuation checks pass locally: Cargo library check; 3/3 scoped-management
  Rust contracts; 4/4 existing consultation contracts; Solid TypeScript;
  production Vite build; 2/2 line budgets; public Wedding and metadata smoke;
  public directory JavaScript syntax.
- Docker Desktop was unavailable. Migration 0159 therefore requires real
  Postgres execution and table/profile counts during the exact-SHA Oracle
  release before this continuation is marked complete.

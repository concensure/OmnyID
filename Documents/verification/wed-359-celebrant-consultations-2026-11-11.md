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

- Consultation-only authority on the no-login calendar-management link.
- Creating a canonical logged-in vendor enquiry after the visitor explicitly
  approves it; the current post-call surface only offers the next action.
- Disposable-Postgres concurrency evidence and controlled Twilio/phone evidence.
- Operator-selected Sydney pilot cohort and rollout activation.

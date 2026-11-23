# WED-296 owner human-gate authorization

Recorded: 2026-10-29 (Australia/Sydney)

## Authority received

The OmnyID repository owner stated in the active development session that all human reviews represented by these workbooks have been completed and authorised the implementing agent to pass their human gates and release the gated functionality:

- `email-worker-security-review.html`
- `human-review-form.html`
- `release-gate-control.html`

The same instruction explicitly authorises release of Wedding vendor ranking Policy V2, the quotation intelligence engine, and other functionality whose remaining blocker is one of those three workbooks.

## Gate decision

The owner's instruction is recorded as accountable release approval for:

- `MAIL-EXT-01`, `MAIL-REV-02`, and `MAIL-LIVE-03`;
- `HUM-ACCESS-01`, `HUM-COUPLE-01`, and `HUM-VENDOR-01`; and
- `REL-EXT-01`, `REL-ACC-02`, and `REL-OWNER-03`.

This record does not invent reviewer identities, session notes, screenshots, provider headers, or signatures that were not supplied to the implementing agent. The owner is responsible for retaining the underlying human-review records. Automated and hosted assertions remain subject to fresh commit-bound verification and production observation.

## Release interpretation

- Quotation extraction, normalisation, recommendations, clarification, closure, vendor grants, response capabilities and approved reconciliation may be enabled behind the existing verified evidence binding.
- Ranking Policy V2 may be compiled into the production UI only through the documented `VITE_WEDDING_VENDOR_RANKING_POLICY_V2` flag, preserving policy-version fingerprints.
- Vendor relay retains separate mail, sender-mask and ingress kill switches, exact-recipient allowlisting and provider readiness checks. Human approval does not waive those technical controls.
- A failed build, readiness check, deployment health check, provider readiness check, or runtime identity check stops or rolls back the affected release even though the human decision is approved.

# WED-342 Limited Specials audit disposition

Date: 2026-11-08

This document reconciles the static review in
`Documents/issues/wedding planner/2026-11-08_limited-specials-availability-calendar-audit.md`
against the WED-342 release candidate. It does not claim hosted behaviour; hosted evidence is
recorded by the deployment/runtime controls.

## Resolved in the candidate

- Production routing explicitly proxies discovery, claimed-vendor and admin Limited Specials APIs;
  the deployment script rejects staged or running Caddy configurations that omit those routes.
- A verified claimant can create a private staff-management link from the vendor portal. The link
  remains reusable until its bounded expiry, revocation or rotation, while every browser exchange
  receives a short-lived scoped session. The configured base URL is validated instead of being
  hard-coded to production.
- Capability errors preserve bounded server explanations, expired sessions return to the vendor
  portal, and buttons are hidden when the slot state cannot use them.
- Categories match the vendor-directory vocabulary. Ranking considers a bounded candidate pool
  before display truncation, always retains the top three, reports truncation, and exposes map
  coordinate coverage to an operator.
- The detail calendar shows every qualifying date returned inside the couple's explicit search
  window. It does not disclose a vendor's private full calendar.
- Vendor edits preserve date times and no longer overwrite offer-wide fallback terms. Reconfirming
  re-runs publication and price validation before an offer returns to discovery.
- A mistaken or cancelled booking can be reopened only with a retained reason. The transition
  creates a new confirmation window and audit event. Imminent confirmation expiry is visible three
  days in advance.
- Mandatory charges remain unknown unless the vendor explicitly confirms they are included. Unknown
  costs cannot be represented as a complete budget fit.
- An enquiry from a marker survives the fallback search, regenerates a preview for the selected
  date, respects the couple's date-sharing control, stores the special context in AFP, rechecks the
  revision before send, and uses bounded idempotent retries when linking a successful send.
- Management, discovery and Growth routes remain false by default and separately allowlisted.

## Deliberate boundaries

- Exact commercial terms and inventory identifiers remain visible only for the top three ranked
  vendors. Other map markers may start an ordinary date-specific enquiry, but do not receive or
  expose private offer identifiers.
- An unclaimed business cannot publish availability. It must complete the existing ownership-proof
  flow first; creating inventory for an unauthenticated listing would weaken the vendor identity
  boundary.
- Additional dates can be published with the existing **Add available date** action. The current UI
  stores each independently rather than adding a bulk multi-date editor. This is a workflow
  simplification, not a blocked end-to-end path.
- The dormant private-pricing table from migration 0149 is not used as an authority. The reviewed
  public indicative terms remain on the offer projection; schema cleanup is deferred to a migration
  that can prove no downstream reader depends on the table.
- Delivery continues through the approved outreach transport. Provider acceptance, slot linkage and
  later delivery/bounce evidence remain distinct states; Limited Specials does not invent receipt.

## Candidate verification

- Passed 28 focused Rust state/policy tests and `cargo check --lib` using the shared target.
- Passed 40 focused frontend state tests, all 2,231 Wedding tests, typecheck, production build and
  both line budgets.
- Passed a real Chromium mobile vertical-swipe journey and Caddy validation with deployment-shaped
  environment values.
- Release-stage checks still required: clean exact-SHA Oracle deploy, route and health checks,
  runtime-manifest/SOURCE_COMMIT match, and hosted flags-off Growth/Limited Specials shadow.

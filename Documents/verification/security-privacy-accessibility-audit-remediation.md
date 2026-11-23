# WED-250 security, privacy, accessibility and vendor-ownership remediation

Date: 2026-10-24
Branch: `agent/codex/WED-215`
Source audit: `Documents/issues/security-privacy-accessibility-audit-2026-10-24.md`

## Scope and interpretation

The audit inspected an older `agent/claude/WED-178` revision. This remediation
checked each finding against the current advanced wedding-planner worktree and
changed only defects that still existed. It is implementation evidence, not an
independent security or accessibility sign-off and not production-deployment
evidence.

## Finding disposition

| Finding | Current disposition | Implementation evidence |
|---|---|---|
| V1 vendor login loop and missing replies | Fixed in code | Wedding vendor links now enter `/workspace/vendor.html?source=vendor_claim`; both old `vendor` and current `vendor_slug` deep links are preserved across authentication. The verified dashboard reuses the existing private quotation-response panel rather than creating a parallel inbox. |
| V2 unproved listing takeover | Fixed in code | Intake creates a 72-hour, non-reserving attempt. It does not set a listing owner, grant the vendor role, accept a photo licence or publish assets. Exact-domain verified email, website meta/`well-known`, DNS TXT, and operator review can verify ownership. Social proof is visible but unavailable until an official business-account connector exists. |
| S1 direct-origin bypass | Deployment-ready code; hosted verification remains | Caddy rejects public requests not arriving from current Cloudflare IPv4/IPv6 ranges. Private source ranges remain available for container and host health checks. Oracle security-list or host-firewall enforcement is still recommended as defence in depth and was not changed in this task. |
| S2 proxy/rate-limit identity | Fixed in code/config | Caddy declares strict trusted Cloudflare proxies and prefers `CF-Connecting-IP`; Oracle compose and environment examples set `OMNYID_BEHIND_TRUSTED_PROXY=true`. |
| S3 vulnerable dependencies | High/critical items fixed; bounded residuals below | Rust HTML/TLS/root packages and frontend Solid/Markdown/PPTX/image packages were updated. TypeScript SDK Zod was updated with its supported v3 compatibility import. |
| S4 headers and CSP | Fixed in code | Six-month HSTS, common security headers, compiled docs CSS, no Tailwind Play CDN, no `script-src 'unsafe-inline'`, narrowed connections, and deterministic inline-script hashes are configured. Apple and Google identity hosts are allowlisted only for their conditional sign-in flows. |
| S5 JavaScript-readable session token | Fixed in code | Browser persistence contains only a marker and user projection. A newly issued bearer stays in volatile memory for the login transition; reloads authenticate with the HttpOnly cookie. HTTP and WebSocket paths accept that cookie. |
| A1 inaccessible auth modal | Fixed on audited surface | Authentication and guided-tour overlays use `DialogShell`, with modal semantics, initial/restored focus, tab trapping and Escape. Authentication inputs have accessible names and the close target is 44 px. |
| A2 contrast and very small text | Targeted fixes complete | The semantic outline token was darkened, the audited wedding/auth labels were raised to at least 12 px, and undersized Bento controls were raised to 44 px. This is not a claim that every legacy small-text occurrence elsewhere in the product was redesigned. |
| A3 landmarks/headings | Fixed on audited surface | The workspace has an H1, the nested wedding `main` is a section, and the wedding marketing preview heading order was repaired. |
| A4 editor, live region and target | Fixed on audited surface | TipTap is a named multiline textbox, toast output is a labelled live region, and the audited small targets meet the current control-size rule. |

## Ownership authority model

1. A signed-in representative starts an attempt for a listing and declares their
   relationship. Multiple representatives may attempt proof without locking out
   the real owner.
2. Work-email proof requires the account email itself to be verified, rejects
   common public-mail domains, and requires an exact listed website/contact
   domain match.
3. Website proof creates a random, hashed, 30-minute challenge with at most five
   checks. The representative can publish it as a meta tag, a bounded
   `/.well-known/` text file, or a DNS TXT record.
4. Website HTTP proof permits HTTPS only, rejects credentials and private/local
   destinations through the shared SSRF guard, follows no redirects, reads at
   most 256 KiB and times out.
5. An operator can verify, dispute or reject a claim only with operator access,
   a recent high-risk session and a 10–1000 character review note.
6. Only the winning verified transaction sets the listing owner and grants the
   vendor role. Competing open attempts become abandoned. Verification produces
   a private AFP receipt.
7. A verified owner receives a prefilled dashboard: verified badge, completion
   state, contact/social/description edits, couple-facing preview, licensed
   photo management and the existing quotation response surface.
8. Welcome email is default-off behind
   `OMNYID_VENDOR_CLAIM_WELCOME_EMAIL_ENABLED`. Its completion and photo
   guidance is calculated from the stored profile; it does not promise ranking.

## Identity path

Business email/password and Google remain available through the shared account
modal. The existing Apple identity-token backend now fails closed when an Apple
client ID is absent. The web button is shown only when both
`OMNYID_APPLE_CLIENT_ID` and an HTTPS `OMNYID_APPLE_REDIRECT_URI` are
configured. The web flow checks returned state and binds the identity token to a
nonce. No simulated Apple button appears when the Apple Services ID has not been
configured.

## Reproducible evidence

- Disposable migration: `0115_wedding_vendor_ownership_proofs.sql` applied
  successfully to local PostgreSQL `omnyid_test`.
- Disposable ownership API: 2 passed. The test proves non-reservation, no early
  vendor role, no early photo licence, public-mail rejection, parallel real-owner
  proof, exact-domain verification, competitor abandonment, DNS challenge shape,
  and voluntary release.
- Wedding frontend: 1,962 passed.
- Session regression: 13 passed.
- Website/CSP smoke: passed, including exact LF-normalised hashes for every
  wedding/docs inline script and rejection of obsolete hashes.
- Line budgets: both guards passed; every new file is below 1,000 lines.
- Frontend typecheck: passed.
- TypeScript SDK typecheck/build: passed.
- Production frontend build: passed.
- Caddy configuration validation in `caddy:2`: valid.
- Rust `cargo check`: passed with one pre-existing unrelated unused-variable
  warning in `email_group_routes.rs`.
- `npm audit --omit=dev`: 0 critical, 0 high, 37 moderate.
- `cargo audit`: the original actionable HTML/TLS advisories are gone. The
  remaining vulnerability is `rsa 0.9.10` through the unused MySQL side of the
  SQLx lock resolution, with no fixed release; `lru 0.16.4` remains an allowed
  transitive AWS SDK panic-safety warning whose fixed version is outside the
  SDK's current version constraint.

## Residual verification and operations

- Deploy the commit before treating Caddy, environment or static-asset changes
  as live. Then verify the direct-origin request is rejected and that proxied
  client addresses produce separate rate-limit identities.
- Apply Oracle network-layer Cloudflare-only ingress as defence in depth.
- Register the Apple Services ID, domain and return URL before populating the two
  Apple environment variables.
- Do not enable social ownership proof until an official Instagram Business or
  Facebook Page authorization flow supplies provider-signed page authority.
- The remaining frontend moderate advisories are in the TipTap dependency
  family and require a separately tested major editor migration.
- Repeat the hosted axe/keyboard/zoom/screen-reader audit against the deployed
  commit. WED-225 independent security, privacy, accessibility and usability
  gates remain independent release requirements.
- Consequential policy V2 and vendor welcome email remain disabled.

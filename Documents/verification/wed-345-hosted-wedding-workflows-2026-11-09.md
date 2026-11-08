# WED-345 hosted wedding workflow verification — 2026-11-09

## Release identity

- Branch: `agent/codex/WED-345`
- Application commit deployed to Oracle: `7ae96fa2a67fe14c941657ddeb5fec31f7981c88`
- Clean release checkout: `C:\temp\wt\omnyid-wed345-release-7ae96fa`
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contained the full application commit.
- The canonical production audit passed runtime-script integrity, manifest verification and backup verification. The restore drill was deliberately skipped because the release did not change storage layout. At audit time `/` and `/var` were 70% used.

## Couple-to-vendor provider exercise

The controlled recipient was `casper.wu01@gmail.com`. The fixture contained one reviewed draft and one explicit approval with a non-actionable test message. Secrets and the full provider identifier were not written to this report.

1. The authenticated provider-readiness route reported enabled and ready with `cloudflare_email_sending`.
2. The first send returned `sent=true`, `replayed=false` and `delivery_status=provider_accepted`.
3. A second identical request returned `replayed=true`, the same idempotency digest and the same provider receipt. It did not make a second provider call.
4. The account ledger contained exactly one reservation, one provider-accepted receipt and one no-automatic-retry decision for the approval.

This proves authenticated provider acceptance and duplicate suppression. The account operator subsequently confirmed in the WED-346 continuation on 2026-11-09 that Gmail received the controlled message. That is independent human mailbox-receipt evidence; no mailbox credential, message content or private header was shared with the implementation run.

## Vendor availability exercise

A temporary vendor owned by the Casper account and one temporary 17 April 2027 offer were created only for this test.

- The authenticated claimed-vendor portal rendered the `Limited-date specials` management surface and the controlled offer.
- A new expiring management URL was generated.
- The fragment-held capability exchanged once for an HttpOnly scoped session and CSRF token; it did not grant account access.
- The scoped session exposed 12 allowed operations.
- The vendor changed the slot from `vendor_confirmed` to `calendar_open`, read the new state, then changed it back to `vendor_confirmed` and read that state.
- The Limited Specials discovery route opened for the reviewed account, returned Ranking Policy V2 and did not trigger the planner-wide failure boundary. The temporary fixture had no coordinates, so returning zero map markers was expected.

The synthetic vendor, claim, offer, grants and all five synthetic message lifecycle rows were deleted after evidence was recorded. Follow-up queries returned zero fixture vendors and zero fixture messages.

## Other hosted checks

- Protected helper capabilities returned both `helper_links_enabled=true` and `authenticated_delegates_enabled=true` for the reviewed Casper cohort.
- The Google Calendar denial callback returned HTTP 307 to `https://omnyid.com/workspace/?calendar=error`, rather than the former API-origin 404.
- Homeserver, Caddy and ClamAV were running; ClamAV was healthy.
- The provider cohort and Limited Specials rollout are account-scoped. This verification did not turn either feature on globally.

## Automated evidence run before release

- All 2,241 Wedding frontend tests passed.
- TypeScript type checking, both line-budget checks and the production Vite build passed.
- Focused Rust coverage passed for RSVP provider lifecycle/idempotency, valid stored AFP messages, Oracle workspace URL handling and the absolute Google Calendar callback.
- The exact-SHA Oracle image compiled successfully before container replacement.

## Operational note

The combined deployment script completed upload, exact-SHA image build, container replacement and workspace smoke, then stopped emitting output inside its optional detached post-deploy audit wrapper. It was stopped after the runtime was healthy. The canonical proof script was then run synchronously with the restore drill skipped and returned `status=pass`; this avoids representing the wrapper stall as a failed application deployment.

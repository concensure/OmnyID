# WED-293 saved-view and print-preview evidence

Date: 2026-10-29 (Australia/Sydney)

## Candidate

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Branch: `agent/codex/WED-293`
- Exact clean code candidate: `65eeda8573de6c8686512259dab1f2397d409c41`
- Deployment: not requested and not performed.
- Scope: first WED-293 slice; WED-293 remains in progress.

## Implemented

- The canonical saved-view contract now carries a bounded profile revision and non-overlapping field policy while remaining read-compatible with V1 payloads that omit the optional additions.
- Six deterministic presets—Master, Vendor, Photo/video, VIP, Guest and Print—project the original run-sheet record IDs rather than copying rows or creating another database.
- Non-master views exclude private notes, couple phone/email fields and projector internals, and do not resolve contact references by default.
- Database provides a responsive exact-content preview with page-one owner labels and explicit copy that preview/save sends nothing.
- Print is available only from the preview. It records a private AFP export intent containing record IDs and visible columns, then opens browser print. It does not send to a vendor or create a hosted link.
- Print CSS is colour-independent, prevents time/title rows splitting, and states that printed/downloaded copies cannot be recalled.
- Hosted sharing remains unavailable; no grant, route, flag or external recipient was activated.

## Exact-candidate verification

All listed commands reported exact SHA `65eeda8573de6c8686512259dab1f2397d409c41` and an empty `git status --short` before execution.

| Check | Result |
|---|---|
| Rust database contract tests | Pass: 6 |
| TypeScript typecheck | Pass |
| Saved-view/database/run-sheet focused tests | Pass: 17 |
| Source and Wedding line budgets | Pass: 2 |
| Full Wedding frontend suite | Pass: 2,036 |
| Production UI build | Pass |
| Playwright/Axe at 320px, 375px and 1280px | Pass: 3; no serious/critical findings |

The production build emitted only the existing large-chunk advisory.

## Remaining WED-293 work

- Implement and independently review an expiring, revocable hosted grant behind a false-default deployment flag, including share/view/expiry/revocation AFP events.
- Add the 7–10 day vendor sign-off state and acknowledgement projection.
- Produce visual print/PDF pagination evidence, including page-one key-contact placement and no split key rows.
- Keep the no-recipient preview boundary and field-policy tests authoritative while those pieces are added.

# Wedding landing claims audit — current-line reconciliation

Date: 2026-11-23  
Task: WED-409  
Current-line base: `290b26b93c44692dfbca15a330a8c63e5e91a451`

This is the current-line reconciliation of the earlier audit with the same
filename. The earlier inspection used `agent/claude/WED-178` and did not inspect
the later signed-in implementation. This pass checks the WED-408 successor line,
the shared Wedding source, and aggregate production data. Production database
queries were read-only.

## Reconciled results

| # | Claim | Current result | Resolution or evidence |
|---|---|---|---|
| 1 | Binder has 40 A4 pages, 8 sections, fillable and print versions | Holds | Both public PDF release assets remain available. |
| 2 | Binder links are emailed | Did not hold | Email readiness is deliberately disabled. The landing page now promises and exposes immediate direct downloads; it offers email only when the readiness endpoint enables it. |
| 3 | Data is never “sold or transferred” | Overbroad wording fixed | Public wording now says never sold, rented or traded and preserves the privacy page's processor and user-directed sharing explanation. |
| 4 | Analytics is consent gated | Holds | Current source retains the consent-gated script contract. The stale WED-178 regression must not be integrated. |
| 5 | Start free with no card | Holds | Existing pricing remains unchanged. |
| 6 | Public checklist and planner share the same task catalogue | Holds after count correction | `weddingTaskCatalogueState.ts` is the authority; its generated public JSON is deep-equality tested. Both contain **64** tasks, so all public “65-task” wording is corrected to 64. |
| 7 | Illustrative budget scenario arithmetic | Holds | It remains explicitly illustrative. |
| 8 | Sample budget progress is meaningful | Fixed | The sample category allocation is A$10,950 of A$12,000 (91.25%); the preview now labels this “Budget allocated” and shows 91%. |
| 9 | Deadlines are guaranteed to add themselves | Overpromise fixed | Copy now describes reviewed reminders and explicitly says NOIM timing is confirmed with the celebrant. |
| 10 | Vendor-reply undo window | Holds | The existing bounded two-minute state remains the authority. |
| 11 | Partner invitation lasts seven days and requires authenticated acceptance | Holds | `wedding_partner_sharing_routes.rs` uses `INVITE_LIFETIME_DAYS = 7`, persists that interval, binds the invite to the invited email digest, rejects expired/non-pending invitations and returns `expires_in_days: 7`. |
| 12 | Guest import reviews households and uncertainty | Holds after WED-409 extension | The existing import synthesizer now reports people, unique explicitly stated households, ungrouped people, pending replies and ambiguous replies. It never infers a household from surname; ambiguous replies remain pending. Counts appear in the immediate upload result and the saved evidence artifact. |
| 13 | Phone permission starts off | Holds | `defaultWeddingVendorEnquiryPermissions()` sets `allowPhoneContact: false`; focused tests retain this contract. |
| 14 | Quote extraction, budget flagging and approval-gated reply drafts exist | Holds at the implementation contract | The shared quote extractor, normalized quote projection, budget delta and quote-reply AFP/draft flows are present. No ranking input for sponsorship or commission exists in the vendor-ranking code; disclosures remain required for sponsored presentation. |
| 15 | Vendor coverage is NSW-first | Holds for current production celebrants | All 1,934 production celebrant rows have NSW-labelled service areas. This is an aggregate database check, not a promise that every supplier category has equivalent coverage. |
| 16 | Public links and assets resolve | Rechecked by site suite | The exact release still requires post-deploy HTTP smoke checks. |

## Requested confirmations

### Seven-day partner invitation expiry

Confirmed. The server, database expiry interval, response contract and invitation
email all use seven days. Acceptance requires an authenticated account whose email
matches the invite digest. An expired invitation is not an access grant.

### Guest import summary with households

Confirmed on the WED-409 candidate. For a guest CSV/TSV or parsed spreadsheet, the
review uses only an explicit `Household`, `Family`, `Group` or `Party` column.
Repeated labels count once; blank labels remain separate ungrouped people. Recognised
yes/no RSVP values are classified, blank/pending values stay pending, and any other
wording is counted as uncertain and also kept pending. The original imported values
remain preserved in the private artifact.

### Oracle celebrant inventory

Read-only SQL against the production `wedding_vendors` table returned:

| Category | Status | Count |
|---|---:|---:|
| Celebrant | active | 1,933 |
| Celebrant | hidden | 1 |
| **Total** |  | **1,934** |

There is no independent “active but hidden” boolean in this table: `status` is one
of `active`, `hidden` or `archived`. Therefore the records are **not all active and
hidden**. The exact production state is 1,933 active and one hidden, with zero
archived. No status or visibility value was changed during this verification.

## Candidate verification

The implementation worktree and the clean detached checkout of exact SHA
`9a6c2b56f733e654b44265b7de957d5c8e494d46` passed focused import and catalogue
contracts, TypeScript, both line budgets, all 2,394 Wedding tests, the 95-page
public/security suite and the 1,862-module production build. Oracle serves matching
public-file and Workspace hashes. Both Binder PDFs return 200, the authenticated
eight-check monitor passes, Caddy validates and the homeserver/Caddy restart counts
remain zero. Full release evidence is in `WED-409-landing-claims-release.md`.

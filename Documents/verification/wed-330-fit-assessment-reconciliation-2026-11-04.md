# WED-330 Wedding fit-assessment reconciliation

Date: 4 November 2026

Inputs reviewed:

- `Documents/marketing/wedding planning/2026-11-04-omnyid-wedding-fit-assessment.md`
- `Documents/marketing/wedding planning/2026-11-04-real-wedding-customer-profiles.md`

These reports are discovery evidence, not product authority. Their source sample is small and
curated, and the assessment did not inspect the signed-in workspace. The current implementation
was checked before accepting each recommendation.

## Accepted now

| Assessment point | Current evidence | Change |
|---|---|---|
| Trust and fictional proof | Invented testimonials and unsourced counters were already absent; `wedding/claims-ledger.md` already excluded them | Added tests that keep them absent, labelled both public examples fictional and removed copy that could imply customer popularity |
| Replanning is not shown | Budget scenarios, guest projections, closure evidence, task projection and approval-gated drafts already exist | Added a clearly fictional guest-count change showing the minimum-spend, deposit, guest/task and notification effects without claiming OmnyID changes contracts |
| Sydney-only positioning | The database contains Sydney and reviewed regional NSW records, while the planning tools are not Sydney-specific | Replaced Sydney-only wording with “NSW-first and expanding”; did not claim Australia-wide vendor or destination-legal coverage |
| Working with other people | Partner, planner, helper and scoped share grants already exist | Made scoped collaboration visible instead of building a second sharing system |
| Guest and seating visibility | RSVP, household, meal, access and seating projections already exist | Added a Guests and seating pane to the public workspace preview |
| Pricing claims | No reviewed evidence supports “Most couples choose this”, and no exact free monthly draft limit was found | Removed the popularity badge and undefined limit wording rather than inventing a number |
| Australian legal timing | The shared countdown catalogue uses reviewed official federal NOIM sources | Added an above-fold “reminders, not legal lodgement” qualification |

## Already implemented; no duplicate built

- Six planning stages and the shared public/workspace task catalogue.
- Stage-aware public context selection and proactive one-at-a-time decisions.
- Regional vendor records, vendor source/suitability separation and travel/accommodation evidence.
- Guest, RSVP, household, family-boundary and seating operations.
- Safe/balanced/stretch budget scenarios, quote normalisation and hidden-cost warnings.
- Planner/helper roles, permission-scoped sharing and approval-first outbound messages.
- Refund/cancellation evidence states and vendor booking closure history.

## Deliberately not claimed or silently added

- A full branchable “duplicate my entire Wedding plan” scenario engine is not implied by the
  illustrative comparison. That would require a reviewed AFP version/merge contract.
- Splurge/save categories are useful, but the present priority and scenario model is not relabelled
  as that feature. It should be designed as a ledger-backed budget decision before public copy
  promises it.
- Multi-event Wedding support has partial event-scoped RSVP primitives, but no complete reviewed
  couple workflow. No multi-event promise was added.
- Destination legal guidance, national vendor coverage, typical planner fees and customer outcome
  statistics remain absent until evidence supports them.
- No “real plans” customer series was invented. Any such series needs actual participant consent
  and attributable source material.

## Example integrity

The public example uses the original fictional names Renee and Kai. It does not copy a couple,
story or quotation from the customer-profile research. It is visibly labelled as an interface
example and not a customer account or typical outcome.

## Verification

- 2,183 Wedding state and component tests passed.
- The Wedding website, 74-page metadata, CSP, quiz, account-confirmation, blog, magnet and
  countdown checks passed.
- TypeScript typecheck and the production Solid UI build passed.
- Both line-budget checks passed; changed public files remain below 1,000 lines.
- Two iPhone-sized Chromium journeys passed. The Guests tab opened in place, the pages had no
  horizontal overflow, and axe reported no serious or critical violations after a shared warning
  pill contrast issue found by the first run was corrected.

No application or static-site deployment was requested or performed.

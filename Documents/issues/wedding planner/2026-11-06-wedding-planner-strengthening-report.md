# Wedding planner strengthening report — 6 November 2026

## What this release strengthens

- Mobile Today now treats the current wedding decision as the main screen: the card uses the available width, remains above the shorter bottom navigation, and does not repeat the desktop-only “Decision focus” heading.
- Swipe guidance appears once, above the first card. Swiping up records “Later”; swiping down immediately approves the presented recommendation. Buttons remain available as the accessible alternative.
- Only the current decision and the immediately following decision receive background research. Vendor-search decisions use the existing live vendor-search and Ranking Policy V2 path to prepare an exactly-three shortlist. The first-ranked option is explained from saved wedding context and can be reviewed in place; accepting it does not send an enquiry.
- The unconventional-venue load adds 57 venues and enriches 20 existing or staged venues without overwriting existing populated fields. Special venue types remain queryable through `evidence.special_category` and searchable through `style_tags`.
- WILD LIFE Sydney Zoo is confirmed as a wedding venue from its current official wedding page. Current capacities and prices are not published there, so those details remain subject to vendor confirmation.

## Evidence obtained

- A disposable Postgres run applied the WeddingNSW prerequisite, the Wedlockers/Urban List prerequisite, and the cumulative unconventional import twice. Both executions completed without duplicate rows or errors.
- Resulting special-category counts were: boat 13, warehouse 12, museum 8, gallery 5, library 2, entertainment 15, botanical 15, and zoo/aquarium 8.
- The focused 375 × 812 browser test confirmed both vertical gestures, the first-card-only instruction, and the next-card transition.

## What still needs strengthening

1. **Verify caveated listings before a couple relies on them.** New rows intentionally retain `verify-before-booking`; several entertainment, zoo and function venues advertise private events but do not explicitly advertise weddings. Contact, trading status, package availability, capacity and pricing should be reconfirmed before outreach or booking.
2. **Add a first-class special-venue facet only when the product needs it.** The data is already filterable in Postgres and searchable by style tag. A future `venue_special_category` attribute in the server attribute catalogue would make boat, warehouse, museum, botanical and zoo/aquarium filters explicit in the UI rather than inferred from text.
3. **Make background-search state visible without technical leakage.** A shortlist may take several seconds or be unavailable if providers are degraded or the weekly research budget is exhausted. The couple should see plain-language progress and a retry action; never substitute invented vendors.
4. **Keep ranking explanations criterion-specific.** Ranking Policy V2 supplies the order, but every displayed top choice should continue to name the actual saved preference, inspiration, location, capacity or budget evidence that affected it, and distinguish unknown availability from verified suitability.
5. **Retain non-gesture access.** Swipe is a convenience, not the only control. Keyboard, switch-control and screen-reader users still need the visible Later and task/shortlist actions, focus restoration, and an announcement of the saved result.
6. **Broaden verified photography carefully.** Many new venues have no licensed local image. Photos should be added only with a recorded source and reuse right; a missing photo is safer than an unlicensed or mismatched one.

## Recommended next increment

Review the caveated Sydney listings in category-sized batches, starting with the venues already surfaced by real couple searches. At the same time, add the explicit special-venue facet and measure whether couples use it before expanding the import to other Australian states.

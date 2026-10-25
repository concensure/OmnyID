# Wedding planner UX and value opportunities

**Date:** 25 October 2026
**Basis:** current `agent/codex/WED-215` implementation, the wedding planning workflow research, the digital workflow review, and the six-stage timeline review.

## Product direction

The strongest next step is a **permissioned, shareable wedding run sheet**. The research places one consistent run sheet on the critical path: final guest numbers, supplier access, weather decisions and confirmed timings must converge before it is distributed to the venue, celebrant, photographer, caterer, MC and transport contacts. The current planner already has most inputs—tasks, owners, dates, vendors, contacts, seating, documents and approvals—but only partial exports and handoff surfaces.

This is both useful and naturally distributable. A coordinator or vendor who receives a clear, current OmnyID run sheet experiences the product without needing a couple to explain it.

## Recommended run-sheet product

Build the run sheet as an AFP projection of confirmed records, not a separate source of truth.

- Generate a chronological wedding-day schedule with time, location, owner, supplier, contact, dependencies, setup notes and fallback.
- Show missing inputs and conflicts before publishing: overlapping travel, unconfirmed supplier arrival, missing access contact, absent wet-weather decision, or a stale guest count.
- Let the couple preview the exact recipient view and exclude private fields by default. Family rationale, budget comfort, private notes, identity documents and unrelated guest data must never be included automatically.
- Support recipient-scoped views: supplier schedule, wedding-party schedule, coordinator master view and guest-facing highlights.
- Publish a versioned, read-only link or PDF with expiry, revocation, last-updated time and a visible version fingerprint. Record who received or acknowledged each version.
- Require explicit approval before sending an update. A changed source record should mark the published sheet stale, not silently rewrite what recipients saw.
- Add restrained attribution such as “Planned with OmnyID” and an optional recipient invitation. Virality should come from usefulness, not forced sign-up.

A first release should stop at preview, controlled sharing and acknowledgement. Live editing by vendors, public indexing, and autonomous schedule changes should remain out of scope until permissions and conflict handling are proven.

## Near-term UX improvements

1. **One next action, complete queue.** Keep presenting one decision or reply at a time, but retain every open planning task and vendor response behind it. Completion or “later” should reveal the next item immediately; a cleared state is valid only when no active work remains.
2. **Responsibility everywhere.** Every canonical task projection should show its owner and allow reassignment. Owner, consulted people and last contact should remain one AFP responsibility record across Home, Tasks, Timeline and People.
3. **Critical-path view.** Distinguish gate tasks from optional checklist items. Show which downstream dates or bookings are blocked, rather than using raw task count as progress.
4. **Compressed-plan mode.** For couples starting inside twelve months, group overdue early work into a “catch up now” sequence and recommend safe parallel enquiries instead of filling the timeline with dates in the past.
5. **Quote-to-booking continuity.** Keep the original quote, normalized comparison, contract, deposit, balance and correspondence in one supplier journey. Surface the next consequence in plain language and retain uncertainty until terms are verified.
6. **Secure RSVP and guest updates.** A permissioned guest link for RSVP, dietary, access and address changes would remove spreadsheet/email reconciliation. Sensitive fields need least-privilege views and explicit sharing.
7. **Day-of exception mode.** After the run sheet, add coordinator alerts for delays, weather activation, absent suppliers and approved broadcasts. The couple should nominate who has emergency decision authority.
8. **After-wedding close-out.** Project equipment returns, final invoices, photo delivery, thank-yous and review approvals into the same queue without mixing them into pre-wedding urgency.

## Validation

The workflow reports are qualitative synthesis, not diary-study evidence. Before treating these priorities as measured behaviour, test a run-sheet prototype with couples at early, middle and final-prep stages, plus coordinators and several supplier categories. Measure whether recipients can identify their arrival time, contact, dependencies and latest version without assistance, and whether couples correctly understand what is shared and can revoke it.

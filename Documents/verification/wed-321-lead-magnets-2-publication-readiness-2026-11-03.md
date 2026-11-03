# WED-321 Lead Magnets Batch 2 Publication Readiness

Date: 3 November 2026  
Source specification: `OmnyID_Wedding_Lead_Magnets_2_Spec.md`  
Prior capability audit: `wed-320-lead-magnet-capability-audit-2026-11-02.md`

## Decision

Do not publish launch blog posts for the Batch 2 tools in this release. The specification labels all three tools as proposed and states that none has been built. Publishing a post that invites a visitor to use them would overstate the hosted product.

## WED-322 foundation update

The shared-profile blocker is now implemented locally:

- `profile-fields.v1` contains all 36 keys with validation, sensitivity tier, declared writers, workspace target, conflict rule and plain-language purpose.
- A generator produces the static registry used by public tools; a parity test fails if it drifts from the workspace copy.
- `magnet-profile.js` provides browser-local read/write, declared-writer enforcement, provenance, three-value history, conflict surfacing, blocked-storage fallback, manual edit, per-field deletion, delete-all and JSON export without a network request.
- Budget Reality Check now prefills and writes its declared shared-profile facts while retaining its separate result envelope.
- The existing Wedding document projection now recognises `style_palette`, `creative_brief`, `invitation_wording`, `shot_list` and `wedding_countdown` as bounded artifact subtypes without creating a parallel document store.

This removes LP-02 and the core LP-03 code dependency. It does not by itself make the three Batch 2 tools publishable.

## Tool status

| Tool | Hosted result page | Shared profile import | Required output contract | Publication decision |
| --- | --- | --- | --- | --- |
| Wedding Style and Colour Palette Builder | Absent | Shared profile and artifact subtype contract ready; consolidated import and reviewed licensed image/content libraries remain | No generated palette or creative brief exists yet | Do not publish |
| Wedding Invitation Wording Generator | Absent | Shared profile and artifact subtype contract ready; consolidated import and inclusive phrase review remain | No generated wording artifact or reviewed phrase library exists yet | Do not publish |
| Personalised Wedding Countdown | Absent | Shared profile ready; catalogue and date-reprojection work remain | One canonical task catalogue and date-change parity are not complete | Do not publish |

The existing public Budget Reality Check, Wedding Animal Quiz, RSVP projection, run-sheet database, venue/photographer style tags and explicit Wedding Understanding submission are real capabilities. They do not satisfy the acceptance criteria for these three separate tools.

## Release condition

Create a launch article only after the corresponding tool page, deterministic engine, mobile/accessibility checks, privacy wording, consented import mapping and exact hosted evidence all pass. Until then, related editorial content may discuss the planning problem, but must not present the proposed tool as available.

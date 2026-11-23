# Wedding UX walkthrough current-implementation audit

Date: 2026-10-22  
Task: WED-245  
Branch: `agent/codex/WED-215`  
Walkthrough reviewed: `Documents/UI/wedding planner/ux-walkthrough-2026-10-21/REPORT.md` in the primary checkout

## Method and boundary

The walkthrough is treated as production-observed evidence, not as a replacement design. Each
observation was compared with the current WED-215 implementation and the preceding WED-242,
WED-243 and WED-244 changes. A finding was changed only when the current implementation still had
the same user-facing problem.

The report's repeated follow-up-draft failure is intentionally excluded at the user's direction.
Human testing did not reproduce it. Error copy remains sanitized for the case where a real retry or
rate-limit error does occur, but this task does not reinterpret rapid scripted requests as evidence
of a provider or backend defect.

The scripted reload logout is not reproduced by the current storage contract. Session storage
survives a same-tab reload, and changing authentication persistence from one automated observation
would weaken an intentional security boundary. No session-persistence contract changed.

## Finding disposition

| Walkthrough observation | Current disposition | WED-245 action |
|---|---|---|
| Wedding landing wordmark clipped at 390px | Genuine current layout risk | Prevented the logo group from shrinking and tightened the small-phone header without hiding the five-tab app navigation. |
| First-time auth shows homeserver/developer wording | Genuine current copy issue | Replaced session, network, offline and auth footer diagnostics with plain recovery copy. |
| Passkey action splits email and password | Genuine current form hierarchy issue | Moved the passkey alternative below the primary password action. |
| Verification response is vague | Genuine current copy issue | Normalized ambiguous server/default wording to name the email address and the verification-link next step. |
| Generic tour, student onboarding and profiling modal appear in a wedding entry | Genuine current context leak | Wedding deep links suppress generic tour, onboarding and profiling prompts. Generic entries retain their existing onboarding. |
| Starter answers are not saved when moving through the wizard | Genuine current continuity issue | Each forward/step transition saves the local draft; the completion action saves before generation and guards duplicate taps. |
| Wizard repeats its first question on every step | Genuine current hierarchy issue | Added a step-specific heading and prompt. |
| Duplicate unsaved-draft labels and ambiguous completion action | Genuine current copy/action issue | Shows one save-state cue before review and uses `Create my wedding plan` with a busy state. |
| NOIM abbreviation appears without explanation | Genuine current jargon issue | Expanded it to `Notice of Intended Marriage` and removed it from the paste example. |
| Current wizard's pink, very-round presentation diverges from wedding brand | Genuine current design-system issue | Migrated the owned shell, step panels, inputs and main actions to wedding tokens and 8-12px radii. |
| Parsed-message status says `1 item need review` and does not identify it | Genuine current copy issue | The status now lists the actual fields that need review and uses grammatical plain language. |
| Wedding home date heading looks inert | Already corrected before WED-245 | The current home uses the functional wedding date entry control. |
| Decision card and approval describe different items | Already corrected before WED-245 | Current confirmation is bound to the active decision rather than a stale generic action. |
| Smart Action/evidence-signal language and repeated recommendation | Genuine residual copy issue | Sanitized those labels and removed a recommendation reason when it duplicates the card's main explanation. |
| Full-sentence vendor searches return unrelated/blank results | Already substantially corrected by WED-244; one empty-state gap remained | Current intent extraction scopes category and place and excludes known mismatches. WED-245 adds an actionable no-match message instead of suppressing a zero-result directory notice. |
| Ranking only says a score and confidence | Already corrected by WED-244 | Current `Why this ranking` uses source-backed, request-specific anchor rows. |
| Known query details are replaced by stale Photos/venue checks | Already corrected by WED-244 | Current request supplies its own category, location, guest count, budget, priorities and atmosphere. |
| Dismissing one vendor removes the comparison with no recovery | Already corrected before WED-245; feedback remained quiet | Current comparison keeps other cards and has a Hidden vendors restore area. WED-245 adds explicit hidden/restored feedback without masking a failed preference sync warning. |
| Generic Response Queue appears under Vendors | Genuine current content leak | The generic queue is no longer mounted in a wedding workspace. |
| Vendor comparison disappears after outreach | Already corrected before WED-245 | Outreach state is owned separately and no longer replaces the comparison. |
| Reach-out draft repeatedly fails | Intentionally excluded | Per user direction, no defect is inferred from the scripted 422/429 sequence. Existing approval and send boundaries remain unchanged. |
| Raw lower-case rate-limit response can reach UI | Genuine defensive copy issue | `too many requests`, rate-limit and 429 errors map to a calm wait-and-retry message. |
| More exposes unrelated OmnyID pages and duplicate icons | Genuine current navigation/content issue | Removed All pages/Advanced from the wedding More sheet and assigned distinct existing icons. |
| Generic persona and customizer controls overlap wedding pages | Genuine current content/overlap issue | Suppressed both on the wedding workspace entered from the wedding site. |
| Wedding bottom navigation disappears | Not reproduced in the current wedding shell | The persistent five-item mobile tab bar remains the current navigation owner. No alternative menu was introduced. |
| Timeline switches to indigo and uses very large radii | Genuine current wedding-surface issue | Migrated the timeline shell and controls to wedding tokens and 8-12px radii. Status-bar colours remain evidence-driven. |
| Timeline task action says Done but only opens Tasks | Already corrected before WED-245 | Current label is derived from the actual sidebar action/status rather than a hard-coded completion command. |
| `+ Add task` opens Calendar | Genuine current label mismatch | Renamed the action `Add task in calendar` to describe its actual destination. |
| Calendar exposes redirect URI, OAuth fallback and raw AFP/curator copy | Genuine current developer-text leak | Removed setup diagnostics, made sync/connect failures user-facing and allowed the connect label to wrap within a 44px target. |
| Calendar is orange rather than wedding teal | Shared-surface constraint, not changed globally | `MonthlyCalendarView` is also a generic app surface. This task does not recolour non-wedding workflows without a separate wedding theme input. Its technical leaks and mobile overflow are fixed. |
| Budget changes to an emerald surface and uses oversized radii | Genuine current wedding-surface issue | Migrated the budget shell, summary cards, allocation section and primary save action to the wedding palette/radius contract. Risk and warning colours remain semantic. |
| Budget save has no confirmation | Already corrected before WED-245 | The current tracker owns a visible save notice and local fallback notice. |
| Documents show raw filter terms and bounded-page diagnostics | Genuine current copy issue | Added friendly kind/export/evidence labels and replaced refresh internals with useful loaded, partial, failed or sign-in states. |
| Documents concatenate title and kind | Not reproduced in the current card implementation | No speculative layout rewrite was applied. |
| Guest totals run into labels and no approximate guest input exists | Mixed/out of this slice | The intake already accepts an approximate total. The structured guest list remains intentionally person/household based; it was not replaced from one production screenshot. |
| Generic marketing root does not advertise weddings | Separate acquisition surface | The dedicated `/wedding/` entry remains the wedding acquisition source; generic marketing changes are outside this current-app repair. |
| Vendor records have no photo | Honest data state | No stock photo is fabricated for a vendor without an approved image. Existing image URLs remain visible where present. |

## Authority and rollout safety

- AFP remains the durable planning/event authority; no parallel task, document, decision or budget
  ledger was introduced.
- A2UI and existing components remain presentation mechanisms. No UI control bypasses approval,
  outreach, booking, payment or vendor-permission boundaries.
- Policy V2, vendor mail, quotation, relay and planning-intelligence release flags remain unchanged
  and disabled unless their existing independent criteria are met.
- No provider action, vendor email, Oracle deployment or source-data upload is part of WED-245.
- The existing mobile bottom bar remains the single persistent wedding navigation model.

## Verification target

The final task record must include Solid typecheck, source and focused wedding line budgets, wedding
site smoke, focused copy/state tests, the full wedding test suite and the production UI build. Any
browser check is supplementary; rapid automation alone is not used to diagnose backend failure.

# WED-319 lead-magnet capability audit

Audit date: 2 November 2026  
Worktree: `C:/Users/ozans/Desktop/projects/OmnyID-WED-319`  
Starting commit: `e459ddfe730293641f8f3a89eb2c8a221c1857c2`

This audit checks the two lead-magnet specifications against the implementation. A proposed feature is not treated as absent merely because the specification did not find it.

## Findings

| Capability | Finding | Evidence and implementation consequence |
|---|---|---|
| Budget allocation guidance | Genuine defect. The seven displayed band midpoints totalled 120%, so they could not be one allocation. | `weddingBudgetGuidanceState.ts` called each midpoint a starting comparison. WED-319 replaces it with `wedding-budget-model.v1.json`: explicit targets total 100%, while bands are labelled non-additive guardrails. The generated public copy and parity test prevent drift. |
| Six-stage planner | Exists. The report that the proposed stages are absent is stale. | `weddingJourneyStageState.ts` defines Plan & budget, Venue & date, Celebrant & suppliers, Details & invites, Final prep, and Wedding & after, and maps tasks into them. Countdown work must consume these ids instead of adding another vocabulary. |
| Single timing catalogue | Not yet complete. | `weddingJourneyStageState.ts` owns research-backed tasks, while `weddingVendorLeadTimeState.ts` and final-phase modules still own other timing rules. Countdown publication remains blocked until these sources are reconciled into one catalogue and a parity test proves that the public tool and workspace agree. |
| Public image reflection | Exists and should be retained. | `POST /wedding/understanding` accepts at most three bounded JPEG, PNG or WebP images, has burst and daily rate limits, never fetches supplied links, and does not persist submissions. `main.js` prepares all selected images with `Promise.all` and performs one request only on explicit form submission. No live page currently mounts the form. A future palette tool may call it only after all selected images are ready and the visitor chooses **Analyse selected photos**. |
| Image model | Working but not yet cost-optimised through a provider abstraction. | The route currently uses Anthropic Haiku directly. For a new low-cost multimodal deployment, benchmark Google Gemini 3.5 Flash-Lite against the existing structured fixture set, then put it behind the existing bounded route; do not call a model on selection or keystrokes. Keep the current provider until quality, JSON validity, privacy terms and exact current pricing are verified. |
| Lead-magnet import | Partly exists. | `weddingLeadMagnetImportState.ts`, its runner, the preference owner and tests already provide a one-time import hook. Extend these consent and conflict paths; do not add a second import route or a per-tool AFP type. |
| Run sheet | Exists. | The Wedding database profile, projection status, manual item flow, previews, protected sharing and scoped packets exist. Magnet copy may describe only the actions that are currently visible and tested; delay execution and external sends remain separately gated where their controls say so. |
| Style-tag matching | Sufficient only for venues and photographers in the current hosted dataset. | Read-only hosted count on 2 November 2026: venue 178/258; photographer 93/109; florist 0/18; celebrant 0/16; hair & makeup 0/15; caterer 0/14; DJ & band 0/14; cake baker 0/8; videographer 0/6. The product threshold is 50 populated listings in the selected category. Counts are operational evidence, not a permanent hard-coded catalogue. |

## Dependency order

1. Use the versioned 100% budget model in both the workspace and public Budget Reality Check.
2. Finish the shared local-only envelope, storage, print and continuation kit.
3. Extend the existing consented lead-magnet importer; do not create a parallel route.
4. Build the Budget Reality Check first, then the deterministic venue decoder and shot-list builder.
5. Extract the current six-stage task and lead-time sources into one versioned catalogue before publishing Countdown.
6. Build the style tool only after its licensed image library is reviewed. Show supplier matching only when a live category count meets the 50-record threshold.
7. Keep image reflection optional and explicit. Add the public surface and privacy disclosure only after the low-cost provider benchmark passes.

## Copy restrictions

- Do not describe planning bands as percentages that can be added together.
- Do not claim the Countdown matches the workspace until the catalogue parity test passes.
- Do not show style-fit supplier counts for a category below the threshold.
- Do not say an image stays on the device if the visitor chooses the model-backed reflection step.
- Do not promise an automatic send, reminder, booking or external update where the current product requires review or approval.

# Wedding Vendor Personalised Recommendation — Task Plan

Status: implementation in progress (WED-187 baseline)
Prepared: 2026-10-15
Governing spec: `wedding-vendor-personalised-recommendation-spec.md` (this folder)
Related: `wedding-vendor-production-closure-spec.md` (ranking v2, sections 5–6) and
`wedding-vendor-production-closure-tasks.md` (C6, C8, C9–C13)
Implementer: Codex
Suggested ledger IDs: WED-187 to WED-200, mapped in the table below. Register each in
`.agent/TASKS.yaml` when it is claimed.

---

## 1. Decisions recorded by the user on 2026-10-15

| Topic | Decision |
| --- | --- |
| Evaluation judges | **Casper** and **Iris** are the two independent judges for the ranking corpus. |
| Lead-magnet trade-off pairs | Import them without a modal. Migrate the visitor's locally stored result after account creation and when an existing account holder signs in. The import is idempotent per local result and plan. Then show a clear, friendly, non-blocking confirmation. |
| Facet rollout | Derive and release venue style facets in the first pass. Add the minimal photographer `aesthetic.*` and `atmosphere.*` facet set only after the venue pass has been evaluated and stabilised. |
| Model ladder | Every wedding LLM feature uses one ladder: **Cerebras** first (`qwen-3.8-27b`), **Mistral** second (`mistral-small-latest`), and **Anthropic `claude-haiku-5-5`** only when the first two fail. This applies to the outreach drafter, the preference interpreter, the lead-magnet pair import and the catalog enrichment agent. |

Facts found while preparing this plan:

- The Cerebras, then Mistral, then Anthropic ladder **already exists** for outreach drafts on
  `agent/codex/WED-185` (commit `807fe72`). It lives inside `wedding_vendor_outreach_routes.rs`
  (989 lines). Its Anthropic default is still `claude-haiku-4-5-20251001`.
- **No client in the repository calls `POST /wedding/understanding`.** No page stores its result
  either. So there is nothing local to migrate until task R10a adds capture.
- Auth responses do not say whether an account was just created. `/auth/register` and
  `/auth/google` both create users, and neither tells the client.
- The marketing site (`/wedding/`) and the workspace (`/workspace/`) are served from the same
  origin, `omnyid.com`. Browser storage written by one is readable by the other.
- `src/server/wedding_vendor_search_routes/attribute_catalog.rs` is 1,057 lines. It must be split
  before a key is added.
- `solid-ui/src/lib/weddingVendorRankingState.ts` is 976 lines. It must shrink before anything is
  added.

---

## 2. Execution rules

- **Base branch:** start from `agent/codex/WED-185` at `81eef59` or later, or from `main` after
  WED-185 merges. It carries the latest card, comparison and provider-ladder code. The
  `agent/claude/WED-178` branch does not.
- Follow the dependency map. A task starts only when its dependencies' acceptance checks pass.
- Read each file before editing it. Check `.agent/HANDOFF.md` for in-progress owners of
  `WeddingVendorChoiceCard.tsx`, `WeddingMobileFocusHome.tsx`, `ResponseQueueView.tsx` and the
  vendor search routes.
- **AFP v1 compatibility:** optional fields only. Never add a required field to `MessageSchema`.
  Never mutate a message; write a successor with `parent_id`.
- **One scorer:** all ranking logic is reached through `rankWeddingVendorCandidates()`. New logic
  goes into pure helper modules.
- **Files:** at most 999 lines each. Never raise a line-budget cap. Split first, then add.
- **Wedding palette** only. No new color values and no `!important`.
- Error messages state what failed, why, and how to fix it. Do not use empty catch blocks.
- **Secrets:** never commit `.env*`, `oracle-cloud.local.env`, `runpod.env`, `*.key` or
  `.secrets/`. Model names go in `.env.example` and `oracle-cloud.env.example` only.
- Report build, test and deploy status from machine output. Never hand-write PASS.
- Commit, push and deploy only when the user authorises it. Deployment follows the `CLAUDE.md`
  checklist.
- **Production catalog writes** (R11) run only as operator-approved batches.
- **Human gates:** R8 judging is done by Casper and Iris. Agents prepare the material and compute
  results. They never fill in judgments.

### Standard verification (referred to below as "standard checks")

```bash
cd solid-ui && npm run typecheck
cd solid-ui && npm run test:line-budget
cd solid-ui && npm run test:wedding
cd solid-ui && npm run build
cd typescript-sdk && npx tsc --noEmit
cargo check
cargo test wedding_
```

Save the output of each command in the task's handoff note.

---

## 3. Task index and dependency map

| ID | Ledger | Title | Spec phase |
| --- | --- | --- | --- |
| R0 | WED-187 | Baseline and screenshot fixture | — |
| R1 | WED-188 | Truthful vendor card (no ranking change) | P0 |
| R2 | WED-189 | Shared wedding LLM provider ladder | 10 |
| R3 | WED-190 | Split ranking orchestrator and connect v2 | P1 |
| R4 | WED-191 | Facet vocabulary and `style_facets` attribute key | P2 |
| R5 | WED-192 | Deterministic vendor facet derivation | P2 |
| R6 | WED-193 | Couple facet mapping, facet match and reason ledger | P2 |
| R7 | WED-194 | Ledger-driven card, widen actions and desktop rows | P2 |
| R8 | WED-195 | Evaluation corpus judged by Casper and Iris | P3 |
| R9 | WED-196 | Preference interpreter and confirmation chips | P4 |
| R10 | WED-197 | Lead-magnet capture and automatic import on account creation or sign-in | P4 |
| R11 | WED-198 | Catalog facet, capacity and price enrichment | P5 |
| R12 | WED-199 | "Not for us" feedback loop | P6 |
| R13 | WED-200 | Staged release of policy v2 | P7 |

```text
R0 baseline
 ├─> R1 truthful card ............................ [shippable alone]
 ├─> R2 provider ladder ........................... [shippable alone]
 ├─> R3 split + connect v2 (flag off)
 │     └─> R4 vocabulary + attribute key
 │           └─> R5 vendor facet derivation
 │                 └─> R6 couple mapping + facet match + ledger
 │                       └─> R7 ledger-driven card
 │                             └─> R12 feedback loop
 ├─> R8 evaluation corpus (prep starts after R0; scoring needs R6)
 R2 + R6 ─> R9 interpreter + chips
 R9 ─────> R10 lead-magnet capture + import
 R2 + R4 ─> R11 catalog enrichment
 R7 + R8 + R11 ─> R13 staged release
```

R1 and R2 can ship immediately after R0. R8 preparation runs in parallel with R3–R6.

---

## R0 — Baseline and screenshot fixture

Depends on: none

Work:

1. Record `git status --short`, the current SHA and the base branch.
2. Run the standard checks and save the output.
3. Add a ranking fixture that reproduces the user's screenshot. Use one candidate built from the
   production attributes of `venue-bondi-icebergs-club`: `style_tags`, `editorial_summary`,
   `location_setting_class=iconic_waterfront`, `in_house_catering`, `indoor_space` and
   `reception_on_site`. It has no capacity, price or rating. Use a Bondi address. Requirements:
   `topPriorities: ["Intimacy"]` and `location: "Bondi, Sydney"`. Copy only vendor facts. No couple
   data from production goes into the fixture.
4. Add a test asserting today's v1 output for the fixture: fit 38, "Matches 1/2 of your
   priorities", and "Strong on: Location". This locks the baseline that R1 and R6 change.
5. Capture a 360×740 Playwright screenshot of the mobile vendor deck with this fixture. Use the
   existing smoke fixture path.

Files: `solid-ui/tests/fixtures/` (new fixture), `solid-ui/tests/wedding-vendor-*.test.ts` (new
test).

Acceptance:

- The baseline test passes and reproduces the screenshot values.
- The screenshot is saved under the task's evidence folder and referenced in HANDOFF.

---

## R1 — Truthful vendor card (no ranking change)

Depends on: R0
Spec: sections 3.3, 11.1–11.4, phase P0

Goal: stop the card claiming fit it has no evidence for, using only data v1 already produces.

Work:

1. **Remove the misleading narrative.** In `comparisonRecommendationHandoff()`
   (`weddingVendorComparisonPresentationState.ts`):
   - Delete the single-choice "is the available option to assess against …" template.
   - Delete the two-choice "stronger first choice for {first priority}" template. It has the same
     defect.
   - Replace both with count-aware, evidence-only sentences:
     - 1 choice: "{N} venue fits what you've told us so far." Include no priority unless a reason
       for that priority is a pro.
     - 2 or more choices: "{A} is strongest on {anchor}." Use it only when A has a known component
       for that anchor with value ≥ 0.6. Otherwise say "Compare the {N} options below."
2. **Add v1 anchor rows.** Create a new pure module, `weddingVendorAnchorRowState.ts`. It builds up
   to 4 rows per candidate from v1 components and the couple's requirements:
   - location anchor (couple's location text): ✓ when the location component is ≥ 0.6, ✗ when it is
     known and below 0.4, otherwise ?;
   - budget anchor: ✓, ✗ or ? from the cost component; ? reads "No price on record";
   - guests anchor: from capacity, with ? reading "Capacity not confirmed";
   - each `topPriorities` entry: ✓ only when one of its tokens matched the vendor's `style_tags`
     or `editorial_summary`; otherwise ? reading "Not confirmed yet". **Never ✗ from a keyword
     miss.**
   Each row records `{anchor, status, detail, componentId}`. Rows are ordered as priorities first,
   then location, budget and guests.
3. **Change the card layout** (`WeddingVendorChoiceCard.tsx`) to match spec 11.1, using v1 data:
   - Count-aware header: "Your best match", "Best of 3 matches", or "Only venue that fits so far".
     Never "#1 recommendation" for a single result.
   - "For what you asked" anchor rows. Icons need a text label for screen readers.
   - "We'll ask them": up to 3 questions from `unknownHardConstraints` and ? anchor rows.
   - One primary action: the semantic intent label from `weddingVendorChoiceActionState`, styled
     `min-h-12`, full width on mobile. Pressing it also marks the vendor selected for follow-up.
     Remove the separate "Selected for follow-up" toggle on mobile. Desktop multi-select stays.
   - A secondary text row: Website, Contact (opens the existing contact disclosure) and Not for us.
     "Not for us" removes the vendor from the current deck only. Its feedback recording comes in
     R12. Each target is at least 44px.
   - Replace the score chip with "Based on {N} checked facts · {M} to confirm". N counts known
     components and M counts ? anchor rows. Move the numeric fit to a "Why this ranking"
     disclosure.
   - Remove the duplicate "Strong on: …" line and the "… looks strong" chips.
4. **Pass the questions to the draft.** The primary action passes the "We'll ask them" questions
   into the outreach draft request as optional `verify_questions: string[]`. The outreach route
   appends them to the prompt as "Questions to include". This is an additive optional request
   field.
5. In `decisionCardFromWeddingVendorComparison()` (`decisionCardState.ts`), set `recommendation`
   to `null` when there is one vendor card. Remove the footer chips "#1 {vendor}" and "Links
   included" from the mobile vendor deck path.
6. Add a copy guard test over all generated comparison copy. It fails on the banned phrases:
   "available option", "assess against", "stronger first choice for", "fit requires", "review
   manually". It also fails on any ✓ anchor whose component value is below 0.6.

Files: `weddingVendorComparisonPresentationState.ts`, `weddingVendorAnchorRowState.ts` (new),
`WeddingVendorChoiceCard.tsx`, `WeddingVendorDeckCard.tsx`, `decisionCardState.ts`,
`weddingResponseWorkspacePresentationState.ts` (footer chip), `weddingVendorComparisonArtifactState.ts`
(optional `anchor_rows` read), `src/server/wedding_vendor_outreach_routes.rs` (optional
`verify_questions`), tests.

Tests:

- The R0 fixture renders "✓ Bondi …" and "? Intimacy — Not confirmed yet". It renders no
  "Intimacy" in any recommendation sentence.
- Copy guard test.
- Anchor rows are stable for legacy artifacts that have no new fields.
- Playwright 360×740: no horizontal overflow, every action at least 44px tall, and one primary
  button.
- The outreach route ignores a missing `verify_questions`, caps it at 3 items of 200 characters
  each, and includes the questions in the prompt.

Acceptance: standard checks pass. The screenshot scenario matches spec 11.1 apart from facet-based
rows, which arrive in R7.

---

## R2 — Shared wedding LLM provider ladder

Depends on: R0
Spec: section 10; user decision on models

Goal: one reusable ladder (Cerebras, then Mistral, then Anthropic Haiku 5.5) for every wedding LLM
feature, with per-feature validation.

Work:

1. **Extract the ladder** from `wedding_vendor_outreach_routes.rs` into a new module,
   `src/server/wedding_llm_ladder.rs`, kept under 400 lines:
   - Provider order is fixed: `Cerebras`, `Mistral`, `Anthropic`.
   - Defaults: `DEFAULT_CEREBRAS_MODEL = "qwen-3.8-27b"`, `DEFAULT_MISTRAL_MODEL =
     "mistral-small-latest"`, `DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"`.
   - Per-feature environment overrides, using the existing pattern:
     `OMNYID_WEDDING_<FEATURE>_<PROVIDER>_MODEL`, where FEATURE is `OUTREACH`, `INTERPRETER` or
     `ENRICHMENT`. A missing feature override falls back to the outreach variable, then the
     default.
   - API keys come from the existing `read_hosted_cerebras_api_key`,
     `read_hosted_mistral_api_key` and `read_hosted_anthropic_api_key`.
   - Signature, roughly:
     `run_ladder<T>(feature, system, user_text, max_tokens, validate: impl Fn(&str) -> Result<T, String>) -> LadderOutcome<T>`.
     The outcome includes the selected provider and model, plus every attempt as
     `{provider, model, error_kind}`.
   - Try the next provider on: a missing key, a transport error, an HTTP status other than 2xx, a
     timeout (per-provider timeout from a constant, 12 seconds by default), empty output, or
     `validate` returning an error.
   - Log each fallback once at `warn` with feature, provider and error kind. Never log prompt text
     or couple data.
   - Meter the successful call through `wedding_shared_tool_metering`. Add `Interpreter` and
     `Enrichment` to `WeddingSharedToolFeature` if they are missing.
2. **Point outreach at the ladder.** Keep its deterministic payload fallback for when all three
   providers fail. `wedding_vendor_outreach_routes.rs` must end below 900 lines.
3. **Verify the Anthropic model id** before merging. Call `GET https://api.anthropic.com/v1/models`
   with the hosted key in a local one-off check, and confirm `claude-haiku-5-5` is listed. If it is
   listed under a dated alias only, use the alias the API returns. Record the result in HANDOFF.
   Do not commit the key or the response body.
4. Update `.env.example` and `oracle-cloud.env.example`. Add the new `INTERPRETER` and
   `ENRICHMENT` model variables, and change the outreach Anthropic default to `claude-haiku-5-5`.
   Do not edit `oracle-cloud.local.env`. List the server env changes the user must apply in
   HANDOFF.
5. Add a DECISIONS entry: "Wedding LLM features use a single ladder: Cerebras, then Mistral, then
   Claude Haiku 5.5. Anthropic is last."

Tests (Rust, with a mock HTTP layer or an injected transport):

- Cerebras success means no other provider is called.
- A Cerebras 5xx leads to Mistral success.
- Cerebras returning invalid JSON fails `validate`, and Mistral is called.
- Cerebras and Mistral missing keys lead to an Anthropic call with `claude-haiku-5-5`.
- All three failing returns `LadderOutcome::Exhausted`, listing three attempts.
- A feature override is used when set.

Acceptance: standard checks pass. Outreach behaviour is unchanged apart from the Anthropic default.

---

## R3 — Split the ranking orchestrator and connect policy v2

Depends on: R0
Spec: section 9.1; closure spec C9–C12 (the helpers already exist)

Work:

1. Move the v1 component functions out of `weddingVendorRankingState.ts` into a new module,
   `weddingVendorUtilityComponentsState.ts`. These are `styleEvidence`, `costEvidence`,
   `locationEvidence`, `capacityEvidence`, `qualityEvidence`, `planningEvidence`, `riskEvidence`,
   `buildComponents`, `computeFit` and `computeConfidence`. Behaviour must not change. The
   orchestrator must end below 900 lines.
2. Add `rankingPolicy: "1" | "2"` to the `rankWeddingVendorCandidates` input. The default is
   `"1"`. With `"2"`:
   - fit comes from `weddingVendorPriorShrunkFit`;
   - location comes from `weddingVendorLocationUtility`, using `latitude` and `longitude`
     attributes and plan coordinates when present (token fallback otherwise);
   - cost comes from `weddingVendorEffectiveCost`, using `venue_hire_fee_aud`,
     `price_per_head_aud`, `minimum_spend_aud`, `corkage_fee_aud` and `price_estimate_total_aud`,
     with the wedding month parsed from `dateOrSeason`;
   - venue quality comes from `weddingVenueQualityScore`, and sentiment from
     `weddingVendorSentimentScore`, as components using the closure spec 5.3.5 weights;
   - confidence comes from `weddingVendorConfidenceV2`;
   - availability probability for verify candidates comes from `weddingVendorAvailabilityPrior`;
   - each candidate gets optional `fitUpper`, `availabilityProbability`, `styleTags`,
     `locationSettingClass` and `suburb`.
3. In `weddingVendorSearchArtifactState.ts`, read the flag through
   `weddingVendorRankingPolicyV2Enabled(import.meta.env)`. Pass `rankingPolicy`, and pass
   `rankingPolicyV2` to `selectWeddingVendorShortlist`, mapping the new candidate fields.
4. Include the policy version in the material fingerprint call. It already accepts
   `rankingPolicyVersion`.

Tests:

- With the flag off, all existing ranking tests pass unchanged, and output for the R0 fixture is
  byte-identical to before.
- With the flag on, the closure spec probes pass: a sparse keyword-echo vendor ranks below a
  well-evidenced one, the capacity veto still excludes, unknown availability never excludes, a
  seasonal estimate is never labelled a quote, and replay is deterministic.
- The flag-on result for the R0 fixture no longer equals 38. Record the new value.

Acceptance: standard checks pass, with the flag off by default.

---

## R4 — Facet vocabulary and `style_facets` attribute key

Depends on: R3
Spec: sections 7.3 and 8

Work:

1. **Vocabulary file.** Create one JSON definition, `wedding_facets` v1, with the dimensions and
   values in spec 8.1. Each entry has `id`, `dimension`, `label`, `couple_phrase`, `synonyms[]`,
   `conflicts[]`, and an optional `derive`.
   - Location: choose a path both builds can read. Confirm that the Rust Docker build context
     (`Dockerfile` and the compose `build.context`) includes it, and that Vite can import it.
     If no single path works for both, keep the JSON in `src/server/wedding_vendor_search_routes/`
     and generate a TypeScript copy with a script, plus a test that fails when they differ.
   - Seed the synonyms from the experience-trait regexes in `weddingExperienceModelState.ts` and
     from the production style tags in spec 3.4. Aim for 60 facets.
2. **TypeScript module.** Add `weddingFacetVocabularyState.ts`. It loads the JSON and exports
   `WEDDING_FACET_VOCABULARY_VERSION`, `weddingFacetById`, `weddingFacetsForPhrase(text)` (synonym
   lookup with whole-word or phrase matching) and `weddingFacetConflicts(id)`.
3. **Remove the duplicate trait regexes.** Change `weddingExperienceModelState.ts` so its trait
   rules and decision-fit rules read synonyms from the vocabulary. Keep its exported API and
   tests unchanged.
4. **Split the Rust catalog.** Move the tests out of `attribute_catalog.rs` into a
   `attribute_catalog_tests.rs` sibling, or split the spec table into its own module, so the file
   ends below 950 lines. Then add `spec("style_facets", "Style facets", AttrKind::Tags, ALL,
   "fit")`. Add validation that rejects any value not in the vocabulary. Each value is a facet id
   string. Per-facet confidence and evidence go in the attribute `notes` as JSON, or in a
   structured value if `AttrKind` supports it. Choose one and record it in DECISIONS.
5. **Admin editor.** `UsageAdminWeddingVendorAttributesEditor.tsx` lists `style_facets` as a
   multi-select of vocabulary labels.
6. **Migration.** Add one only if a CHECK constraint or the export view needs a change. Use the
   next free number (0108 or later; check `postgres/migrations/` and any unmerged branches) and
   keep it additive.

Tests:

- TypeScript: every synonym maps to exactly one facet; "Intimacy" and "intimate" map to
  `scale.intimate`; every `conflicts` id exists.
- Rust: an admin write with an unknown facet id returns 400, with a message naming the id and the
  vocabulary version.
- The experience-model tests pass unchanged.

---

## R5 — Deterministic vendor facet derivation

Depends on: R4
Spec: section 8.3

**Simplification over the spec:** deterministic facets are derived **at rank time** in a pure
TypeScript function from attributes already attached to each source. They are not stored. This
avoids backfills and recompute triggers, and stays cheap for 253 venues. Only agent-inferred or
operator-set facets are stored in `style_facets`. R13 updates the spec to match.

Work:

1. Create `weddingVendorFacetDerivationState.ts`. Its input is a ranking source plus the couple's
   guest count. Its output is a list of
   `{facetId, confidence, evidence: {attributeKey, value, authority, sourceUrl}}`.
2. Implement these rules:
   - `setting_class_map`: map each `location_setting_class` enum value to facets. Confidence is
     0.8 × the attribute's confidence.
   - `boolean_map`: map `wheelchair_accessible`, `accommodation_on_site`, `wet_weather_option`,
     `exclusive_use`, `byo_alcohol_allowed`, `pets_allowed`, `public_transport_access`, `parking`,
     and `ceremony_on_site` together with `reception_on_site`.
   - `tag_dictionary`: run the vocabulary synonyms over `style_tags` (confidence 0.7) and
     `editorial_summary` (confidence 0.6).
   - `smallest_room_fit`: with guests G, take the smallest room (from `wedding_vendor_rooms`
     evidence on the source) with `capacity_seated ≥ G`, or else `capacity_seated_max`. Ratio ≤ 1.6
     gives `scale.intimate` match. Ratio ≤ 2.5 gives partial (`scale.mid` together with
     `scale.flexible_rooms` when more than one room exists). Ratio > 4 with no smaller room gives
     `scale.large`. With no capacity, the facet is unknown and nothing is emitted. With G unknown,
     skip the rule.
   - `stored_facets`: read `style_facets` values with their stored confidence and authority.
3. Merge duplicate facets by keeping the highest confidence. Keep every evidence item.

Tests:

- Bondi Icebergs Club (R0 fixture) gives `setting.waterfront`, `setting.beach` (from the "Bondi
  Beach" tag) and `experience.views_led`. It gives no scale facet.
- A 300-seat venue with no rooms and 40 guests gives `scale.large`.
- Rooms of 50 and 200 seats with 45 guests give `scale.intimate` at the room's confidence.
- Run against `oracle-venue-export-2026-10-07-enriched.csv` plus a sanitised attribute snapshot.
  This is a local script. Do not commit production attribute values unless they are already in
  repo exports. Report the share of active venues that get at least one facet. The target is 60%
  or more.

---

## R6 — Couple facet mapping, facet match and reason ledger

Depends on: R5
Spec: sections 8.4 and 9.2–9.5

Work:

1. **Couple profile (deterministic).** Create `weddingPreferenceProfileState.ts` with:
   - `WeddingPreferenceFacet = {facetId, weight: "must" | "strong" | "nice", polarity: 1 | -1,
     anchor, anchorSource, confidence, authority: "user" | "deterministic" | "interpreter" |
     "feedback"}`;
   - `buildDeterministicPreferenceProfile(requirements, experienceModel?)`. It maps
     `topPriorities` to strong, atmosphere and preferences to nice, and inspiration traits to
     nice, using `weddingFacetsForPhrase`. Unmatched phrases go to `unmapped[]`. The anchor is the
     couple's exact phrase. Confidence is 0.7 for the deterministic map;
   - `mergePreferenceProfile(base, override)` for later stored profiles from R9 and R10, where
     user-confirmed facets win.
2. **Facet match component.** Create `weddingVendorFacetMatchState.ts`:
   - Use weights must = 3, strong = 2, nice = 1. Score each facet as match 1.0, partial 0.5,
     conflict 0.0, or unknown prior 0.5 at confidence 0, as in spec 9.2.
   - Return `{value, confidence, perFacet: [{facetId, anchor, outcome, evidence[]}]}`.
   - With policy v2, this replaces the style component and keeps the v2 style weight (0.20).
   - With policy v1, it is unused.
3. **Must-have veto.** A must facet with a decisive conflict (confidence ≥ 0.7) adds a
   `failReason`: "{anchor} is a must-have, but {evidence phrase}". A non-decisive conflict adds a
   risk flag. Unknown adds an unknown constraint with a verify question.
4. **Priority weight shift.** When a dimension holds the couple's top-ranked anchor, shift up to
   0.06 of weight toward the matching component. Record the shift on `components`.
5. **Reason ledger.** Create `weddingVendorReasonLedgerState.ts` with the `WeddingVendorReason`
   type exactly as in spec 9.5. `buildReasonLedger(candidate, profile, requirements)` emits one
   reason per anchor from facet-match results and the location, cost, capacity and quality
   components. A validator drops any pro or con without evidence and records each drop in a debug
   counter. Verify-question templates are listed in spec 9.5 and section 11.
6. Add optional `reasons?: WeddingVendorReason[]` and `profileFacetIds?: string[]` to
   `WeddingVendorRankedCandidate`. Fill them only under policy v2.

Tests (personalisation probes from spec section 14):

- **Intimacy probe:** 50 guests and "Intimacy". A venue with a 60-seat private room ranks above a
  similar venue whose smallest room seats 300.
- **Keyword-echo probe:** a vendor whose snippet repeats "intimate" but has no facets or capacity
  ranks below a vendor with derived `scale.intimate`.
- **No-false-tick probe:** every pro reason has evidence.
- **Unknown-neutral probe:** removing style tags moves facet value toward 0.5, not to 0.
- **Replay probe:** identical inputs give an identical order and an identical ledger, compared as
  deep-equal JSON.
- The Bondi fixture's ledger reads: location pro (Bondi), "Intimacy" unknown with a verify
  question about the smallest private room for the guest count, and budget unknown.

---

## R7 — Ledger-driven card, widen actions and desktop rows

Depends on: R6, R1
Spec: sections 9.6, 11 and 13

Work:

1. **Ledger-based anchor rows.** When a candidate has `reasons`, `weddingVendorAnchorRowState.ts`
   builds rows from the ledger. Otherwise it falls back to the R1 v1 rows. Use the copy templates
   from spec 11.4 only.
2. **Facet subline.** Show the vendor's two highest-confidence facets that relate to the couple's
   facets, using couple-facing labels from the vocabulary.
3. **"Worth knowing".** Show the highest-weight con, or else the seasonal note when present. Mark
   it "indicative" when estimated.
4. **Fit word.** Show it only at medium or high confidence: Strong match (fit ≥ 75), Good match
   (60–74) or Partial match (45–59).
5. **Near misses and widen actions** for 1 or 2 results:
   - Take up to 2 candidates from `excluded`, each shown with its failing constraint in plain
     words.
   - Build widen actions from the binding constraint: distance +15 km, standing reception,
     include unknown price, and must-have to strong. Each action reruns
     `rankWeddingVendorCandidates` with one relaxed requirement. It does not save the profile.
6. **Comparison sentence** for 2 or more candidates: use the spec 11.4 template, only when both
   claims are pros with evidence.
7. **Desktop table.** The rows "Preference match", "Situation fit" and "Why surfaced" become one
   row per anchor, with ✓, ? or ✗ and a short detail per vendor.
8. **Artifact fields.** Add optional `profile_ref`, `vocabulary_version`, per-card `reasons`,
   `anchor_rows` and `widen_actions`, plus supertags `wedding_facet:<id>` for matched facets.
   Readers must accept artifacts without them.
9. **Outreach.** The verify questions now come from the ledger's unknown reasons, at most 3.

Files: `weddingVendorAnchorRowState.ts`, `WeddingVendorChoiceCard.tsx`, `WeddingVendorDeckCard.tsx`,
`weddingVendorComparisonPresentationState.ts`, `weddingVendorComparisonArtifactState.ts`,
`weddingVendorSearchArtifactState.ts` (stay under 999 lines; extract the artifact-field
mapping to a helper if needed), `A2UIRenderer.tsx` (desktop rows only, read-only change).

Tests:

- The copy guard from R1 also covers ledger copy and the contradiction probe: no anchor is shown
  as a strength when its reason is con or unknown.
- A single-result fixture shows the count header, near misses and at least one widen action.
  Applying a widen action produces a new ranking without writing a profile.
- A legacy artifact renders unchanged.
- Playwright 360×740 for both the 3-result and 1-result fixtures, with axe showing no serious
  violations.

---

## R8 — Evaluation corpus judged by Casper and Iris

Depends on: R0 for preparation, R6 for scoring
Spec: section 14; closure spec 5.8

Work for the agent:

1. **Case builder script** (`scripts/`). It builds at least 40 cases from the sanitised active
   catalog: vendor rows and attributes only, no couple PII.
   - Couple profiles are synthetic and span guest count (30–250), budget (low, mid, high), month
     (peak and off-peak), location (CBD, east, north, west, regional), and priorities. At least 10
     cases include intimacy-type priorities, 5 accessibility needs, 5 food-led, and 5 with sparse
     evidence.
   - For each case, pick 8–12 candidates that the directory search would return.
2. **Judging sheets.** Produce one sheet per judge (CSV or a simple local HTML form). Each case
   shows the couple profile and each candidate's facts and source links. Each sheet asks for
   relevance from 0 to 3 per candidate and an ideal top 3. Hide the ranker's order and scores
   from judges.
3. **Writing the judgments to the corpus.** `judges: ["Casper", "Iris"]` per case. Relevance is
   the mean of both judges. Record cases where they differ by 2 or more as `disagreement: true`,
   with a `resolution` field that Casper and Iris fill in together. Do not resolve them as an
   agent.
4. **Scoring.** Compute `assessWeddingVendorRankingV2Gate` (v1 against v2 with facets), the
   probes from R6, explained coverage, and the unmapped-phrase rate. Write a report to
   `Documents/design/wedding planner/wedding-vendor-ranking-eval-report-<date>.md`.

Work for Casper and Iris (human gate):

- Judge every case independently, without discussing it, then resolve flagged disagreements
  together.

Acceptance: the corpus file has at least 40 cases, both judges, no unresolved disagreements, and a
report generated from machine output. If the gate fails, the report lists failing cases and the
v2 flag stays off.

---

## R9 — Preference interpreter and confirmation chips

Depends on: R2, R6
Spec: sections 10.1, 7.3 and 13

Work:

1. **Server route.** Add `POST /wedding/preference-profile/interpret`, authenticated. Put it in a
   new module, `src/server/wedding_preference_routes.rs`, kept under 600 lines.
   - Input: `wedding_plan_id`, the couple's free text (priorities, atmosphere, vendor preferences,
     and optionally lead-magnet pairs from R10), `guest_count`, and `vocabulary_version`. Cap each
     field at 400 characters.
   - It calls `run_ladder` with feature `INTERPRETER`. The system prompt lists the vocabulary ids
     and labels, demands JSON in the spec 10.1 shape, and forbids inventing facts.
   - The validator does the following:
     - parses the JSON;
     - drops facets not in the vocabulary;
     - drops entries whose `anchor` is not a case-insensitive substring of the submitted text;
     - drops hard constraints whose key is not in the existing requirement keys;
     - limits the output to 12 facets, 3 trade-offs and 1 question.
     If nothing valid remains, the validator fails and the ladder moves to the next provider.
   - When the ladder is exhausted, return `{status: "fallback"}` with no facets. The client keeps
     its deterministic profile.
   - Use per-user rate limiting and metering through the existing shared-tool metering.
2. **Client flow.** On intake save, run the deterministic map first. Call the route only when
   `unmapped[]` is non-empty, or when a phrase maps to more than 2 facets. Cache the result by
   material fingerprint plus vocabulary version.
3. **AFP profile message.** Create `weddingPreferenceProfileAfpState.ts`. It builds the
   `context/note` message with subtype `wedding_preference_profile`, using the field list in spec
   13 and supertags `wedding`, `wedding_preference_profile` and `wedding_facet:<id>`. Each change
   emits a successor with `parent_id` set to the previous profile message id. Follow the pattern
   in `weddingIntakeProfileAfpProjectionState.ts`.
4. **Confirmation chips.** Show them on the wedding intake summary and above the vendor deck when
   the profile is unconfirmed: "We read 'Intimacy' as: small room · warm feel". Each chip opens a
   control to choose must-have, nice-to-have or remove. "Looks right" confirms everything. A
   confirmation sets `authority: "user"` and confidence 1.0, and emits a successor. This is
   non-blocking. Use wedding palette tokens and targets of at least 44px.
5. **Fingerprint.** Add the latest profile message id and the vocabulary version to
   `weddingVendorMaterialFingerprint`.
6. **Allowlist.** If a daemon or workflow in `typescript-sdk/src/workflows.ts` emits wedding
   planning messages, add `wedding_preference_profile` to its `outbound_allowlist` and its
   `output_contract.allowed_types`. Record the check in HANDOFF even if none applies.

Tests:

- Rust validator: an unknown facet id is dropped, a non-substring anchor is dropped, a fully
  invalid payload advances the ladder, and exhaustion returns fallback.
- TypeScript: the deterministic profile is used when the route fails; a confirmed facet overrides
  an interpreter facet; the successor message keeps lineage.
- A chip change triggers a new comparison (the fingerprint changes) and does not mutate the old
  artifact.

---

## R10 — Lead-magnet capture and automatic import on account creation or sign-in

Depends on: R9
Spec: section 3.5; user decision on lead-magnet pairs

### R10a — Capture the result locally (precondition)

Nothing in the repository calls `POST /wedding/understanding` yet. Before writing code, the
implementer checks HANDOFF and asks in the task's HANDOFF note whether the lead-magnet front end
lives outside this repository.

- **If it lives elsewhere:** that client must write the record below. Keep R10a to documenting the
  contract.
- **If it does not exist:** add a minimal "Wedding Understanding" section to `wedding/index.html`
  and `wedding/assets/js/main.js`. It needs a text area, up to 3 images (client-side downscale), a
  honeypot field, a submit button, and a result panel showing the core theme, the pairs and the
  tension. Use the existing marketing styles.

Local record contract. It is written to `localStorage` on the `omnyid.com` origin after a
successful response:

```json
{
  "key": "omnyid.wedding.understanding.v1",
  "value": {
    "version": 1,
    "created_at": "ISO-8601",
    "expires_at": "ISO-8601, created_at + 30 days",
    "core_theme": "string",
    "preferences": [{"a": "people", "b": "spectacle"}],
    "largest_tension": "string or null",
    "opening_observation": "string or null"
  }
}
```

- Store only the model's output. Never store the visitor's raw text or images.
- Wrap storage calls in try/catch that logs the failure and continues. The result panel still
  renders when storage fails.
- The "Start planning free" link after a result keeps
  `../workspace/?auth=register&source=wedding`.
- Update `wedding/privacy.html`. It must say that the quiz result is kept in the visitor's browser
  for up to 30 days, and copied into their plan after account creation or the next sign-in to an
  existing account. The server-side "not persisted" statement stays true for the route itself.

### R10b — Flag account creation in auth responses

- Add optional `account_created: true` to the auth success response when the call created the
  user. `/auth/register` always sets it. `/auth/google` sets it only when it created a user. Login
  never sets it. This is an additive response field in `src/server/auth.rs`.
- `parseAuthApiResponse` exposes `accountCreated?: boolean`. Persist it for the session as a
  one-shot flag, consumed by R10c.

### R10c — Import automatically on account creation or sign-in

1. Create `weddingLeadMagnetImportState.ts`, a pure module with storage access injected:
   - `readLeadMagnetRecord(storage, now)` returns the record, or null when it is missing,
     malformed or expired. Expired records are deleted.
   - `leadMagnetPairsToProfileInput(record)` turns each pair into a trade-off text of the form
     "{a} over {b}". The theme becomes an atmosphere text. The anchor source is `"lead_magnet"`.
2. Add one call in `App.tsx`'s wedding launch path, `launchWeddingTemplateFromDeepLink` or the
   `onLogin` handler, after every successful sign-in. `accountCreated` can optimise plan creation,
   but must not guard the import. It lazy-imports a small runner module, so `App.tsx` grows by 5
   lines or fewer. The runner:
   - reads the record and, if present, waits for the wedding plan id that the template launch
     creates;
   - sends the trade-off texts and theme through the R9 interpreter with
     `anchorSource: "lead_magnet"`. Pairs that do not map to facets are kept as text trade-offs on
     the profile and still shown;
   - emits the profile AFP successor, with `metadata.import_source: "wedding_understanding"` and
     a deterministic local-result fingerprint; it first checks the plan for that fingerprint so
     repeat sign-ins do not emit a duplicate successor;
   - deletes the local record **only after** the AFP write succeeds;
   - on failure, keeps the record, logs what failed, why and the next step, and retries on the next
     app load until the record expires. It never blocks onboarding.
3. **Confirmation.** Show a non-blocking toast or inline banner on the wedding home, once, using
   `aria-live="polite"`. Copy: "We brought over your Wedding Understanding results: you value
   people over spectacle and warmth over polish. They'll shape your vendor matches."
   - The banner has two actions: "Review" opens the R9 confirmation chips, and "Got it" dismisses
     it.
   - With more than 2 pairs, list the first 2 and add "+N more".
   - No modal, and nothing is required before the planner loads.
4. Imported facets enter as `weight: "nice"` and `authority: "interpreter"` until the couple
   confirms them. They never create must-haves.

Tests:

- Read: expired records are deleted, malformed records are ignored and logged, and a valid record
  parses.
- An account-created login imports, writes AFP, deletes the record and shows the banner once.
- An existing-account sign-in imports the valid local result using the same idempotency key.
- A repeated sign-in with an already imported fingerprint writes no second AFP successor and does
  not show the banner again.
- An AFP write failure keeps the record, shows no banner, and retries on the next load.
- No raw visitor text appears in the AFP message. Only pairs and theme do.
- The marketing-site smoke test covers the result panel and the storage write, when R10a builds
  the UI.

---

## R11 — Catalog facet, capacity and price enrichment

Depends on: R2, R4
Spec: section 10.2; closure spec C8

Work:

1. **Admin route.** Add `POST /admin/wedding/vendors/enrichment/propose` (admin only). It takes a
   batch of up to 25 vendor ids and returns proposals. **It writes nothing.**
   - Input per vendor: stored `style_tags`, `editorial_summary`, room descriptions and stored
     official-page text. It never fetches URLs.
   - Ladder feature: `ENRICHMENT`.
   - Proposal kinds:
     - `style_facets`, each with an evidence quote;
     - `capacity_seated_max` and `capacity_standing_max`, each with a quote;
     - price signals (`venue_hire_fee_aud`, `price_per_head_aud`, `minimum_spend_aud`), each with
       a quote and its date context.
   - The validator does the following:
     - each quote must be a verbatim substring of the input;
     - facet ids must exist in the vocabulary;
     - numbers must appear inside their quote;
     - confidence is capped at 0.6 for facets;
     - capacity and price proposals are `estimated` with `primary_official` authority only when
       the quote came from official-page text, and `inferred` otherwise.
2. **Apply route.** Add `POST /admin/wedding/vendors/enrichment/apply`. It takes the proposals the
   operator approved and writes them through the existing attribute upsert. Authority-rank rules
   prevent overwriting stronger evidence. It emits one AFP message per batch, subtype
   `wedding_vendor_facet_enrichment_receipt`, with vendor ids, counts per key, operator id, and
   the ladder provider and model.
3. **Admin UI.** Add a review table in `UsageAdminWeddingVendorsPanel.tsx`, or a new sibling
   component if that file would exceed its budget. It shows one row per proposal with the quote
   highlighted, plus approve, reject and edit. There is a batch "Apply approved" button and no
   auto-apply.
4. **Coverage report.** Produce a script, or extend the admin export, that prints facet, capacity,
   price and coordinate coverage for active venues before and after enrichment.

Scope: this pass enriches **venues only**. The next approved pass adds photographer proposals for
the minimal `aesthetic.*` and `atmosphere.*` vocabulary; it needs its own corpus and coverage gate.

Governance: every apply batch on production needs explicit user approval in the conversation. The
agent may run propose on production only to show the user the proposals.

Tests:

- A non-verbatim quote is dropped, an unknown facet is dropped, and a number missing from its
  quote is dropped.
- Apply refuses proposals that were not in the approved set.
- Apply never downgrades an `operator` value.
- A receipt AFP message is emitted per batch.

---

## R12 — "Not for us" feedback loop

Depends on: R7, R9
Spec: sections 11.5 and 12

Work:

1. "Not for us" opens a one-tap reason sheet: "Too big", "Not our style", "Too far", "Too
   expensive", "Other". It records an AFP `wedding_preference_signal` that references the
   comparison artifact and vendor, with the reason, the vendor's derived facet ids, and the
   timestamp. `metadata.store` stays true.
2. Create a pure module, `weddingPreferenceSignalState.ts`, holding the deterministic update rules
   in spec 12, with caps and 90-day decay. The output is a proposed profile delta and an optional
   confirmation prompt after 3 consistent signals.
3. A profile successor applies only nice-weight deltas automatically. Each delta records
   `derived_from_signals`. Must-haves, and tighter location or budget constraints, appear only as
   a confirmation prompt ("You've passed on 3 large venues. Make 'intimate' a must-have?").
4. The rejected vendor stays hidden from this plan's decks until the profile changes again or the
   couple restores it from a "Hidden vendors" list.
5. Pressing the primary action records a positive signal: confidence +0.25 for the vendor's
   facets that are already in the profile, capped.

Tests: the feedback probe from spec section 14; a must-have is never created silently; decay works;
signals for one plan never affect another plan.

---

## R13 — Staged release of policy v2

Depends on: R7, R8, R11

Work:

1. Re-run the R8 scoring on the enriched catalog. Release only if
   `assessWeddingVendorRankingV2Gate` passes and every probe passes.
2. Update spec section 8.3 to describe rank-time derivation (the R5 simplification). Sections 10
   and 18 already record the ladder and the user's decisions.
3. Turn `WEDDING_VENDOR_RANKING_POLICY_V2` on for a staged cohort. Use the existing flag
   mechanism. If there is no per-user cohort mechanism, the stage is "admin accounts first", then
   everyone.
4. Monitor these for 7 days:
   - the "Not for us" rate on rank 1;
   - explained coverage (the share of anchors with pro or con in the top 3);
   - the unmapped-phrase rate;
   - ladder provider mix and exhaustion count.
   Record them in HANDOFF from machine output.
5. Check the embedding trigger from spec 7.4. If it is met, open a separate task. Do not build it
   here.

Acceptance: gate evidence and the monitoring summary are recorded, and the user authorises the
full rollout.

---

## 4. Out of scope

These are parked, as spec section 15 P8 sets out:

- the LLM rationale writer;
- embedding-based retrieval;
- facets for categories other than venues, beyond what the tag dictionary gives for free;
- any LLM ranking or reranking.

---

## 5. Definition of done (whole plan)

- The screenshot scenario renders evidence-backed anchor rows, with no contradiction between the
  copy and the evidence.
- Policy v2 with facet matching passes Casper's and Iris's corpus gate, and is live behind the
  staged flag.
- Every wedding LLM feature runs through one ladder: Cerebras, then Mistral, then Claude Haiku 5.5.
  Failures are logged and metered.
- Lead-magnet results reach the couple's profile automatically on account creation or the next
  sign-in to an existing account, with a friendly banner and no modal; repeat sign-ins remain
  idempotent.
- All new AFP messages are optional-field, append-only and listed in DECISIONS.
- The standard checks pass, the line budget is green, and no file exceeds 999 lines.

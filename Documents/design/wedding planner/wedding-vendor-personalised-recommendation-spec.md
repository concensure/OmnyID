# Wedding Vendor Personalised Recommendation — Specification

Prepared: 2026-10-15
Status: accepted for implementation; WED-187 baseline in progress
Audience: the agent writing the task document (Opus 5.5) and the implementing agent (Codex)
Code baseline: `agent/codex/WED-185` at `81eef59`. That branch carries the latest vendor card and
comparison-copy changes. The current `agent/claude/WED-178` branch does not have them yet.
Related specs:
- `wedding-vendor-production-closure-spec.md` (ranking policy v2, sections 5 and 6)
- `wedding-vendor-mobile-one-card-and-ranking-review.md` (ranking review, section 4)

---

## 1. Summary

The vendor comparison card feels weak for three reasons. None of them is that the system lacks
vector embeddings.

1. **The data is too thin to rank on.** Most active venues have no price, capacity, rating or
   coordinates on record (section 3.4). The ranker can only score what it has.
2. **The improved ranker was built but never connected.** The ranking v2 helpers exist and are
   tested in isolation. They include prior-shrunk fit, synonym style matching, distance,
   seasonal cost, quality, sentiment and slot diversity. `rankCandidate()` still runs the v1
   formula, and nothing passes `rankingPolicyV2` to the shortlist.
3. **The card speaks in system terms, not the couple's terms.** It shows an internal score ("38
   fit · low confidence"), a component count ("Matches 1/2 of your priorities"), and a narrative
   that names the couple's priority even when the evidence says the vendor does not match it.

This spec fixes all three. It does this in a way that keeps the ranker deterministic, explainable
and replayable.

- **A closed vocabulary of wedding facets** acts as typed supertags. It describes both what the
  couple wants and what each vendor offers. Matching becomes explainable set logic, not keyword
  overlap.
- **A preference profile** turns the couple's free-text words, such as "Intimacy", into weighted
  facets anchored to those exact words. The couple confirms it in one tap.
- **A reason ledger** records every pro, con and unknown, each tied to a stored fact. The card is
  rendered only from the ledger, so it cannot claim anything the evidence does not support.
- **AI agents are used where they are strong.** They interpret free text into facets and enrich the
  catalog offline, under validation. They do **not** rank. Ranking stays a pure function, gated by
  the existing NDCG evaluation.
- **Embeddings are deferred**, with an explicit trigger for adding them later (section 7.4).

---

## 2. Assessment of the proposed suggestions

The suggestions the user received are directionally right but partly misdiagnose this codebase.

| Suggestion | Verdict | Reason in this codebase |
| --- | --- | --- |
| Ranking relies on static keyword rules, not dynamic context | **Partly right** | Hard constraints already exist: capacity, budget, availability and accessibility vetoes, with an 8-state availability machine and expected value of information (EVOI). The real gaps are missing data, the unconnected v2 code, and keyword-only style matching. |
| Hard constraints: capacity, budget, date availability | **Already built** | `evaluateEligibility()` and `effectiveAvailability()` in `weddingVendorRankingState.ts`. They rarely fire because capacity and price are usually unknown. The fix is data plus honest "to verify" handling, not new logic. |
| Vibe or aesthetic vectors instead of broad tags | **Right goal, wrong first tool** | A closed facet vocabulary over the existing `style_tags` and `editorial_summary` covers about 70% of active venues today. It is explainable on the card and deterministic for replay. Embeddings give a similarity number with no reason to show the couple (section 7). |
| Explain the why and the trade-off | **Right; the core fix** | Implemented as the reason ledger (section 9) and the card spec (section 11). |
| Multi-layer architecture: constraints, then soft match, then rationale | **Right** | It matches the existing funnel. This spec adds the preference profile before it and the reason ledger after it. |
| Convert vendor text, reviews and the couple's plan into embeddings | **Defer** | Production has pgvector but no embedding service. Ollama is not in the Oracle compose file. Review text is not stored. Revisit under the trigger in section 7.4. |
| Score by dimension, not one number | **Already built** | The ranker already has seven weighted components. The card hides them behind one number. Show the couple's priorities instead (section 11). |
| Replace "low confidence" with a breakdown such as "Capacity 80/80" or "Budget +10% over" | **Right, with a guard** | Show a breakdown, but only from stored facts. Unknown must read "not confirmed yet", never a guessed tick. |
| Move the bottom narrative into the card body | **Right** | The bottom "Recommendation" block repeats the card and currently overstates fit (section 3.3). |
| Pros and "To verify" bullets | **Right, with a guard** | Every bullet must cite a stored attribute. Example copy such as "high guest satisfaction for dining" is only allowed if a rating or review aspect supports it. |
| Make "Check availability and pricing" the primary action | **Right** | The semantic action exists in `weddingVendorChoiceActionState`. Fold "Selected for follow-up", website and contact into one primary button plus a quiet secondary row. |
| "Bondi Icebergs usually requires a minimum beverage spend" | **Only with evidence** | `minimum_spend_aud` is known for 2 vendors. Without evidence, this sentence is a hallucination. Turn it into an outreach question instead. |

---

## 3. Current state (verified 2026-10-15)

### 3.1 Pipeline

| Step | Where | What it does |
| --- | --- | --- |
| Intake | `WeddingSiteIntakeWizard.tsx`, `weddingIntakeProfileAfpProjectionState.ts` | Collects free text: date or season, location, guest count, budget comfort, priorities, atmosphere and vendor preferences. Emits a `context/note` AFP message with subtype `wedding_intake_profile`. |
| Retrieval | `src/server/wedding_vendor_search_routes/directory.rs` | Pulls up to 8 active vendors per search term. Attaches stored attributes, where each missing key is an explicit `unknown`. Online providers fill shortfalls. |
| Ranking | `solid-ui/src/lib/weddingVendorRankingState.ts` (977 lines) | Pure funnel: eligibility, then availability, then utility, then confidence, then EVOI. |
| Slot selection | `weddingVendorShortlistPolicyState.ts` | Exactly three cards, bookable before verify, deduplicated. The v2 slot selector exists but is never enabled. |
| Copy | `weddingVendorComparisonPresentationState.ts` | Builds card records, labels and the recommendation sentence. |
| Card | `WeddingVendorChoiceCard.tsx`, `WeddingVendorDeckCard.tsx`, `DecisionCard.tsx` | Renders the vendor card on mobile and desktop. |

### 3.2 How the top three are ranked today (v1, live)

1. **Eligibility veto:** listicles, permanently closed venues, decisive capacity below guest count,
   a known quote more than 120% of budget, and declared needs (wheelchair, pets, BYO, on-site
   ceremony, accommodation) that are decisively false.
2. **Availability group:** `bookable`, `verify`, `booked` or `excluded`.
3. **Fit (0–100):** weighted mean of the **known** components only. Venue weights are style 0.25,
   cost 0.20, location 0.15, capacity 0.12, reviews 0.13, planning 0.08 and risk 0.07.
4. **Confidence:** coverage × authority × recency. It is displayed but does not affect order.
5. **Order:** bookable by fit, then verify by EVOI. The first three that pass suitability are taken.

**Style matching** looks for preference words of four or more letters inside the title, snippet,
`editorial_summary` and `style_tags`. Any snippet of 20 or more characters makes style "known". A
miss therefore scores 0.

### 3.3 The screenshot, reproduced

The production row for `venue-bondi-icebergs-club` holds `style_tags`, `editorial_summary`,
`location_setting_class = iconic_waterfront`, `in_house_catering`, `indoor_space` and
`reception_on_site`. It has no capacity, price, rating or coordinates.

With the couple's priority "Intimacy" and a Bondi location:

| Component | Known? | Value | Why |
| --- | --- | --- | --- |
| Style (0.25) | Known | 0 | "intimacy" appears in none of the tags. The tags say iconic, panoramic views, swimming club. |
| Location (0.15) | Known | 1 | "bondi" appears in the address. |
| Cost, capacity, reviews, planning, risk | Unknown | dropped | No stored evidence. |

Fit = 0.15 ÷ 0.40 ≈ **38**. Two components are known, and one scores at least 0.6, which gives
**"Matches 1/2 of your priorities"** and **"Strong on: Location"**. Coverage of 0.40 gives **low
confidence**.

The bottom sentence comes from `comparisonRecommendationHandoff()`, added in `5d74e13` (WED-185).
When there is one choice, it always renders:

> "⟨vendor⟩ is the available option to assess against ⟨first user priority⟩; check availability
> and package details before outreach."

It names "Intimacy" because that is the first priority. The evidence says this venue did **not**
match intimacy. This is the single most damaging line on the card. It sounds personalised but is
generic, and it contradicts the score above it.

Other problems on the card:

- "Strong on: Location" and "Location looks strong" say the same thing twice.
- "#1 recommendation" is shown when only one vendor exists.
- The footer chips "#1 Bondi Icebergs Club" and "Links included" carry no decision value.
- There are four separate actions, and "Selected for follow-up" is a state toggle styled as the
  primary button.

### 3.4 Catalog coverage in production

Read-only query against the production Postgres instance on 2026-10-15. There are 253 active
venues and about 110 non-venue vendors.

| Signal | Vendors with known or estimated value | Ranking use today |
| --- | --- | --- |
| `editorial_summary` or `style_tags` (active venues) | 178 of 253 | Keyword match only |
| `location_setting_class` | 133 | Unused by v1 |
| `capacity_seated_max` | 96 | Veto and capacity comfort |
| Coordinates (`latitude`, `longitude`) | 71 | Unused (v2 distance not connected) |
| `rating_google` and review count | 60 | Reviews component |
| Any price signal (active venues) | 49 of 253 | Cost; `price_estimate_total_aud` exists for 1 vendor |
| Room-level rows (`wedding_vendor_rooms`) | 5 vendors, 20 rooms | Display only |
| `wheelchair_accessible` | 14 | Veto when declared |

The attribute counts, except the two marked "active venues", span all vendor rows.

Free-text style tags are rich but uncontrolled. Examples: "fairy-lit barn", "relaxed luxury",
"blank canvas", "stay on site", "intimate or large", "cultural weddings".

### 3.5 Assets that already exist but are not used for ranking

| Asset | Where | Gap |
| --- | --- | --- |
| Ranking v2 pure helpers | `weddingVendorRankingV2State.ts`, `weddingVendorLocationUtilityState.ts`, `weddingVendorSeasonalCostState.ts`, `weddingVendorQualityModelState.ts`, `weddingVendorSlotSelectionState.ts` | Exported, unit-tested, never called by `rankCandidate()`. The `rankingPolicyV2` flag is never passed. |
| Experience traits model | `weddingExperienceModelState.ts` | Derives traits such as "warm and intimate" or "relaxed, low-formality" from inspiration, with fit and trade-off regexes. It is not connected to vendor ranking. |
| Preference conflict model | `weddingPreferenceConflictState.ts` | Detects tensions such as a wide family list against intimacy. Not used for vendor copy. |
| Trade-off pairs | `src/server/wedding_understanding_routes.rs` | The public lead magnet produces "people > spectacle" style pairs but persists nothing, by design. |
| Hosted LLM path | `llm_resolution::read_hosted_anthropic_api_key`; outreach drafting in `wedding_vendor_outreach_routes.rs` | Already used for drafts with a Haiku-class model. It can host the preference interpreter. |
| NDCG gate | `weddingVendorRankingEvaluationState.ts` | Fail-closed gate: at least 40 cases, two judges, at least +0.05. No real corpus exists yet. |
| pgvector | Production Postgres extensions: `vector`, `pg_trgm` | Available. No vendor embeddings exist and no embedding service runs in production. |

---

## 4. Goals and non-goals

### 4.1 Goals

1. The card explains, in the couple's own words, why this vendor fits and what is unconfirmed.
2. Every claim on the card is traceable to a stored fact with authority and source.
3. A couple who says "Intimacy" gets venues ranked by intimacy evidence (room size against guest
   count, intimate-style facets), not by whether the word appears in a blurb.
4. Unknowns become outreach questions, so "low confidence" turns into a next step.
5. Ranking stays one pure, deterministic, versioned scorer. Replay gives identical order.
6. Personalisation improves over time from explicit couple feedback, without opaque ML.

### 4.2 Non-goals

- A learned ranker, an LLM reranker, or collaborative filtering. Interaction volume is too low.
  This keeps the closure spec's threshold of 500 comparisons with outcomes.
- Vector embeddings in this phase (section 7.4 sets the trigger).
- Changes to the outreach send path, approval gates, or the AFP schema's required fields.
- Non-venue facets other than photographers. Venue style facets ship first because the catalog is
  mostly venues; photographer facets follow in a separately gated second pass.

---

## 5. Design principles

1. **Speak in the couple's anchors.** Every visible reason starts from something the couple said,
   saved or rejected.
2. **No claim without evidence.** If no attribute supports a claim, it becomes "not confirmed" plus
   a question.
3. **Unknown is not bad, and not good.** Unknowns take a neutral prior (v2 prior-shrunk fit).
4. **Agents interpret and enrich; the pure function ranks.**
5. **Closed vocabulary over free similarity.** Facets are typed, versioned and few.
6. **Honest scarcity.** One result is a finding ("only one venue fits so far"), and the card must
   offer a way to widen the search.

---

## 6. Target architecture

```
 Intake text, inspiration, feedback
          │
          ▼
 ┌────────────────────────────────────┐   AFP: context/note
 │ A. Preference profile               │   subtype wedding_preference_profile
 │  deterministic phrase map, then     │   supertags wedding_facet:*
 │  interpreter agent for leftovers;   │
 │  the couple confirms in one tap     │
 └──────────────────┬─────────────────┘
                    │ weighted facets + hard constraints + anchors
                    ▼
 ┌────────────────────────────────────┐   Postgres: wedding_vendor_attributes
 │ B. Vendor facets (precomputed)      │   key style_facets, with provenance
 │  derived from numbers and enums,    │
 │  tag dictionary, enrichment agent   │
 └──────────────────┬─────────────────┘
                    ▼
 ┌────────────────────────────────────┐   solid-ui pure functions
 │ C. Ranker, policy v2 (connected)    │
 │  eligibility, availability,         │
 │  prior-shrunk fit with facet match, │
 │  confidence v2, slot selection      │
 └──────────────────┬─────────────────┘
                    ▼
 ┌────────────────────────────────────┐   stored on comparison artifact
 │ D. Reason ledger                    │   (optional fields)
 │  pro, con, unknown per anchor;      │
 │  evidence refs; verify questions    │
 └──────────────────┬─────────────────┘
                    ▼
 ┌────────────────────────────────────┐
 │ E. Card renderer (templates)        │──▶ outreach draft pre-filled with
 │  priority rows, trade-off, CTA      │    the verify questions
 └────────────────────────────────────┘
                    ▲
 Feedback: "Not for us" reasons, select, contact
   → AFP wedding_preference_signal → profile successor
```

Latency: A and B run outside the search path. A runs when intake is saved, B runs offline. C, D and
E stay client-side and pure, so the search path's 95th-percentile latency (P95) is unchanged.

---

## 7. Decision: facets as typed supertags, not embeddings

### 7.1 Options compared

| Criterion | Keyword match (today) | Facet vocabulary (chosen) | Embedding similarity |
| --- | --- | --- | --- |
| "Intimacy" against a venue that says "boutique, private dining room" | Miss | Match via `scale.intimate` | Probable match |
| Can the card say why? | Only the matched word | Yes: facet, anchor and evidence | No; a cosine score is not a reason |
| Deterministic replay | Yes | Yes | Only with frozen model and vectors |
| Uses numbers (capacity against guests) | No | Yes: derived facets | No |
| New infrastructure | None | One vocabulary file, one attribute key | Embedding service, vector column, re-embed jobs |
| Handles the long tail ("Tuscan long-lunch feel") | No | Partly; the interpreter maps it to the nearest facets | Yes |
| Cost per search | 0 | 0 at query time | Vectors stored; one query embed |

### 7.2 Why facets are enough now

- The catalog is small (253 venues) and already curated with tags. A closed vocabulary of about 60
  facets captures most of what couples ask for.
- The card's main job is explanation. Facets produce named reasons, and vectors do not.
- Facet matching can combine text with numbers. Intimacy is better measured by the smallest room's
  capacity against the guest count than by any wording.
- It reuses existing machinery: attribute provenance, authority, time-to-live (TTL) and the
  operator editor.

### 7.3 How "kind" and "supertags" are used

Vendors are Postgres rows, not AFP messages. They carry facets as an attribute. AFP messages carry
facets as supertags. Both use the same vocabulary.

| Thing | Representation |
| --- | --- |
| Vocabulary | One versioned definition (`wedding_facets` v1), loaded by both TypeScript and Rust. Each facet has an id, dimension, label, couple-facing phrase, synonyms, conflicting facets, and an optional derivation rule. |
| Vendor facets | New attribute key `style_facets`, kind Tags, values restricted to vocabulary ids. Each value carries a confidence and a short evidence quote in the attribute `notes`, or a structured value of `{facet, confidence, evidence}`. Normal authority and TTL rules apply. |
| Couple profile | AFP message: `type: context`, `kind: note`, `subtype: wedding_preference_profile`. Supertags include `wedding_facet:scale.intimate` and similar, so search and the knowledge graph see them. |
| Comparison artifact | Optional supertags for matched facets, plus a `profile_ref` to the profile message id. |
| Feedback | AFP `subtype: wedding_preference_signal` with `references` to the comparison and vendor. |

The supertag form is `wedding_facet:<dimension>.<value>`, for example
`wedding_facet:setting.waterfront`.

### 7.4 When to add embeddings

Add embeddings only for **retrieval recall**, never as a displayed reason. Do this when either
trigger is met:

1. More than 20% of couple phrases are left unmapped after the interpreter, measured over 30 days
   of profiles.
2. The evaluation corpus shows a style-matching gap the facets cannot close: two or more cases
   where judges rate a candidate relevant for style and facet match is at or below 0.3.

When added, use pgvector (already installed) on `editorial_summary` plus `style_tags`. Use it only
to widen the candidate pool before the pure ranker runs.

---

## 8. Facet vocabulary (v1)

### 8.1 Dimensions and initial values

Keep the first version near 60 values. Add values only through a versioned change.

| Dimension | Values (ids) | Primary vendor evidence |
| --- | --- | --- |
| `scale` | `intimate` (≤ 60), `mid` (61–150), `large` (151+), `flexible_rooms` | Derived from capacities and rooms against the couple's guest count; tags such as "boutique" or "private room" |
| `setting` | `waterfront`, `beach`, `harbour`, `garden`, `vineyard`, `country`, `bushland_mountain`, `city`, `rooftop`, `heritage_estate`, `industrial` | `location_setting_class` enum mapping, tag dictionary |
| `atmosphere` | `warm`, `relaxed`, `elegant`, `grand`, `romantic`, `lively`, `calm` | Tags, summary, experience-trait rules |
| `aesthetic` | `modern_minimal`, `classic`, `rustic`, `bohemian`, `ornate_glam`, `natural_organic`, `blank_canvas` | Tags, summary |
| `experience` | `food_led`, `views_led`, `party_late`, `exclusive_use`, `all_in_one`, `diy_flexible`, `stay_on_site`, `cultural_ceremonies` | Inclusions, booleans, curfew, tags |
| `practical` | `accessible`, `public_transport`, `parking`, `wet_weather_backup`, `ceremony_and_reception`, `kids_friendly`, `pets_ok`, `byo` | Boolean attributes |

### 8.2 Facet definition shape

```json
{
  "id": "scale.intimate",
  "dimension": "scale",
  "label": "Intimate",
  "couple_phrase": "a small, close-feeling room",
  "synonyms": ["intimate", "intimacy", "small", "cosy", "cozy", "close", "boutique",
               "private dining", "private room", "small group"],
  "conflicts": ["scale.large", "atmosphere.grand"],
  "derive": { "rule": "smallest_room_fit", "max_ratio": 1.6 }
}
```

### 8.3 Derivation rules (deterministic, vendor side)

| Rule | Logic | Confidence |
| --- | --- | --- |
| `smallest_room_fit` (`scale.intimate`) | Use the smallest room with `capacity_seated ≥ guests`, or else the venue's `capacity_seated_max`. Match when capacity ÷ guests ≤ 1.6. Partial when ≤ 2.5. Conflict when > 4 and no smaller room exists. Unknown when no capacity is stored. | The capacity attribute's confidence |
| `setting_class_map` | `iconic_waterfront` gives `setting.waterfront` and `experience.views_led`. `heritage_garden` gives `setting.heritage_estate` and `setting.garden`. Other enum values map the same way. | 0.8 × the attribute's confidence |
| `boolean_map` | `wheelchair_accessible` gives `practical.accessible`, `accommodation_on_site` gives `experience.stay_on_site`, and so on. | The attribute's confidence |
| `tag_dictionary` | Synonym lookup over `style_tags` and `editorial_summary`. Tags match whole tokens or phrases. | 0.7 for tags, 0.6 for summary |
| `enrichment_agent` | See section 10.2. | At most 0.6, authority `inferred` |

Derived facets are computed at enrichment time and stored. They are recomputed when an input
attribute changes. `scale.intimate` depends on the couple's guest count, so it is computed at rank
time from stored capacities. That is cheap and pure.

### 8.4 Couple-side mapping

| Couple input | Facet output |
| --- | --- |
| Priority text, such as "Intimacy" | Synonym lookup gives `scale.intimate` (strong) and `atmosphere.warm` (nice-to-have) |
| Atmosphere text | Synonym lookup |
| Guest count | Sets the reference for `scale` derivation. No facet is added unless the couple names a scale. |
| Location text | Not a facet. It feeds the location component and its anchor ("near Bondi"). |
| Inspiration traits (`weddingExperienceModelState`) | `warm_intimate` gives `atmosphere.warm` and `scale.intimate`. `relaxed_low_formality` gives `atmosphere.relaxed`. `place_led` gives `experience.views_led`. These are added as nice-to-have unless confirmed. |
| Unmapped phrases | Sent to the preference interpreter agent (section 10.1) |

The experience trait rules and the new vocabulary must share one synonym source. Do not keep two
regex lists. Extend `weddingExperienceModelState.ts` to read the vocabulary rather than duplicate it.

---

## 9. Ranking changes

### 9.1 Connect policy v2 (prerequisite)

Inside `rankCandidate()`, when `WEDDING_VENDOR_RANKING_POLICY_V2` is on:

- use `weddingVendorPriorShrunkFit` instead of `computeFit`;
- use `weddingVendorLocationUtility` with stored coordinates, falling back to tokens;
- use `weddingVendorEffectiveCost` for cost, including per-head, minimum spend and seasonal
  estimates;
- use `weddingVenueQualityScore` and `weddingVendorSentimentScore` as components;
- use `weddingVendorConfidenceV2`;
- pass `rankingPolicyV2: true`, `fitUpper`, `availabilityProbability`, `styleTags`,
  `locationSettingClass` and `suburb` to `selectWeddingVendorShortlist`.

`weddingVendorRankingState.ts` is at 977 lines. The v1 component functions must move to a module
such as `weddingVendorUtilityComponentsState.ts` before anything is added. The orchestrator must
end smaller than it is today.

### 9.2 Facet match replaces the style component

For each profile facet `f` with weight `w_f`, where must is 3, strong is 2 and nice is 1:

| Vendor evidence for `f` | `m_f` | Confidence `c_f` |
| --- | --- | --- |
| Vendor has `f` | 1.0 | the facet's confidence |
| Vendor has a related facet in the same dimension (for example `mid` when `intimate` is wanted, with flexible rooms) | 0.5 | the facet's confidence |
| Vendor has a facet listed in `f.conflicts` | 0.0 | the conflicting facet's confidence |
| No evidence | prior 0.5 | 0 |

Style value is `Σ w_f (c_f·m_f + (1−c_f)·0.5) / Σ w_f`. Style confidence is the weighted mean of
`c_f`.

This removes the "keyword miss = 0" defect. A conflict lowers the score only when there is evidence
for it.

### 9.3 Must-have facets

When the couple confirms a facet as a must-have, a decisive conflict excludes the vendor. A
decisive conflict means confidence ≥ 0.7, for example a 400-seat ballroom with no smaller room for
an intimate wedding of 40. A non-decisive conflict becomes a risk flag. Unknown becomes a verify
question. This reuses the existing eligibility pattern.

### 9.4 Component weights

The closure spec's v2 venue weights stay. "Style and preferences" (0.20) becomes "Facet match".
When the profile marks a dimension as the couple's top priority, the weights may shift by up to
0.06 toward the matching component. This extends closure spec 5.3.4. The shift is deterministic,
versioned and recorded on the candidate.

### 9.5 Reason ledger

Each ranked candidate gets an optional `reasons` array, built during ranking:

```ts
type WeddingVendorReason = {
  id: string;                     // stable, e.g. "facet:scale.intimate", "location", "cost"
  anchor: string | null;          // the couple's own words, e.g. "Intimacy", "near Bondi"
  anchorSource: "priority" | "atmosphere" | "location" | "budget" | "guests"
    | "inspiration" | "feedback" | null;
  polarity: "pro" | "con" | "unknown";
  strength: "decisive" | "supporting";
  claim: string;                  // template output, see 11.4
  evidence: Array<{
    attributeKey: string;
    value: unknown;
    authority: string;
    sourceUrl: string | null;
    retrievedAt: string | null;
  }>;
  verifyQuestion: string | null;  // set when polarity is "unknown"
  weight: number;                 // used for ordering on the card
};
```

Rules:

- Every `pro` and `con` needs at least one evidence item. A validator drops any reason without one.
- Each couple anchor gets exactly one reason row: its best match, or one `unknown`.
- `verifyQuestion` text is written for the outreach draft, for example: "What is the seated
  capacity of your smallest private room? We expect about 60 guests."
- Reasons are stored on the comparison artifact as optional fields. v1 artifacts render unchanged.

### 9.6 Honest result count

- **3 candidates:** normal comparison.
- **1 or 2 candidates:** the header says how many fit and why. Up to two "near misses" come from
  the `excluded` list, each with the constraint it failed. The card offers "widen" actions that name
  the binding constraint: "Include venues up to 30 km away", "Allow cocktail-style reception",
  "Show venues without price on record". Each widen action reruns the pure ranker with one relaxed
  input. None changes the saved profile without confirmation.

---

## 10. Where AI agents help (and where they must not)

Every agent below emits an AFP message for its output. Each runs through one shared provider
ladder: Cerebras first, Mistral second, and `claude-haiku-5-5` only when both fail (section 18).
A provider is skipped when its key is missing, its call fails, or its output fails validation. Each
agent has a deterministic fallback when the whole ladder fails.

### 10.1 Preference interpreter (new, runs on intake save)

- **Input:** the couple's free text (priorities, atmosphere, vendor preferences), guest count, and
  the facet vocabulary.
- **Output (JSON, validated):**
  ```json
  {
    "facets": [
      {"id": "scale.intimate", "weight": "strong", "anchor": "Intimacy",
       "reading": "a small, close-feeling room"}
    ],
    "hard_constraints": [{"key": "wheelchair_accessible", "anchor": "Nan uses a wheelchair"}],
    "tradeoffs": [{"prefer": "atmosphere.warm", "over": "experience.views_led", "anchor": "..."}],
    "unmapped": ["Tuscan long-lunch feel"],
    "clarifying_question": "Is a small room a must-have, or a nice-to-have?"
  }
  ```
- **Validation:** facet ids must exist in the vocabulary. Each anchor must be a substring of the
  couple's input. Hard constraints must use existing requirement keys. Anything else is dropped.
- **Run order:** the deterministic synonym map runs first. The agent is called only when phrases
  remain unmapped or ambiguous. Results are cached by the material fingerprint.
- **Persistence:** a `wedding_preference_profile` AFP message. Each change is a successor with
  `parent_id`. The message is never mutated.
- **Couple confirmation:** one row of chips, such as "We read 'Intimacy' as: small room, warm
  feel". Each chip can be tapped to change must, nice or remove. Confirmation upgrades the facets'
  confidence to 1.0 and authority to `user`.

### 10.2 Catalog facet enrichment (new, offline batch)

- **Input:** the vendor's stored `style_tags`, `editorial_summary`, room descriptions, and official
  page text that is already stored. It never fetches arbitrary URLs.
- **Output:** facets, each with an evidence quote.
- **Validation:** the quote must be a verbatim substring of the input. The facet must exist.
  Confidence is capped at 0.6 and authority is `inferred`.
- **Governance:** it runs under the existing C8 enrichment rule. Every write batch needs explicit
  operator approval. Operator edits upgrade authority to `operator`. Each batch emits an AFP
  receipt (`subtype: wedding_vendor_facet_enrichment_receipt`) listing the vendors and the facet
  counts. Add this type to the relevant daemon `outbound_allowlist` if a daemon runs it.
- **Second job:** propose capacity and price values from stored official-page text, each with a
  source quote. They are written as `estimated`, `primary_official`, after operator approval. This
  is the biggest lever on ranking quality (section 3.4).

### 10.3 Rationale writer (optional, last phase)

The card ships with templates (section 11.4). Add an LLM writer only if couple testing shows the
templates read as robotic. If added:

- It may only rephrase claims in the reason ledger. A validator checks that every number, name and
  facet in the output appears in the ledger. On failure, the card falls back to templates.
- It runs server-side, once per comparison, and its output is cached on the artifact.

### 10.4 What agents must not do

- **Rank or rerank.** It would break deterministic replay, the NDCG gate, the one-scorer rule, and
  the P95 latency target.
- **Write facts the couple sees without validation and provenance.**
- **Infer sensitive attributes** (religion, culture, disability) from names or photos. Cultural or
  accessibility facets come only from what the couple states or what the vendor states.

---

## 11. Card presentation

### 11.1 Mobile layout (one vendor in view)

```
┌────────────────────────────────────────┐
│ [photo or honest placeholder]          │
│                                        │
│ Only venue that fits so far            │  ← count-aware header (11.3)
│ Bondi Icebergs Club                    │
│ Bondi Beach · ocean-pool views         │  ← 2 strongest vendor facets
│                                        │
│ FOR WHAT YOU ASKED                     │
│ ✓ Near Bondi        On the beach       │  ← one row per couple anchor
│ ? Intimacy          Has private rooms; │
│                     size not confirmed │
│ ? Budget $30k       No price on record │
│                                        │
│ WORTH KNOWING                          │  ← at most 1 trade-off or note
│ Iconic spot: October Saturdays tend    │
│ to book early (indicative).            │
│                                        │
│ WE'LL ASK THEM                         │  ← verify questions → outreach
│ • Smallest private room for 60?        │
│ • Price and minimum spend for Oct 2027?│
│                                        │
│ [  Check availability & price  ]       │  ← one primary action, min-h-12
│  Website · Contact · Not for us        │  ← quiet secondary row
│                                        │
│ Based on 6 checked facts · 2 to confirm│  ← replaces "low confidence"
└────────────────────────────────────────┘
```

### 11.2 Element rules

| Element | Rule |
| --- | --- |
| Header line | Count-aware: "Your best match", "Best of 3 matches", "Only venue that fits so far". Never "#1 recommendation" when only one result exists. |
| Facet subline | The vendor's two highest-confidence facets that relate to the couple's facets. Fall back to the setting facet. |
| "For what you asked" rows | One row per couple anchor, ordered by weight. At most 4 rows on mobile, with a "+2 more" disclosure. Icons: ✓ pro, ✗ con, ? unknown. Each row needs a text label as well as the icon. |
| "Worth knowing" | At most one line: the highest-weight `con`, or a seasonal or demand note. It must be marked "indicative" when estimated. |
| "We'll ask them" | Verify questions from `unknown` reasons, at most 3. The primary action pre-fills the outreach draft with exactly these questions. |
| Primary action | The semantic intent from `weddingVendorChoiceActionState`: "Check availability & price", "Review quote", or "Start booking". Pressing it also marks the vendor as selected for follow-up. There is no separate toggle on mobile. |
| Secondary row | Website, Contact (opens details sheet), Not for us (opens feedback, 11.5). Text links, each with a target of at least 44px. |
| Evidence line | "Based on N checked facts · M to confirm". N counts known decisive and supporting evidence. M counts unknown anchors. |
| Numeric fit | Hidden on the card. It is shown in a "Why this ranking" sheet together with the components, weights and sources. |
| Fit word | Shown only when confidence is medium or high: "Strong match" (fit ≥ 75), "Good match" (60–74) or "Partial match" (45–59). Below that, or at low confidence, show nothing. The anchor rows carry the message. |

### 11.3 Remove or change

- Remove the decision card's bottom "Recommendation" block for vendor comparisons with one
  candidate. With two or more candidates, replace it with a comparison sentence built from the
  ledgers (11.4).
- Remove the footer chips "#1 ⟨vendor⟩" and "Links included" from the mobile vendor deck.
- Remove the duplicated "Strong on: …" and "… looks strong" labels. Anchor rows replace both.
- Remove `comparisonRecommendationHandoff()`'s "available option to assess against …" template.

### 11.4 Copy templates

Templates are filled only from ledger fields.

| Situation | Template |
| --- | --- |
| Pro, decisive | "✓ {anchor} — {vendor evidence phrase}" (for example "✓ Near Bondi — on the beach, 0.4 km") |
| Pro, supporting | "✓ {anchor} — likely: {evidence phrase}" |
| Unknown | "? {anchor} — {what we know}; {what is missing}" |
| Con | "✗ {anchor} — {evidence phrase}" (for example "✗ Intimacy — main room seats 300") |
| Comparison sentence, 2 or more candidates | "{A} fits {anchor1} best; {B} is stronger on {anchor2}." Use it only when both claims are pro reasons with evidence. Otherwise omit it. |
| Single result | "{count} venue fits {must-have anchors} so far." Follow it with widen actions. |

Banned phrasings, enforced by a unit test over generated copy: "available option", "assess
against", "fit requires", "review manually", and any anchor shown with ✓ when its reason is not a
`pro`.

### 11.5 "Not for us" feedback

Tapping "Not for us" opens a one-tap reason sheet: "Too big", "Not our style", "Too far", "Too
expensive", "Other". It records a `wedding_preference_signal` AFP message with the vendor's facets
and the reason. The vendor drops from the current deck. The profile is not changed silently
(section 12).

### 11.6 Desktop

The desktop comparison table uses the anchor rows as table rows, one per couple anchor, with ✓, ?
or ✗ per vendor. They replace "Preference match", "Situation fit" and "Why surfaced". The
multi-select "Confirm selected vendors" flow stays on desktop.

---

## 12. Learning from feedback (deterministic)

| Signal | Effect |
| --- | --- |
| "Not our style" on a vendor with facets F | Each `f` in F not in the profile gains a negative weight of −0.5 nice. It is capped and decays after 90 days. |
| "Too big" | Raises `scale.intimate` or `scale.mid` by one step, as a suggestion. |
| "Too far" or "Too expensive" | Proposes a tighter location or budget constraint. |
| Primary action pressed (contact) | Each facet of that vendor already in the profile gains +0.25 confidence, capped. |
| Three or more consistent rejections | Shows one confirmation prompt: "You've passed on 3 large venues. Make 'intimate' a must-have?" |

Rules:

- Weight changes are deterministic functions of the signal log. The profile successor records
  `derived_from_signals: [ids]`.
- A must-have constraint is never created without the couple's confirmation.
- Signals are scoped to the wedding plan. They are never shared across users.

---

## 13. AFP and data model changes

All additions are optional. No required fields are added to `MessageSchema`.

| Item | Change |
| --- | --- |
| `wedding_preference_profile` | New AFP message: `type: context`, `kind: note`, `subtype: wedding_preference_profile`. Thread is the wedding context thread. Content holds facets with weight, anchor, source and confidence, plus hard constraints, trade-offs, unmapped phrases, `vocabulary_version`, and `derived_from_signals`. Supertags: `wedding`, `wedding_preference_profile`, and `wedding_facet:*`. Successors use `parent_id`. |
| `wedding_preference_signal` | New AFP message: references the comparison artifact and vendor, with reason, vendor facets and timestamp. `metadata.store` stays true, because it affects later outcomes. |
| `wedding_vendor_facet_enrichment_receipt` | New AFP audit message per enrichment batch. |
| Comparison artifact | Optional: `profile_ref`, `vocabulary_version`, per-candidate `reasons[]`, `anchor_rows[]`, `widen_actions[]`, and supertags for matched facets. |
| `attribute_catalog.rs` | New key `style_facets` (Tags, all categories, group "fit"). Values are validated against the vocabulary. |
| Vocabulary | One versioned definition loaded by TypeScript (ranker, interpreter validation, UI labels) and Rust (attribute validation, enrichment validation). Its path must work inside the Rust Docker build context. The task writer should confirm that before choosing a location. |
| Migration | Only if the attribute CHECK constraints or the export view need it. Use the next free number, and keep it additive. |
| `ranking_policy_version` | This work extends v2 before v2's first release, so it stays "2". If v2 ships first, use "3". A policy change creates a successor comparison, as closure spec 5.11 describes. |
| Material fingerprint | Add the profile message id and the vocabulary version, so a confirmed profile change triggers a fresh comparison. |

---

## 14. Evaluation

The existing fail-closed gate stays: at least 40 real-catalog cases, two judges, NDCG@3 improved by
at least 0.05, and no case worse by more than 0.15. Add these personalisation probes. Each one must
always pass:

1. **Intimacy probe:** 50 guests, priority "Intimacy". A venue with a 60-seat private room ranks
   above an otherwise similar venue whose smallest room seats 300.
2. **Keyword-echo probe:** a sparse vendor whose snippet repeats the couple's words ranks below a
   well-evidenced vendor with matching facets.
3. **No-false-tick probe:** no rendered ✓ row lacks a `pro` reason with evidence.
4. **Contradiction probe:** the copy never names an anchor as a strength when its reason is `con`
   or `unknown`. This is the screenshot defect.
5. **Unknown-neutral probe:** removing a vendor's style tags moves its facet score toward 0.5, not
   to 0.
6. **Feedback probe:** after three "Too big" signals, the next comparison shows a confirmation
   prompt. It does not apply a silent constraint.
7. **Replay probe:** the same profile, catalog snapshot and policy version give identical order and
   identical ledgers.

Report these numbers:

- the share of couple anchors with a `pro` or `con`, not `unknown`, in the top three ("explained
  coverage");
- the unmapped-phrase rate (the embedding trigger in section 7.4);
- the "Not for us" rate on rank 1.

---

## 15. Delivery phases

Each phase can ship on its own. Phases 1 and 2 land behind the existing v2 flag.

| Phase | Scope | Depends on | Acceptance |
| --- | --- | --- | --- |
| **P0 — Truthful card (no ranking change)** | Remove the "assess against" template. Render anchor rows from existing v1 components, using location, cost and capacity anchors plus one priority row marked "?" when style is unknown or 0. Hide the numeric fit at low confidence. Use one primary action plus a secondary row. Remove the footer chips. Use the count-aware header. | none | The screenshot scenario renders "✓ Near Bondi" and "? Intimacy — not confirmed". The banned-phrase test passes. Targets are at least 44px. The 360×740 Playwright check passes. |
| **P1 — Connect v2 and shrink the orchestrator** | Move the v1 components out. Call the v2 helpers behind the flag. Pass the slot-selection inputs. | none | `weddingVendorRankingState.ts` is under 900 lines. Flag off gives byte-identical v1 output. Flag on runs the closure spec probes. |
| **P2 — Facet vocabulary and deterministic matching** | Vocabulary v1. Vendor derivation rules: enum map, booleans, tag dictionary, `smallest_room_fit`. Deterministic couple synonym map. Facet-match component. Reason ledger. Connect anchor rows to the ledger. | P1 | Probes 1–5 and 7 pass on fixtures. At least 60% of active venues get one or more facets with no LLM involved. |
| **P3 — Evaluation corpus** | At least 40 cases from the sanitised active catalog, two judges, graded relevance, personalisation probes. | P2 (can start in parallel) | `assessWeddingVendorRankingV2Gate` passes. Otherwise the flag stays off and the report lists the failing cases. |
| **P4 — Preference interpreter and confirmation chips** | Agent call on intake save, validation, profile AFP message, confirmation chip UI, fingerprint update. | P2 | Unmapped-phrase rate is measured. Invalid facet ids and non-substring anchors are rejected in tests. With no key, the deterministic fallback runs. |
| **P5 — Catalog enrichment** | Facet enrichment and capacity/price proposals, operator approval UI, AFP receipts. | P2 | Coverage report before and after. Every written value has a verbatim source quote. No write happens without approval. |
| **P6 — Feedback loop** | "Not for us" sheet, signal messages, profile successors, confirmation prompt. | P4 | Probe 6 passes. A signal never creates a must-have without confirmation. |
| **P7 — Release** | Turn the v2 flag on for a staged cohort once the P3 gate passes. | P3, P5 | Gate evidence is recorded in the handoff notes. NDCG and explained coverage are reported. |
| **P8 — Optional** | LLM rationale writer (10.3). Embedding recall (7.4). | trigger met | Each needs its own evidence of need. |

---

## 16. Constraints for implementers

- Ranking, facet matching and ledger building are pure TypeScript with no DOM or network. Each
  file stays under 1000 lines. Split the logic into focused modules, for example a vocabulary
  module, a facet derivation module, a facet match module, a reason ledger module and a preference
  profile module. Do not grow `weddingVendorRankingState.ts`.
- Do not duplicate synonym lists or trait regexes. Make `weddingExperienceModelState.ts` read the
  vocabulary.
- Wedding components use the wedding palette in `tailwind.config.cjs`. Do not use the blue primary
  tokens.
- Error messages state what failed, why, and how to fix it. Interpreter or enrichment failures must
  fall back visibly, not silently.
- Do not commit production data or couple text into fixtures. The evaluation corpus uses sanitised
  vendor rows and synthetic couple profiles.
- Any write to the production catalog is an operator-approved batch.

---

## 17. Risks

| Risk | Mitigation |
| --- | --- |
| The facet vocabulary misses how couples talk | The interpreter maps leftovers. The unmapped rate is tracked. Vocabulary versions add values. Embedding recall is the fallback trigger. |
| LLM-inferred facets are wrong | Confidence is capped at 0.6, a verbatim quote is required, operators review, and the card shows the facet as "likely". |
| Thin data still leaves cards mostly "?" | P5 enrichment targets price and capacity first. "?" rows turn into outreach questions, which still moves the couple forward. |
| Copy becomes long on mobile | At most 4 anchor rows, 1 note and 3 questions. The rest goes behind disclosures. |
| The v2 gate blocks release indefinitely | P0 ships the truthful card without any ranking change. The gate needs two human judges (open question 1). |
| Privacy of preference signals | They are scoped to the plan, stored as AFP messages under the existing privacy scope, never cross-user, and never used to infer sensitive traits. |

---

## 18. Decisions and open questions

Decided by the user on 2026-10-15:

1. **Judges:** Casper and Iris are the two independent judges for the evaluation corpus.
2. **Lead-magnet trade-off pairs:** import them automatically after account creation **or when an
   existing account holder next signs in**, with no modal. The import is idempotent per local
   result and plan, so a result is never duplicated across sign-ins. Show a clear, friendly,
   non-blocking confirmation afterwards. The visitor's browser keeps the result for up to 30 days.
   Only model output is kept, never raw text or images. Imported facets start as nice-to-have until
   the couple confirms them.
3. **Model ladder:** every wedding LLM feature uses Cerebras (`qwen-3.8-27b`) first, Mistral
   (`mistral-small-latest`) second, and `claude-haiku-5-5` only when both fail. This covers the
   outreach drafter, the interpreter and catalog enrichment. The ladder already exists for
   outreach on `agent/codex/WED-185`, and will be extracted into a shared module.

4. **Facet rollout order:** derive and release venue style facets in the first pass. After the
   venue pass is evaluated and stable, add the minimal photographer facet set (`aesthetic.*` and
   `atmosphere.*`) as the next pass; do not mix photographer data into the venue gate or corpus.

The task plan is `wedding-vendor-personalised-recommendation-tasks.md` in this folder.

# OmnyID Weddings: Small-Wedding Alignment Spec

Date: 2026-11-17
Status: Draft for owner review. Not registered in `.agent/TASKS.yaml`.
Owner: TBD. Reviewer: TBD (the agent that doesn't implement reviews).
Scope: `wedding/` marketing site and the Wedding Planning template in `solid-ui/`. No changes to
`typescript-sdk/`, `src/` (Rust), `proto/` or `postgres/migrations/`.
Source brief: [omnyid wedding small-wedding message alignment.md](omnyid%20wedding%20small-wedding%20message%20alignment.md).
Brief IDs (`MSG-`, `LP-`, `SP-`, `TPL-`, `TASK-`) are cited as "brief LP-02" and so on.
Tasks: [omnyid wedding small-wedding alignment tasks.md](omnyid%20wedding%20small-wedding%20alignment%20tasks.md).

---

## 0. Summary

Narrow the wedding message to couples aged 24–33 who are eloping or planning a micro wedding,
without redesigning anything.

- **Website:** rewrite copy, swap demo data and images, and remove unverified claims on
  `omnyid.com/wedding/`. Keep the existing section order, which follows the customer journey.
- **Template:** add one **optional** wedding format signal (`elopement | micro | undecided | larger`).
  Use it only to change defaults, ordering, emphasis and copy. Plans without a format behave exactly
  as they do today.
- **AFP:** no schema change and no new message type or subtype. Two existing message subtypes get
  optional content fields. A format change after a profile has been saved creates a **new**
  superseding message. Nothing already sent is ever changed.

Copy in brief §4 and §5 is the **copy deck**. This spec makes it binding with the resolutions in §2,
and adds the behaviour, data contract and tests.

---

## 1. Goals and non-goals

### 1.1 Goals

| ID | Goal | Measured by |
| --- | --- | --- |
| G1 | A first-time visitor can tell from the first viewport that this is a planner for intimate weddings | Brief §8 checklist; 5-second test in the brief's interview round |
| G2 | No unverified statistic, review-like quote, live-availability claim or legal overclaim on `/wedding` | Smoke-test guards (§9.2) |
| G3 | Elopement, micro and undecided couples get format-appropriate first steps in the template | Unit tests (§9.1) |
| G4 | Existing plans, routes, AFP history and larger weddings are unaffected | Regression tests; no-format snapshot tests |

### 1.2 Non-goals

- The PGJ four-context selector, contextual demo engine and campaign-intent framework.
- Migrating the landing CSS or `WeddingSiteIntakeWizard` from rose classes to the Deep Teal wedding
  tokens. That is separate visual work (brief TASK-P2-06).
- Partner invite and sharing changes (brief TPL-12). This spec only audits them (§8.1).
- New blog posts, lead magnets, analytics vendors or research fieldwork (brief TASK-P2-05, P2-07,
  P2-08).
- Age capture of any kind.

---

## 2. Decisions

### 2.1 Settled by this spec

| # | Question (brief §9) | Decision |
| --- | --- | --- |
| D1 | CTA text | Switch every register CTA's text to **"Plan our kind of wedding"**. There's no A/B infrastructure on the static site, so the decision is a full switch. |
| D2 | Hero format chips | Ship in Slice C **together with** deep-link handling (§6.9). Never ship the chips before the template can read them. |
| D3 | "A bigger celebration" | Include it as the fourth format option, value `larger`. |
| D4 | Testimonial slider | Keep it as labelled illustrative scenarios (brief LP-11). |
| D5 | First scenario caption | Change "Hunter Valley planning scenario" to "Blue Mountains planning scenario". |
| D6 | Pricing line "one price, two or forty" | Publish only after the claims audit (§8.1) confirms no guest-count limit on any plan. |
| D7 | Preview section H2 | Keep the current H2 "One screen. Every part of your wedding, at a glance." |
| D8 | Review-step CTA in the wizard | "Make our starter plan". Don't change it again later. |
| D9 | Blog hub | Reorder cards to put the small-wedding posts first and change the H1. Add no new filter category and publish no draft posts in this scope. |
| D10 | Stats band values | See §5.4. Every value is a product fact or official rule that the audit confirms. |

### 2.2 Needs owner sign-off before the tasks start

Each item has a default. The tasks proceed with the default unless the owner overrides it.

| # | Item | Default |
| --- | --- | --- |
| S1 | Canonical demo scenario (§4) | As written |
| S2 | Format thresholds for inference: ≤10 elopement, 11–40 micro, >40 larger | As written |
| S3 | Witness task for `elopement` and `micro` only, not `larger` | As written |
| S4 | Collapse Seating and Helpers for elopement plans (§6.8) | As written |

---

## 3. AFP contract

This section is normative. Any implementation that conflicts with it is wrong.

### 3.1 What does not change

- `typescript-sdk/src/index.ts` `MessageSchema`: **no change**.
- No new AFP `type`, `kind` or `subtype`. So there are no `outbound_allowlist`, `output_contract`,
  `DAEMON_PRESETS` or `ViewDispatcher` changes.
- No Rust, migration or homeserver route change. The format value travels inside message `content`
  through the existing send path (`weddingProjectionQueueState` → projection dispatch).
- No `branch_id`, `workspace_id` or `ephemeral` use. Knowledge Curator indexing is unchanged.
- The approval gate is unchanged. Intake-profile messages still go through the projection queue and
  need the user's "Approve planning outputs" action before they are sent.

### 3.2 Optional content fields on existing subtypes

#### `context` / `note` / `wedding_intake_profile`

Built by `weddingIntakeProfileToAfpMessage` in `weddingIntakeProfileAfpProjectionState.ts`.

| Location | Field | Type | Rule |
| --- | --- | --- | --- |
| `content` | `wedding_format` | `"elopement" \| "micro" \| "undecided" \| "larger" \| null` | Optional. Omitted or `null` when not chosen. |
| `content` | `wedding_format_source` | `"explicit" \| "deep_link" \| "extracted" \| null` | Optional. How the stored value was chosen. **Never `"inferred"`** (§3.4). |
| `content` | `supersedes_message_id` | `string \| null` | Present only on a revision (§3.3). |
| `views[0].content.fields` | `wedding_format` | same as `content.wedding_format` | Optional. Keeps the structured view in step with the content. |
| `metadata.searchable_terms` | display label, e.g. "Elopement" | string | Added only when a format is set. |
| `supertags` | `wedding_format:<value>` | string | Added only when a format is set. The format is low-sensitivity planning data. |

#### `wedding_need_to_know`

Built in `weddingNeedToKnowAfpProjectionState.ts`.

| Location | Field | Type | Rule |
| --- | --- | --- | --- |
| `content.planning_context` | `weddingFormat` | same enum as above, or `null` | Optional. It is written as part of the existing `planningContext` object, so no new serialisation code is needed. |

**Reader rule.** Every reader must accept `weddingFormat ?? wedding_format`. Unknown strings, missing
fields and non-string values parse to `null`. Use `parseWeddingFormat` (§6.1). A message without the
field must produce exactly today's behaviour.

### 3.3 Append-only revision rule

The intake profile's AFP id is deterministic (`afp-wedding_intake_profile:<workspace>`), and the
projection queue sends it once (`hasSentWeddingIntakeProfileAfpProjection`). There are two cases.

1. **Not yet sent.** If the format changes before the user approves the profile, the pending queue item
   is rebuilt with the new content. Nothing was sent, so nothing is mutated. This is today's
   behaviour.
2. **Already sent.** If the format changes after the profile was sent, queue a **new** intake-profile
   message:
   - `sourceId` = `<profileId>:rev:<UTC timestamp, compact ISO, e.g. 20261117T041500Z>`.
   - `id` = `afp-<sourceId>`.
   - `parent_id` = the message id of the latest known intake profile for this workspace: the newest
     revision if one exists, otherwise `afp-<profileId>`.
   - `references` = the existing source-response reference, plus
     `{ type: "supersedes", target: <parent_id>, label: "Previous intake profile" }`.
   - `content` = the **full** current profile, not a diff, so the message stands alone (AFP
     "Atomic"). It also carries `supersedes_message_id = <parent_id>`.
   - The same `thread_id` (`wedding_context:<workspace>`), the same `type`, `kind` and `subtype`, and
     the approval-gated queue path.
   - The same-id dedupe still applies to each revision `sourceId`.

**Never** re-send or overwrite `afp-<profileId>`, and never delete an older profile.

### 3.4 Canonical versus derived

| Value | Status | Storage |
| --- | --- | --- |
| A format chosen in the UI (explicit), accepted from a deep link, or accepted from extraction | **Canonical** | AFP (§3.2) |
| A format inferred from guest count | **Derived** | Computed at read time by `effectiveWeddingFormat`. Never written to AFP. |
| The pending deep-link format before the wizard reads it | Convenience | `localStorage`, cleared once read (§6.9) |
| The "Show all tools" menu preference | Convenience | `localStorage`, per plan (§6.8) |

### 3.5 Readers must take the latest profile

When several `wedding_intake_profile` messages exist in a thread, readers use the one with the latest
`timestamp`. If two timestamps are equal, the higher `id` wins (string order).

| Reader | Today | Required change |
| --- | --- | --- |
| `src/wedding_vendor_replay.rs` | Sorts by timestamp then id, last one wins | None |
| `solid-ui/src/lib/useWeddingVendorOutreachOwner.ts:164` | `contextMessages.find(...)` returns the **first** profile | Replace with `latestWeddingIntakeProfileMessage(messages)` from `weddingFormatState.ts` |
| `solid-ui/src/lib/weddingPersistedWorkspaceState.ts` (need-to-know context reload) | Reads `planning_context` from `wedding_need_to_know` | Overlay `weddingFormat` from the latest intake profile in the same thread when present. Use the helper so the file grows by no more than about 5 lines (it is at 936 of 999). |

### 3.6 Agent-native behaviour

- `buildWeddingTemplateEntryState().firstResponseInstruction` gets one sentence: "If a wedding format
  is set, begin with that format's first three decisions. Never omit NOIM timing, the authorised
  celebrant or the two-adult-witness requirement." The planning agent's responses stay AFP messages
  on the existing response path. There is no side channel.
- The tasks in §6.7 are ordinary `WeddingPlanningTaskItem`s. They project to first-class task
  messages through the existing calendar and task projection, with no new task store.

### 3.7 Privacy

- The format is low-sensitivity planning data. It may appear in supertags and searchable terms.
- Never collect, infer or store age. Age is for media targeting only, outside the product.
- The deep-link value is read only from an allowlist (§6.9), is never rendered raw, and is not kept
  after the wizard consumes it.

---

## 4. Canonical demo scenario

The landing preview (brief LP-06) and the template demo (brief TPL-07) both use this scenario. All
names are fictional. Before shipping, check that no venue name matches a business in the
`wedding_vendors` directory or a real Sydney business found by web search. Rename any that clash.

| Field | Value |
| --- | --- |
| Couple | Sam & Alex. URL label `omnyid.com/plan/sam-and-alex` |
| Format | Micro wedding, 24 guests |
| Place | Inner West Sydney, NSW |
| Date | Autumn 2027. The template demo date is `2027-04-17` (a Saturday). |
| Priorities | personal ceremony, long dinner, photos |
| Budget | A$12,000 total: dinner & room $6,000 · photography $2,800 · attire $1,400 · flowers & other $1,050 · celebrant $750 |
| Budget used | 65%, which matches the hero card "$7,800 of $12,000" |
| RSVPs | 18 of 24 |
| Suppliers booked | 2 of 4 |
| Venue shortlist | Fig & Olive Dining Room (private room, seats 20–40, min. spend applies; **Best fit**) · Laneway Garden Terrace (ceremony + dinner, seats 15–30; **Still to confirm: your date**) · Upstairs at the Corner (seats 24–36; **Min. spend applies**) |
| Decision | "Ceremony spot": **Garden ceremony + dinner** (best fit, left-edge highlight) vs Registry ceremony + private dining room |
| Timeline | Restaurant booked (done) · NOIM lodged with celebrant (done) · Two witnesses confirmed (due) · Final numbers to restaurant (due in 3 weeks) · Ceremony day |
| Draft email | To `celebrant@example.com`. Subject: "Garden ceremony for 24 guests, 17 April". Body mentions a 4pm garden ceremony and a dinner afterwards. |
| Files | Celebrant questions · Budget sheet · Venue comparison · Run sheet (one page) |

The template demo keeps all of its `Sample` prefixes, `demo-only@example.invalid` contacts and
`demoLabels`. The landing preview keeps its "demo data" captions.

---

## 5. Website specification (`wedding/`)

### 5.1 Structure invariants

These must still hold after every website task:

1. Section order in `index.html` is unchanged: hero → location strip → `#how-it-works` →
   `#vendor-flow` → `#preview` → features → gallery → moments → stats → scenarios → CTA → newsletter.
2. Every register CTA keeps `href` `../workspace/?auth=register&source=wedding`. The chips in
   Slice C add `&format=<value>`.
3. The header is unchanged. It contains no "Start planning", "How it works" or vendor links.
4. Existing smoke-test locks still pass: the Sydney-only strip; exactly two
   "Sydney planning scenario" captions; the newsletter strings; the pricing strings; blog card count
   equal to post count; the vendor-flow position; the footer vendor login.
5. One primary CTA per viewport region.

### 5.2 Copy changes

Apply the brief copy exactly, with the §2.1 resolutions.

| Brief ID | File | Notes |
| --- | --- | --- |
| LP-01 | `index.html` `<title>`, meta description | — |
| LP-02 | `index.html` hero | Includes trust item 2 and both floating cards. Add the microcopy "Free to start. No card needed." and the "Only What Matters" sign-off. Chips are Slice C only. |
| LP-04 | `index.html` `#how-it-works` | Step 2 must read "See your first three decisions" **only after** T12 (template next steps) is merged. Before that, use "See your next decisions" without the format example. |
| LP-05 | `index.html` `#vendor-flow` | Text only. The screenshot is unchanged. |
| LP-06 | `index.html` `#preview` | Use §4 data. H2 unchanged (D7). Remove the "AFP workspace" label and the AFP strip text. |
| LP-07 | `index.html` features | Card 1's partner sentence is gated by the audit (§8.1). |
| LP-09 | `index.html` moments | Eyebrow "✦ Small by choice", H2 "The moments that matter most". |
| LP-11 | `index.html` scenarios | See §5.5. |
| LP-12 | `index.html` CTA band | — |
| LP-14 | footer blurb on all pages; sign-in modal register-option text on `index`, `pricing`, `user-guide`, `blog`, `animal-quiz` | The same string on every page. |
| SP-01 | `pricing.html` | The guest-count line needs D6. Don't touch the price strings. |
| SP-02 | `user-guide.html` | Small-wedding callout and H2. |
| SP-03 | `blog.html` | H1 and card order only (D9). |

### 5.3 Images (brief LP-02, LP-08, LP-09; MSG-04)

- **Hero:** replace `elvis-bekmanis-…jpg`. Review these candidates first:
  `commons-signing-the-book.jpg`, `commons-vietnam-candlelit-glasses.jpg`,
  `commons-same-sex-wedding-rainbow-bunting.jpg`.
- **Gallery:** replace the four hot-linked `images.unsplash.com` URLs with local files in
  `wedding/assets/images/`.
- **Moments:** replace image 2 (`mark-zamora-…`, crowd exit). Keep images 1 and 3 only if they read as
  a small celebration.
- **Alt text:** describe the scene without assuming gender or role ("Two people…", "A couple…",
  "A celebrant…").
- **Licensing:** record the source and licence for every new file in the same place as the existing
  Unsplash and Commons images. If no record exists, add it to the task's commit message and the PR
  description.

### 5.4 Stats band (brief LP-10)

Keep the component and its count-up. The values are:

| Value (`data-count-to`, suffix) | Label | Condition |
| --- | --- | --- |
| `0`, `%` | Of your data ever sold or shared | Already in place |
| `1`, ` month` | Minimum NOIM notice we remind you about | The audit confirms NOIM reminders are live |
| `4` | Short setup steps | The wizard has four steps. This is still true after Slice B. |
| `6` | Starter plan documents to choose from | Six starter intents exist. Change to `3` / "First decisions, not a 100-item checklist" in T12's PR. |

Remove the "14+ hrs", "$2,100" and "97%" items completely.

### 5.5 Scenario slider (brief LP-11)

- Three slides, one per format. Use the brief's scenario text and captions as resolved in D5:
  "Blue Mountains planning scenario", then two "Sydney planning scenario" captions.
- Each slide shows the visible text **"Illustrative scenario. Not a customer review."** inside the
  slide, not only in a tooltip.
- Remove `<img>` portraits from `.testi-person`. Use a detail image or no image. Names stay off the
  slides. Each slide carries only the format label.
- H2: "What 'our kind of wedding' can look like".

### 5.6 Truth guards (brief MSG-03)

These strings must not appear in any `wedding/*.html` file after Slice A. The smoke test enforces it
(§9.2):

- "Available your date"
- "handled" within 40 characters of "NOIM"
- "AFP workspace" and "first-class AFP messages"
- `data-count-to="14"`, `data-count-to="2100"` and `data-count-to="97"` in `index.html`

---

## 6. Template specification (`solid-ui/`)

### 6.1 New module: `solid-ui/src/lib/weddingFormatState.ts`

This is the only new source file. It holds all format logic so other files make only small edits.
It contains pure functions only, with no Solid signals and no DOM access except the `localStorage`
helpers named in §6.9. Keep it well under 300 lines.

```ts
export type WeddingFormat = "elopement" | "micro" | "undecided" | "larger";
export type WeddingFormatSource = "explicit" | "deep_link" | "extracted";

export const WEDDING_FORMAT_OPTIONS: ReadonlyArray<{
  value: WeddingFormat; label: string; hint: string;
}>;
// labels: "Just us" · "Our closest people" · "Not sure yet" · "A bigger celebration"
// hints:  "About 0–10 guests" · "About 11–40 guests" · "Compare before you choose" · "41 guests or more"

export function parseWeddingFormat(value: unknown): WeddingFormat | null;      // allowlist only
export function inferWeddingFormatFromGuestCount(guestCount: unknown): WeddingFormat | null;
export function effectiveWeddingFormat(context: {
  weddingFormat?: unknown; guestCount?: unknown;
} | null | undefined): WeddingFormat | null;  // explicit value first, then inference
export function weddingFormatLabel(format: WeddingFormat): string;
export function latestWeddingIntakeProfileMessage<T extends {
  subtype?: string | null; timestamp: string; id: string;
}>(messages: readonly T[]): T | null;                                         // §3.5
export function weddingFormatFromWorkspace(state: {
  contextCards: ReadonlyArray<{ planningContext?: { weddingFormat?: unknown; guestCount?: unknown } | null }>;
}): WeddingFormat | null;                                                     // latest card, effective
```

**Inference rules** (`inferWeddingFormatFromGuestCount`):

1. A number is used directly. For a string, take the integers in it. A range uses its **upper** bound
   ("10–20" → 20). Words alone ("small") → `null`.
2. ≤10 → `elopement`. 11–40 → `micro`. >40 → `larger`. No integer → `null`.
3. Inference never returns `undecided`.

The format-dependent tables in §6.4–§6.8 also live in this module as exported constants or functions.

### 6.2 Type extension

`WeddingPlanningContext` in `weddingNeedToKnowProbingState.ts` gets:

```ts
weddingFormat?: WeddingFormat | null;
weddingFormatSource?: WeddingFormatSource | null;
```

Both are optional. The same two fields are added to the intake draft and local follow-up records
(`weddingTemplateFollowUpLocalState.ts`, `weddingTemplateFollowUpState.ts`) using the existing
`clean`/`preferredText` patterns. Persisted drafts without them load unchanged.

### 6.3 Intake wizard (`WeddingSiteIntakeWizard.tsx`, brief TPL-01/02/03)

**Format control.** This is the first control in step 0, above the paste box.

- Label: **"What kind of day feels like yours?"**
- Four options from `WEDDING_FORMAT_OPTIONS`, each showing its label and hint. Render it as a native
  radio group with keyboard support and a visible focus state.
- It is not required. The user can continue with nothing selected.
- New props: `weddingFollowUpFormat(): WeddingFormat | null` and
  `onWeddingFollowUpFormatChange(format, source)`. The signal lives in `ResponseQueueView.tsx` next to
  the other `weddingFollowUp*` signals. Keep the growth in that file to about 15 lines or fewer.
- Choosing an option sets `weddingFormatSource = "explicit"`.

**Guest count.**

- Placeholder `"80"` becomes `"20"`.
- Add chips beside the field: `0–10 · 11–20 · 21–40 · 41+ · Not sure`. A chip writes its label into
  the existing text field. "Not sure" clears the field. Free text keeps working.
- Help text under the field: "Suppliers don't count. A legal ceremony needs two adult witnesses."
- When the guest count implies a format and none was chosen, show the read-only hint "Sounds like:
  <label>. Change above if not." Don't set the format. Inference stays derived (§3.4).

**Copy** (brief TPL-03):

| Location | New text |
| --- | --- |
| Eyebrow | "Let's start with your kind of day" |
| Paste-box placeholder | Brief TPL-03 text |
| Priorities label | "What matters most? Choose up to three." |
| Priorities placeholder | "personal ceremony, time together, photos" |
| Review note | "Choose what to prepare first. You can add the rest later." |
| Review CTA | "Make our starter plan" (D8) |

All other strings are unchanged. The draft badge "Draft - not saved to your account yet" stays.

### 6.4 Probing and extraction (brief TPL-01, TPL-09)

**New probe rule** in `weddingNeedToKnowProbingState.ts`:

- Add `"wedding_format"` to the `WeddingProbeSlot` union.
- Insert the rule **first** in `PROBE_RULES`:
  - `sensitivity: "low"`
  - `isAnswered: (c) => parseWeddingFormat(c.weddingFormat) !== null || inferWeddingFormatFromGuestCount(c.guestCount) !== null`
  - `shouldAsk: () => true`
  - `question: "What feels closest to your kind of wedding?"`
  - `reason: "The format changes which decisions come first and which tools you need."`
  - `improves: "first decisions, vendor priorities, workspace tools"`
  - `suggestedAnswers: ["Just us", "Our closest people", "Not sure yet", "A bigger celebration"]`
- `coreAnswered` stays `date_or_season`, `location` and `guest_count`. **Don't add `wedding_format`.**
- Because of the `isAnswered` fallback, any existing plan that has a parseable guest count keeps its
  current `nextQuestion` and `isReadyForFirstRecommendations` values. A regression test must prove
  this (§9.1).
- Change the guest-count rule's `suggestedAnswers` to `["0–10", "11–40", "41–100", "100+"]`.

**Extraction** in `weddingNeedToKnowExtractionState.ts`. These patterns produce a **suggested**
format, which is applied through the existing "Use message details" flow with
`weddingFormatSource = "extracted"`:

| Pattern (case-insensitive) | Format |
| --- | --- |
| `\belop(e\|ed\|es\|ing\|ement)\b`, `\bjust (the )?(two\|2) of us\b`, `\bjust us\b` | `elopement` |
| `\bmicro[- ]?wedding\b`, `\bsmall wedding\b`, `\bintimate (wedding\|ceremony\|celebration)\b` | `micro` |
| `\bnot sure (how big\|about size)\b`, `\bstill deciding (on )?(size\|guests)\b` | `undecided` |

- The bare word "intimate" is **not** a format signal. It stays an atmosphere trait in
  `weddingExperienceModelState.ts`.
- An explicit choice already in the form is never overwritten by extraction.

### 6.5 Format-aware vendor categories (brief TPL-04)

In `weddingVendorLeadTimeState.ts`:

- `weddingVendorMustDecideFirstCategories(format?: WeddingFormat | null)` returns:
  - `elopement` → `officiant`, `photographer`
  - `micro`, `larger`, `null` → today's set (`venue`, `officiant`)
  - `undecided` → today's set. The wizard shows the note "Choose your format first. It changes what's
    worth booking early." above the list.
- The lead-time ranking that reads `mustDecideFirst` (around lines 193 and 223) takes the same
  optional format and uses the format-aware set. Callers that don't pass a format get unchanged
  results.
- Lead-time month values don't change.

### 6.6 Starters and template entry (brief TPL-08)

In `weddingTemplateEntryState.ts`:

- `starterPrompts(format?: WeddingFormat | null)`. The `WeddingTemplateStarterIntent` union is
  **unchanged**.
- Recommended intents by format:

| Format | Recommended | Prompt changes |
| --- | --- | --- |
| `elopement` | `budget_plan`, `vendor_emails` | `vendor_emails`: "Draft approval-gated enquiries to a celebrant and photographer asking about availability, inclusions and legal paperwork." `run_sheet`: drop "transport". |
| `micro` | `venue_search`, `budget_plan`, `guest_list` | — |
| `undecided` | `budget_plan` | `budget_plan`: "Compare what 10, 30 and 80 guests would mean for our budget and plan." |
| `larger`, `null` | `venue_search` (today) | — |

- **Wizard behaviour:** on entering the Review step, if the user hasn't toggled any starter yet, set
  the selection to the recommended set for the current effective format. After a manual toggle, never
  overwrite the selection.
- The `description` string uses brief TPL-08.
- `firstResponseInstruction` gets the §3.6 sentence.

### 6.7 Next steps and legal essentials (brief TPL-05, TPL-11)

**Witness task** in `weddingAustralianLegalSetupState.ts`. Add an optional input
`weddingFormat?: WeddingFormat | null`. When the format is `elopement` or `micro`, add one
`WeddingPlanningTaskItem`:

- `id`: `wedding-legal-witnesses:<weddingPlanId>`. It is deterministic, so it deduplicates across
  rebuilds.
- `title`: "Confirm two adult witnesses".
- `kind`: the same kind the existing NOIM tasks use.
- `priority`: `"high"`.
- `dueAt`: the NOIM latest-lodgement date when an exact date exists, otherwise `null`.
- `linkedArtifactId`: the legal setup artifact.
- Notes: "Your celebrant confirms the exact requirements."

NOIM logic and copy are unchanged.

**Next-step ladder** in `weddingNextStepState.ts`. Read the format with
`weddingFormatFromWorkspace(state)`. Don't add a field to `WeddingResponseWorkspaceViewState`: that
file is at 1038 lines, already over the wedding cap, and must not grow.

- The `wedding_date` step stays first for every format, because NOIM timing depends on it.
- After the date, a set format inserts its steps **before** today's ladder. A step is skipped when its
  evidence exists:

| Format | Step | `priority` (new union member) | Done when | `menuId` |
| --- | --- | --- | --- | --- |
| elopement | Choose the ceremony spot | `ceremony_place` | A saved decision selection for a venue or location category exists | `plan` |
| elopement | Choose a celebrant and check NOIM timing | `celebrant_legal` | `celebrantPath === "own_celebrant"` **or** an officiant decision is saved | `plan` |
| elopement | Confirm two witnesses and a photographer | `witnesses` | The witness task is done **and** a photographer decision is saved | `people` |
| micro | Settle the guest-count range | `guests` (existing) | A guest count is set | `guests` |
| micro | Choose the venue or meal format | `ceremony_place` | A venue decision is saved | `plan` |
| micro | Set budget priorities | `budget` (existing) | `budgetTargetAmount` is set **and** at least one top priority exists | `budget` |
| undecided | Compare 10, 30 and 80 guests | `format_tradeoff` | The format becomes something other than `undecided` | `budget` |

- After the format steps, today's ladder continues unchanged.
- `larger` and `null` use today's ladder unchanged.
- For `elopement`, replace the base label `Guests: X of Y replied` with
  `Witnesses: confirmed | not yet confirmed`, taken from the witness task's status.
- **Audit point:** before coding, confirm which menu hosts the venue shortlist and the legal setup. If
  it isn't `plan`, use the correct existing menu and record the choice in the PR.
- **Format change after intake.** `WeddingNextStepCard.tsx` shows the current format as a chip with a
  "Change" link. The link opens the same four-option radio group inline. Saving it calls the §3.3
  revision path, and nothing else.

### 6.8 Menu emphasis (brief TPL-06)

- `weddingFormatState.ts` exports `weddingMenuEmphasis(format)`, which returns
  `{ collapsed: WeddingWorkspaceMenuId[]; suppressBadges: WeddingWorkspaceMenuId[] }`:
  - `elopement` → `collapsed: ["seating", "helpers"]` and `suppressBadges: ["seating"]`
  - `micro` → `suppressBadges: ["seating"]`, but only until there is at least one attending RSVP
  - every other format → nothing collapsed or suppressed
- The menu component (find it through the consumers of `WEDDING_WORKSPACE_MENU_IDS` or
  `weddingWorkspaceMenuState`) hides collapsed items from the main list and adds a final
  "Show all tools" toggle.
- The toggle persists in `localStorage` under `omnyid.wedding.show-all-tools.<weddingPlanId>`. Wrap
  reads and writes in try/catch. If storage fails, show everything.
- Deep links are unaffected. `weddingMenu=seating` and `canonicalWeddingWorkspaceMenuId` still open
  the item, and opening a collapsed item reveals it.
- No `WeddingWorkspaceMenuId` value is removed.

### 6.9 Deep link from the website (brief TPL-10, LP-02 chips)

- **`App.tsx`:** where `deepLinkParams` is read (around line 1260), read `format` only when
  `shouldLaunchWeddingTemplateFromDeepLink()` is true. Call
  `saveWeddingEntryFormat(parseWeddingFormat(raw))` inside `launchWeddingTemplateFromDeepLink()`.
  Keep the change to about 3 lines, because `App.tsx` is a legacy file far over budget.
- **`weddingEntrySourceState.ts`:** add `saveWeddingEntryFormat`, `loadWeddingEntryFormat` and
  `clearWeddingEntryFormat`. Use key `omnyid.wedding.entry-format` and the same try/catch pattern as
  the entry source.
- **Wizard on mount:** if the draft has no format, load the pending entry format, pre-select it with
  `source = "deep_link"`, then clear it.
- **Precedence:** explicit > deep_link > extracted > inferred (display only).
- Unknown, empty or malicious values do nothing. The raw parameter is never placed in the DOM, in
  storage or in AFP.
- **Website:** three link-chips under the hero CTAs ("Just us", "Our closest people", "Not sure yet")
  with `&format=elopement|micro|undecided`. Style them as secondary links, keep them keyboard
  reachable, and add no JavaScript.
- **Quiz bridge (brief SP-04):** link the result only if the quiz brief contains an explicit
  guest-size answer that maps to a format. Otherwise link without `format`.

### 6.10 Demo data (brief TPL-07)

`buildWeddingTemplateDemoState()` uses the §4 scenario:

- Seed "sample garden micro wedding".
- Two sample venues from the §4 shortlist with the `Sample` prefix.
- Budget rows from §4.
- An email draft to the celebrant (`demo-only@example.invalid`).
- Tasks "Confirm two adult witnesses" and "Confirm wet-weather plan".
- `planningContext.guestCount: 24`, `weddingFormat: "micro"`,
  `topPriorities: ["personal ceremony", "long dinner", "photos"]`.
- Date `2027-04-17`. Assumption text "Guest count example: 24."

### 6.11 File-size and reuse rules

| File | Lines now | Budget for this change |
| --- | --- | --- |
| `weddingResponseWorkspaceViewState.ts` | 1038 (over the 999 cap) | **0 lines.** Don't edit. |
| `weddingPersistedWorkspaceState.ts` | 936 | ≤5 lines |
| `ResponseQueueView.tsx` | 2193 (legacy) | ≤15 lines |
| `App.tsx` | 5585 (legacy) | ≤3 lines |
| `WeddingSiteIntakeWizard.tsx` | 619 | Must stay <999 |
| `weddingFormatState.ts` | new | <300 |

Don't duplicate any guest-count parsing or label logic that already exists. Find it first in
`weddingNeedToKnowProbingState.ts` (`hasGuestCount`) and the extraction module, and reuse or extend it.

---

## 7. Accessibility and UX requirements

- The format radio group and guest chips are fully usable by keyboard and have visible focus. Chips
  are buttons with `aria-pressed`.
- The "Illustrative scenario" label is real text, not an image or pseudo-element.
- All new website imagery has meaningful alt text. Decorative images use `alt=""`.
- Copy stays inclusive: no default bride, no gendered pair assumptions.
- The landing hero stays at one primary CTA.

---

## 8. Dependencies and gates

### 8.1 Claims audit (gates copy)

Before Slice A copy merges, produce a claim-to-evidence table in the PR description, and add a short
entry to `.agent/HANDOFF.md`, for each of these claims:

| Claim | Evidence required | If missing |
| --- | --- | --- |
| Free to start, no card | `pricing.html` terms plus the register flow requiring no card | Drop the microcopy |
| NOIM reminders | Legal setup tasks project to dated tasks | Drop the stats `1 month` value and soften features card 2 |
| Approval before anything is sent | Projection-queue and outreach approval gate code paths | Blocker: escalate to the owner |
| Plan together, separate sign-ins, private notes stay private | `WeddingCollaborationAccessCard.tsx` plus a test proving the private/shared boundary | Remove the features card 1 partner sentence |
| No guest-count limit on plans | Pricing and plan entitlements code | Don't publish the D6 line |

### 8.2 Ordering

- Slice A (website) and Slice B (template) can run in parallel.
- Slice C (deep link, chips, menu emphasis, quiz bridge) needs Slice B's §6.1–§6.3.
- The LP-04 step 2 wording and the stats `3` value land in T12's PR.

---

## 9. Testing and verification

### 9.1 Unit tests (`solid-ui/tests/wedding-*.test.ts`, run by `npm run test:wedding`)

| Test file | Cases |
| --- | --- |
| `wedding-format-state.test.ts` (new) | Allowlist parsing, including unknown, `<script>`, empty and non-string input · inference boundaries 0, 10, 11, 40, 41, ranges, words · effective precedence · latest-profile selection, including equal timestamps · menu emphasis per format |
| `wedding-need-to-know-probing-state.test.ts` | The format rule is first · **Regression:** a context with a guest count and no format gives the same `nextQuestion` and `isReadyForFirstRecommendations` as before · new guest suggested answers |
| `wedding-need-to-know-extraction-state.test.ts` | Each pattern · bare "intimate" gives no format · an explicit value isn't overwritten |
| `wedding-template-entry-state.test.ts` | Recommended intents per format · `null` equals today · demo uses the §4 scenario and keeps the sample labels |
| `wedding-vendor-lead-time-state.test.ts` | The elopement set · no-format result equals today's snapshot |
| `wedding-next-step-state.test.ts` | Ladder per format · date stays first · `larger`/`null` snapshot equals today · elopement witness label |
| `wedding-projection-queue-state.test.ts` | The profile includes the format when set · unsent change rebuilds the pending item · **sent profile plus change produces a revision** with `parent_id`, a `supersedes` reference and full content, and the original id is never re-queued |
| `wedding-template-deep-link-launch-state.test.ts` / `wedding-entry-source-state.test.ts` | Save, load and clear the entry format · invalid values ignored |
| `wedding-workspace-menu-state.test.ts` | Deep link to a collapsed item still resolves |

### 9.2 Website smoke test (`wedding/tests/wedding-website-smoke.mjs`, run by `npm run test:wedding-site`)

Add these assertions:

1. The §5.6 truth guards.
2. Each `.testi-slide` contains "Illustrative scenario. Not a customer review."
3. No `<img>` inside `.testi-person`.
4. No `images.unsplash.com` URLs in `index.html`.
5. Every anchor whose text is "Plan our kind of wedding" has `auth=register` and `source=wedding`.
6. Any `format=` value in `index.html` is one of `elopement`, `micro` or `undecided`.

Existing assertions stay unchanged.

### 9.3 Build and provenance

Run these before declaring any task done:

```bash
cd solid-ui && npx tsc --noEmit
cd solid-ui && npm run test:wedding:ci     # typecheck + line budget + site smoke + wedding tests
cd solid-ui && npm run build
```

Follow `CLAUDE.md` build provenance: report `git rev-parse --show-toplevel`, `git rev-parse HEAD` and
`git status --short` before builds, and run them from a clean checkout of the task's SHA. `cargo
check` isn't required, because no Rust changes. Run it anyway if the branch contains other Rust
changes.

### 9.4 Manual checks

- **Website:** desktop and 375px mobile screenshots of the hero, preview, scenarios and CTA band.
  Keyboard tab through the hero and chips.
- **Template:** a fresh account through `?source=wedding&format=elopement` should show "Just us"
  pre-selected. Continue to Review: the recommended starters are budget plus emails. After approval
  the profile message contains `wedding_format: "elopement"`. Change the format on the next-step
  card: after approval, a revision message appears in the `wedding_context:<workspace>` thread.

---

## 10. Rollout

- **No production deploy without explicit owner approval.**
- **Website:** `wedding/` is a static bind mount. Use the current wedding static hot-sync procedure.
  Don't run the full Oracle deploy while the local `Caddyfile` has uncommitted changes, because that
  diff affects another site on the shared VM.
- **Template:** ships with the normal `solid-ui` build and deploy checklist in `CLAUDE.md`.
- **Order:** P0 truth fixes (T1) may ship alone. The other Slice A changes ship together, so the page
  never mixes old and new messaging. Slice B ships before Slice C's chips go live.
- **Rollback:** each task is one commit. Copy can be reverted per commit. AFP messages that were
  already sent stay as they are, because they're immutable. Readers keep tolerating format fields
  after a rollback, since unknown optional fields are ignored.

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Message change lowers conversion for larger weddings | `larger` path unchanged; measure after launch by format (brief TASK-P2-08) |
| "Only What Matters" reads as dismissive of family or culture | Always "to you both"; scenario copy includes a family-inclusive case in later iterations |
| A revision message without approval looks like a silent change | Revisions use the same approval-gated queue |
| Readers pick a stale profile | §3.5 latest-wins rule and test |
| Wedding file caps break CI | §6.11 line budgets; the format logic lives in a new focused module |
| Demo names clash with real businesses | §4 name check before ship |

---

## 12. Traceability

| Brief ID | Spec section | Task |
| --- | --- | --- |
| MSG-03, LP-10, LP-11, TASK-P0-01..03 | §5.4–§5.6, §9.2 | T1 |
| TASK-P1-05 | §8.1 | T2 |
| LP-01, LP-02, LP-12, LP-14 | §5.2 | T3 |
| LP-04, LP-05, LP-07, LP-09 | §5.2 | T4 |
| LP-06, TPL-07 | §4, §5.2, §6.10 | T5, T13 |
| LP-02, LP-08, LP-09 (images), MSG-04 | §5.3 | T6 |
| SP-01..SP-03 | §5.2 | T7 |
| TPL-01 (model) | §3, §6.1, §6.2 | T8, T9 |
| TPL-01 (UI), TPL-02, TPL-03 | §6.3 | T10 |
| TPL-01 (probing), TPL-09 | §6.4 | T11 |
| TPL-04, TPL-05, TPL-08, TPL-11 | §6.5–§6.7 | T12 |
| TPL-10, LP-02 chips, SP-04 | §6.9 | T14, T16 |
| TPL-06 | §6.8 | T15 |
| TPL-12 | §8.1 (audit only) | T2 |

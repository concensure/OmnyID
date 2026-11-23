# Venue Quote Comparison v3 — source-grounded normalisation, scenarios and choice

Status: incremental implementation specification
Owner: WED-383
Builds on: WED-350 and WED-377
Supersedes: the no-model extraction constraint in sections 3.4, 5.5 and Q5 of `OmnyID_Wedding_Lead_Magnets_Spec.md` and `OmnyID_Wedding_Lead_Magnets_Tasks.md`. All other privacy, import and approval boundaries remain.

## 1. Outcome

A couple can use the dedicated authenticated **Quotes** section, separately
from any vendor's **Quote received** lifecycle status, or the no-login public
page to compare proposals for the same wedding. They can see what each vendor
covers, whether its terms fit the event, the effect on the remaining wedding
budget and the one missing fact most likely to change the choice.

The tool is not a recommendation engine and must not describe the lowest
displayed number as the best option. A quote with exclusions or unknowns is
not equivalent to a comprehensive quote.

## 2. Reused architecture

- Extend `wedding/compare-wedding-venue-quotes.html`; do not add a competing
  calculator or quote store.
- Extend `WeddingBudgetEvidenceHub` and the canonical quotation/source
  authorities for signed-in use. The vendor lifecycle panel may link to a
  quote but is not the dedicated comparison authority.
- Reuse the server's platform-funded OpenRouter gate, weekly USD 50
  configured ceiling, provider data-collection denial, server-held credential
  and persistent abuse rate limiter.
- Reuse the existing quote normal form when a signed-in visitor later imports
  a result. This public release keeps analysis in the page and does not write
  an AFP event or quote record.
- Keep the existing deterministic browser calculation layer authoritative.
- Keep manual entry functional if contextual extraction is declined,
  unavailable or rate-limited.

## 2.1 Existing capabilities to retain

- The public contextual extractor, exact source snippets and deterministic
  browser arithmetic from WED-350/WED-377.
- Authenticated source files, vendor messages, normalised quotation evidence,
  corrections and document reading in the Wedding Quotes hub.
- Quote originals and revisions remain immutable source evidence. Scenarios
  are projections and never overwrite a vendor quote.
- AFP remains the authority for a signed-in couple's saved preference,
  confirmed choice and decision-card projection.

## 2.2 Capture sources

Authenticated use accepts the existing PDF/DOCX/TXT/Markdown upload and vendor
email/message paths. The public page accepts pasted email/manual text and local
plain-text, email and selectable-text PDF files. It reuses the repository's
existing `pdfjs-dist` client extraction dependency rather than inventing a
second parser. PDF bytes and extracted text remain in the browser unless the
visitor separately chooses contextual analysis. A scanned or unreadable PDF
must say so and retain manual entry.

## 3. Privacy and activation boundary

Pasting text must not send it anywhere. A separate, explicit **Analyse quote**
button explains that the selected proposal text is sent once to OmnyID's
configured model provider to identify commercial terms. The page states:

- the text is used for this extraction request;
- OmnyID does not store the proposal text or the structured extraction on the
  public tool server;
- OpenRouter is a third-party processor and is requested not to retain data;
- the browser may cache the structured result by a one-way content digest so
  an unchanged re-analysis does not need another model request;
- manual comparison works without model analysis.

This processing is a requested product function, not Analytics consent. Ahrefs
and first-party page analytics remain controlled by the separate Analytics
preference and must never receive proposal text, amounts or extracted fields.

## 4. Extraction contract

Model: the existing funded inference model (`openai/gpt-5-mini`) unless the
shared funded-inference policy changes. The provider credential is never sent
to the browser.

Input limits: one proposal, 40–20,000 characters, at most two calls per ten
minutes and five per day per trusted visitor address, plus the shared weekly
spend ceiling. No URLs are fetched and no files are uploaded by this endpoint.

Schema version: `quote-extraction.v2`.

Each field returns:

- `state`: `extracted`, `ambiguous`, or `not_found`;
- typed raw `value`, or null;
- `source_snippet`: an exact contiguous quote substring, or null;
- confidence: high, medium or low;
- a short reason.

Fields (v2 fields remain valid; v3 adds the following where stated):

- pricing model: per-head, fixed, minimum spend, hybrid or unclear;
- per-head rate;
- guest count stated by the quote;
- whole-package amount;
- fixed/hire fee;
- minimum spend;
- GST included, excluded or unclear;
- service-charge percentage;
- venue/package hours;
- overtime rate;
- payment schedule;
- deposit amount or percentage and its due date, kept separate from total;
- cancellation/reschedule terms and quote expiry;
- quoted event date or eligible date conditions;
- minimum and maximum guest counts or capacity;
- itemised per-head, fixed, included or unclear rows;
- inclusions and exclusions;
- for each item, whether it is optional, mandatory, bundled or unknown and
  whether its spend counts toward a stated minimum.

The server rejects unsupported types, out-of-range numbers and any suggestion
whose source snippet does not appear exactly in the submitted proposal. Model
arithmetic is never accepted.

## 5. Component-versus-total invariant

`120 guests × A$275` yields quoted guest count 120 and per-head rate A$275.
The browser may show a deterministic A$33,000 package subtotal. Neither the
model nor the UI may write A$33,000 into whole-package amount unless the quote
itself explicitly calls that figure a grand/package total.

Minimum spend is also not a total. It is a lower bound applied by deterministic
code after quoted per-head and fixed inputs are assembled.

## 6. Interaction model

Each proposal contains:

1. Proposal text and local TXT/Markdown/EML/selectable-text PDF reader.
2. An explicit contextual-analysis control and disclosure.
3. Suggestion cards with state, confidence, value and an always-visible source
   snippet. Selecting a card selects the exact snippet in the textarea.
4. Apply controls that name the destination. Ambiguous values use a choice
   pill, for example per-head versus a deterministic total.
5. Clicking a populated commercial field selects its accepted source snippet.
6. `Extract from selection`: the visitor selects text, chooses a destination
   field, and applies the number or selected wording themselves.
7. Commercial terms fields separated from an editable line-item table.
8. Extracted, not stated and not analysed states rendered distinctly.

## 7. Deterministic total and viability

For comparison guest count `G` and event hours `H`:

1. Select the quoted base according to pricing model.
2. Multiply quoted per-head rates by `G` in code.
3. Add explicitly counted fixed rows and fees.
4. Apply a minimum spend only to components marked as eligible for that
   minimum. Add ineligible fees outside the floor. Do not assume an unknown
   component counts.
5. Apply a service percentage only to the visible stated base used by this
   release; label the assumption and ask what the venue actually applies it to.
6. Add overtime only when included hours and overtime rate are stated.
7. Add 10% GST only when the quote explicitly says GST is excluded.
8. Keep unclear GST, service basis and other missing amounts outside the total
   and list them as unknowns.

Before calling a scenario viable, check the comparison date, guest count,
event duration, stated capacity, minimum guests and date/rate conditions.
Out-of-range or changed terms are labelled **Vendor confirmation needed**;
the tool does not silently extend a quoted rate. A deposit is displayed with
the payment schedule but never added to the event total a second time.

## 7.1 Scenario edits

Each proposal has an immutable **Original quote** basis and a separate
**Scenario estimate**. A couple may add or remove optional items or change
their quantity. Both proposal totals, their difference and remaining wedding
budget update live. Every changed row is visible in the formula.

- Optional items may be included/excluded and have a scenario quantity.
- Mandatory items cannot be removed; explain that they are required.
- Bundled items cannot be deducted independently; explain that their price is
  part of another quoted amount.
- Unknown prices remain unknown after selection.
- A changed date, headcount, duration or quantity outside stated terms is
  marked **Vendor confirmation needed**.
- The edited result remains **Scenario estimate** until the vendor confirms a
  revision. It never mutates the original source or accepted extraction.

Minimum-spend invariant: if eligible food and drinks are A$5,200 including an
optional A$400 upgrade, removing the upgrade produces eligible spend A$4,800,
then a A$200 minimum-spend adjustment, for a A$5,000 scenario total—not
A$4,800 and not A$5,200.

Every result shows its formula lines and marks each as quoted, calculated,
user-entered or assumed. The headline is **Estimated total from stated terms**,
never a final price.

## 8. Comparison and gaps

- Show proposal totals at the same guest count and event duration.
- Show pricing model prominently.
- Show inclusions in A but not stated/excluded in B, and vice versa.
- Show every missing commercial term as a question that can be copied to the
  venue.
- Preserve `not_found`; never coerce it to zero.
- A lower total can be described as lower on stated figures, with exclusions
  and unknown counts beside it. Do not say better, best or recommended.
- Show quoted costs and estimated extras separately, along with the remaining
  budget for each scenario.
- Explain a price crossover such as A$120 per guest with a A$5,000 minimum
  versus A$150 per guest: B is A$500 lower at 30 guests, while A is A$1,000
  lower at 40 guests, assuming equivalent scope and no other known charges.

## 8.1 Choice and decision projection

The dedicated comparison provides **Prefer this**, **Confirm choice** and
**Keep open** actions. Public visitors may retain the choice only on their
device. Signed-in actions append to the canonical wedding ledger and update
the existing decision card; they do not create a second decision system.

The decision summary contains:

1. the material trade-off on the current scenario;
2. a conditional recommendation tied to budget and stated priorities;
3. the single unknown most likely to change that recommendation; and
4. a link back to the source evidence or correction surface.

If staffing is unknown, both totals and the recommendation explicitly retain
that uncertainty.

## 9. Cache and change detection

The browser computes SHA-256 over the proposal text. It stores only a bounded
set of structured extractions keyed by that digest, not the source text. On an
unchanged quote, reuse the cached extraction. On a changed quote, compare the
new structured fields and line items with the prior result for that proposal
and list material changes such as a changed beverage rate or removed minimum.

Clear-cache control must be available. Cache failure must not block the tool.

## 10. Accessibility and responsive behaviour

- Keyboard and touch users receive the same source evidence; no meaning relies
  on hover.
- Status changes use a live region.
- Source selection returns focus without unexpected page navigation.
- Tables have headers and remain horizontally scrollable on narrow screens.
- Desktop public Wedding pages use the requested larger scale; mobile scale is
  unchanged and must have no horizontal page overflow.

## 11. Acceptance evidence

- A fixture containing `120 guests x $275.00` produces a per-head suggestion,
  deterministic A$33,000 subtotal and no whole-package suggestion.
- A quote with no beverage price shows `Not stated in quote` and a targeted
  question.
- Suggestions without exact source evidence are rejected server-side.
- No request occurs before explicit analysis.
- Manual entry and comparison work with the analysis endpoint unavailable.
- Arithmetic property tests prove unknowns never become zero and model values
  are not used as calculated totals.
- Re-analysis of unchanged text uses local structured cache; changed text
  produces a field-level diff.
- Desktop and mobile browser smoke, Wedding site tests, Rust route tests,
  production build, exact-SHA deployment and hosted checks pass.
- At 30 guests, A$120 per guest with a A$5,000 minimum produces A$5,000 and
  A$150 per guest produces A$4,500. At 40 guests the same proposals produce
  A$5,000 and A$6,000, and the explanation identifies why the cheaper option
  flipped.
- Removing a A$400 minimum-eligible optional upgrade from A$5,200 shows
  A$4,800 eligible spend plus a A$200 minimum adjustment and a A$5,000
  **Scenario estimate**, while preserving the A$5,200 original quote basis.
- Changing optional quantity recalculates both totals, difference and
  remaining budget without a reload. Mandatory/bundled rows cannot be
  silently deducted, and out-of-term changes require vendor confirmation.

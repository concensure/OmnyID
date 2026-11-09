# Venue Quote Comparison v2 — source-grounded extraction and deterministic comparison

Status: implementation specification  
Owner: WED-350  
Supersedes: the no-model extraction constraint in sections 3.4, 5.5 and Q5 of `OmnyID_Wedding_Lead_Magnets_Spec.md` and `OmnyID_Wedding_Lead_Magnets_Tasks.md`. All other privacy, import and approval boundaries remain.

## 1. Outcome

A visitor can paste one or two venue proposals and obtain an understandable,
like-for-like comparison without searching for every commercial term or doing
guest multiplication. The tool must distinguish quoted facts, deterministic
calculations, user-entered assumptions and unknowns.

The tool is not a recommendation engine and must not describe the lowest
displayed number as the best option. A quote with exclusions or unknowns is
not equivalent to a comprehensive quote.

## 2. Reused architecture

- Extend `wedding/compare-wedding-venue-quotes.html`; do not add a competing
  calculator or quote store.
- Reuse the server's platform-funded OpenRouter gate, weekly A$50-equivalent
  configured ceiling, provider data-collection denial, server-held credential
  and persistent abuse rate limiter.
- Reuse the existing quote normal form when a signed-in visitor later imports
  a result. This public release keeps analysis in the page and does not write
  an AFP event or quote record.
- Keep the existing deterministic browser calculation layer authoritative.
- Keep manual entry functional if contextual extraction is declined,
  unavailable or rate-limited.

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

Fields:

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
- itemised per-head, fixed, included or unclear rows;
- inclusions and exclusions.

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

1. Proposal text and local TXT/Markdown reader.
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

## 7. Deterministic total

For comparison guest count `G` and event hours `H`:

1. Select the quoted base according to pricing model.
2. Multiply quoted per-head rates by `G` in code.
3. Add explicitly counted fixed rows and fees.
4. Apply a minimum spend with `max(quoted variable subtotal, minimum spend)`.
5. Apply a service percentage only to the visible stated base used by this
   release; label the assumption and ask what the venue actually applies it to.
6. Add overtime only when included hours and overtime rate are stated.
7. Add 10% GST only when the quote explicitly says GST is excluded.
8. Keep unclear GST, service basis and other missing amounts outside the total
   and list them as unknowns.

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


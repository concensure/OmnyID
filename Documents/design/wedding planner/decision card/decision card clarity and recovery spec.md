# Wedding decision-card clarity and recovery specification

Status: implemented design contract
Tasks: WED-389, WED-390
Source guidance: `decision card requirement.md` and the supplied 390-pixel mobile
screenshot
Existing authorities: AFP Wedding plan, tasks, decisions, evidence, deferrals,
quotes, RSVP and run-sheet projections

## 1. Interpretation boundary

The source document is design guidance, not an instruction set. This specification
selects the changes that materially improve the existing Wedding workflow and keeps
the current AFP authorities, guarded actions and Defer mechanism. It does not add a
second reminder system, a generic questionnaire, automatic vendor contact, or an
unreviewed recommendation engine.

The existing Defer action already creates a durable
`wedding_decision_deferral`. “Remind me” therefore means making that action's exact
resurface date understandable and editable, not adding another button with a second
storage path.

## 2. Problems to solve

### 2.1 Wedding template recovery

A fresh production browser currently downloads and renders the Templates chunk, so
the public route is present. A browser that has an older module graph, or an account
whose planner projection throws while rendering, can reach the Wedding Planner error
boundary. Its current Retry action resets the same lazy component promise and can
repeat forever after a failed dynamic import.

The planner must distinguish a stale-module failure from a planner-data failure:

- stale module: reload the latest application shell once while preserving the saved
  Wedding navigation intent;
- projection/render failure: retain the account data, show a concise diagnostic
  reference and allow a clean remount or return home;
- no retry action may delete a plan, clear account storage or create a new template.

Release packaging must retain at least the immediately preceding compiled module
generation during the transition window so an already-open browser can complete its
current navigation.

### 2.2 Decision-card content

The mobile card in the supplied screenshot combines a decision, booking task and
coordination task; labels a raw ISO value as a “Timing cue”; and exposes internal
phrases such as “saved evidence” and “hard constraints”. The recommendation consumes
most of the first screen while the actual action sits below the viewport.

Every displayed Wedding decision card must answer, in ordinary language:

1. What exactly are we deciding now?
2. Which known fact makes this relevant to this wedding?
3. What single missing fact or uncertainty blocks the next stage?
4. What will the primary action accomplish?
5. If there is a recommendation, what is its main benefit, compromise and strongest
   alternative?

Internal pipeline terms are permitted only in an expanded evidence view intended for
diagnosis. They are not user-facing reasons.

## 3. Card presentation contract

The compact card model adds an evidence-derived decision-support block:

- `statusLabel`: e.g. “Needs your input”, “Ready to compare”, or “Ready to confirm”;
- `knownFacts`: at most two useful facts, excluding provenance boilerplate;
- `oneThingToConfirm`: one explicit uncertainty, or null when ready;
- `primaryOutcome`: what completing the primary action changes;
- `compromise`: the main cost, effort or constraint of a recommendation;
- `alternative`: one credible alternative, including “use existing arrangements”;
- `unconfirmed`: availability, price or other material unknown that remains.

The title is a decision question where the source task combines stages. Transport is
the first explicit case:

- initial question: “How should your wedding party travel?”;
- unknown passenger/location requirements: “Confirm who needs transport”;
- requirements known: “Compare transport options”;
- suitable option but no current price: “Prepare quote requests”;
- comparable quotes present: “Compare your quotes”;
- choice saved: “Confirm our choice”;
- booking already recorded: “Add booking details”.

Other cards use the same readiness rules without pretending that a transport-specific
answer applies. A title that cannot safely be converted remains a clear task title,
but still receives a concrete primary outcome and missing-fact statement.

Dates use Australian long form. A date is labelled by its role, for example “Task due
18 September 2028” or “Reminder 25 September 2026”; the generic “Time-sensitive” and
raw `YYYY-MM-DD` treatment are not sufficient. Urgency appears only when the due
window or a sourced consequence makes it urgent.

## 4. Research-readiness window

Before a decision card is shown, the agent prepares a bounded three-item window:

1. current decision;
2. next decision;
3. following decision.

An item is research-ready when one of these is true:

- a deterministic Wedding projection has a decision-specific brief;
- a linked source artifact or quote comparison is available;
- a source-backed vendor shortlist is available;
- the workflow is inherently record/review work (for example RSVP follow-up) and its
  saved ledger facts are sufficient to name the action and remaining uncertainty;
- funded research returned a recommendation and detail report.

Loading text is not a recommendation. Until all available items in the three-item
window are ready, the deck shows a separate “Preparing your next decisions” state
with per-item progress. If preparation fails, the failed item is not presented as a
decision; the state names the missing research and offers Retry or open-the-source
work. Preparing is bounded to three items and does not research the whole backlog.

The model must never invent live availability, current price, capacity or legal
conclusions. Unknown facts remain unknown.

## 5. Explicit Defer/reminder behaviour

The default reminder date continues to use the existing policy: three days before a
valid task due date, otherwise seven days after deferral. The visible action states
the calculated date before it is saved, for example “Remind me 25 September”.

Selecting the action opens a compact review sheet containing:

- the task being deferred;
- the exact reminder date in long form;
- a date input to change it;
- a note that changed evidence may bring the item back earlier;
- Cancel and “Set reminder” actions.

Swipe-up may keep the fast default, but its announcement and completion notice must
state the exact reminder date. A custom date is carried through the existing sidebar
action into the existing AFP deferral record. The projection validates a real future
date and otherwise falls back to the existing calculated policy. Dependency-change
resurfacing remains active.

## 6. Mobile layout and progressive disclosure

At 320–430 CSS pixels and at 200% zoom:

- the question, relevant context, missing fact and primary action are visible without
  requiring the recommendation report to occupy the entire first screen;
- deck controls are outside the scrollable card body and above the bottom navigation;
- the agent control does not cover a card action;
- detailed recommendation reasons, sources, trade-off and alternative open through
  “View details”; they are not discarded;
- swipe remains optional because every consequence has a labelled button.

The primary action advances exactly one stage. “View report” remains secondary when
a report exists.

## 7. Completion evidence

Automated evidence must cover:

- stale dynamic-import recovery does not loop and preserves the Wedding intent;
- a planner render error does not clear saved data;
- a transport card uses the decision question and readiness-matched action;
- no card displays internal-processing filler as its recommendation;
- current, next and following cards are withheld until their research-ready state;
- default and custom reminder dates survive AFP serialization and projection;
- mobile 320/390/430 and 200% zoom keep primary and reminder actions visible and
  unobscured;
- the full Wedding typecheck, line budgets and regression suite pass.

## 8. Shared decision-selection contract

WED-390 generalises the transport treatment to every Wedding planning-task kind.
The planner chooses the decision before it writes presentation copy. Each decision
definition declares:

- its decision type and one answerable question;
- the ordered prerequisites that make the choice meaningful;
- the existing AFP or Wedding record that owns the answer;
- whether priority follows a hard deadline, supplier lead time, workflow sequence or
  no sourced deadline;
- two or three open options and the outcome of the one primary action;
- whether an external action must pass through the existing approval and provider
  receipt flow.

The shared registry covers research, vendor follow-up, budget review, guest list,
legal, vows, rings, first dance, cake, transport, attire, pre-wedding celebration,
beauty, music, contract review, RSVP, seating, vendor coordination, document
checklists, run sheet, weather contingency, email drafts, registry, generic
decisions and other planning tasks. Category recognition may specialise a task as a
venue, quote, payment, transport, RSVP, seating, legal or run-sheet decision, but it
does not create a parallel queue or record.

Missing date, budget and guest-scope choices use the existing Wedding setup cards
and records. While one of those setup cards is active, dependent cards are withheld
instead of repeating the same prerequisite. Other missing prerequisites replace the
dependent question with the prerequisite question. A completed or settled task is
removed from the actionable queue rather than rewritten as another decision.

Existing rank weights and saved deadlines remain the priority authority. A dated
urgent blocker therefore outranks undated planning work, while the card explains
whether urgency came from the saved deadline, lead time or sequence. No date or
consequence is invented.

Venue discovery is the deliberate exception to treating an exact wedding date as a
blocking prerequisite. A couple may need venue availability to choose their date,
so the existing venue-search task can enter Decision Focus with only a season or
with no date saved. The card keeps the date and availability unknown, offers venue
research rather than booking, and requires exact availability to be confirmed
before calling an option viable or making a commitment. Other date-dependent legal,
RSVP and run-sheet decisions retain their date prerequisites.

The vendor catalogue's `mustDecideFirst` sequence signal survives recommendation,
task and PersonalOS projection. It contributes only a small tie-break after normal
priority, saved deadline and lead-time urgency have been evaluated. Venue therefore
precedes another vendor with the same urgency, but it does not outrank a materially
more urgent blocker merely because it is a venue.

## 9. One choice, evidence and approval boundary

Every compact card shows one decision question and one primary action. It may show
two or three options, but it does not combine choosing, booking and scheduling into
one approval. A recommendation appears only when a confirmed quote or checkable
source supports it. Otherwise the card keeps the choice open and names the one fact
that could change it.

Evidence is part of the card contract, not generic provenance copy. It can include a
quote line, amount, inclusion, constraint, saved plan fact or vendor-source
highlight. Checkable HTTP sources are links. Estimates and unknowns are labelled;
an EXA highlight is discovery evidence, never proof of current price, availability
or legal eligibility. Private imported source URLs remain redacted.

Actions that could contact a vendor, send a guest message, sign, pay or otherwise
create an external commitment continue through the existing prepared-action,
explicit-approval and provider-receipt flows. Saving a preference is not represented
as sending an enquiry or booking.

## 10. Bulk audit and online-research boundary

The projection emits audit findings for:

- a compound source title whose card must use the single contract question;
- a missing prerequisite that is not surfaced first;
- recommendation wording without confirmed supporting evidence;
- a settled choice that has incorrectly remained in the actionable queue.

The shared selector and renderer are fixed before adding narrow per-category copy.
Live EXA smoke checks cover representative transport, celebrant and florist
decisions. The production provider already structures EXA responses as a title,
source URL and bounded semantic highlight, excludes directory domains and routes
the results through canonical vendor resolution. The live checks found that this
structure is sufficient: no generative system-prompt rewrite is required. Query
context and response grading must still retain location, scope and preference terms,
and every surfaced result remains a source to verify rather than a recommendation to
book.

## 11. Production monitoring contract

Twice each day, a read-only synthetic uses a dedicated Wedding monitor account to
verify the public Wedding page, workspace shell, password login, authenticated
session, workspace bootstrap, health, readiness and the current hashed JavaScript
asset. Readiness must report the database and background daemons as healthy. The
synthetic creates no Wedding record and revokes its session after each run.

Credentials are root-owned systemd credentials, not environment values committed to
Git or command-line arguments. The timer is persistent, uses Sydney time, randomises
within ten minutes to avoid a thundering herd, records a machine-readable result and
can post that result to a configured alert webhook. This complements, rather than
replaces, public uptime checks and runtime `/healthz`/`/readyz` authorities.

## 12. Venue hold and earned proactive-signal contract

A venue quote card asks one concrete question: “Hold [venue] for [wedding date]?”
The source record keeps three facts separate:

- quote validity says how long the quoted price or package is offered;
- a date-hold expiry is a vendor-stated temporary reservation deadline;
- chosen and booked are separate couple/vendor lifecycle states.

No deadline is derived from the day a quote arrived. If neither quote validity nor
a date-hold expiry was stated, the card has no countdown and asks the couple to
confirm whether the venue can hold the date. The shared content contract covers
unreadable quote, no deadline, over budget, hold expiring, hold lapsed, chosen and
booked. Each state changes the question and next action without changing the card
layout. A vendor-stated deadline inside seven days contributes to the existing
PersonalOS deadline pressure and outranks a comparable undated card. Quote validity
and date hold remain visible separately even when the earlier one supplies ranking.

Accepting a quote records a chosen venue, not a booking, payment or external send.
The same AFP selection carries stable successor task identifiers for contract,
deposit and cancellation review and releases the existing caterer and photographer
research dependencies. Materialisation is once per stable task id. Any vendor
message remains prepared and approval-gated.

Proactive copy is earned from saved records. A silent-vendor prompt may name “6
days vs about 2” only when at least two comparable replied vendors establish that
baseline. Five or more decisions opened this week reduce Decision Focus to one only
when saved velocity also shows at least four more opened than closed; the ranked queue
remains intact. Context-switch, completed-check, budget-pace and weekly
caught-work lines appear only when their source metadata exists and is current; no
score or internal evidence label is shown to the couple. The weekly line counts
expiring holds, over-budget quotes and stale vendors seen during the previous seven
days.

The passive quote reconciler remains the watcher ingress: it projects authenticated
normalised quote events and replays them idempotently after restart. This slice does
not claim a new Gmail trigger, encrypted-mail reader or calendar-conflict detector.
Accessibility, dietary and old-preference topology must continue to use the existing
guest, preference and vendor records; an individual card may not invent a cross-link
that those records do not support.

The public site retains the selected Soft message: a general “wedding that feels
like you” headline, with intimate ceremonies and micro weddings named alongside
larger celebrations. That sentence must remain present at mobile widths. This is a
message alignment, not a small-wedding-only repositioning.

## 13. Plan-variable dependency decisions

Guest count and budget are revisioned Wedding facts. A changed answer is saved as a
new revision through the existing Need-To-Know, intake-profile and Budget decision
streams; it must not be discarded as “already saved”. The current and immediately
prior distinct values supply the before/after evidence for dependent cards.

There is no universal wedding-industry “20 guests” threshold. Vendor terms control
when present: for example, Monash Country Club requires final numbers seven days
before the wedding and will accept increases but not decreases after that point,
while Gabbinbar requires final numbers three weeks before the wedding and requires
approval for later increases. In the absence of an extracted vendor threshold, the
product safeguard treats a change as material when it is at least 20 guests, or at
least 10 guests and 20% of the prior count. This keeps the fallback proportionate for
small weddings. The card identifies affected capacity/per-head vendors, shows the
exact change and prepares a reconfirmation only; vendor contact remains approval
gated. Sources: https://www.monashcc.com.au/cms/weddings/frequently-asked-questions/
and https://gabbinbar.com.au/files/gabbinbar-terms-and-conditions.pdf.

A lower total budget creates one budget-trade-off decision only when saved vendor
costs exist. It shows the old total, new total and reduction to absorb. Candidate
options favour projected, reduced-allocation or lower-priority categories and
protect categories that match saved priorities, atmosphere, vendor preferences or
photography scope. The recommendation remains unsupported when no preference
evidence exists. Choosing an option records what to review; it never cancels scope,
changes a contract, forfeits a deposit or contacts a vendor automatically.

Each before/after fingerprint has one stable task id. Settling it suppresses that
revision; a later material edit produces a successor. The shared card contract,
ranking, evidence and approval flows are reused without a new card layout or a
parallel decision store.

## 14. Editable decision-plan contract

Decision Focus is a ranked view of an editable plan, not a compulsory sequence.
The Personal Agent and Wedding Planner use the same append-only plan-edit record
for two user-owned changes: applicability and custom decisions. Wedding records are
scoped to the canonical response workspace so both authorised partners see the
same plan. Personal records remain current-account scoped.

“Doesn't apply” is a settled applicability choice, not a defer, snooze, empty
answer or deletion. It removes the decision from Today and suppresses only current
follow-ups whose causal parent is that decision. Independent timing, legal and
coordination decisions remain. Before saving, the UI names causal follow-ups that
will be hidden. Notes, sources, quotes, bookings, answers and completion records are
never deleted or rewritten. The choice has immediate Undo and a durable Restore
control in Plan; no reason is required. Later evidence may offer “Restore now?” but
cannot silently reactivate the decision.

“Decide later” retains the existing Wedding deferral and Personal Agent snooze
semantics. A generic dismiss/skip affordance must not masquerade as either outcome.
Optional services such as hair styling may show “Doesn't apply” directly; every
other active card exposes it in the plan-action menu.

Plan exposes “+ Add a decision”, while active, completed and not-applicable cards
expose “Add a follow-up decision”. Only the question is required. Choices, due date
and note are optional. A follow-up stores its source decision id and title. Custom
decisions use the existing ranked card, completion and defer/snooze surfaces. Any
suggested task arising after resolution remains proposal-only until the user
approves it; vendor enquiries, guest messages, bookings, payments and other external
commitments retain their existing approval and receipt boundaries.

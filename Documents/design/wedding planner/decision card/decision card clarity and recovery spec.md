# Wedding decision-card clarity and recovery specification

Status: implementation specification
Task: WED-389
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

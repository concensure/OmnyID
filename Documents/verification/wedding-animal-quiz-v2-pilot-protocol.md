# Wedding Animal Quiz v2 pilot protocol

Version under review: `quiz_version: 2`

This pilot evaluates comprehension and planning usefulness. It does not validate
a personality test, predict relationship outcomes or establish psychological
reliability.

## Phase 1 — comprehension and friction

Recruit 30–50 consenting adults who are planning, recently planned or are
meaningfully involved in planning a wedding. Seek variation in age, gender,
sexual orientation, culture, disability, planning stage, budget comfort and
device familiarity. Record these only as voluntary broad cohorts; do not attach
identifying details to quiz answers.

Each participant completes the quiz on their own device and then explains:

1. What they think each of the six dimensions means.
2. Whether every image and label felt like a neutral choice rather than a
   desirable/undesirable answer.
3. What the animal label does and does not claim.
4. What is shared when they invite a partner.
5. What will enter an OmnyID account if they accept the import preview.
6. Whether the suggested planning action is relevant, editable and easy to
   dismiss.

Capture completion/abandonment, time to first result, skips, revisions,
misunderstood wording, inaccessible images or controls, and any image that feels
stereotyped or unrepresentative. Stop and correct the item if a participant
reasonably believes the result is a compatibility or psychological score.

Phase 1 passes when at least 90% correctly understand the non-diagnostic nature,
partner sharing and account-import boundary; no critical accessibility issue is
open; and no option set has a repeated diversity or desirability bias.

## Phase 2 — distribution and stability

After Phase 1 fixes, recruit a larger and more diverse sample. Pre-register the
sample target and analysis before looking at results. Review:

- score distribution and ceiling/floor effects for every dimension;
- option-selection imbalance that could indicate wording or image bias;
- stability when the same participant repeats the quiz after a suitable delay;
- changes after an answer correction;
- animal and runner-up distribution without treating labels as ground truth;
- performance by device, image-loading condition and broad voluntary cohort.

Do not tune the scoring to produce evenly distributed animals. Change an item
only for a documented comprehension, representation or measurement problem,
version the quiz, and rerun deterministic regression fixtures.

## Product usefulness outcome

For participants who explicitly import the result, measure only consented,
account-scoped AFP outcomes:

- suggestion shown;
- suggestion accepted, edited or dismissed;
- source-cited task or search default used;
- later correction or deletion;
- planning workflow selected.

An imported answer never becomes a confirmed budget, guest count, date, vendor
booking or permission to contact someone. Report aggregate acceptance and edit
rates; do not claim that a score predicts a successful wedding or relationship.

## Evidence packet

Freeze the full source SHA and quiz version. Retain the item/image provenance
manifest, accessibility report, deterministic scoring fixtures, de-identified
aggregate results, issue log, change decisions and owner sign-off. Keep raw
participant notes in the approved research store with stated retention and
access controls, not in the public repository.

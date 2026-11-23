# Wedding vendor-ranking reviewed corpus

Date: 2026-10-24 (Australia/Sydney)

## Outcome

`wedding-vendor-ranking-reviewed-corpus-v1.jsonl` is a reproducible, data-minimised
projection of the numeric relevance judgements in the Casper and Iris private
workbooks. It contains one manifest followed by 40 evaluation cases.

This is a **reviewed vendor-ranking corpus**, not the quotation-normalisation
accuracy corpus required by WED-225. The source workbooks do not contain the
money, currency, inclusions, exclusions and source-anchor judgements needed for
that separate gate.

## Source binding

| Reviewer label | Source SHA-256 |
| --- | --- |
| Casper | `8f155be4c3cedc036fd54983d97da543f8e186573585823eb5a796f5a73df958` |
| Iris | `c97e8773eea8203ef843aa7c8b5cb8fb07e664662387cdb7f03085170931340c` |

The private source paths and their contents are not application assets. The
generated corpus intentionally excludes source-fact JSON, links and free-text
review comments. It retains only the case profile, candidate title, 0-3 score,
recorded ideal order, reviewer label and derived agreement state.

Generated corpus SHA-256:
`1845d1ecd74f139539918167e572fbe98937ff18ae87dfd34ffeb284344b2885`.

## Coverage and agreement

| Measure | Result |
| --- | ---: |
| Evaluation cases | 40 |
| Scored candidates per reviewer | 480 |
| Score comparisons | 480 |
| Exact agreements | 477 |
| Exact agreement rate | 99.375% |
| Unresolved disagreements | 3 |
| Casper cases with an ideal top three | 4 of 40 |
| Iris cases with an ideal top three | 0 of 40 |

Score distributions are preserved in the manifest. Casper recorded 390 zeroes,
62 ones, 19 twos and 9 threes. Iris recorded 387 zeroes, 65 ones, 19 twos and
9 threes.

## Unresolved judgements

| Case | Candidate | Casper | Iris |
| --- | --- | ---: | ---: |
| eval-01 | 12-Micron (Waterman's Room) | 0 | 1 |
| eval-04 | Cafe 2773 Glenbrook | 0 | 1 |
| eval-04 | Conservation Hut Cafe | 0 | 1 |

The consensus score is `null` for these rows. The generator does not select one
reviewer's value or average ordinal labels.

Casper's eval-01 order names `12-Micron (Harbour room)`, which does not exactly
identify a candidate row in that case. The manifest records this as an ideal
order reference issue; it is not silently aliased to Waterman's Room.

## Provenance and readiness

The workbooks identify reviewer labels but do not attest that the reviews were
independent. Ranking-order coverage is incomplete. Consequently the corpus
declares both of these fields as `false`:

- `ranking_policy_v2_gate_eligible`
- `quotation_accuracy_corpus_gate_eligible`

Ranking policy V2 remains disabled. Before it can be reconsidered, a reviewer
must resolve the three score disagreements, correct or confirm the mismatched
order reference, complete the missing ideal orders, and provide review
provenance/independence evidence. Policy comparison should then use a
commit-bound replay with the predeclared ranking metric and threshold.

## Reproduction

From `solid-ui`, run:

```powershell
node scripts/build-reviewed-vendor-ranking-corpus.mjs `
  --casper <private-casper-workbook> `
  --iris <private-iris-workbook> `
  --output ..\Documents\verification\wedding-vendor-ranking-reviewed-corpus-v1.jsonl
node --test tests/reviewed-vendor-ranking-corpus.test.mjs
```

The command refuses a result other than 40 cases and 480 candidate scores per
reviewer. Tests enforce minimisation, disagreement preservation, missing
provenance, incomplete ordering and rollout-ineligible status.

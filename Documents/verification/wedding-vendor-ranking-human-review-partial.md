# Wedding vendor ranking human review — partial evidence

Status: partial human evidence only  
Recorded: 2026-10-22  
Implementation branch: `agent/codex/WED-215`

## Scope

The user has completed and saved rankings and comments for the first three cases in the private
venue-ranking evaluation workbook:

`Documents/design/wedding planner/private/wedding-vendor-ranking-eval-casper.md`

The source workbook remains private and is not copied into application assets. This record captures
only completion state, scenario anchors, and the resulting ideal ordering needed to reproduce the
evaluation. It does not reproduce the user's private free-text comments.

## Reviewed cases

| Case | Scenario anchors | Human ideal order | Status |
|---|---|---|---|
| `eval-01` | 30 guests; AUD 20,000; February; Sydney CBD; intimacy priority | Bellevue Cottage By Antoine; 12-Micron (Harbour room); Barmilano | Reviewed |
| `eval-02` | 50 guests; AUD 35,000; May; Eastern Suburbs; wheelchair access | Bathers' Pavilion; Barmilano; Bondi Icebergs Club | Reviewed |
| `eval-03` | 80 guests; AUD 50,000; October; North Shore; food priority | Burnt Orange — Mosman; Capella Sydney (The Lands by Capella); Centennial Homestead | Reviewed |

## Human relevance rubric

Apply the rules in this order:

1. Score `0` for a clearly wrong location, including a normal travel time more than 30 minutes from
   the requested area. A hard location miss is not rescued by other attractive qualities.
2. Score `2` when a requirement must be compromised but the option remains plausibly usable.
3. Score `2` when location, capacity, and budget are all confirmed to fit.
4. Score `3` only when location, capacity, and budget fit and the couple's priorities and requested
   atmosphere also fit.

An evaluator may use score `1` for a weak or insufficiently supported candidate that is not an
unambiguous hard-location miss, but must explain the missing or weak evidence. Unknown facts are not
silently treated as confirmed matches.

## Gate effect

- These three cases count as completed first-judge venue-ranking evidence.
- They do not represent a second independent judge.
- They do not complete the full ranking corpus or its inter-rater agreement requirement.
- They do not satisfy the separate nine WED-240 ideal-agent human-review dimensions.
- They do not unblock WED-225 or WED-226 and do not authorise deployment.
- Ranking policy V2 remains disabled until its existing rollout criteria are met.

## Next review action

Run the remaining cases against one immutable candidate/source snapshot, then obtain a second
independent review of the same snapshot. Calculate agreement and ranking metrics only after both
review sets are complete; do not reinterpret the first three private comments as production labels.

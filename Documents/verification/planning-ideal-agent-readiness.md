# Planning ideal-agent readiness

Status: machine verifier available; release remains blocked.

The WED-240 verifier evaluates the WED-230 through WED-239 planning programme without enabling a
feature flag, contacting a provider, changing Oracle, or advancing a rollout cohort. It writes logs
and `readiness.json` under the ignored `target/planning-ideal-agent-readiness/` directory.

## Safe local invocation

Use only the disposable local database and scanner. The verifier rejects any database host other
than `127.0.0.1` and any database name other than `omnyid_test`; it also rejects a non-local ClamAV
endpoint.

```powershell
$env:TEST_DATABASE_URL = "<disposable postgres URL ending in 127.0.0.1:<port>/omnyid_test>"
$env:CLAMD_HOST = "127.0.0.1:<test clamd port>"
./scripts/verify-planning-ideal-agent-readiness.ps1
```

`-SkipWedding` and `-SkipBrowser` record missing gates. They do not turn a partial run into a pass.
The report reaches `machine_status: verified` only for a clean worktree with every machine check
passing.

## Human review records

Independent human-review records use one file per dimension and are supplied with
`-HumanReviewDirectory`. Each file must use this closed shape:

```json
{
  "schema_version": "planning.ideal_agent_human_review.v1",
  "dimension": "memory_fidelity",
  "status": "verified",
  "commit_sha": "<exact evaluated commit>",
  "reviewer": "<independent reviewer>",
  "recorded_at": "<RFC3339 timestamp>",
  "evidence_reference": "<durable review artifact>",
  "evidence_sha256": "<64 lowercase or uppercase hex characters>"
}
```

The nine dimension filenames are declared by
`config/planning_ideal_agent_evaluation_v1.json`. Missing, malformed, stale-commit or unbound records
remain blocked.

### What the nine dimensions mean

| Filename / dimension | Independent reviewer checks |
| --- | --- |
| `memory_fidelity.json` | Confirmed constraints are recalled exactly, superseded facts are not presented as current, and private source remarks are not silently broadened. |
| `cost_clarity.json` | Paid, committed, estimated, forecast, at-risk, and unknown amounts are distinguishable; advice never reads as an automatic reallocation or purchase. |
| `critical_path_wording.json` | Dependencies, dates, blockers, and uncertainty are understandable without graph or protocol jargon, and prepared work is not described as completed work. |
| `vendor_context_minimisation.json` | A vendor receives only explicitly approved, task-relevant requirements and questions; partner rationale, competitor data, scores, full-plan context, and private notes remain absent. |
| `accessibility.json` | Keyboard, screen-reader, zoom/reflow, contrast, focus, touch target, reduced-motion, error recovery, and status-not-by-colour behavior work on the evaluated build. |
| `couple_usability.json` | A couple can understand the next decision, evidence, unknowns, alternatives, consequences, and how to defer or undo without implementation guidance. |
| `vendor_usability.json` | A vendor can understand the bounded request, respond or revise, distinguish review from acceptance/booking, and recover from expired or invalid authority. |
| `permission_wording.json` | Copy states what will be shared or executed, with whom, and when; prepare/review/approve/send/book/pay remain visibly distinct. |
| `alternative_preservation.json` | Every materially valid option remains available, the recommendation is evidence-based rather than generic, and deferral or a non-recommended choice is not hidden. |

### Human-review workflow

1. Choose the exact clean commit to evaluate and deploy that same build only to an isolated review environment.
2. Review the applicable scenarios in `config/planning_ideal_agent_evaluation_v1.json`. Reviewers must be independent of the implementation and must record findings separately from the small verifier record.
3. Save a durable report, recording, worksheet, or audit export for each dimension. A single supporting artifact may cover several dimensions, but each dimension still needs its own JSON record.
4. Hash each supporting artifact with `Get-FileHash -Algorithm SHA256 <artifact>` and put its stable reference and digest in the corresponding record shown above.
5. Put the nine records in a review-only directory using the exact filenames in the table. These evidence records do not exist in the repository until reviewers create them; do not mark a record `verified` while a material finding remains open.
6. Run the verifier against the same clean commit:

```powershell
./scripts/verify-planning-ideal-agent-readiness.ps1 `
  -HumanReviewDirectory <directory-containing-the-nine-json-records>
```

The record's `commit_sha` must equal `git rev-parse HEAD`. A new implementation commit makes earlier
human records stale by design and requires review of the affected dimensions again.

## Release boundary

Machine and human verification still do not deploy or enable anything. Release eligibility also
requires WED-225 and WED-226 to leave `blocked`, plus the applicable mail/provider evidence. The
permissioned-vendor stage follows dark package, synthetic tenant and allowlisted-couple stages in
that order. Kill switches disable projection/action without deleting AFP or commercial history.

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

## Release boundary

Machine and human verification still do not deploy or enable anything. Release eligibility also
requires WED-225 and WED-226 to leave `blocked`, plus the applicable mail/provider evidence. The
permissioned-vendor stage follows dark package, synthetic tenant and allowlisted-couple stages in
that order. Kill switches disable projection/action without deleting AFP or commercial history.

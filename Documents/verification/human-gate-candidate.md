# Existing Wedding release: frozen human-review candidate

This candidate includes the existing email/quotation release and WED-275/276's dark professional
workspace foundation. WED-277 is not part of this continuation. The user selected preparation of
the existing release for human gates. No deployment, catch-all/DNS mutation, mail send or cohort
activation is part of candidate preparation.

## Open the three workbooks

The original path contains an extra separator: the file is
`Documents/issues/wedding planner/email-worker-security-review.html`, alongside
`human-review-form.html` and `release-gate-control.html`.

Use the full pushed candidate SHA reported in the handoff/final response as **Frozen source commit**
on each page. Do not substitute a short SHA, the earlier WED-276 SHA or the production SHA. The pages
also accept `?commit=<40-character SHA>` and carry it through their navigation links.

Before hosted sessions, deploy that exact candidate into the authorised review environment using
the existing release procedure. Independently verify its runtime SHA and enter the hosted URL and
runtime SHA. Merely entering matching strings in the workbook does not verify a deployment. Record
Worker and gateway versions, build configuration and flags in the external evidence too. Keep the
existing provider/mail/quotation/practice rollout gates closed until their prerequisites are met.

Each report now requires its **Reviewed source commit** and **Reviewed hosted URL**, in addition to
the named authority, RFC 3339 timestamp, reference, SHA-256 and completed actions. Evidence from a
different candidate or environment does not count, even if its status remains “Passed”. Previously
saved v2 records are preserved but require these missing bindings; new exports use
`omnyid.human_gate_execution.v3`. These browser records are operator attestations, not cryptographic
reviewer signatures or replacements for the server-side release verifiers.

Working evidence can be downloaded while blockers remain. Final signed export stays disabled until
the autonomous prerequisites and all human gates are complete. A published candidate is not release
approval. Missing hosted shadow, representative accuracy corpus, full adversarial/provider evidence
or independent review must not be marked complete using the focused tests below.

## Reproduce the source package

From a clean checkout of the final commit:

```powershell
$candidateSha = (git rev-parse HEAD).Trim()
./scripts/prepare-human-gate-candidate.ps1 `
  -ExpectedCommit $candidateSha `
  -OutputDirectory "C:/temp/omnyid-human-review-$candidateSha"
```

The helper refuses a different HEAD, dirty source or an existing output directory. It creates a
source archive, all three workbook pages and shared assets, `START-HERE.html` with candidate-bound
links, and `candidate.json` with source/tree identity and SHA-256 digests. Optional `-EvidenceFiles`
accepts explicitly selected, content-free reports. It hashes those artifacts without declaring them
passed, independently reviewed or hosted. Do not attach credentials, raw mail, full addresses or
secure response links. Creating this external package does not require another source commit.

For consistent browser storage, serve the generated directory on localhost, for example
`python -m http.server 4193 --bind 127.0.0.1 --directory <package-directory>`, then open
`http://127.0.0.1:4193/START-HERE.html`. The package does not include an application deployment.

## Automated evidence and remaining gates

The WED-285 handoff records actual executions and limitations. Relevant repeatable commands are:

```powershell
./scripts/prepare-human-gate-candidate-selftest.ps1
node --test cloudflare/vendor-email-ingress-worker/test/worker.test.mjs
cargo test --lib vendor_email_worker_ingress -j1
cargo test --lib gateway::smtp -j1
# TEST_DATABASE_URL must name a disposable localhost omnyid_test database with pgvector.
cargo test --test vendor_email_worker_ingress_api -j1 -- --test-threads=1
# CLAMD_HOST must point to a disposable live scanner; absence skips these tests.
cargo test --test clamav_live -j1 -- --test-threads=1
```

The scanner test covers a clean sample and the standard harmless EICAR fixture in memory. The HTTP
test's scanner is mocked; it proves authenticated encrypted quarantine and replay behavior, not a
live provider round trip. Neither test proves a complete MIME-bomb or malware corpus. Browser
coverage checks source/environment binding, focus continuity, persistent drafts and final-export
blocking. Existing quotation browser cases exercise synthetic fixture workflows.

The broader `scripts/verify-quotation-vendor-portal-readiness.ps1` and
`scripts/verify-planning-ideal-agent-readiness.ps1` remain authoritative for their documented
contracts. Obtain current-commit machine reports and the required external artifacts before claiming
their gates pass. Human review belongs to the independent reviewers, account/zone owner and cohort
owner named by the workbooks. The implementing agent does not supply their approvals.

## Scope and rollback

WED-285 changes review tooling and a live-scanner test, not mail routing or application authority.
Reverting the workbook change restores the previous form; keep downloaded evidence and its original
SHA. No migration or data rollback is required for this slice. WED-275/276 and all existing release
flags remain as they were. Eight professional-workspace implementation slices still remain.

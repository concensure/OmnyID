# Quotation closure and vendor portal readiness

Status: **blocked**

Task: WED-225 / DBV-10

Branch: `agent/codex/WED-215`
Implementation base: WED-224 commit `a5bb2d9`

This is an evidence index, not a deployment or production-health claim. GitHub Checks,
Deployments, and runtime health remain the operational authorities. Every quotation,
closure, response-capability, claimed-response, upload, and email-reconciliation switch
must remain off while this status is `blocked`, `failed`, or `untested`.

## Current verdict

The deterministic local scenario suite and aggregate privacy contract are implemented.
Release is blocked because disposable-Postgres execution, a real clean ClamAV scan,
accuracy-corpus evidence, an allowlisted provider smoke, independent security/privacy
review, hosted accessibility review, couple/vendor usability sessions, human review of
booking and permission wording, hosted shadow evidence, and cohort evidence have not
been supplied for the current commit.

No critical or high finding is represented as closed. The absence of a reviewer report is
a blocker, not a pass. Local Axe checks are useful machine evidence but do not constitute
independent accessibility or usability approval.

## Seven-scenario evidence map

| Scenario | Executable evidence | Expected invariant |
| --- | --- | --- |
| A - stale decision | `quotation_vendor_portal_e2e::scenario_a_material_successor_invalidates_the_active_decision`; `quotation_decision_api` | History remains, while active selection and closure disappear after a material quote successor. Shuffled and duplicate AFP delivery has the same projection. |
| B - changed contract | `quotation_vendor_portal_e2e::scenario_b_contract_change_requires_source_linked_human_review`; `quotation_closure_evidence` | A mandatory fee remains source-linked and booking cannot proceed until explicit review. |
| C - claimed AFP response | `quotation_vendor_portal_e2e::scenario_c_claimed_afp_response_is_review_only_and_competitor_blind`; `quotation_vendor_response_transport`; `quotation_vendor_response_api` | Only grant-bound material enters a review proposal; no competitor, private-note, acceptance, or booking state is produced. |
| D - secure link | `quotation_vendor_portal_e2e::scenario_d_secure_link_is_exact_bound_single_use_and_fail_closed`; `quotation_response_capability`; `quotation_response_capability_api` | Exact binding, strict cookie, CSRF, nonce, replay, expiry/revocation/authority checks, and multi-key rate limiting fail closed. |
| E - ordinary email reply | `quotation_vendor_portal_e2e::scenario_e_email_and_portal_material_converge_on_one_review_response`; server `quotation_email_response` tests | Semantically equal email and portal material share a fingerprint and converge on the same user-review facts. |
| F - booking closure | `quotation_vendor_portal_e2e::scenario_f_booking_retries_commit_once_and_refund_preserves_history`; `quotation_closure`; wedding closure adapter tests | Booking produces a stable commitment; retries do not duplicate it; cancellation/refund are successors and preserve history. |
| G - permission minimisation | `quotation_vendor_portal_e2e::scenario_g_permission_projection_rejects_private_and_competitor_fields`; `quotation_vendor_context` | Only approved requirements/questions project. Budget may appear only as an explicitly approved field; competitor/private/full-plan/score material is rejected. |

The scenario file is deliberately template-neutral. Wedding projection is covered through
the existing adapter and full wedding suite rather than by putting wedding state into the
quotation engine.

## Negative security and privacy matrix

| Risk | Evidence path | Current evidence class |
| --- | --- | --- |
| Tenant, vendor, grant, thread, quote, and session IDOR | conditional Postgres API tests plus always-run domain binding tests | Local/domain verified; real Postgres blocked |
| Attachment IDOR and active-content upload | secure revision route tests, shared document-ingest policy, WED-223 upload tests | Local verified; clean clamd blocked |
| Token brute force | token-prefix, IP-hash, vendor, and thread counters | Local verified; independent review blocked |
| CSRF, nonce replay, and session fixation | capability domain/API tests; transaction-only cookie with no account access | Local verified; independent review blocked |
| XSS | Solid renders projection values as text; browser fixture and CSP are exercised | Local verified; hosted review blocked |
| Referer and URL-token leakage | browser asserts immediate hash stripping and no token-bearing request; API requests use `no-referrer` | Local verified; hosted review blocked |
| Cache leakage and framing | exchange/consume API tests assert `no-store`, `no-cache`, `no-referrer`, CSP, and frame denial | Local verified; hosted review blocked |
| Logs and metrics | log-boundary guards; closed metric enums; unknown fields rejected | Local verified; independent review blocked |
| Stale/revoked/expired authority | replay, capability, grant, claim-key, and terminal-closure tests | Local verified; Postgres/reviewer blocked |
| Duplicate channels and ambiguous delivery | reconciliation and receipt tests | Local verified; provider smoke blocked |

## Aggregate metrics contract

`QuotationMetricEvent` accepts only fixed event, category, and outcome enums. There is no
free-form label position in which a user, vendor, thread, quotation, email address, URL,
token, source text, or commercial amount can be stored. Counts, bounded elapsed time,
fallback counts, correction counts, and OmnyID processing cost are the only values.

This answers the source brief's four investment questions without content:

1. `first_complete_quote_to_decision` and `first_complete_quote_to_booking` measure
   decision friction as bounded aggregate latency.
2. `clarification_exchanges_per_booking` measures communication burden by aggregate count.
3. `qualified_enquiry_outcome` supplies verified-booking and not-booked cohorts for a
   conversion rate.
4. `vendor_active_response_time` measures bounded active response time without page-view
   surveillance or email-open intent inference.

Extraction accuracy/manual correction, response channel, duplicate reconciliation,
security rejection, material change, and closure projection metrics use the same closed
contract. The WED-213 fixed minima remain unchanged: 100% source-anchor safety, zero
unsupported confirmed material fields, at least 98% exact money/currency, at least 95%
inclusion accuracy, and 100% deterministic/approval enforcement.

## Reproduction

From PowerShell at repository root:

```powershell
$env:CARGO_BUILD_JOBS = "2"
./scripts/verify-quotation-vendor-portal-readiness.ps1
```

By default the script runs the canonical quotation verifier with browser coverage, the
migration-catalog test, the full wedding tests, the Solid production build, and a WED-225
line-budget check. It writes an untracked evidence manifest to
`target/quotation-vendor-portal-readiness/quotation-vendor-portal-readiness.json` and
prints a SHA-256 digest over quotation programme inputs. It does not enable a flag, call a
live provider, send email, execute payment, or deploy.

`-SkipBrowser` or `-SkipWedding` may shorten diagnostic runs, but the manifest then stays
blocked. `TEST_DATABASE_URL` must name a disposable test database for the conditional HTTP
tests to count as Postgres evidence. Never point it at production.

## External evidence contract

Each human or environment evidence path supplied to the verifier must contain JSON with
this shape and must bind the exact current commit:

```json
{
  "schema_version": "quotation.external_evidence.v1",
  "gate": "security_privacy_review",
  "status": "verified",
  "commit_sha": "<40-character current commit SHA>",
  "reviewer": "<accountable human or named test authority>",
  "recorded_at": "<RFC 3339 timestamp>",
  "evidence_reference": "<stable report, receipt, or artifact reference>",
  "evidence_sha256": "<64-character SHA-256 of that supporting evidence>"
}
```

Accepted gate names are `accuracy_corpus`, `clamav_clean_scan`,
`allowlisted_provider_smoke`, `security_privacy_review`,
`hosted_accessibility_review`, `couple_usability`, `vendor_usability`,
`booking_permission_wording`, `hosted_shadow`, and `allowlisted_cohort`. Presence alone
does not pass a gate: wrong schema, gate, status, commit, reviewer, timestamp, supporting
reference, or supporting digest is reported as invalid. Reviewer reports retain their detailed
findings separately; this small record is only the digestable, commit-bound sign-off pointer.

## Rollout boundary

WED-226 may package and deploy this code dark only after this work is reviewed. A dark
deployment must leave every flag false and prove runtime SHA/configuration. Feature
enablement still requires a `verified` manifest, the applicable WED-213/WED-185 provider
gates, explicit canary authority, and rollback evidence. The rollback sequence is: disable
flags, stop invites, revoke outstanding links, retain AFP commercial history, then roll
back application code without deleting evidence.

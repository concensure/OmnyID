# Quotation Intelligence Readiness

Status: **untested for release**

This document records the reproducible gate, not a production-health claim. GitHub Checks,
Deployments, and runtime health remain the operational authorities.

## Fixed thresholds

| Measure | Release threshold |
|---|---:|
| Confirmed material source-anchor coverage | 100% |
| Unsupported confirmed price/availability/deposit/booking fields | 0 |
| Material money and currency exact match | at least 98% |
| Inclusion-state accuracy | at least 95% |
| Arithmetic, replay, and ordering determinism | 100% |
| Approval and provider-receipt enforcement for sends | 100% |

Thresholds are compile-time constants. Empty evidence is `untested`, never a pass. External
dependencies can set `blocked`; completed evidence below any threshold is `failed`.

## Local reproduction

From PowerShell at repository root:

```powershell
./scripts/verify-quotation-readiness.ps1

# Include the focused 360x740 and desktop accessibility/security fixture.
./scripts/verify-quotation-readiness.ps1 -IncludeBrowser
```

The script exercises the synthetic corpus, contracts, deterministic engine, AFP replay, source
boundary, extraction, review, clarification, closure, vendor-context boundary, readiness rules,
client state, and type checking. It does not call live model, OCR, email, payment, or vendor systems.

## Release controls

All quotation flags default false. Runtime flags are ignored unless all of the following are set:

- `OMNYID_QUOTATION_RELEASE_GATE=verified`
- `OMNYID_QUOTATION_RELEASE_GATE_VERSION=quotation.readiness.v1`
- `OMNYID_QUOTATION_RELEASE_EVIDENCE_SHA` is a 40- or 64-character hexadecimal artifact digest

Extraction, recommendation, clarification draft, clarification send, closure, and vendor-context
grants have independent switches. A failed or untested in-process readiness report disables all of
them even when requested.

## Evidence still required before release

- Run the full golden corpus through configured parsers and the hosted provider ladder in shadow
  mode; record precision, recall, exact matches, latency, fallback, correction, and cost aggregates.
- Exercise the completed clarification and wedding-closure adapters against a gated live Gmail
  account and temporary Postgres, including provider-receipt reconciliation after an ambiguous
  delivery result.
- Run tenant-isolation HTTP tests against temporary Postgres, browser accessibility at 360x740 and
  desktop across the hosted application, and complete the security matrix for SSRF, prompt
  injection, oversized inputs, stale actions, grants, and log leakage. The focused local quotation
  fixture passes Axe at 360x740 and desktop, prevents source-excerpt HTML execution, checks focus
  return and horizontal overflow, and proves approval invalidation; the existing wedding suite
  passes 1,874 tests and the production UI build passes. These do not substitute for hosted evidence.
- Record a seven-day allowlisted review cohort before broadening category or autonomy.

Vendor links remain disabled until the vendor-context red-team evidence passes. Payment execution
is outside scope and must remain disabled.

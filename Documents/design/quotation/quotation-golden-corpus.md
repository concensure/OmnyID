# Quotation golden corpus and baseline

Prepared: 2026-10-17

Base commit: `ac5b529343df6267afb64ece298f235ef5a3eb96`

This consent-safe corpus freezes the quotation-related seams that existed before the generic
quotation engine. It contains synthetic commercial data only. No name, email address, phone
number, street address, access token, or confidential vendor term is copied from a real source.

## Existing capability inventory

| Capability | Existing implementation | Quotation rule |
| --- | --- | --- |
| Wedding quote event to DecisionOS | `src/wedding_vendor_quote_orchestration.rs` | Adapt the event; do not replace or duplicate it. |
| Shared decision patterns | `src/wedding_vendor_decision_patterns.rs` and shared UI decision cards | Reuse review, clarify, compare, choose, approve-act, and record patterns. |
| Attachment ingestion | `src/server/ingest_routes.rs` | Extract a reusable service boundary before adding quotation routes. |
| Image OCR | Existing OpenAI image OCR path, advertised by `image_ocr_supported` | Reuse only when capability is enabled; do not implement OCR. |
| PDF parsing | Existing MinerU/LlamaParse selection | Return a typed parser-unavailable blocker when neither is configured. |
| Email provider and approval | Existing wedding outreach/provider receipt pipeline | All sends remain draft, approval, send, and receipt gated. |
| A2UI | Existing renderer and comparison primitives | Add small quotation adapters; do not fork the renderer or foundational card. |

The base includes the shared wedding LLM ladder from WED-189, existing shared decision patterns,
and the wedding quote-decision closure projector. The quotation core remains generic; wedding
planning is one adapter and context namespace.

## Corpus shape

`tests/fixtures/quotation/synthetic_quote_versions.json` has 12 documents and two immutable
versions per document. Eight use the venue registry. The remaining four prove that the contract
is reusable by event, conference, and production-style templates.

Each version contains a human-authored expected fact with:

- a canonical key;
- an expected value or explicit unknown/conflicting state;
- an evidence state; and
- an exact excerpt contained in the synthetic source text.

The set covers text PDFs, scanned PDFs through the existing OCR boundary, images through OCR,
email bodies, DOCX parser output, a missing legacy-DOC parser, a revised quote, and a source that
contains an instruction-like sentence. The instruction is data and must never change a schema,
invoke a tool, or create a booking state.

## Baseline invariants

1. A single existing wedding quote produces a review/decision request, not a comparative winner.
2. Projection is deterministic and does not copy the source quote object into the decision card.
3. A revision resolves the earlier decision before creating the successor request.
4. Missing OCR/parser capability produces no confirmed extraction.
5. All future gold fields need exact, synthetic evidence excerpts.
6. Raw documents remain in the existing attachment retention system; AFP stores references and
   bounded excerpts only.

Repository-wide `cargo fmt --check` currently reports formatting drift in files outside this task.
The new quotation files are formatted independently, and no inherited line-budget failure is
treated as passing evidence.

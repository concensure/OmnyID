# Venue Quote Comparison v3 — dependency-ordered tasks

Status: v2 released under WED-350/WED-377; v3 implementation complete under WED-383, release evidence pending

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| QV2-01 | Freeze the v2 schema and component-versus-total invariant. | — | Schema distinguishes per-head, whole-package, fixed fee and minimum spend; 120 × A$275 fixture cannot populate whole-package total. |
| QV2-02 | Add the bounded public extraction route using the shared funded-inference and rate-limit infrastructure. | QV2-01 | Secret remains server-side; body/rate/spend limits and provider no-collection request are present. |
| QV2-03 | Validate every returned type, range and exact source snippet. | QV2-02 | Fabricated snippets and invalid states are downgraded to not found; focused Rust tests pass. |
| QV2-04 | Split browser calculation into a deterministic engine with commercial terms, line items, minimum spend, service, GST and overtime. | QV2-01 | Unknowns never become zero; formula lines identify quoted and calculated inputs. |
| QV2-05 | Replace regex scanning with explicit contextual analysis and accurate privacy copy. | QV2-02, QV2-03 | Paste causes no request; analysis button explains processing; manual fields work without analysis. |
| QV2-06 | Build source-grounded suggestion cards and form-to-source/source-to-form navigation. | QV2-05 | Visible snippets work with keyboard/touch; applying is always explicit; accepted field selects its source. |
| QV2-07 | Add selection extraction and genuine ambiguity pills. | QV2-06 | Visitor can map a selected source to a field; per-head/total fork explains deterministic multiplication. |
| QV2-08 | Add editable line-item tables and inclusion deltas. | QV2-04, QV2-06 | Per-head/fixed/included rows are editable; counted rows affect the formula once; comparison highlights differences. |
| QV2-09 | Add three-state gaps and copyable venue questions. | QV2-04, QV2-06 | Extracted, not stated and not analysed differ; missing payment/GST/overtime/service/drinks yield questions. |
| QV2-10 | Add local structured cache and re-paste diff. | QV2-06 | Cache stores no quote text; unchanged text makes no second call; changed extraction shows material changes; cache can be cleared. |
| QV2-11 | Enlarge desktop public pages without changing phone scale. | — | Root is one scale step larger, Wedding is two; fixed/sticky elements and pages remain usable without horizontal overflow. |
| QV2-12 | Update privacy, SEO and smoke contracts. | QV2-05 | Public copy no longer falsely claims no model transfer; analytics never receives quote payloads; metadata and links remain valid. |
| QV2-13 | Verify and release from a clean exact-SHA worktree. | all | Focused browser/Rust tests, Wedding CI and build pass; Oracle manifest and hosted route/browser evidence match the frozen SHA. |

## Deliberately deferred

- PDF/DOCX extraction remains the existing authenticated document-ingestion
  path; the public tool reads TXT/Markdown/EML locally and accepts pasted text.
- Public-tool results are not persisted as AFP records. Import into an account
  remains an explicit later action through the canonical quote authority.
- The model does not decide which venue to book and does not perform arithmetic.

## WED-383 incremental tasks

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| QV3-01 | Inventory and reuse the public decoder, authenticated Quotes hub, canonical quotation normal form and AFP decision authority. | QV2-13 | No parallel quote store, parser, calculator or decision ledger is introduced; Quote received remains a vendor status, not the comparison destination. |
| QV3-02 | Extend the normal form for deposits, cancellation/expiry, date eligibility, capacity and item status/minimum eligibility. | QV3-01 | Deposit remains outside total; unknowns stay unknown; every correction retains source evidence. |
| QV3-03 | Add immutable original-versus-scenario line-item state. | QV3-02 | Optional rows can be toggled or quantified; mandatory and bundled rows explain why they cannot be deducted; the source quote is unchanged. |
| QV3-04 | Correct deterministic minimum-spend allocation. | QV3-03 | Only eligible spend meets the floor; A$5,200 less a A$400 eligible upgrade becomes A$4,800 plus A$200 shortfall = A$5,000. |
| QV3-05 | Add viability and vendor-confirmation checks. | QV3-02 | Date, capacity, guest minimum/maximum, duration and changed-rate conditions are checked before viable language is shown. |
| QV3-06 | Recalculate both scenarios, difference and remaining wedding budget live. | QV3-03, QV3-04 | Guest/date/duration/add-on edits update without navigation or reload and identify each material change. |
| QV3-07 | Add trade-off, conditional recommendation and most-material-unknown summary. | QV3-05, QV3-06 | 30/40 guest crossover is explained; staffing unknown remains in totals and recommendation. |
| QV3-08 | Add prefer, confirm and keep-open actions through the existing AFP decision authority. | QV3-07 | Authenticated choice is wedding-scoped and source-linked; public choice is explicitly device-only. |
| QV3-09 | Complete source intake across canonical PDF, email/message, text and manual paths. | QV3-01 | Existing authenticated ingestion is reused; the public page accepts email/plain text and provides an honest PDF fallback where browser extraction is unavailable. |
| QV3-10 | Verify public and authenticated experiences. | QV3-02..QV3-09 | Deterministic unit/property tests, browser scenario checks, quote-route tests, typecheck/build and exact-SHA evidence pass. |

### Delivery order

1. Public deterministic scenario engine and no-login comparison page:
   QV3-02 through QV3-07 and the public portion of QV3-09.
2. Authenticated Quotes-hub persistence and decision projection: QV3-08 and
   the authenticated portion of QV3-09.
3. Cross-surface and release verification: QV3-10.

The first slice must remain useful if funded extraction is unavailable: manual
terms, line items, minimum-spend scenarios and comparison continue locally.

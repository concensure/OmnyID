# Venue Quote Comparison v2 — dependency-ordered tasks

Status: completed and released under WED-350 on 10 November 2026

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

- PDF/DOCX extraction remains the existing broader document-ingestion work;
  the public tool reads TXT/Markdown locally and accepts pasted text.
- Public-tool results are not persisted as AFP records. Import into an account
  remains an explicit later action through the canonical quote authority.
- The model does not decide which venue to book and does not perform arithmetic.

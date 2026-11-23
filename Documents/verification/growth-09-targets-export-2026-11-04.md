# GROWTH-09 targets, diagnostics and export evidence

Date: 2026-11-04 (Australia/Sydney)

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/GROWTH-001`

Base commit: `7670b0b07bfd72118f3da3423e25588d41572658`

## Implemented

- Added append-only, operator-attributed benchmark revisions for the six canonical Growth KPIs.
- Fixed each KPI's unit and comparison direction on the server. Clients cannot invent either.
- Added an explicit rationale, effective window and `supersedes_id` chain; no target is seeded.
- Added maturity diagnostics for registered and activated Weddings whose seven-day windows remain
  open.
- Moved Growth export receipts to a dedicated admin audit table and retained formula-safe,
  definition-labelled CSV output.
- Added authenticated CSV download, benchmark editing, target display, and small-sample warnings to
  the existing operator Growth panel.

## Evidence

- `cargo check --lib`: passed with `CARGO_INCREMENTAL=0` and shared `CARGO_TARGET_DIR`.
- `cargo test --test growth_dashboard_api -- --nocapture`: passed against a fresh disposable
  `pgvector/pgvector:pg18` database bound only to `127.0.0.1`. It proves anonymous 401,
  non-operator 403, operator 200, disabled 404, bounded input rejection, two retained target
  revisions linked by `supersedes_id`, and one audited CSV export receipt. The container was
  removed after the run.
- `cargo test --lib migration_catalog_matches_current_embedded_set -- --nocapture`: passed.
- Growth state tests: passed.
- `npx playwright test tests/e2e/wedding-growth-analytics.spec.ts --config
  playwright.config.ts`: passed at 375 px, including benchmark creation.
- `npm run typecheck`: passed.
- `npm run build`: passed (1,631 modules transformed).
- `git diff --check`: passed; all new implementation files remain below 999 lines.

No Growth flag was enabled and nothing was deployed. GROWTH-10 must exercise this from a clean
candidate commit before any rollout decision.

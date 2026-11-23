# GROWTH-10 disposable full-stack evidence

Date: 4 November 2026

Implementation SHA: `3c8648238e6a9027ae3f4ef794c145b440d849a3`

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

## Completed automatically

- Built the real Rust homeserver and production Solid UI from the clean implementation SHA.
- Started a loopback-only `pgvector/pgvector:pg16` container with a tmpfs data directory and an `omnyid_test` database.
- Registered synthetic `@omnyid.test` accounts through the real authentication route.
- Used the existing public measurement, AFP activation and payment/refund projectors rather than inserting dashboard totals.
- Proved that the disabled Growth route returns 404 and does not add a Growth admin-audit row.
- Proved anonymous access returns 401 and an ordinary account returns 403.
- Imported the same spend CSV twice through the authenticated operator API and observed a new receipt followed by an idempotent duplicate receipt.
- Reconciled two landing sessions, two registered Weddings, two activations, one days-one-to-seven return, one paid Wedding, A$120 spend, A$49 gross and A$10 refunded.
- Opened the real Cost Dashboard Growth panel in Chromium and verified the funnel and paid campaign row.
- Repeated the browser path at 375 px, including keyboard focus and axe serious/critical checks, with no serious or critical violation and no horizontal overflow.
- Removed the disposable database container and local child processes.

Command:

```powershell
$env:CARGO_TARGET_DIR='C:\cargo-target'
$env:CARGO_INCREMENTAL='0'
pwsh -NoProfile -File .\scripts\e2e-growth-stack.ps1
```

Result: one Playwright test passed. The harness reported:

```text
Growth full-stack harness passed at 3c8648238e6a9027ae3f4ef794c145b440d849a3
```

## Deliberately not claimed

No Oracle application release or production flag change was made. The hosted flag-off shadow,
runtime-manifest SHA comparison and observed rollback remain deployment-stage evidence. Local
proof is not relabelled as hosted proof. Growth analytics therefore remains false-default in
production.

# WED-302 Wedding response payload release evidence

Date: 2026-10-30 (Australia/Sydney)

## Release identity

- Application SHA: `823bf7a0aa85301bf039bc7feac203ef94d5ed20`
- Branch: `agent/codex/WED-302`
- Development worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Clean release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed302-release-823bf7a`
- Deployment: Oracle production, UI service only, simulated data excluded

The coordination commit after this record is documentation-only. Production UI code comes from the application SHA above; the backend remains the WED-295 release.

## Outcome

- `ResponseQueueView` no longer statically imports the Wedding workspace, intake wizard or rich-response surface.
- Each surface loads through an explicit Solid lazy boundary only when its state selects that surface.
- Loading fallbacks use `role=status` and polite announcements. Module/render failures remain inside a local error boundary with truthful saved-data copy and a reload action.
- AFP projections, state construction, handlers and backend contracts are unchanged.
- The generic response route no longer downloads the large Wedding workspace or optional intake/rich-response modules.

## Bundle comparison

| Asset | Before | Exact candidate | Hosted |
| --- | ---: | ---: | ---: |
| Response queue core | 1,660,630 bytes (about 452 KB gzip) | 876,101 bytes (about 249 KB gzip) | 877,006 bytes, HTTP 200 |
| Wedding workspace | Included in core | 749,544 bytes (about 195 KB gzip) | 749,995 bytes, HTTP 200 |
| Wedding intake | Included in core | 26,481 bytes (about 7.7 KB gzip) | 26,481 bytes, HTTP 200 |
| Wedding rich response | Included in core | 5,549 bytes (about 1.9 KB gzip) | 5,549 bytes, HTTP 200 |

The core response feature payload is approximately 47% smaller uncompressed and 45% smaller compressed. Wedding Home still loads its workspace feature after the route shell; intake and standalone rich-response code remain deferred until needed.

## Exact-candidate checks

- Clean checkout and full 40-character SHA verified before checks.
- TypeScript: pass.
- Wedding tests: 2,065 pass.
- Source and Wedding line-budget tests: 2 pass.
- Production UI build: pass.
- Feature-boundary regression tests: 2 pass as part of the Wedding suite.
- New feature-boundary source file: under 100 lines.

The dependency install retained 39 inherited audit findings (38 moderate and 1 high). No forced dependency rewrite was applied.

## Oracle proof

- Preflight: pass.
- Exact runtime staging: 57 reviewed paths; simulated data excluded.
- UI image build and one-shot asset population: pass.
- Caddy replacement and `/workspace/` smoke: HTTP 200.
- Post-deploy backup/runtime proof including restore drill: pass.
- Hosted response core, Wedding workspace, intake and rich-response chunks: HTTP 200 with expected bounded sizes.
- Root disk: 73% used, about 13 GB free.

The effective backend flags remain:

- `OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED=false`
- `OMNYID_VENDOR_MAIL_ENABLED=false`
- `OMNYID_VENDOR_SENDER_MASK_ENABLED=false`
- `OMNYID_VENDOR_MAIL_INGRESS_ENABLED=false`

No backend container, AFP authority, external-delivery permission or rollout policy changed in this UI-only release.

## Next useful slice

The Wedding workspace feature is still about 750 KB. A later measured slice can split menu-specific Documents, vendor, seating and secondary planning surfaces inside `WeddingResponseWorkspaceView`, retaining Today as the primary feature boundary. WED-286's provider-observed bounce/complaint evidence remains independently open before vendor-mail activation.

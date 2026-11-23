# WED-356 Wedding card refinement release evidence

Date: 10 November 2026  
Implementation SHA: `e2a1e816367c02570000ed2eab1445ee1696f805`  
Release checkout: `C:\temp\wt\omnyid-wed356-release-e2a1e81`

## Completed

- Removed the requested Limited Specials empty-state sentence and all-category
  button without removing the fallback date-enquiry workflow.
- Restored approved vendor media to comparison-card projection and replaced the
  Favourite text action with an accessible photo-overlay heart.
- Removed Wedding decision queue prose and separated the rationale action as a
  lower-right question button.
- Kept Wedding Overview assignment in place and added account-scoped AFP notes
  for Budget, Guests and Seating, projected by both Up Next and Notes.
- Made non-zero vendor activity filters visually distinct and count bearing;
  zero-count states remain absent.
- Audited the vendor management portal implementation boundary. First-release
  tasks are complete; P1 extensions remain explicitly deferred.

## Verification

- `npm run typecheck`: pass.
- `npm run test:line-budget`: 2/2 pass.
- `npm run test:wedding`: 2,262/2,262 pass.
- Clean detached exact-SHA `npm run build`: pass.
- Oracle deploy preflight/post-deploy proof: pass.
- Oracle `SOURCE_COMMIT`: exact SHA match.
- Oracle `oracle-runtime-manifest.json`: exact SHA match.
- Hosted workspace: HTTP 200.
- Hosted bundle checks: My activity, AFP note action, favourite heart and Show
  Me Why question control present; removed Limited Specials sentence absent.
- Backup verification and restore drill: pass.
- Simulated data: not included.
- Production root and `/var` use: 80%.

The public health routes are intentionally ops-token gated and return 401 to an
unauthenticated browser. The authenticated deployment proof reports the
homeserver and backup service running.

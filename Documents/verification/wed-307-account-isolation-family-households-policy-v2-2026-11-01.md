# WED-307 Account Isolation, Family Households and Ranking Policy V2 Evidence

Date: 2026-11-01

## Release provenance

- Branch: `agent/codex/WED-307`
- Exact deployed application SHA:
  `b353d47122fe8aa15885ae4fdc64a81aaec69b41`
- Clean release checkout:
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed307-b353d47`
- Deployment used Oracle's existing `.env.oracle`; no local environment file,
  credential or simulated dataset was uploaded.
- The release checkout had no tracked changes before build and deployment. The
  deployment proof directory was generated afterwards and remained untracked.

## Implemented boundary

- An authenticated account boundary now runs before application state is
  hydrated. When the account identity changes it clears ambiguous, unscoped
  Wedding, decision, contact, profile and persona-adjacent browser state while
  preserving data that is explicitly scoped to the new account.
- Login identity replacement and guest-to-authenticated transitions reload the
  application after the boundary is applied. Logout clears the in-memory
  dashboard rather than leaving the preceding user's projection visible.
- Authenticated contact and profile readers no longer adopt old global values
  whose owner cannot be proven. The Wedding quiz handoff remains available only
  for the explicit `source=wedding_quiz` account-creation path.
- The compact Family boundaries surface restores focus when Requests or
  Households is opened. Household rows project representative, members,
  invitation allocation, remaining places, RSVP summary, pending requests,
  deadline and attention from the existing AFP ledger.
- Editing a household's family group, invitation allocation or request deadline
  writes a successor AFP household object. It does not create a second guest or
  household store.
- The Plan hub action cards stack title, explanation and status on phones, with
  a minimum card height and full-width text, so the centre copy is no longer
  compressed into a narrow column.

## Recreated-account inspection

The Oracle database was inspected for `casper.wu01@gmail.com` without printing
credentials or profile content. The recreated identity has a fresh account ID,
creation time `2026-10-31 01:13:27.253052+00`, zero onboarding rows and zero
persona rows. Its three managed-agent rows are the expected account bootstrap,
not a retained user-selected persona. This distinguishes the observed phone
behaviour from server-side retained profile data: it was unscoped browser state.

The existing deletion route inventories and removes SeaweedFS/filesystem
objects before deleting the tenant schema and user, and database foreign keys
cascade account-owned profile, onboarding and related rows. Existing route
tests assert this purge ordering and the returned storage receipt.

## Exact-candidate verification

The unchanged application SHA passed:

- Solid UI typecheck.
- Both repository line-budget checks.
- Focused account-boundary, contact/profile ownership, Family household/mobile
  and ranking-policy tests.
- Full Wedding suite: 2,105 passed, 0 failed.
- Production Solid UI build with
  `VITE_WEDDING_VENDOR_RANKING_POLICY_V2=true`.

The built ranking bundle contained the Policy V2 flag and
`rankingPolicyVersion` fingerprint. No new Rust or migration contract was added
in this slice.

## Oracle deployment and hosted verification

The exact release was deployed with `scripts/deploy-oracle.ps1`. Hosted checks
after deployment established:

- `https://omnyid.com/workspace/` returns HTTP 200.
- `assets/main-Duft8VhU.js` contains the authenticated-account boundary marker.
- `assets/ResponseQueueView-CP_0iB9J.js` contains
  `VITE_WEDDING_VENDOR_RANKING_POLICY_V2:"true"` and the policy fingerprint.
- `assets/WeddingResponseWorkspaceView-DJWKvQbM.js` contains the Family
  household editor and permissions surface.
- `assets/index-CAjiU95g.css` contains the 10 rem mobile Plan-card minimum
  height rule.
- Oracle `.env.oracle` contains
  `VITE_WEDDING_VENDOR_RANKING_POLICY_V2=true`.
- The production homeserver is running with zero restarts, and the production
  workspace, Caddy, backup, database, Electric and SeaweedFS containers remain
  up.

Policy V2 is therefore both compiled into and configured for the live Oracle
release. Source verification and suitability evidence remain distinct under
the policy.

## Operational caveat

Manifest integrity and backup verification passed. The post-deploy restore
drill did not start because its safety preflight required 8,280,865,439 bytes
free and found 7,920,603,136 bytes, a 360,262,303-byte (about 0.34 GiB) gap.
The application deployment completed and the hosted checks above pass, but the
overall generated production-proof report is correctly marked failed at
`restore_drill`; it must not be represented as a successful restore proof.

At final inspection the root and Docker filesystem used 37 GiB of 45 GiB (84%)
with 7.2 GiB free. Docker reported about 9.26 GB of reclaimable images and
4.93 GB of reclaimable build cache. A reviewed safe prune can restore enough
headroom before rerunning the drill.

## Remaining Family Boundaries roadmap

This release completes WED-307's account-isolation and household-projection
slice. The broader WED-306 roadmap still includes server-authoritative family
grants, structured rule precedence, atomic request decisions, household
split/merge/archive commands, connected reconciliation, restricted-helper
privacy testing and controlled rollout evidence. Those remain ordered in
`Documents/design/wedding planner/wedding planner/family-boundary-tasks.md`.

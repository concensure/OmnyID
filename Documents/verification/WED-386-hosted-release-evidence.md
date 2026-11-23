# WED-386 hosted release evidence

Date: 2026-11-21

## Frozen release

- Application and static source: `23b9c57007188e460135f0e0c71806180f69d7a9`.
- Oracle homeserver image: `sha256:f6ef45dee35b37772100c2798268af9315abc2f150a76b996cb22fad1a7c0e96`.
- Workspace package SHA-256: `996990B62B256A9EA3BCD2C83BF16FEAED7CED9BACF05E094B881ECBC2530049`.
- Deployed RSVP asset: `rsvp-DRrzvj_q.js`, SHA-256 `e12d89349a810c5d9dae04fa71df3209e83c6ce743c8f1aae8583c5360c69a41`.
- Previous homeserver image retained as `omnyid-homeserver:wed386-rollback-de181133` (`sha256:de181133e9463ae2d63b25137b80a4a402ad0bd3645d59dd1ae8cd43281f5706`).
- Pre-change application/config and workspace-volume backups remain under `/home/ubuntu/omnyid-candidates/wed386-23b9c570/hosted-proof/config-rollback/`.

The workspace volume was checked separately from the homeserver image. It initially contained an older RSVP bundle even though the WED-386 backend image was live. The frontend was rebuilt from a clean detached worktree at the frozen SHA, packaged with the hash above, deployed to the workspace volume, and then checked through both the origin and public Caddy route. No server-tree image build was used.

## Hosted RSVP evidence

One dedicated synthetic couple and a two-person household were used. Existing vendor and celebrant accounts were not mutated because this RSVP gate exercises couple/guest authority; their retained authenticated role/account regression remains applicable to the vendor surfaces.

- Canonical guest profiles, invitations and setup were written through the authenticated AFP send route.
- The household preview/test envelope contained the canonical host, date, local time, time zone, venue and address and exposed no submit action.
- One guest was saved attending, reopened, and amended from revision 2 to revision 3; the other was saved not attending.
- The returning confirmation exposed only guest-safe fields. Private plaintext and ciphertext were absent.
- The test provider returned `provider_accepted`; the exact replay was suppressed.
- Before/after counts changed only for the test draft, approval, reservation and provider receipt. Capability, RSVP response, setup, profile and invitation lifecycle counts did not change.
- The synthetic production capability was revoked after the browser check and subsequently returned 404.
- Mobile 320 x 760 and desktop 1280 x 900 browser checks passed without horizontal overflow or console errors.

Sensitive capability tokens, credentials, recipient addresses and provider receipt identifiers are deliberately retained only in the restricted server-side evidence directory and are not committed.

## Quote and homepage evidence

- `https://omnyid.com/wedding/` returns the general “a wedding that feels like you” headline and names small weddings alongside larger celebrations.
- The deployed no-login quote comparison passed its 390 px Playwright flow. An optional A$400 minimum-eligible upgrade produced A$5,200, removing it produced a labelled A$5,000 Scenario estimate with a A$200 change, the remaining budget updated, the deposit stayed separate, the original quote remained intact, and the added item could be deleted.
- The authenticated Wedding quote scenario tests passed 12/12, including quantity changes, added/removed items, immutable original evidence, bundled/mandatory locks, unknowns, capacity and minimum-spend decision flips.

## Final Oracle proof

The final proof is stored locally at `C:\temp\wed386-oracle-proof-final-r2` and passed with:

- backup service running: true;
- homeserver running: true;
- backup manifest verification: pass;
- isolated PostgreSQL restore drill: pass;
- root filesystem use: 71% at proof time.

The first post-rollout proof exposed that `.env.oracle` had become root-owned mode `0600`. Docker services were healthy, but the normal `ubuntu` operator could not read the Compose environment. Ownership was repaired to `ubuntu:ubuntu` while retaining mode `0600`; the exact Compose service query and the full proof then passed.

Final production posture: public RSVP publishing is off, the pilot list is empty, reminder send is off, mail ingress is off, vendor welcome mail is off, and test-to-self is on only behind authenticated review, provider readiness and the exact recipient allowlist. Caddy validation and public `/wedding/`, `/workspace/rsvp.html`, quote comparison, `/healthz` and `/readyz` checks passed.

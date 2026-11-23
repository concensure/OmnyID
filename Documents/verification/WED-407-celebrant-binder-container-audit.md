# WED-407 celebrant, Binder and container audit

Date: 2026-11-23 (Australia/Sydney)

## Scope

- Restore a truthful public celebrant-consultation discovery response and the complete file-backed phone-verification configuration path.
- Let an operator create a co-branded image preview from any page of the existing day-of Binder without changing the source PDF.
- Allow a verified account email to prove ownership when it exactly matches the selected listing email, including public-mail addresses, without permitting domain-only public-mail claims.
- Preserve and publish the bounded WED-406 celebrant-data and blog work.
- Audit the ten live Oracle containers before retaining them.

## Oracle container audit

The live inventory contained seven production services and three isolated staging services:

| Project | Container role | Evidence for retention |
| --- | --- | --- |
| production | Caddy | Public TLS proxy and static Wedding/Workspace delivery |
| production | homeserver | Authenticated and public API runtime |
| production | Postgres | Canonical application database |
| production | Electric | Postgres change/sync service |
| production | SeaweedFS | Uploaded-object storage |
| production | ClamAV | Uploaded-file malware scanning |
| production | backup | Scheduled database/object backup process |
| staging | homeserver | Isolated risky backend/auth release proof |
| staging | Postgres | Isolated staging database |
| staging | Electric | Isolated staging sync path |

All ten were running; the staging stack had current activity and retained isolated data. No container was an unexplained or idle orphan, so none was removed. The staging stack is required by the repository's production-safety gate for this backend/auth change.

## Security and product decisions

- Public consultation discovery is readable even while mutations are disabled. It reports `consultations_enabled`, `phone_verification_configured` and `requests_enabled`, returns no invented availability, and keeps all verification/request mutations fail-closed.
- Production Compose uses fixed `/run/secrets/...` defaults for all consultation/Twilio file-backed secrets. The rollout flag remains false by default in source and must be explicitly enabled in the production environment.
- Exact listing-email verification requires the authenticated account email to be verified and its full normalized mailbox to equal the selected listing's contact email. A different Gmail mailbox still fails; Gmail-domain equality alone never proves ownership.
- Binder co-branding is an operator-only, browser-local preview. It accepts PNG/JPEG/WebP logos up to 5 MB, overlays the logo on the selected page footer, exports PNG/JPG, performs no upload, and does not alter or repackage the original PDF.

## Data authority notes

- WED-406 contains four blank-fill enrichments and one new record. The four canonical register-import rows already exist in production. Pauline Appiah-Dwyer is inserted with registration pending; no unsupported register verification is asserted.
- The requested `Double Happiness` / `Lourde` celebrant does not match a production vendor, user, claim or proposal record. Public results identify multiple materially different businesses under similar names, so no record or bearer capability should be guessed. A link can be generated through the existing operator authority as soon as the exact canonical listing (or a verified source/contact) is supplied.

## Release evidence

- Exact implementation and deployed source SHA: `1cf789eff1a7a2cb9db5f2a1b837f01225851280`.
- Clean candidate: `C:/temp/wt/omnyid-wed407-release-1cf789ef`; TypeScript, line budgets, the focused Binder tests, focused ownership and consultation Rust tests, the public-site suite and the 1,862-module production build passed. The implementation worktree also passed all 2,390 Wedding tests before the exact-SHA candidate was cut.
- Native ARM64 workflow `45137881583` built the exact SHA. Archive SHA-256 is `0984ae1ecc42e907c5cdefc9677b704660f5ac5c544b946ea502cf57c11e55ba`; the loaded image is ARM64, carries the exact revision label and has image id `sha256:4185d53b3f449710262c97e17a3098ea0c54137b94369bd1e675dadf68f26c2f`. Docker's pre-save manifest id differs from the loaded config id, but the checked archive digest and embedded revision are unchanged.
- Staging ran the exact image with zero restarts and returned HTTP 200 from the consultation discovery route with requests truthfully disabled because staging has no production Twilio secrets.
- Production returns HTTP 200 from both `omnyid.com` and `api.omnyid.com`; the payload reports consultations and phone verification configured, returns no invented cards, and keeps request availability derived from the complete gate.
- The WED-406 load updated four existing records by blank-fill only, inserted Pauline Appiah-Dwyer with registration pending, inserted 26 reviewed attributes and created one pilot profile. Both guides, catalogue metadata and the root sitemap are live.
- The exact Workspace index hash is `a91bd96927dcb48fcb8ca0959861bd373935bc12729c540192b5a26689d4e486`; the hosted Usage chunk contains the Binder co-branding panel. The original print Binder PDF and cover both continue to return HTTP 200.
- The scheduled authenticated monitor passed all eight checks, Caddy validation passed and the production homeserver has zero restarts. `SOURCE_COMMIT` and `oracle-runtime-manifest.json` name the exact SHA.
- Rollback is retained at `/home/ubuntu/omnyid-candidates/wed407-1cf789eff1a7a2cb9db5f2a1b837f01225851280/rollback`, with the previous `b8c5012` image additionally tagged `omnyid-homeserver:pre-wed407-b8c5012`.
- The ten running containers remain seven production and three staging services. Two stopped UI containers and obsolete images with no container references were removed; root use is 71% with about 13 GB free.
- No Double Happiness capability was generated. The requested name does not resolve to a unique production authority record, so there is no truthful expiry to report. The existing operator generator uses a 14-day default once the exact canonical vendor is supplied.

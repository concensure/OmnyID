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

## Required release evidence

The final release record must add the exact implementation SHA, clean candidate path, staging result, native ARM64 image/build identity, production rollback references, database load counts, public API response, hosted static hashes, health checks and any generated capability expiry.

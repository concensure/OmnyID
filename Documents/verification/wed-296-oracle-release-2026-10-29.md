# WED-296 Oracle release receipt

## Release identity

- Released at: 2026-10-29 Australia/Sydney
- Source worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Source branch: `agent/codex/WED-296`
- Deployed source SHA: `518a106fdf2c8253144175d7ab591e51e47db1a7`
- Source state at build: clean
- Quotation-readiness evidence digest: `656705c72756eadbe221d624c0726fb513f391c978a562cc8607b8a7a950d5d8`
- Quotation-readiness manifest SHA-256: `32b9c538ecf130ce2dd1cf97527cea8a74f9f3d5d55094ce5937d8daa4a76ffb`

The owner explicitly confirmed that the human reviews represented by the three Wedding review workbooks were complete and authorised release. The owner-authorization record is `Documents/verification/wed-296-owner-human-gate-authorization.md`. This receipt binds that authority to the exact clean implementation candidate above; it does not invent reviewer identities or signatures.

## Released controls

The production UI was built with `VITE_WEDDING_VENDOR_RANKING_POLICY_V2=true`. The quotation release gate and the extraction, recommendation, clarification, closure, grant, claimed-vendor-response and email-response-reconciliation capabilities were enabled with the commit-bound evidence digest above.

The following vendor-email transport controls remained disabled:

- `OMNYID_VENDOR_MAIL_ENABLED=false`
- `OMNYID_VENDOR_SENDER_MASK_ENABLED=false`
- `OMNYID_VENDOR_MAIL_INGRESS_ENABLED=false`

Consequently, this release does not claim that the external masked-email relay is production-ready. WED-286 still requires provider-observed live bounce or complaint evidence before that separate transport can be enabled.

## Deployment and runtime evidence

- Environment backup: `.env.oracle.wed296-20261028T153922Z.bak`
- Preflight proof: `artifacts/oracle-production-proof-wed296-518a106f/preflight/oracle-production-proof.json`
- Preflight proof SHA-256: `d15f30ef79d8570e4b291c1dfdaf8585764eb5cb9a6626e9e420e93278f4da95`
- Synchronous post-deploy proof: `artifacts/oracle-production-proof-wed296-518a106f/postdeploy-sync/oracle-production-proof.json`
- Post-deploy proof SHA-256: `0565cd462949bb50eb92696ae6fe033ccd7a455dd7f03a2ea60e52fa25fa6902`
- Post-deploy status: `pass`
- Backup service running: `true`
- Homeserver running: `true`
- Backup verification: `pass`
- Restore drill: `pass`
- Root and `/var` disk use: 78%
- Failure step: `none`
- Public workspace check: `https://omnyid.com/workspace/` returned HTTP 200

The public `/healthz` route requires a session token and therefore was not represented as an anonymous HTTP-200 health result. The authenticated/internal machine proof above is the runtime authority used for the release.

The deploy command's detached local post-deploy poller remained attached after the remote audit had already completed successfully. That stale local poller was stopped without changing production, and the same production proof was rerun synchronously. The committed synchronous proof is the release evidence.

## Rollback boundary

Rollback means restoring `.env.oracle.wed296-20261028T153922Z.bak`, rebuilding the Wedding UI without the Policy V2 build flag, and redeploying the prior scoped homeserver/UI release. Vendor mail, sender-mask and ingress flags must remain false throughout rollback unless a later independently verified relay release explicitly supersedes this receipt.

This receipt was committed after deployment. Its commit is an audit record only; the deployed application source remains `518a106fdf2c8253144175d7ab591e51e47db1a7`.

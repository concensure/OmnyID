# WED-297 Oracle release record

## Candidate

- Source SHA: `e668e4b92ede40d68d2141696001e16405303e87`
- Branch: `agent/codex/WED-297`
- Development worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Detached release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed297-release-e668e4b`
- Deployment profile: `docker-compose.oracle.minimal.yml`
- Simulated/source data: excluded
- Remote environment: existing `.env.oracle` preserved

## Candidate verification

- TypeScript typecheck: pass
- Focused quiz-import and public-surface tests: 10/10 pass
- Wedding site, CSP and animal-quiz engine smoke: pass
- Source and Wedding line budgets: pass
- Full Wedding suite: 2,023/2,023 pass
- Production UI build: pass; existing chunk-size advisory only

The changed quiz/profile-owner source files and all three changed Wedding static files were hashed after deployment. Each Oracle source hash exactly matched the detached release checkout.

## Deployment evidence

The guarded deployment rebuilt the UI, homeserver and backup images, recreated the relevant containers, reloaded Caddy and returned HTTP 200 for the workspace smoke with its CSP present.

The full detached remote audit completed with exit code 0 and reported:

- runtime-script integrity: pass
- backup verification: pass
- restore drill: pass
- failure step: none
- root and `/var` use at completion: 81%

The local detached-job poller did not collect that already-complete result and was stopped without stopping or rolling back Oracle. A fresh read-only collector then generated the committed files in [wed-297-oracle-proof-2026-10-29](./wed-297-oracle-proof-2026-10-29/) and reported `status=pass`, `failure_step=none`, backup verification pass, homeserver/backup services running and 80% disk use. Its restore status is `skipped` because the immediately preceding full remote drill had already passed and was not repeated.

## Live checks

- `https://omnyid.com/wedding/`: HTTP 200; run-sheet section, source-link explanation and approval wording present.
- `https://omnyid.com/wedding/animal-quiz.html`: HTTP 200; versioned WED-297 quiz asset selected.
- `https://omnyid.com/wedding/assets/js/quiz.js?v=20261029-wed297`: HTTP 200; bounded handoff, stretch-budget and deal-breaker fields present.

The designated test account returned HTTP 401 for the locally saved password, classified as a credential mismatch. No password, bearer token or private AFP content was printed; no account reset was attempted. This release does not misstate that authenticated browser smoke as passed.

## Scope boundary

This release connects the quiz to the existing authenticated AFP backend and publishes a run-sheet preview. It also deploys the already committed WED-290 registry and WED-291 deterministic projector core because they are ancestors of the candidate. WED-291 remains open for the atomic server transaction, durable checkpoint advancement, expanded selectors, failure/concurrency proof and UI invocation.

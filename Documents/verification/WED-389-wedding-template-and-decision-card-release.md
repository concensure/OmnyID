# WED-389 Wedding template and decision-card release

Date: 2026-11-21

## Outcome

The Wedding template no longer traps a stale browser in an endless Retry loop. A
failed lazy module load now reloads the latest application shell while preserving
the Wedding route and account-backed plan. The release also retains older hashed
assets on Oracle, so an already-open browser can finish loading its prior module
graph during the release transition.

Wedding decision cards now lead with one concrete question, the relevant known
facts, the single missing fact most likely to change the choice and a
readiness-matched action. Internal ranking and processing prose is not presented
as advice. Recommendation detail, evidence, trade-offs, alternatives and sources
remain progressively disclosed.

The existing Defer action now states its exact reminder date and lets the couple
choose a different future date before saving. It continues to write the existing
AFP `wedding_decision_deferral` authority, including dependency-change
resurfacing; no parallel reminder store or scheduler was introduced. Current,
next and following decisions are prepared and research-ready before their cards
are presented, while research remains bounded and does not start for a fourth
decision.

On mobile, the decision content scrolls independently and the two labelled
actions remain clear of the bottom navigation and assistant control. The scoped
spec and dependency-ordered task document are committed beside the supplied
requirement guidance.

## Frozen source and clean verification

- Branch: `agent/codex/WED-389`.
- Implementation commit:
  `568dcb3e332ebb0fc8244cef9e5e923485de05d2`.
- Exact deployed application/static source:
  `c445e740a000f0faf5cc99562a88db15ed441eba`.
- Clean detached release worktree:
  `C:\temp\wt\omnyid-wed389-release-c445e740`.
- `npm run test:wedding:ci`: pass, including typecheck, both line budgets,
  public/security checks and all 2,328 Wedding tests.
- `npm run build`: pass. The existing large-chunk warning remains a warning.
- Focused mobile browser proof: pass at 320, 390 and 430 pixels and 200 percent
  text zoom, with the actions visible and no horizontal overflow.
- The focused tests cover the editable reminder serialization, stale-module
  recovery and bounded current/next/following research gate.

## Oracle release

The homeserver and compiled workspace were released from the exact source above.
No Caddy, Compose, migration or environment change was included.

- Runtime archive SHA-256:
  `35ee7e5cbe99cb255f2e404e51efecd1a996918267ee2842ba6869659124c239`.
- Workspace archive SHA-256:
  `4aef7bf1127275d927800deca45a60d942b15efbca9d3a2983b7c4649cb20177`.
- Native ARM64 homeserver image:
  `sha256:78551e7e1379087c6b49a3675f04bc0f1ad20c9a3c38970900809e3731f2cc6e`.
- The image OCI revision is the full deployed source SHA and its platform is
  `linux/arm64`.
- Deployed workspace `index.html` SHA-256:
  `e4d9e2bb1ad2323c52cc2ff5c7b5996dd65c3ee0e638b47d9d96ecce9f9933d9`.
- Deployed main bundle SHA-256:
  `d63d508623ab46f4edea09590dc8e3c472623f2cd48d72c7a3eb7ec6f411ee8d`.
- Deployed Templates bundle SHA-256:
  `2d7ce825c8cc6603f4f621beb3ddb522722af59cab077eecdac4f12138eec924`.
- Deployed decision-card bundle SHA-256:
  `0e3acc1ea9c5fe1db6c8871f8bbc53b07b31bf59bf7b887ad073d0aac529b49c`.
- Deployed Wedding-workspace bundle SHA-256:
  `beb9e82459640ec873312049553a82c0e6c1abc424ecd4ed745e99b5a6711767`.

The workspace release was additive: new hashed assets were copied first and the
new shell was copied last. Asset count increased from 204 to 267, preserving the
prior WED-386/WED-388 chunks needed by already-open clients. All live hashes above
match the clean build byte-for-byte.

The candidate and evidence are retained at:

`/home/ubuntu/omnyid-candidates/wed389-c445e740a000f0faf5cc99562a88db15ed441eba`

Rollback retains the previous homeserver image as
`omnyid-homeserver:wed389-rollback-f6ef45`, whose image ID is
`sha256:f6ef45dee35b37772100c2798268af9315abc2f150a76b996cb22fad1a7c0e96`.
The prior workspace archive is retained under the candidate's `rollback`
directory with SHA-256
`6a3e41afdd145cb6e195cf1ac5c83376c0b0326c4347b1dd0d1edf54f648f545`.
The prior Caddyfile, Compose file, container inventory and image inspection are
retained there as well.

## Hosted proof

- `/wedding/`, `/workspace/` and `/docs/` return 200.
- Anonymous `/healthz` and `/readyz` retain their expected authenticated 401.
- The decision-research endpoint is installed: GET returns method-not-allowed and
  an invalid empty POST reaches request validation and returns 422.
- Public Wedding and Wedding-origin sign-in passed live Chromium at 390 x 844 and
  1280 x 900 with no page errors, failed requests or horizontal overflow. Ask
  Sprout remains absent and the sign-in form remains usable.
- The signed-out Wedding mobile shell shows Today, does not show Retry or Reload
  and has no page error or overflow.
- The current public asset hashes match the exact build. The prior WED-388 main
  bundle and all three retained Templates bundle generations return 200.
- Caddy validates and is byte-identical to the pre-release file. The live
  homeserver is running the image above with zero restarts. Root usage is 73%.
- The full detached Oracle production audit completed with `STATUS=pass`,
  including backup service, manifest verification, runtime-script integrity and
  an isolated restore drill. Its captured stdout is
  `C:\temp\wed389-oracle-proof-final-light-c445e740\full-restore-proof.stdout.txt`
  with SHA-256
  `70792225f3a675406e80e641d9fbd0add89100a9a70adf1f2ab95b015d2a5bcf`.
- The final machine-readable light proof is
  `C:\temp\wed389-oracle-proof-final-light-c445e740\oracle-production-proof.json`
  with SHA-256
  `ffc2505c8a4ad37e4e08372c963a83f28e42c2378966d5b0d1b000492223821e`.

The retained WED-386 synthetic couple credential is no longer accepted by the
live authentication boundary, so no authenticated production account was
mutated and no authenticated live-card claim is made. The complete exact-SHA
suite and focused browser tests prove the authenticated decision behavior; the
hosted checks prove that the matching bundles and backend image are live. This
release did not change celebrant or vendor workflows, so those accounts were not
used.

## Follow-up observations

The runtime staging helper omitted Docker-required test fixtures and two
compile-time installer scripts. Exact committed copies were added only to the
isolated candidate before its native build, and their hashes are retained in the
candidate evidence. The helper should be corrected in a separate release so its
manifest is complete by construction.

The local production-proof collector did not exit after the remote full audit had
already completed successfully. Its client-side polling was interrupted without
interrupting or invalidating the completed remote audit; the final light proof
then emitted the machine-readable JSON normally. The polling behavior should be
diagnosed separately.

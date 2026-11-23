# WED-390 Wedding decision and production-monitor release

Date: 2026-11-22

## Outcome

Every current Wedding decision card now uses the shared definition-first contract,
not only transport. The registry covers all 25 planning-task kinds and the setup,
calendar, selected-decision and approval projections. Each definition declares its
question, ordered prerequisites, answer authority, deadline policy, options,
evidence and external-approval boundary before card copy is produced.

Missing setup choices surface before dependent work, settled choices leave the
actionable queue, and existing deadlines plus urgent blockers determine priority.
Compact and detailed cards agree on one choice and one next action, show source-linked
quote amounts, inclusions, constraints, estimates and unknowns, and retain the
existing approval and provider-receipt flow for external commitments. The bulk audit
flags compound choices, missing prerequisites, unsupported recommendations and
repeated settled choices through the Wedding PersonalOS projection.

The current, next and following decisions must be research-ready before presentation;
research does not spill into a fourth card. The existing Defer authority continues to
own reminders and exposes the exact editable reminder date.

A read-only production synthetic now runs at 08:00 and 20:00 Australia/Sydney with
bounded jitter. It checks the public Wedding page, workspace shell, password login,
session, bootstrap, health, readiness and current JavaScript asset. Credentials are
root-owned mode 0600 systemd credentials and do not appear in the journal.

## Frozen source and verification

- Branch: `agent/codex/WED-390`.
- Exact deployed application/static source:
  `3c22a9c7766455fa591ddd5b19ee14f9b2fc8517`.
- Clean detached release worktree:
  `C:\temp\wt\omnyid-wed390-release-3c22a9c7`.
- `npm run test:wedding:ci`: pass, including typecheck, public/security checks,
  both line budgets and all 2,336 Wedding tests.
- `npm run build`: pass. The inherited large-chunk warning remains a warning.
- `scripts/omnyid-wedding-monitor-selftest.sh`: pass.
- Focused Rust regressions: the six registered system-daemon kinds receive shared
  liveness reports, and readiness accepts both RFC 3339 and PostgreSQL timestamptz
  text. Both pass from the exact release worktree.
- The dependency install retained the inherited audit summary of 38 moderate and one
  high finding; dependency changes were not mixed into this release.

## Exa decision research

The live bounded smoke passed for transport, celebrant and florist. Each query
returned five relevant, first-party-like sources. Examples included provider capacity
and accessibility, celebrant package/legal inclusions, and seasonal florist terms.
Deterministic query shaping and the existing response structure are sufficient, so no
system-prompt rewrite was added. Search highlights remain labelled unconfirmed until
the couple or vendor verifies them.

Local report:
`C:\temp\wed390-3c22a9c7-exa.json`, SHA-256
`609cacc2ba2c81c413c57d12701788c1f486827887bea4741a01b9c8198d0783`.

## Oracle release

- Native ARM64 image:
  `sha256:3a3301fa2b925e1fbf03387ea4978c152d1e7a226cda279e057965f59a6efb15`.
- Image revision label: the full deployed source SHA above.
- Native binary SHA-256:
  `ae03b25624329610ac42abf35918ffd1a7c8bf28109b7ff24da08d237cf1a5a8`.
- Source archive SHA-256:
  `805fe08caacb58238b3f23a3d14f0c9ec31dcc5327c1d469f182e5d91b2e8921`.
- Runtime archive SHA-256:
  `41f99d203f0a19c61c98c8f8dc7ba18476b75b7c07835c3f44b0c33983dda4c7`.
- Workspace archive SHA-256:
  `0800201e448180186d1c5b123fcdbc39a4c477cf25fa7acb1e683ab0f0278c63`.
- Monitor archive SHA-256:
  `f5d2dd3db7abe86eb16f81d41faa5a84b57a1c5a34d332e8ea4da43d9616bc18`.
- Deployed workspace `index.html` SHA-256:
  `48375bc01ea72b60afe79fc8308e06b94f675b8f75bef336ba6decc6d24be819`.
- Deployed main bundle SHA-256:
  `ef3127d6f3e4927dcfdbcba93ca9657a38a712f8fc8214fc9fe0c6f04504b944`.

The final native build used the established isolated Oracle candidate pattern: exact
Git archive, no live-tree build, two CPUs, 12 GiB memory, an 8 GiB tmpfs target cache
and Rust 1.94.0. Transient extracted sources, duplicate binaries and unused BuildKit
cache were removed after their hashes were retained. Root usage was 79% before and
after deployment.

## Hosted proof

- Authenticated `/readyz` returns `status: ready` with database, object store,
  daemons, SMTP, LLM, Gmail OAuth and Composio healthy; optional Stripe is correctly
  `not_configured`.
- The manual monitor run reports `pass` with all eight checks returning HTTP 200.
- `/wedding/`, `/workspace/` and `/docs/` return 200.
- The timer is enabled and active; its next persisted jittered run is visible in
  systemd.
- Credential files are `0600 root:root`; the monitor journal contains zero matches
  for the synthetic account address.
- Caddy validates and is byte-identical to the pre-release file.
- The live container runs the exact image above with zero restarts.

The candidate, build log, monitor/readiness JSON and release evidence are retained at:

`/home/ubuntu/omnyid-candidates/wed390-3c22a9c7766455fa591ddd5b19ee14f9b2fc8517`

Rollback is retained at:

`/home/ubuntu/omnyid-candidates/wed390-3c22a9c7766455fa591ddd5b19ee14f9b2fc8517/rollback-20261121T162505Z`

It contains the previous image ID
`sha256:78551e7e1379087c6b49a3675f04bc0f1ad20c9a3c38970900809e3731f2cc6e`,
workspace archive, Caddyfile, Compose file, monitor units and container inventory.

Earlier candidate attempts failed closed and restored the previous image. They exposed
two real readiness defects: optional Stripe was incorrectly activated by an unrelated
workspace URL, and PostgreSQL heartbeat text was parsed only as RFC 3339. The final
release fixes both while preserving strict readiness rather than bypassing it.

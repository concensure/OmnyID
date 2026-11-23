# GROWTH-02 acquisition-linkage evidence

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Branch: `agent/codex/GROWTH-001`
- Feature commit: `b4cbff5dfeeb9254a448e8f4430025954f9d848c`
- Production state: not deployed

## Implemented boundary

- New password, Google and Apple accounts may submit only a valid 12-character opaque visit from
  session storage. Existing-account login does not create an acquisition link.
- The server copies campaign, referrer, intent and landing values from its own public-measurement
  session. It does not accept those facts from registration.
- A visit is unique to one user. That user can attach it to the first Wedding plan only; a different
  user or plan cannot replace either side. Partner acceptance has no acquisition-linking path.
- First-touch and last-non-direct-touch are deterministic and bounded by touch expiry. Direct,
  internal and unknown touches cannot overwrite last non-direct attribution.
- Touch and identity rows expire within 30 days or cascade with their source visit/user. Browser
  state remains same-session only. Persistent cross-session identity stays disabled until there is
  explicit approved opt-in and no GPC/DNT signal.

## Evidence

- Two Node tests passed for the bounded current/legacy session visit and rejection of email-, query-
  or otherwise malformed values.
- Twelve focused Rust Growth tests passed, covering attribution models and the seven canonical event
  definitions. The database test ran against disposable tmpfs pgvector with all migrations applied:
  it resolved a trusted server touch, rejected a second user's claim and refused a Wedding swap.
- Migration-catalog parity, `cargo check --lib`, Solid typecheck and both file-line-budget tests
  passed. Every new file is below 999 lines and no disposable Growth container remains.

## Deliberate non-feature

This commit does not create a persistent browser identifier. That path remains false-default until
the product has an approved explicit consent state and the GPC/DNT constraints can be enforced at
the point of collection. Same-session attribution is useful without weakening that privacy boundary.

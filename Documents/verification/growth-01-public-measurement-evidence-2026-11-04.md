# GROWTH-01 replay-safe public measurement evidence

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Branch: `agent/codex/GROWTH-001`
- Feature commit: `e25b8525290569dca713a268ce5966eb7eb731e1`
- Schema: `public-measurement.v1`
- Production state: not deployed

## Implemented boundary

- The browser creates a bounded 20-character client event ID before transport and retains the same
  ID across failed fetches and unacknowledged `sendBeacon` navigation sends.
- Postgres enforces one event per `(visit_id, event_id)`. Exact replay is ignored; another event in
  the same visit is stored once.
- The root home and Wedding public pages share one same-origin session-storage visit. Only `/`,
  `/wedding` and `/wedding/*` are accepted; workspace and unapproved root paths fail closed.
- Batch schema, event count, body size, event names, property names/types, paths and IDs are bounded.
  GPC, DNT and known bots still produce no measurement write.
- Raw anonymous sessions older than 30 days are removed in at most four 1,000-session batches per
  maintenance pass; event rows cascade with their session. No persistent cross-session attribution
  or third-party tracker was added.

## Evidence

- Browser replay smoke: root beacon IDs survive a root-to-Wedding navigation, reuse the same visit
  and landing touch, and clear only after an acknowledged response. DNT creates no storage/request.
- Focused Rust: 10 measurement-related tests passed, including schema, ID, path, property, batch,
  privacy/bot and retention boundaries.
- Disposable pgvector: migration 0137 applied on a tmpfs database; exact replay plus one new event
  yielded two rows, and the 30-day batch cleanup removed the aged session and cascaded both events.
- Growth contracts: seven tests passed. Migration-catalog parity and `cargo check --lib` passed.
- Public surfaces: both line-budget tests, the Wedding site/CSP suite and 74-page public metadata
  smoke passed. No new file exceeds 999 lines.

## Release boundary

The committed candidate changes the homeserver schema and static public assets, so it must be built
and deployed from a clean exact-SHA release checkout before production can be called replay-safe.
No live measurement migration or application deployment was performed as part of this task.

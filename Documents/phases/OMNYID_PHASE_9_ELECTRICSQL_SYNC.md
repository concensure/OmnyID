# Omnyid Phase 9 ElectricSQL Local-First Sync

## Phase 9: ElectricSQL Local-First Sync

Status: server contract complete; Electric server + client PGLite wiring remaining

Purpose: define the local-first sync slices before wiring ElectricSQL into the running stack.

## What Was Landed

### Sync Slice Contract

- [src/local_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/local_sync.rs) now defines:
  - sync slice names
  - conflict modes
  - default sync slice specs
  - a device bootstrap record for ElectricSQL plus PGLite flows
- The default plan explicitly preserves the shared-thread model across:
  - inbox summaries
  - thread metadata
  - page structures
  - action states
  - ciphertext blobs
  - layout config

### Encryption-Aware Local Sync Baseline

- `requires_local_key_material(...)` now keeps the future ElectricSQL plan honest: ciphertext-bearing slices imply local key material on the client side.
- The tests in [src/local_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/local_sync.rs) lock in the expectation that synced thread state includes both inbox and ciphertext slices.

### Durable Device Bootstrap Table

- [postgres/migrations/0002_workflow_state.sql](/c:/Users/ozans/Desktop/projects/Agenton/postgres/migrations/0002_workflow_state.sql) now adds `sync_devices`.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now includes `upsert_sync_device(...)`.

### Dashboard Device Bootstrap Bundles

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now exposes `POST /dashboard/device-bootstrap-bundle`.
- The hosted dashboard in [docs/index.html](/c:/Users/ozans/Desktop/projects/Agenton/docs/index.html) and [docs/app.js](/c:/Users/ozans/Desktop/projects/Agenton/docs/app.js) can now generate bootstrap bundles for:
  - desktop
  - mobile
  - watch
- Each bundle includes:
  - `device-bootstrap.json`
  - `sync-plan.json`
  - `README.md`
- The generated bootstrap contract now makes the future ElectricSQL path more concrete by carrying:
  - a device-scoped sync identity
  - default sync slices
  - a PGlite target path appropriate to the device class
  - an encrypted seed reference placeholder
  - an explicit `requires_local_key_material` flag for ciphertext-bearing slices

### Device Sync Policy Registry

- [postgres/migrations/0012_sync_device_policies.sql](/c:/Users/ozans/Desktop/projects/Agenton/postgres/migrations/0012_sync_device_policies.sql) now persists a per-device local-first policy registry.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now supports:
  - `upsert_sync_device_policy(...)`
  - `list_sync_device_policies_by_user(...)`
  - `find_sync_device_policy_by_user(...)`
  - `update_sync_device_policy(...)`
- [src/local_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/local_sync.rs) now defines device-aware sync profiles instead of one universal plan:
  - desktop defaults to `full`
  - mobile defaults to `balanced`
  - watch defaults to `lightweight`
- The hosted dashboard now exposes that registry through:
  - `GET /dashboard/device-sync-policies`
  - `POST /dashboard/device-sync-policies`
- That means device class now changes actual sync behavior:
  - desktop can keep richer ciphertext-bearing slices
  - mobile can keep recent encrypted thread state without full workspace weight
  - watch can stay summary-first and avoid ciphertext entirely in `lightweight` mode

### Shape Descriptor API (added Phase 9 completion pass)

- `SliceShapeDescriptor` struct added to `src/local_sync.rs`:
  - `table`: Postgres table name
  - `where_clause`: optional row filter (e.g. `account_id = $1`)
  - `requires_key_material`: whether the client needs local E2EE key material to use this slice
  - `conflict_mode`: `LastWriteWins` or `AppendOnly`
- `shape_descriptors_for_slices()` maps each `SyncSliceName` to its descriptor
- `GET /sync/shapes` endpoint in `src/server.rs` returns the descriptor list for the requesting device class and sync profile
- `GET /sync/bootstrap` endpoint returns `DeviceBootstrap` + shape descriptors + `sync_endpoint` URL as a single bootstrap response

These descriptors are the bridge to ElectricSQL: a client using the Electric client library reads these descriptors and passes `table` + `where_clause` directly to `Electric.syncShape()` or PGLite's `useLiveQuery` to subscribe.

## Still Remaining For Instant Edge Updates

- add an `electric` service to `docker-compose.oracle.minimal.yml` pointing at the Postgres instance
- define client access tokens scoped by device for Electric
- add browser-local PGLite initialization in the Solid UI, consuming the bootstrap and shapes from `/sync/bootstrap`
- handle offline replay and conflict resolution on merge
- replace the encrypted seed reference placeholder with a real local key bootstrap and re-key flow

## Notes

The server-side shape contract is now complete and matches what the Electric client library expects. A client can call `/sync/bootstrap`, get the shape descriptors, and configure PGLite subscriptions today. The missing piece is the Electric server process itself and the client-side PGLite initialization in the Solid UI — once those are wired, edge devices will receive instant Postgres change-stream updates without polling.

# WED-289 Generic Database Contract Inventory

Date: 2026-10-29 AEDT
Branch: `agent/codex/WED-289`
Starting commit: `5b51eeb724303b49e914e3623789c61bfb8f633d`

## Purpose

Freeze one forward AFP contract before `wedding_runsheet.v1` creates records. This inventory concerns the existing generic Database surface; it does not introduce a run-sheet page or a relational row store.

## Existing write paths

| Writer | Previous shape | WED-289 treatment |
|---|---|---|
| `DatabaseView` create/import | `type: database_record`, `content.kind: database_record`, table and data only | Uses the canonical record builder with contract version, database ID, stable record ID, revision, idempotency key and source-reference slot |
| `DatabaseView` inline edit | `type: note:ledger_update`, `content.kind: database_record_update`, target message ID and patch | Uses the canonical revision builder with database ID, base revision, next revision, operation and idempotency key |
| `DatabaseView` add field | `type/content.kind: database_schema_update`, table and column only | Uses the canonical schema builder with database ID, contract version and idempotency key |
| `BentoQuickAdd` data entry | Direct unversioned `database_record` write | Reuses the same canonical record command as Database View |
| Sample dashboard | Static unversioned `database_record` fixtures | Remains a read-compatibility fixture; it is not a runtime writer |

No other runtime source writer was found under `solid-ui/src`, `src`, or `typescript-sdk` for `database_record` or `database_schema_update`.

## Existing read paths

- `DatabaseView` gathers account-scoped bootstrap AFP messages and its just-saved local projection.
- `databaseViewState.ts` previously parsed mounted records/updates directly and used message ID as row identity.
- `BentoQuickAdd` writes but does not project rows.
- The older `Documents/specs/OMNYID_DATABASE_VIEW_SPEC.md` describes neutral `type: database` messages whose raw content is the record and whose `metadata.database_id` groups records.

WED-289 moves neutral and mounted parsing to `databaseMessageCompatibility.ts`. The generic grid consumes only its normalized projection.

## Hosted shape observation

A read-only aggregate query was run against Oracle on 2026-10-29. It inspected only type, content kind, contract-version presence and counts across the public message stores and every account-schema `messages` table. It returned zero database-family rows. No message content, account identity or schema identifier was exported.

Consequences:

- there is no observed hosted database record requiring a data rewrite;
- the compatibility adapter is still required for local fixtures, older clients and future restored histories;
- WED-289 must not fabricate a migration merely because the design document and mounted implementation differ; and
- once canonical writes are hosted, a later shadow inventory should confirm the expected versioned shape before removing compatibility code.

## Canonical forward contract

The forward contract uses these AFP families:

- `database_record` for an initial record revision;
- `note:ledger_update` with `kind: database_record_update` for append-only record revisions or tombstones;
- `database_schema_update` for schema additions;
- future `database_definition`, `database_profile`, `database_saved_view`, `database_archive`, and `database_projection_receipt` contracts defined in `src/database_contract.rs`.

Every canonical record/revision includes:

- `contract_version: 1`;
- stable `database_id` and `record_id`;
- positive revision metadata;
- a bounded idempotency key;
- a table presentation label; and
- bounded source references when the record is projected from another AFP object.

Until WED-290 creates durable definitions, existing generic writes use `database:legacy` as the visible compatibility database ID. They do not use a table name as database authority.

## Conflict and duplicate rules

1. Exact idempotency-key repeats have one effective result.
2. A canonical update applies only when `base_revision` equals the current effective revision and `revision = base_revision + 1`.
3. A revision whose database ID conflicts with the target record is rejected from the effective projection.
4. An orphan revision is retained as a conflict result but cannot create a row.
5. A tombstone removes the effective row without erasing prior AFP history.
6. Legacy updates without revision metadata apply in deterministic timestamp/message-ID order.
7. Unsupported future contract versions fail closed rather than being interpreted as legacy.
8. Account scope is supplied by authenticated AFP storage; any additionally declared foreign account scope is rejected by the Rust contract validator.

## Follow-on boundary

WED-290 may add database definitions and switching, but it must consume this contract. WED-291 may register `wedding_runsheet.v1`, but it must emit canonical records/revisions and projection receipts rather than writing a second store.

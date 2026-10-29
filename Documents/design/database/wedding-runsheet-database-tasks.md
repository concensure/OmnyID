# Wedding Run Sheet in Database — Detailed Implementation Tasks

## 1. Delivery rules

- Build on the reviewed advanced branch containing WED-181, WED-247, and WED-287.
- Do not copy another worktree wholesale.
- Keep AFP as authority and the UI as a projection.
- Extend the existing Database view through profile modules; do not create a parallel run-sheet page or store.
- Preserve creation and editing of ordinary non-wedding databases.
- Use A2UI only for portable contextual cards and approvals, not as a replacement spreadsheet renderer.
- Keep every new file below 1,000 lines.
- Do not add more feature logic to already-large files. Extract focused components/services first.
- Keep policy V2 and outbound sharing/delivery flags disabled until their existing rollout gates pass.
- Verify the exact clean commit before any package or deployment.

## 2. Proposed dependency chain

```text
WED-289 contract freeze and compatibility
        |
        +--> WED-290 generic database registry/switcher
        |
        +--> WED-291 wedding run-sheet projector
                    |
                    +--> WED-292 run-sheet profile editing and time model
                                  |
                                  +--> WED-293 saved views, print and sharing
                                  |
                                  +--> WED-294 conflicts, buffers and A2UI help
                                                |
                                                +--> WED-295 hardening and rollout evidence
```

## 3. WED-289 — Freeze the generic database contract

Implementation status (2026-10-29): complete on `agent/codex/WED-289`, pending final clean-commit verification. The mounted and neutral shapes now share one compatibility boundary and all runtime Database writers use the versioned canonical commands. A read-only hosted inventory observed zero database-family rows, so no production rewrite was introduced.

### Goal

Reconcile the older `database` design contract with the mounted `database_record`, `database_schema_update`, and `note:ledger_update` implementation before run-sheet records are added.

### Work

1. Inventory all database message writers/readers and migration fixtures.
2. Record which shapes are present in production data.
3. Select one canonical forward record/revision contract.
4. Add a read compatibility adapter for legacy shapes.
5. Add stable `database_id`, `record_id`, and revision/source metadata.
6. Define database definition, profile, saved-view, archive, and projection-receipt contracts.
7. Define deterministic idempotency keys and version conflict semantics.
8. Document the schema in the AFP registry and TypeScript types.
9. Reject cross-account database IDs and malformed source references.
10. Ensure no dual-write creates duplicate effective records.

### Suggested file decomposition

- `src/database_contract.rs`
- `src/server/database_routes.rs`
- `solid-ui/src/lib/databaseContract.ts`
- `solid-ui/src/lib/databaseMessageCompatibility.ts`
- focused Rust and TypeScript tests

Avoid growing `src/server/mod.rs`, `src/db.rs`, or `DatabaseView.tsx` with implementation bodies; mount thin route/module calls only.

### Tests

- legacy and canonical rows normalize to the same logical record;
- update ordering and tombstones are deterministic;
- cross-tenant IDs fail closed;
- repeated idempotency keys have one effect;
- invalid definitions/saved views are rejected;
- current Database fixtures remain readable.

### Exit criteria

- Architecture decision recorded.
- One canonical write path exists.
- Compatibility tests pass with no duplicate rows.

## 4. WED-290 — Add generic database definitions, switching, and creation

### Goal

Make Database a real multi-database surface before adding the wedding profile.

### Work

1. Add an account-scoped database definition projection.
2. Add a database switcher to the current Database header.
3. Add **New database** with Blank and registered-profile choices.
4. Persist database name, default table, profile, and archive state through AFP.
5. Replace the component-local `dbName` authority with the selected definition.
6. Scope records, schemas, and updates by `database_id`, not only table label.
7. Keep blank database creation available to every eligible account.
8. Add archive/restore confirmation dialogs.
9. Preserve old table-only records under a visible Legacy database definition.
10. Retain current CSV/JSON import and row/cell editing.

### UI decomposition

- `DatabaseView.tsx`: orchestration only
- `DatabaseHeader.tsx`: switcher and primary actions
- `DatabaseCreateDialog.tsx`: blank/profile selection
- `DatabaseGrid.tsx`: generic grid
- `DatabaseRecordEditor.tsx`: mobile/detail editor
- `databaseRegistryState.ts`: definitions and selection

### Tests

- create two unrelated databases and switch without row leakage;
- rename persists after refresh;
- archive requires confirmation and restore works;
- legacy records remain visible;
- generic database works with no wedding plan;
- mobile and keyboard focus checks.

### Exit criteria

- A non-wedding user can manage multiple databases.
- Wedding profile hooks exist but no wedding-specific projection has landed.

### Implementation status — 2026-10-29

Complete in WED-290. Database definitions, switching, blank/profile creation, durable rename, selected-database scoping, Legacy compatibility, and confirmed archive/restore are implemented. The `wedding_runsheet.v1` registry hook is available only when an accessible wedding plan is present; no wedding-specific row projection is included in this slice.

## 5. WED-291 — Implement the incremental wedding run-sheet projector

### Goal

Populate one Wedding run sheet database from the same wedding-plan AFP ledger without replaying full history or invoking a model for structured facts.

### Work

1. Register `wedding_runsheet.v1` as an optional Database profile.
2. Create the profile definition idempotently for a selected wedding plan.
3. Define source selectors for:
   - wedding date/timezone;
   - venue/date decisions;
   - ceremony and reception milestones;
   - wedding tasks and owners;
   - supplier enquiry/quote/booking evidence;
   - vendor delivery/setup/teardown commitments;
   - speeches, catering, photo/video meals, and transport;
   - WED-287 run-sheet circulation tasks.
4. Add a checkpoint containing last source cursor and projector version.
5. Map changed AFP IDs to affected logical run-sheet item IDs.
6. Build bounded structured fact packets per affected item.
7. Hash source facts and skip unchanged fingerprints.
8. Append record revisions and a projection receipt transactionally.
9. Keep user-created rows detached from automatic overwrite.
10. Mark stale rows when a source cannot be resolved instead of deleting them.
11. Emit a user-facing change explanation for connected updates.

### Deterministic seed set

Seed only when evidence exists, otherwise create a `needs-confirmation` suggestion:

- venue access/setup;
- hair/makeup and getting ready;
- transport departures/arrivals;
- ceremony start/end;
- family/wedding-party photos;
- couple portraits/golden hour when date/location data supports it;
- cocktail hour;
- reception entrance;
- meal service and vendor meal;
- speeches;
- first dance/cake/major reception cues;
- farewell;
- teardown/load-out;
- final run-sheet distribution milestones.

### Tests

- structured facts require zero model calls;
- same source replay creates no new effective revision;
- one source change affects only linked rows;
- failed batch leaves checkpoint unchanged;
- user-created rows survive replay;
- source refs are account/plan scoped;
- concurrency and retry tests against disposable Postgres.

### Exit criteria

- The profile opens with a deterministic, source-linked schedule.
- Projection metrics and receipts are inspectable without content leakage.

### Implementation status — 2026-10-29

Complete in WED-291. The selected Wedding run-sheet profile now loads its durable projection state and incrementally maps plan-scoped milestones, tasks, supplier evidence, logistics and circulation work into source-linked rows with zero model calls. An authenticated server command validates account and plan authority, locks the checkpoint, protects user-created rows, and commits row changes, the AFP receipt and checkpoint atomically. Exact retries replay the prior result; competing stale writers fail closed. A disposable pgvector/Postgres test proves rollback, one-winner concurrency and retry behaviour. No hosted sharing or outbound delivery was enabled.

## 6. WED-292 — Add run-sheet profile controls and time editing

### Goal

Apply run-sheet editing needs to the generic Database view while keeping shared grid behaviour.

### Work

1. Add a profile toolbar plug-in interface.
2. Implement day selector, chronological sort, status/conflict filters, and time rail.
3. Register run-sheet field renderers for:
   - zoned time/range;
   - proposed/confirmed status;
   - location reference;
   - owner/participant contacts;
   - visibility roles;
   - dependencies and buffers.
4. Add `Add run-sheet item` as a database record action.
5. Support anchor + relative offset editing.
6. Require confirmation before moving a confirmed connected time.
7. Offer run-sheet-only override versus authoritative source update when appropriate.
8. Show source and override state in record detail.
9. Add mobile cards and bottom-sheet editing.
10. Add keyboard move earlier/later actions as alternatives to drag.
11. Keep ordinary database fields and custom schema additions available.

### Tests

- timezone and daylight-saving boundaries;
- relative rows recompute when proposed anchors move;
- confirmed rows become conflicts rather than moving silently;
- edit focus remains on the same row;
- custom fields survive profile rendering;
- ordinary databases do not show run-sheet controls;
- 320px/375px/mobile and 400% zoom checks.

### Exit criteria

- The run sheet is fully editable inside Database on desktop and mobile.
- No source update requires manual reconciliation.

### Implementation status — 2026-10-29

Complete in WED-292 on exact clean code candidate `8c9923361eac1cca0396c68803b2e2a5e601fe3f`. The generic profile plug-in adds run-sheet-only day, status and attention filters, chronological presentation, time rail, mobile cards and manual-item entry without changing ordinary databases. Zoned times fail closed across daylight-saving gaps; proposed relative rows follow their anchors while confirmed drift becomes a visible conflict. Confirmed source-linked time edits require an explicit choice between a labelled run-sheet override and an authoritative linked-task update when that update can be made safely. Owners, participants, visibility, dependencies, buffers and source/override state remain visible. Keyboard cell editing restores focus, shift controls avoid drag-only interaction, dialogs restore their trigger, and the horizontal time rail is keyboard-scrollable.

Verification on that candidate passed TypeScript, 29 focused tests, both line budgets, all 2,033 Wedding tests, the production build, and Playwright/Axe checks at 320px, 375px and 1280px. The 320px reflow is the 400% equivalent for a 1280 CSS-pixel layout. No deployment or hosted sharing activation occurred.

## 7. WED-293 — Saved views, print, and permissioned sharing

### Goal

Generate role-specific variants from one master record set.

### Work

1. Implement saved-view definitions with filter, sort, columns, field policy, and profile revision.
2. Seed Master, Vendor, Photo/video, VIP, Guest, and Print views.
3. Add preview-before-export/share.
4. Exclude couple phone numbers and private notes by default.
5. Resolve contact references only when the viewer/export policy permits the field.
6. Add accessible PDF/print styles with page-one key contacts.
7. Add a revocable, expiring hosted share grant only behind a false-default flag.
8. Record share, view, export, expiry, and revocation AFP events.
9. State clearly that downloaded/printed copies cannot be recalled.
10. Add the 7–10 day final-vendor sign-off state and acknowledgement projection.

### Tests

- every saved view reads the same record IDs;
- field allowlists prevent contact/private-note leakage;
- revoked/expired hosted grants fail closed;
- print output remains legible without colour;
- PDF pagination does not split key time/title rows;
- exact recipient/content preview is required before delivery.

### Exit criteria

- Role variants are saved projections, not copied databases.
- No outbound message is sent by merely creating or previewing a view.

### Implementation status — 2026-10-29

Complete in WED-293. The saved-view contract seeds Master, Vendor, Photo/video, VIP, Guest and Print projections over the same source record IDs. Non-master policies deny contact resolution and exclude private notes, couple contact fields and projector internals. Database offers exact-content preview and an accessible A4 landscape print path; print records only view ID, source record IDs and visible columns in private AFP. A generated multi-page PDF fixture proves that key contacts stay on page one, table headers repeat, and each time/title row stays together.

Hosted access is a separate, false-default server capability. When explicitly enabled, an authenticated owner can create a 256-bit fragment-only protected link for the exact saved-view revision and record IDs they previewed. PostgreSQL stores only the token digest and content-light grant metadata; rows remain live AFP projections. Expired and revoked links fail with the same unavailable response, owners retain revoke access while the creation flag is off, and grant/view/expiry/revocation events are written to the tenant AFP ledger. Vendor links may request a bounded final sign-off; acknowledgement or change-request responses are idempotent and projected back to the owner. Creating a link never sends it, and the UI warns that downloaded or printed copies cannot be recalled.

The production rollout flag remains `false`. WED-295 must complete adversarial authorization, hosted accessibility/privacy/usability and shadow evidence before activation.

## 8. WED-294 — Conflict rules, buffers, and contextual A2UI

### Goal

Make the schedule operationally useful without presenting AI guesses as facts.

### Work

1. Implement deterministic conflict rules for owner/vendor overlap, travel, access, curfew, meals, speeches, photos, and transport.
2. Add 15–20 minute buffer suggestions around risky transitions.
3. Explain affected rows before applying a buffer.
4. Keep suggested, approved, and confirmed states distinct.
5. Add A2UI cards for:
   - next conflict;
   - fixed milestones;
   - buffer review;
   - missing owner/place/time;
   - distribution readiness;
   - day-of current and next item.
6. Make A2UI actions emit intents resolved by authoritative commands.
7. Add optional bounded model assistance only for unstructured extraction, concise notes, missing-block suggestions, or plain-language conflict explanation.
8. Record source refs, input fingerprint, prompt version, token/cost, approval, and revision history for every suggestion.
9. Add per-account and per-wedding budgets and deterministic fallback.

### Tests

- rule fixtures for all conflict types;
- false-positive cases and unknown evidence;
- a suggestion cannot set `confirmed`;
- same input fingerprint reuses the saved result;
- typing/view changes cause zero model calls;
- budget exhaustion preserves deterministic editing;
- A2UI actions cannot bypass confirmation/permissions.

### Exit criteria

- Conflicts and missing information are actionable and evidence-labelled.
- Core schedule use remains available with no LLM.

Complete in WED-294. The Database run-sheet profile now derives evidence-labelled owner/vendor overlap, travel, access, curfew, meal, speech, photo and transport findings without a model call. Missing owner, place, time and unmeasured travel remain explicit unknowns. Six contextual cards use an A2UI-compatible projection and emit only focus, filter or buffer-review intents; Database remains the authoritative command boundary. Buffer suggestions explain both affected rows before approval, persist source references, an input fingerprint, deterministic prompt version, zero token/cost accounting and revision history, and cannot set a row to confirmed. Account or wedding model-budget exhaustion leaves the same deterministic surface available. Responsive Axe checks and print pagination cover the mounted experience; hosted sharing remains independently false-default.

## 9. WED-295 — Hardening, accessibility, migration, and rollout

### Goal

Prove the feature is safe and reliable on a frozen candidate before any hosted sharing rollout.

### Work

1. Migrate or adapt legacy database records without duplicate effective rows.
2. Add projection rebuild and dry-run commands with bounded batches.
3. Add stale-checkpoint recovery and idempotent retry.
4. Add offline-readable day-of cache with explicit synchronization timestamp.
5. Complete keyboard, screen-reader, focus, colour-independent, zoom, and print review.
6. Add tenant/plan/share authorization adversarial tests.
7. Add performance fixtures for large schedules and many generic databases.
8. Verify projection token/cost budgets and telemetry redaction.
9. Run couple/planner day-of usability with realistic schedule changes.
10. Run vendor/VIP share-preview comprehension checks.
11. Keep hosted share flag false during shadow projection.
12. Freeze a clean SHA and bind build/test/review evidence to it.

### Required verification

- relevant Rust unit/integration tests;
- disposable-Postgres projection/idempotency tests;
- Database and Wedding frontend tests;
- TypeScript typecheck;
- production UI build;
- line-budget checks;
- mobile and desktop browser checks;
- Axe serious/critical scan;
- print/PDF visual review;
- hosted flags-off shadow with no outbound effects.

### Exit criteria

- No unresolved cross-tenant, duplicate, stale-time, or contact-disclosure defect.
- Generic databases remain regression-free.
- Hosted sharing remains disabled until its independent security/privacy and usability gates pass.

Implementation status: the WED-295 candidate adapts legacy and replayed projector rows into one
deterministic effective row, executes rebuilds in checkpoint-chained batches of at most 80 writes,
and exposes a no-write rebuild review. A failed network refresh can use a 72-hour account/database/
plan-scoped local copy containing only day-of schedule fields; the surface states the exact last
synchronization time and disables edits until reconnection. Content-free telemetry records counts and
explicit zero model/token/cost values. Disposable-Postgres tests cover wrong-plan, cross-tenant,
rollback, concurrency, replay, share revocation, expiry and sign-off. Responsive browser tests cover
keyboard focus, Axe, 320/375/1280 layouts, 200% text zoom, forced colours and multi-page PDF output.
Hosted sharing remains false; exact-SHA hosted shadow and release evidence remain the final rollout
boundary rather than being inferred from these local checks.

## 10. Cross-slice test matrix

| Scenario | Expected result |
|---|---|
| User creates a reading-list database | No wedding fields or projector activity |
| Couple creates Wedding run sheet twice | One active definition, no duplicate rows |
| Ceremony time changes | Relative proposed rows update; confirmed conflicts stay put |
| Vendor setup time is confirmed | Linked row updates with source explanation |
| User adds a private custom row | Row survives every projector replay |
| Projector receives unchanged events | Zero effective revisions and zero model calls |
| Couple opens/sorts/scrolls grid | Zero model calls |
| Couple previews Vendor view | Private couple/contact fields excluded |
| Share is revoked | Hosted access fails; audit remains |
| Offline day-of mode opens | Last synchronized data and timestamp are visible |
| Concurrent edit and source update touch same field | Both histories preserved; conflict requires review |
| LLM is unavailable or budget exhausted | Deterministic schedule/editing remains functional |

## 11. Definition of done

- All acceptance criteria in the companion specification pass.
- New files are below 1,000 lines.
- Large existing files are smaller or unchanged in feature-body size.
- Canonical coordination files identify owner, branch, dependencies, verification, and next action.
- The implementation is committed on a task branch and verified from the exact clean SHA.
- No deployment or flag activation is inferred from local test success.

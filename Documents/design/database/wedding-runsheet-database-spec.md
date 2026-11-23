# Wedding Run Sheet in the OmnyID Database View — Specification

## 1. Status and scope

- Status: implementation specification
- Proposed delivery programme: WED-289 through WED-295
- Depends on: WED-181 generic Database editing, WED-247 shared wedding tasks, WED-287 run-sheet task reconciliation
- Source research: `Documents/wedding research/wedding runsheet.md`
- Primary surface: the existing OmnyID Database view
- Authority: the wedding plan's account-scoped AFP ledger

This specification adds a wedding run-sheet database profile to the existing Database view. It does not create a second run-sheet page, a parallel wedding database, or a second source of truth.

## 2. Product outcome

A couple can open Database, select or create a **Wedding run sheet** database, and see a chronological day-of plan assembled from facts already held by their wedding plan. They can add, edit, assign, sequence, filter, share, and print entries using the same database editing model available to every OmnyID user.

The same Database surface must also let a user create unrelated databases such as a supplier tracker, reading list, inventory, or CRM table. Wedding behaviour is activated by a database profile, not hard-coded into Database as its only use case.

## 3. Research translated into requirements

The research describes a run sheet as a master chronological schedule of every activity, movement, task, and key moment before, during, and after a wedding. Each useful entry answers:

1. When does it happen?
2. What happens?
3. Where does it happen?
4. Who owns or participates in it?
5. What must happen before or after it?

It also establishes these product requirements:

- support digital collaboration during planning and print-ready copies for the day;
- build backwards from fixed milestones such as ceremony time, sunset, venue access, meal service, and curfew;
- propose, but never silently impose, 15–20 minute buffers around risky transitions;
- show key operational contacts while excluding the couple's phone numbers from vendor copies by default;
- provide role-specific versions from one master schedule;
- explicitly align catering, photographer/videographer meals, speeches, transport, setup, and teardown;
- make the final 7–10 day vendor circulation and sign-off state visible;
- support a simplified VIP/bridal-party version and a selective guest order of events.

Usage percentages in the research are directional context, not product claims unless separately sourced and approved for public copy.

## 4. Non-goals

- No independent `WeddingRunSheetView` with its own persistence.
- No copy of the wedding ledger into local storage as authority.
- No mandatory AI generation to open or edit a run sheet.
- No automatic messaging to vendors, guests, or the bridal party.
- No inference that a proposed time has been confirmed by a vendor.
- No exposure of private contact details merely because a saved view is shared.
- No replacement of Timeline or Tasks. Those surfaces and the run sheet are projections over shared facts for different jobs.

## 5. Core architecture

```text
Wedding AFP ledger
  tasks, decisions, bookings, quotes, contacts, venue, date, transport
                         |
                         v
Incremental run-sheet projector
  deterministic mapping + source fingerprints + optional bounded inference
                         |
                         v
Generic Database contract
  database definition + records + revisions + saved views
                         |
                         v
Existing Database view
  table / timeline mode / cards / print / role-specific saved views
```

### 5.1 Authority rule

The wedding AFP event remains authoritative for connected facts. A projected row carries source references and projection state. Editing a connected field must either:

- append a change to the authoritative wedding object and let the projector refresh the row; or
- append an explicit run-sheet-only override with a visible explanation that it does not change the source object.

The UI must never ask the user to reconcile connected information manually. For example, changing a confirmed venue access time updates the connected run-sheet setup entries on the next projection pass and explains the change.

### 5.2 Existing contract compatibility

The mounted Database implementation currently reads:

- `database_record` for base records;
- `note:ledger_update` with `kind: database_record_update` for revisions;
- `database_schema_update` for fields.

The older design specification describes neutral `database` messages. WED-289 must choose one canonical forward contract and provide a compatibility adapter for the other shape. It must not emit duplicate rows in both shapes.

Until that contract freeze is complete, the run-sheet profile should use the mounted message forms and stable metadata rather than introduce a third record type.

## 6. Generic database definition

Every database has a durable definition separate from its records.

```json
{
  "kind": "database_definition",
  "database_id": "db_01...",
  "name": "Wedding run sheet",
  "profile_id": "wedding_runsheet.v1",
  "scope": {
    "account_id": "account_01...",
    "wedding_plan_id": "wedding_plan_01..."
  },
  "default_table": "wedding_run_sheet",
  "created_from": "template",
  "archived": false
}
```

For an ordinary user-created database:

- `profile_id` is `generic.v1` or absent;
- `wedding_plan_id` is absent;
- the user can name it and add tables/fields/records without wedding setup;
- no wedding projector reads or writes it.

Database names are labels, not identifiers. Renaming a database does not change `database_id`.

## 7. Wedding run-sheet record contract

One run-sheet item is one stable database record with append-only revisions.

### 7.1 Required fields

| Field | Type | Purpose |
|---|---|---|
| `runsheet_item_id` | string | Stable logical identity across projections |
| `title` | string | Human-readable activity |
| `start_at` | zoned datetime or null | Confirmed/proposed start |
| `end_at` | zoned datetime or null | Confirmed/proposed end |
| `duration_minutes` | integer or null | Duration when end is derived |
| `time_status` | enum | `confirmed`, `proposed`, `relative`, `unknown` |
| `location` | object or null | Venue/room/address reference plus display label |
| `owner_refs` | reference list | People or vendors responsible |
| `participant_refs` | reference list | People/vendors expected |
| `category` | enum | getting-ready, ceremony, photos, reception, catering, transport, setup, teardown, administration, after |
| `status` | enum | draft, needs-confirmation, confirmed, in-progress, done, cancelled |
| `visibility` | enum list | master, vendor, photo-video, vip, guest |
| `source_refs` | AFP reference list | Authoritative facts that produced the row |
| `source_fingerprint` | string | Idempotent projection key |
| `updated_at` | timestamp | Latest effective revision time |

### 7.2 Optional operational fields

- `cue`: the signal that starts the item;
- `dependencies`: preceding item or fact references;
- `buffer_before_minutes` and `buffer_after_minutes`;
- `contact_ref`: a contact object, never an unscoped copied phone number;
- `vendor_notes`: bounded execution notes;
- `couple_notes`: private notes excluded from shared variants by default;
- `meal_service`: service/window/vendor-meal coordination;
- `transport`: pickup, vehicle, route, loading, and accessibility notes;
- `photo_requirements`: shot/list/light-location notes;
- `setup_window` and `load_out_deadline`;
- `confirmation_refs`: vendor acknowledgement or decision evidence;
- `conflict_state`: deterministic validation output;
- `projection_state`: projected, overridden, detached, or stale.

### 7.3 Time semantics

- Store instants plus IANA timezone where a date/time is known.
- Preserve local display time and timezone through daylight-saving transitions.
- A relative row may reference an anchor and offset, for example `ceremony_start - 90 minutes`.
- Moving an anchor recomputes only dependent proposed/relative rows.
- A confirmed row does not move silently. It becomes a conflict requiring review.
- Unknown time stays unknown; the projector must not invent a precise time.

## 8. Database view behaviour

### 8.1 Database switcher and creation

Database receives a database switcher and a **New database** action. Creation offers:

- Blank database;
- Wedding run sheet, when the account has an accessible wedding plan;
- future registered profiles without changing the core Database component.

Choosing Wedding run sheet creates a definition and starts projection. Choosing Blank opens the current ghost-grid flow.

### 8.2 Run-sheet profile inside Database

When `profile_id` is `wedding_runsheet.v1`, Database adds contextual controls around the existing grid:

- day selector and chronological sort;
- compact time rail;
- fixed milestone markers;
- conflict and confirmation filters;
- role-specific saved views;
- print/share actions;
- `Add run-sheet item` with time, place, owner, participants, visibility, and notes.

These are profile plug-ins around the generic grid. Inline cell editing, record detail, selection, import/export, schema handling, and generic creation stay shared.

### 8.3 Mobile

- Default to stacked record cards with time, title, place, owner, and status.
- Keep table mode available with horizontal scrolling.
- Use 44px minimum targets and bottom-sheet editors.
- Put the day/time/status controls in a horizontally scrollable chip row.
- Do not require drag-and-drop; provide accessible move earlier/later actions.

### 8.4 Day-of mode

Day-of mode is a saved presentation of the same records:

- large current/next item;
- offline-readable last synchronized projection;
- clear stale timestamp;
- no hidden mutation while offline;
- print/PDF export with page-one operational contacts.

## 9. Saved views and sharing

Saved views are filter/column/visibility policies over the same record set.

| Saved view | Intended audience | Default content |
|---|---|---|
| Master run sheet | couple, planner, coordinator | all operational rows and permitted contacts |
| Vendor run sheet | confirmed vendors | setup, delivery, service, cues, meals, teardown |
| Photo/video timeline | photo/video team | light, locations, shots, movements, vendor meal |
| VIP / bridal party | wedding party and parents | getting ready, photos, transport, responsibilities |
| Guest order of events | guests | arrival, ceremony, reception, major public moments |
| Print master | day-of leads | compact master plus page-one contacts |

Sharing creates a revocable grant bound to a saved-view revision. It does not duplicate records.

Before sharing, preview must show:

- recipients;
- included columns and rows;
- included contact fields;
- expiry and revocation controls;
- exact delivery method.

Couple phone numbers are excluded by default. Contact details resolve through permission-aware references at render/export time.

## 10. Automatic population and token efficiency

### 10.1 Deterministic first

The projector maps structured wedding facts without an LLM:

- wedding date and timezone;
- ceremony/reception times and locations;
- confirmed venue access and curfew;
- wedding tasks with due/owner state;
- accepted/confirmed supplier records;
- transport pickups;
- speech and meal timings;
- setup, teardown, delivery, and collection windows;
- the research-backed run-sheet circulation tasks already seeded by WED-287.

### 10.2 Incremental projection

Each projector run receives only changed AFP message IDs since its checkpoint.

1. Resolve changed messages into affected logical item IDs.
2. Load the bounded current fact packet for those items.
3. Calculate `source_fingerprint`.
4. Skip unchanged fingerprints.
5. Append only changed row revisions and one projection receipt.
6. Advance the checkpoint only after all writes commit.

Opening Database, scrolling, typing in a cell, or switching saved views never invokes a model.

### 10.3 Bounded inference

Inference is allowed only when structured rules cannot safely do one of these jobs:

- extract a proposed timing from newly added unstructured notes;
- rewrite a long vendor instruction into a concise execution note;
- suggest likely missing schedule blocks;
- explain a detected conflict in plain language.

The recommended default is the existing low-cost structured-output model route (currently `openai/gpt-5-mini` when available through the configured provider), with provider-agnostic fallback. The model is not an authority and cannot mark a time confirmed.

Each inference uses:

- a versioned cached prompt prefix;
- a small schema-bound fact packet, never full wedding history;
- a meaningful-input fingerprint;
- per-account and per-wedding token/cost budgets;
- a deterministic fallback when unavailable.

Each generated suggestion is an AFP event containing source references, model/provider class, token/cost receipt, approval state, and revision lineage. Re-opening the same item reuses the saved suggestion.

## 11. Conflict and quality rules

Deterministic validation detects:

- overlapping commitments for the same owner/vendor;
- insufficient travel or room-change time;
- setup before venue access;
- teardown after curfew;
- meal/speech/photo conflicts;
- missing owner, place, time, or confirmation;
- photographer/videographer meal timing that risks a key moment;
- transport pickup after required arrival;
- stale projected rows whose authoritative source changed.

A buffer recommendation is a suggestion until approved. The UI explains what will move before applying it.

## 12. A2UI usage

A2UI is suitable for portable contextual surfaces, including:

- `Next conflict to resolve`;
- fixed-milestone summary;
- proposed buffer review;
- final-distribution readiness;
- role-specific share preview;
- day-of current/next card.

The editable database grid remains a native Database component because high-density spreadsheet editing exceeds the current portable A2UI primitive set. A2UI actions emit intents; server/database commands enforce authority.

## 13. Security, privacy, and permissions

- All reads and writes are account- and wedding-plan-scoped.
- A database profile does not broaden wedding ledger access.
- Shared views are allowlisted projections, not raw ledger exports.
- Phone, email, address, guest, accessibility, family, and private-note fields require explicit field policy.
- Revocation takes effect for future hosted access; exported/printed copies cannot be recalled and must say so.
- Public/guest views cannot reveal vendor private notes, quote details, or internal conflict explanations.
- Every projection, override, confirmation, share, export, and revocation is append-only and auditable.
- Policy V2 remains disabled unless its independent rollout criteria are met.

## 14. Reliability and idempotency

- Stable logical item IDs prevent duplicate rows.
- Projection commits use deterministic idempotency keys.
- A failed batch does not advance its checkpoint.
- Replaying the same source events produces no additional effective revisions.
- Concurrent user edits and projector updates preserve both histories and open a conflict when they touch the same field.
- Delete means archive/tombstone with confirmation, not history erasure.

## 15. Accessibility

- Every grid action has a keyboard equivalent.
- Time/status/conflict is represented by text and icon as well as colour.
- Screen-reader labels identify row, column, effective value, and edit state.
- Focus stays on the edited row after save/reprojection.
- Drag actions have move earlier/later alternatives.
- Print output uses readable type and does not depend on colour.

## 16. Observability

Record without storing message bodies in operational logs:

- projection duration, changed-source count, affected-item count, skipped fingerprints;
- deterministic versus model-assisted item count;
- token and cost totals by wedding and projection version;
- conflict counts by rule;
- share/export events by saved-view ID;
- failures by bounded reason code.

## 17. Acceptance criteria

1. A user can create, rename, switch, archive, and restore a generic non-wedding database.
2. A wedding-plan user can create one idempotent Wedding run sheet profile in Database.
3. Structured wedding facts populate the run sheet without a model call.
4. Replaying unchanged facts creates no duplicate effective rows.
5. A connected fact change updates the affected run-sheet row and explains the source change.
6. User-only rows and explicit overrides survive projection.
7. Fixed, relative, proposed, and confirmed times behave according to the time rules.
8. Master, vendor, photo/video, VIP, guest, and print views filter the same rows.
9. Couple contact details are excluded from shared variants by default.
10. Mobile cards, keyboard editing, focus retention, and print output pass accessibility checks.
11. Model assistance is incremental, budgeted, source-referenced, and never required for core editing.
12. No new file exceeds 999 lines, and the already-large Database component is decomposed rather than enlarged.

## 18. Open decisions before implementation

- Freeze the canonical database AFP message form and compatibility lifetime.
- Decide whether database definitions/saved views use dedicated AFP types or one database-control envelope.
- Confirm timezone source precedence when a venue and account differ.
- Approve the initial share-field allowlists for each role view.
- Decide whether hosted share links are in the first release or whether PDF/export is first.
- Confirm whether the current model registry exposes `openai/gpt-5-mini`; otherwise use the configured structured-output model without hard-coding a new provider dependency.

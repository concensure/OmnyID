# OmnyID Database View Design and Interaction Specification

## Status

This document specifies the Database View UI/UX, rendering rules, and AFP integration for OmnyID's human-facing database experience.

---

## 1. Core Principle

The Database View is a human-facing rendering of AFP messages.

- Agents never see or work with rows or columns.
- Agents only read and write neutral AFP `database` messages.
- The UI derives table structure from message `content`.
- Cells show only the content value for that field.
- Metadata, routing fields, and protocol fields are never shown inside table cells.
- Nothing in the AFP message itself decides row versus column orientation.

The Database View decides layout at render time. AFP stays atomic and minimal: each message carries only raw structured content plus optional metadata needed to group entries into the same database.

---

## 2. AFP Message Shape for Database Rows

Each database entry maps to one AFP message with a neutral top-level type.

```json
{
  "protocol": "afp-v1",
  "type": "database",
  "thread_id": "db_suburbs_2026",
  "content": {
    "suburb": "Bondi",
    "status": "full_time",
    "population": 32000,
    "notes": "high rental yield"
  },
  "metadata": {
    "database_id": "suburbs",
    "last_updated": "2026-04-15T10:00:00Z"
  },
  "views": []
}
```

### Rules

- No `row`, `row_id`, `column`, or `column_id` fields are required in AFP.
- Layout is entirely a view-layer concern.
- `content` is the canonical entry payload.
- `metadata.database_id` groups entries into the same human-facing database.
- `views` is optional and does not define table orientation.
- The message does not declare whether a field should render as a row label, a column, or a card property.

For avoidance of doubt, the database surface should not use `type: "database_row"` or `type: "database_entry"`.

Example minimal entry:

```json
{
  "protocol": "afp-v1",
  "type": "database",
  "thread_id": "db_suburbs",
  "content": {
    "suburb": "Bondi",
    "status": "full_time",
    "population": 32000,
    "notes": "high rental yield"
  }
}
```

---

## 3. Rendering Model

### Row Mapping

- One `database` AFP message represents one structured record.
- A database is the set of messages sharing the same `metadata.database_id`.
- The renderer chooses how that record appears in table, card, or graph form.
- A selected entry opens a richer detail panel but does not change the underlying message model.

### Column Detection

Columns are derived from the most common keys found in `content` across rows in the same database.

- Example keys: `suburb`, `status`, `population`, `notes`
- Header labels are humanized from the key names
- Knowledge Curator may suggest smarter defaults and ordering
- Sparse fields remain valid even when not present on every row

### Orientation

The table supports two orientation modes:

- Default: one common key becomes the row header and other keys become columns
- Swap: the user taps `Transpose` to swap rows and columns instantly

The default orientation is a UI decision. Knowledge Curator or the Master Agent may suggest the best starting orientation based on the shape of the data.

### Cell Rendering

Each cell shows only the value for the relevant `content` key.

- No protocol chrome inside the grid
- No metadata badges inside the cell
- No system timestamps inside the cell
- Long text is visually truncated in the table and fully visible in the detail panel

---

## 4. Database View Layout

### Top Bar

- Search bar with semantic and full-text search
- `New Row` button
- `Transpose` button
- View toggle: `Table`, `Cards`, `Graph`

### Main Table Area

The default surface is a clean spreadsheet-style table.

- Records come from `database` messages
- Columns come from auto-detected `content` keys
- Headers are derived from common keys for the database and the chosen orientation
- Sorting is supported
- Filtering is supported
- Inline editing is supported
- Transpose is supported

### Right Sidebar

When a row is selected, the right sidebar opens and shows:

- Full AFP message content for the selected row
- Backlinks
- AI summary
- Action items
- Version history

The sidebar is the place for richer context. The table stays compact and content-only.

---

## 5. Interaction Model

| Interaction | Result |
|---|---|
| Tap cell | Start inline edit for that value |
| Save inline edit | Auto-save as a new AFP `database` message |
| Tap row | Open full details in the right sidebar |
| Drag column header | Reorder columns in the UI only |
| New Row | Create a new AFP `database` message with empty `content` |
| Tap `Transpose` | Swap row and column orientation in the UI only |
| Search | Filter rows using semantic and full-text matching |
| View toggle | Re-render the same database as Table, Cards, or Graph |

### Inline Editing Rule

Database edits must respect AFP's append-only model.

- Editing a cell never mutates a prior message in place
- The system writes a new `database` message representing the updated entry state
- Version history in the sidebar exposes prior row revisions

---

## 6. New Row Flow

The `New Row` action should be one-tap and friendly to non-technical users.

- User can create a row by text, voice, or image input
- OmnyID immediately creates a new `database` message with empty or partially inferred `content`
- Knowledge Curator fills in useful structure in the background
- The new row appears instantly in the active database view

Example empty row:

```json
{
  "protocol": "afp-v1",
  "type": "database",
  "thread_id": "db_suburbs_2026",
  "content": {},
  "metadata": {
    "database_id": "suburbs"
  }
}
```

---

## 7. Alternate Presentations

The same underlying `database` messages can be rendered in multiple human-facing views.

### Table

- Best default for scanning, sorting, and editing

### Cards

- Best for mobile and visually richer records
- Each card shows key fields plus summary context

### Graph

- Best for relationship-heavy datasets
- Knowledge Curator may infer links, clusters, or groupings

These are presentation modes only. Agents still work only with AFP messages.

---

## 8. Small Business and Non-Technical UX

The Database View should feel lightweight, forgiving, and self-organizing.

- One-tap `New Entry`
- Voice, text, and image entry supported from the same action
- No schema-definition step required
- Knowledge Curator creates columns, summaries, and backlinks in the background
- Master Agent suggests helpful saved views such as `Show unpaid invoices` or `Group by client`
- Structure evolves from use instead of requiring upfront setup

---

## 9. Design Guardrails

- Keep the default table visually simple and spreadsheet-like
- Do not expose AFP protocol fields in the primary grid
- Do not require users to define schema before entering data
- Preserve append-only history for every edit
- Treat column order as a UI preference, not a message concern
- Treat row identity and revision history as message-history concerns, not spreadsheet primitives

---

## 10. AFP Integration Summary

| UI Action | AFP Effect |
|---|---|
| Create row | New `database` message |
| Edit row | New `database` message with updated `content` |
| Change view | No AFP write required |
| Reorder columns | No AFP write required unless user preferences are persisted separately |
| Transpose table | No AFP write required |
| Search or filter | No AFP write required |
| Sidebar AI summary | Derived from the selected row and related AFP history |

The database UI is a projection layer over AFP history, not a separate storage model.

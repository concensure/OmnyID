# OmnyID Note View Specification

## Status

This document specifies the Note View UI/UX, interaction flows, and AFP integration for OmnyID's note management experience.

---

## 1. Adding a Title or Tag to a Note

### Primary Method: Direct UI (fastest and most natural)

When a note is open in the right sidebar:

- The **title field is always editable inline** — click to edit.
- **Tags** appear as small pills below the title.
- Clicking the **"+ Tag" pill** instantly opens a small tag selector showing:
  - Existing supertags
  - AI-suggested tags from the Knowledge Curator
- User can type a new tag or select from suggestions.
- All changes are **saved instantly** as an AFP message update (`metadata.title` and `metadata.tags`).

### Secondary Method: Chatbox (for voice / complex instructions)

A persistent small chatbox sits at the bottom of the right sidebar, labeled **"Ask your note…"**.

Users can type or speak:

> "Title this note 'Q3 Budget Review' and add tags #Finance #Urgent"

The Master Agent processes this and creates the appropriate AFP metadata update.

#### Chatbox Hover Behavior

On hover, the chatbox:

- Expands slightly
- Shows a subtle **Voice input** microphone icon
- Displays suggested quick commands: "Add tag…", "Change title…", "Summarize this note"

This makes the chatbox feel responsive without cluttering the default view.

---

## 2. Project Delineation – Folders, Areas, and Rules

The system supports three levels of organisation:
- **Folders** — named note containers (left sidebar)
- **Areas** — cross-folder groupings (e.g. "Work" spanning "Projects" and "Meetings" folders)
- **Rules** — AFP messages that control how the Knowledge Curator behaves within a scope

### Folder Rules

`folder_rule` is a **dedicated top-level AFP message type** — not optional metadata inside another message.

```json
{
  "protocol": "afp-v1",
  "type": "folder_rule",
  "thread_id": "folder:work",
  "content": {
    "folder_id": "work",
    "summary_style": "concise bullet points with action items",
    "backlink_rules": "only link within this folder or #ProjectX",
    "tag_suggestions": ["#Meeting", "#Task", "#Decision"]
  }
}
```

Rules are versioned — the latest `folder_rule` message for a `folder_id` wins.

### Area Rules

`area_rules` spans multiple folders. Areas are a higher-level grouping — a folder belongs to at most one area.

```json
{
  "protocol": "afp-v1",
  "type": "area_rules",
  "thread_id": "area:work",
  "content": {
    "area": "work",
    "summary_style": "concise bullet points with action items",
    "backlink_rules": "only link within this area or #ProjectX",
    "tag_suggestions": ["#Meeting", "#Task", "#Decision"]
  }
}
```

Both `folder_rule` and `area_rules` live as **first-class AFP messages** — versioned, audited, and updated independently. Never embedded as metadata inside normal notes.

---

## 3. Expanded Note View Layout

### Overall Layout

#### Top Bar (56px)

- Left: Logo + Search bar (semantic + full-text)
- Center: Current folder name + breadcrumb
- Right: New Note button + View toggle (List / Grid / Graph)

#### Left Sidebar (240px, collapsible)

- All Notes
- Folders (Work, Personal, Health, etc.)
- AI Smart Groups (auto-created by Knowledge Curator)
- Tags cloud (most-used first)

#### Main Content Area (flexible)

Cards show:

- Title
- First 2 lines or AI summary
- Supertags as colored pills
- Last updated timestamp

**Hover on card:** subtle lift + "Quick actions" appear on the right edge (pin, tag, link, delete)

**Click card:** opens full note in right sidebar

**Drag card onto another card:** creates a backlink with a visual confirmation animation

#### Right Sidebar — Context Panel (340px)

- Note title (editable inline)
- Supertags row (click to add/edit)
- Main note content (rich editable area)
- AI Actions bar: Summarize, Extract Tasks, Create Mind Map, Elaborate
- Backlinks & Related section (clickable cards)
- Version history (compact timeline at bottom)

---

## 4. Key Interactive Flows

| Flow | Description |
|---|---|
| **Creating a note** | Tap "New Note" → blank note opens in right sidebar with cursor ready. Voice icon always visible for instant dictation. |
| **Organizing** | Drag any note from main area onto a folder in sidebar → instantly moves it and applies that folder's rule. |
| **Smart Linking** | While editing, system shows subtle inline suggestions ("Link to last week's meeting note?"). Tap to create backlink. |
| **Rule Setting** | Right-click a folder in sidebar → "Set Folder Rules" → opens a simple form that creates the `folder_rule` AFP message. |

---

## 5. Tag Updates — Append-only Delta Pattern

AFP is append-only. Tag changes are expressed as deltas — not full note rewrites.

```json
{
  "protocol": "afp-v1",
  "type": "tag_update",
  "thread_id": "<note_thread_id>",
  "references": [{ "id": "original_msg_123" }],
  "content": {
    "remove_tags": ["#Action"],
    "add_tags": ["#Complete"],
    "remove_supertags": [],
    "add_supertags": []
  }
}
```

**Resolver**: The UI and Knowledge Curator replay all `tag_update` messages that reference a note in timestamp order to compute the current tag state. Old messages remain in the log for audit/history; only the resolved state is used for indexing and display.

**Optimistic updates**: The UI applies the delta locally before the server confirms, then replaces the local entry with the server-assigned message id. On server error, the local delta is removed and the UI reverts.

**Cold storage**: Very old `tag_update` messages can be archived via the `ArchiveColdStorage` daemon — the resolved state is retained in the active index.

## 6. AFP Integration Points

| Action | AFP Message Type | Fields |
|---|---|---|
| Edit title | note update | `content.title` |
| Add/remove tag | `tag_update` | `add_tags`, `remove_tags` |
| Add/remove supertag | `tag_update` | `add_supertags`, `remove_supertags` |
| Move note to folder | note update | `content.folder_id` |
| Create backlink | note update | `content.backlinks[]` |
| Set folder rule | `folder_rule` | full `content` block |
| Set area rule | `area_rules` | full `content` block |
| AI action (summarize, etc.) | agent output | `content.summary` / `content.tasks` |

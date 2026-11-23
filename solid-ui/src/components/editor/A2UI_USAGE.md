# TiptapEditor — Agent A2UI Usage Guide

## How an agent triggers the rich text editor in a thread

Send an AFP message with `type: "a2ui_render"` and include a `rich_text_editor`
component in the `components` array. The workspace renders it inline in the thread.

### Minimal example (note)

```json
{
  "type": "a2ui_render",
  "content": {
    "components": [
      {
        "type": "rich_text_editor",
        "props": {
          "mode": "full",
          "placeholder": "Write your idea...",
          "thread_id": "thr_abc123",
          "submit_label": "Save Note"
        }
      }
    ]
  }
}
```

### Email draft pre-fill

```json
{
  "type": "a2ui_render",
  "content": {
    "components": [
      {
        "type": "rich_text_editor",
        "props": {
          "mode": "email",
          "initial_content": "<p>Hi Alex,</p><p>Just following up on the proposal...</p>",
          "email_to": "alex@example.com",
          "email_subject": "Re: Q3 Proposal",
          "submit_label": "Send Email",
          "thread_id": "thr_email_123"
        }
      }
    ]
  }
}
```

### Chat composer (compact mode)

```json
{
  "type": "a2ui_render",
  "content": {
    "components": [
      {
        "type": "rich_text_editor",
        "props": {
          "mode": "compact",
          "placeholder": "Reply to this thread…",
          "thread_id": "thr_abc123"
        }
      }
    ]
  }
}
```

## Props reference

| Prop             | Type                       | Default           | Description |
|------------------|----------------------------|-------------------|-------------|
| `mode`           | `compact\|full\|email`     | `full`            | Editor toolbar variant |
| `initial_content`| string (HTML)              | `""`              | Pre-filled HTML content |
| `placeholder`    | string                     | mode-specific     | Empty state text |
| `thread_id`      | string                     | `""`              | AFP thread the note/draft is saved to |
| `submit_label`   | string                     | mode-specific     | Send button label |
| `email_to`       | string                     | —                 | Email recipient (email mode) |
| `email_subject`  | string                     | —                 | Email subject (email mode) |

## On submit

When the user clicks the submit button:

1. The editor builds an `EditorPayload`:
   - `html` — full HTML output
   - `text` — plain text stripped of markup
   - `json` — Tiptap JSON document (portable, re-hydration safe)
   - `afpMessage` — ready-to-POST AFP message (`type: "note"` or `"email_draft"`)

2. The workspace POSTs `afpMessage` to `POST /messages`.

3. A `omnyid:editor-submit` CustomEvent is dispatched on `window` with `detail: EditorPayload`
   so any listening agent or service worker can react immediately.

## Direct component usage (non-A2UI)

```tsx
import { TiptapEditor } from "@/components/editor/TiptapEditor";

<TiptapEditor
  mode="full"
  placeholder="Write your note…"
  threadId="thr_abc123"
  supertags={["project:acme", "type:note"]}
  onSend={(payload) => {
    console.log(payload.html);
    console.log(payload.afpMessage);
  }}
  onCancel={() => setShowEditor(false)}
/>
```

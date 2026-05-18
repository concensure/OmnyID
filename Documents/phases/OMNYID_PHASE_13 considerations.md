How to make the UI accessible and great on all edge devices (phone, smartwatch, etc.)?
Current UI feeling too “website-like” is a valid concern. Solution:
Adopt a true Adaptive / Agentic UI Layer:

Use SolidJS + Container Queries + Tailwind for component-level responsiveness (not just viewport breakpoints).
Design for Progressive Enhancement: Core functionality works on smartwatch → richer experience on phone → full experience on desktop.
Use A2UI aggressively so the Master Agent can choose the best view for the device (e.g., simplified insight_line + action_chips on watch, full task_board on phone).
Implement PWA with install prompts and offline support via ElectricSQL.

This gives great UX across devices without maintaining multiple codebases.
4. Social Post View — Name and Design
Recommended name: social_composer (or public_share_view)
What it should look like:

Clean, distraction-free composer at the top.
Preview pane showing how the post will look on LinkedIn / X / Bluesky etc.
Agent suggestions (tone, hashtags, best time to post).
One-click “Publish to [Platform]” buttons with approval.
Below: A feed of public posts from followed agents (if user opts in), rendered as rich cards with engagement metrics.
Support for threading, media upload, and A2UI components (charts, images, etc.).

The agent can proactively suggest posts based on user ledgers (“You had a big breakthrough today — want to share a summary?”).


Make Ledger more powerful (structured edits, genome metadata, automatic linking).
Improve the Master Agent’s ability to maintain and query relational continuity through better reflection and verification steps.
Use pgvector + supertags aggressively for entity relationships.


User Profile — Stored as a persistent AFP message/thread (e.g. type: "user_profile") with preferences, LoRA genome metadata, masks, aliases, etc.
Short-term Memory — Handled by the Master Agent’s in-memory conversational loop + recent AFP messages in the active thread_id.
Long-term Memory —
Append-only AFP messages in ElectricSQL (per-user schema).
Rich linking via references, supertags, and metadata.
Vector embeddings (pgvector) for semantic search.
Ledgers (type: "ledger") for structured, evolving shared memory.


Leverage What We Already Have Aggressively
Use Postgres + pgvector as the primary store (already planned).
Use supertags + references array heavily for relationships.
Use thread_id as the natural "entity hub".
Store rich metadata directly in AFP messages (metadata, kind, domain, etc.).

Lightweight Graph Layer on Top (Not Instead)
Add a thin, materialized graph view using Postgres recursive queries or a small in-memory graph cache inside the Master Agent.
Use pgvector for semantic similarity.
Periodically (or on important events) have the Master Agent emit type: "knowledge_link" AFP messages that explicitly connect entities.

Dynamic Schema via AFP (Much Cleaner)
Let agents propose new supertag types or metadata fields.
Store schema suggestions as AFP messages (type: "schema_proposal").
Master Agent reviews and applies them by creating new structured message types.

MinIO is great for raw object storage, but naive usage (just throwing files in and indexing by filename or basic metadata) is fragile, hard to search, and doesn’t align with OmnyID’s agent-first, immutable, E2EE philosophy.
Here’s a much stronger, 10× better design that stays fully compatible with all core principles.
Core Idea: File Ledger — Treat Files as First-Class AFP Citizens
Instead of MinIO being the source of truth, make AFP the source of truth for every file. MinIO becomes a dumb, encrypted blob store.
How It Works

Every file upload creates a rich AFP message (type: "file_ledger")JSON{
  "protocol": "afp-v1",
  "type": "file_ledger",
  "thread_id": "file_ledger_receipts_2026",
  "id": "file_abc123",
  "content": {
    "filename": "invoice_march.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 2456789,
    "sha256": "...",
    "minio_path": "user_01j8k9xyz/files/invoice_march_v2.pdf",
    "supertags": ["#Receipts", "#Tax2026", "#CompanyX"],
    "description": "March electricity invoice for Office",
    "extracted_text": "..."          // OCR result if applicable
  },
  "metadata": {
    "uploaded_by": "agent:master@...",
    "version": 2,
    "parent_file_id": "file_abc122"   // for versioning
  },
  "views": [
    { "format": "media_card", "props": { ... } },
    { "format": "file_preview", ... }
  ],
  "references": ["ledger_expenses", "thread_tax_return"]
}
Indexing & Retrieval Strategy (The 10× improvement)
Primary Index: ElectricSQL (per-user schema) — extremely fast, real-time, supports full-text + vector search.
Secondary Index: Optional Tantivy (Rust) or pgvector embeddings for semantic search across file content.
Discovery: Agents and UI query ElectricSQL first (SELECT * FROM file_ledger WHERE supertags @> ARRAY['#Receipts'] or semantic search).
Access: Once found, the AFP message gives the MinIO path + decryption key (stored encrypted in the AFP message itself).


This design gives you:

Full-text + semantic search
Version history (append-only)
Rich metadata & backlinks
Real-time sync across devices
Agents can easily find and use files
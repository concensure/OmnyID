// @locs-version: 1.0
import type { JSONContent } from "@tiptap/core";
import type { AfpMessage, AfpView } from "@/lib/api";
import type { EditorMode } from "@/lib/editorMode";

export function buildEditorAfpMessage(opts: {
  mode: EditorMode;
  markdown: string;
  text: string;
  json: JSONContent;
  /** Sanitized HTML — required for email mode only. */
  html?: string;
  threadId?: string;
  supertags?: string[];
  emailTo?: string;
  emailSubject?: string;
}): Omit<AfpMessage, "id" | "timestamp" | "from"> {
  const isEmail = opts.mode === "email";
  const type    = isEmail ? "email_draft" : "note";

  // ── Views ────────────────────────────────────────────────────────────
  // Email:  one email view containing the sanitized HTML (required by email clients).
  // Other:  one rich_text view carrying the Markdown for the workspace renderer.
  const views: AfpView[] = isEmail
    ? [{ format: "email",     content: { html: opts.html ?? "", to: opts.emailTo, subject: opts.emailSubject }, priority: 1 }]
    : [{ format: "rich_text", content: { markdown: opts.markdown },                                             priority: 1 }];

  // ── Content ──────────────────────────────────────────────────────────
  // Markdown is the primary durable content for note/compact/full modes.
  // HTML is kept only in email mode where downstream clients require it.
  // The Tiptap JSON is stored in metadata for lossless editor re-hydration.
  const content = isEmail
    ? { html: opts.html ?? "", text: opts.text, to: opts.emailTo, subject: opts.emailSubject }
    : { markdown: opts.markdown, text: opts.text };

  return {
    thread_id:   opts.threadId ?? "",
    type,
    content,
    views,
    attachments: [],
    references:  [],
    metadata: {
      supertags:   opts.supertags ?? [],
      editor_mode: opts.mode,
      created_via: "TiptapEditor",
      editor_json: opts.json,      // kept for lossless re-hydration; not primary content
    },
  };
}

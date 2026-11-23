import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeA2UIRichTextEditorMode,
  resolveA2UIRichTextEditorState,
} from "../src/lib/a2uiRichTextEditorState.ts";

test("normalizeA2UIRichTextEditorMode falls back to full for unsupported values", () => {
  assert.equal(normalizeA2UIRichTextEditorMode("email"), "email");
  assert.equal(normalizeA2UIRichTextEditorMode("weird"), "full");
  assert.equal(normalizeA2UIRichTextEditorMode(null), "full");
});

test("resolveA2UIRichTextEditorState uses the explicit thread id when present", () => {
  const state = resolveA2UIRichTextEditorState({
    mode: "compact",
    thread_id: " thread.inline ",
    placeholder: " Reply here ",
    submit_label: " Send ",
    supertags: [" inbox ", "", "type:reply"],
  }, "thread.fallback");

  assert.equal(state.mode, "compact");
  assert.equal(state.threadId, "thread.inline");
  assert.equal(state.placeholder, "Reply here");
  assert.equal(state.submitLabel, "Send");
  assert.deepEqual(state.supertags, ["inbox", "type:reply"]);
});

test("resolveA2UIRichTextEditorState falls back to the surrounding thread context", () => {
  const state = resolveA2UIRichTextEditorState({
    mode: "email",
    initial_content: "<p>Hello</p>",
    email_to: " alex@example.com ",
    email_subject: " Re: Proposal ",
  }, "thread.parent");

  assert.equal(state.mode, "email");
  assert.equal(state.threadId, "thread.parent");
  assert.equal(state.initialContent, "<p>Hello</p>");
  assert.equal(state.emailTo, "alex@example.com");
  assert.equal(state.emailSubject, "Re: Proposal");
});

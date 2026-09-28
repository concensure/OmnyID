import test from "node:test";
import assert from "node:assert/strict";

import { dispatchEditorSubmitEvent, EDITOR_SUBMIT_EVENT } from "../src/lib/editorSubmitEvent.ts";
import type { EditorPayload } from "../src/lib/editorPayload.ts";

test("dispatchEditorSubmitEvent emits the documented editor submit event", () => {
  const target = new EventTarget();
  let received: EditorPayload | null = null;
  target.addEventListener(EDITOR_SUBMIT_EVENT, (event) => {
    received = (event as CustomEvent<EditorPayload>).detail;
  });

  const payload: EditorPayload = {
    markdown: "Hello",
    text: "Hello",
    html: "<p>Hello</p>",
    afpMessage: {
      thread_id: "thread.1",
      type: "note",
      content: { markdown: "Hello", text: "Hello" },
      views: [],
      attachments: [],
      references: [],
      metadata: {},
    },
  };

  dispatchEditorSubmitEvent(payload, target);

  assert.deepEqual(received, payload);
});

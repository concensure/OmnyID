import assert from "node:assert/strict";
import test from "node:test";
import { buildMasterAgentConversationState } from "../src/lib/masterAgentConversationState.ts";

test("master agent conversation preserves paragraphs and bounded structured details", () => {
  const state = buildMasterAgentConversationState("  Help me plan this  ", {
    summary: "First paragraph.\n\nSecond paragraph.",
    bullets: ["One", "One", "Two"],
    links: [
      { title: "Source", url: "https://example.com", kind: "source" },
      { title: "Duplicate", url: "https://example.com", kind: "source" },
    ],
  });

  assert.equal(state.userText, "Help me plan this");
  assert.equal(state.assistantMarkdown, "First paragraph.\n\nSecond paragraph.");
  assert.deepEqual(state.bullets, ["One", "Two"]);
  assert.deepEqual(state.links, [{ title: "Source", url: "https://example.com" }]);
});

test("master agent conversation drops unsafe links and supplies a readable empty fallback", () => {
  const state = buildMasterAgentConversationState("Question", {
    summary: "  ",
    bullets: [],
    links: [{ title: "Unsafe", url: "javascript:alert(1)", kind: "source" }],
  });

  assert.equal(state.assistantMarkdown, "The Master Agent completed the request.");
  assert.deepEqual(state.links, []);
});

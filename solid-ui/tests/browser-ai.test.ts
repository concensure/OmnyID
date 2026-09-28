import test from "node:test";
import assert from "node:assert/strict";

import { parseBrowserAiClassification } from "../src/lib/browserAi.ts";

test("parseBrowserAiClassification rejects malformed model JSON", () => {
  assert.equal(parseBrowserAiClassification("{bad-json"), null);
  assert.equal(parseBrowserAiClassification("[]"), null);
  assert.equal(parseBrowserAiClassification("null"), null);
});

test("parseBrowserAiClassification normalizes fenced classification JSON", () => {
  assert.deepEqual(
    parseBrowserAiClassification('```json\n{"intent":" task ","title":"Buy milk"}\n```'),
    {
      intent: "task",
      parsed: {
        intent: " task ",
        title: "Buy milk",
      },
    },
  );
});

test("parseBrowserAiClassification defaults blank intent to web research", () => {
  assert.deepEqual(
    parseBrowserAiClassification('{"intent":"   ","query":"weather"}'),
    {
      intent: "web_research",
      parsed: {
        intent: "   ",
        query: "weather",
      },
    },
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  stripTrackingParamsFromText,
  stripTrackingParamsFromUrl,
} from "../src/lib/editorUrlCleanup.ts";

test("stripTrackingParamsFromUrl removes known tracking params and preserves others", () => {
  assert.equal(
    stripTrackingParamsFromUrl("https://example.com/page?utm_source=newsletter&id=42&fbclid=abc123"),
    "https://example.com/page?id=42",
  );
});

test("stripTrackingParamsFromUrl preserves trailing punctuation", () => {
  assert.equal(
    stripTrackingParamsFromUrl("https://example.com/path?gclid=abc&id=7)."),
    "https://example.com/path?id=7).",
  );
});

test("stripTrackingParamsFromText cleans multiple urls inside pasted text", () => {
  assert.equal(
    stripTrackingParamsFromText(
      "Primary https://example.com?a=1&utm_campaign=launch and backup https://omnyid.com/?ref=feed.",
    ),
    "Primary https://example.com/?a=1 and backup https://omnyid.com/.",
  );
});

test("stripTrackingParamsFromText leaves invalid urls untouched", () => {
  assert.equal(
    stripTrackingParamsFromText("See https://exa[mple.com/?utm_source=test and keep it literal."),
    "See https://exa[mple.com/?utm_source=test and keep it literal.",
  );
});

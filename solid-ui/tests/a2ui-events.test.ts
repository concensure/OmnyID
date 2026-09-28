import test from "node:test";
import assert from "node:assert/strict";

import {
  readA2uiCardRequestEventDetail,
  readA2uiCopyFallbackEventDetail,
  readA2uiShareEventDetail,
  readSocialComposeActionEventDetail,
  readSpaceFeedComposeEventDetail,
} from "../src/lib/a2uiEvents.ts";

test("readA2uiCopyFallbackEventDetail accepts only string text payloads", () => {
  assert.deepEqual(
    readA2uiCopyFallbackEventDetail(new CustomEvent("x", { detail: { text: "copy me" } })),
    { text: "copy me" },
  );
  assert.equal(
    readA2uiCopyFallbackEventDetail(new CustomEvent("x", { detail: { text: 7 } })),
    null,
  );
  assert.equal(
    readA2uiCopyFallbackEventDetail(new Event("x")),
    null,
  );
});

test("readA2uiCardRequestEventDetail accepts only valid card request payloads", () => {
  assert.deepEqual(
    readA2uiCardRequestEventDetail(new CustomEvent("x", {
      detail: { type: "text", prompt: "Summarize this", attachedFileName: "brief.md" },
    })),
    { type: "text", prompt: "Summarize this", attachedFileName: "brief.md" },
  );
  assert.deepEqual(
    readA2uiCardRequestEventDetail(new CustomEvent("x", {
      detail: { type: null, prompt: "Summarize this" },
    })),
    { type: null, prompt: "Summarize this" },
  );
  assert.equal(
    readA2uiCardRequestEventDetail(new CustomEvent("x", {
      detail: { type: 7, prompt: "Summarize this" },
    })),
    null,
  );
  assert.equal(
    readA2uiCardRequestEventDetail(new CustomEvent("x", {
      detail: { type: "text", prompt: 7 },
    })),
    null,
  );
});

test("readA2uiShareEventDetail accepts only record payloads", () => {
  const detail = { title: "Share", url: "https://example.com", nested: { ok: true } };
  assert.deepEqual(
    readA2uiShareEventDetail(new CustomEvent("x", { detail })),
    detail,
  );
  assert.equal(
    readA2uiShareEventDetail(new CustomEvent("x", { detail: ["not", "a", "record"] })),
    null,
  );
  assert.equal(
    readA2uiShareEventDetail(new CustomEvent("x", { detail: null })),
    null,
  );
  assert.equal(readA2uiShareEventDetail(new Event("x")), null);
});

test("readSocialComposeActionEventDetail accepts only valid social compose payloads", () => {
  assert.deepEqual(
    readSocialComposeActionEventDetail(new CustomEvent("x", {
      detail: {
        action: "share",
        platform: "linkedin",
        draft_text: "Launch update",
        title: "Launch update",
      },
    })),
    {
      action: "share",
      platform: "linkedin",
      draft_text: "Launch update",
      title: "Launch update",
    },
  );
  assert.equal(
    readSocialComposeActionEventDetail(new CustomEvent("x", {
      detail: {
        action: "share",
        platform: "linkedin",
        draft_text: "Launch update",
        title: 7,
      },
    })),
    null,
  );
});

test("readSpaceFeedComposeEventDetail accepts only valid space compose payloads", () => {
  assert.deepEqual(
    readSpaceFeedComposeEventDetail(new CustomEvent("x", {
      detail: { space_id: "space-1", space_name: "Product" },
    })),
    { space_id: "space-1", space_name: "Product" },
  );
  assert.equal(
    readSpaceFeedComposeEventDetail(new CustomEvent("x", {
      detail: { space_id: "space-1", space_name: 7 },
    })),
    null,
  );
  assert.equal(
    readSpaceFeedComposeEventDetail(new Event("x")),
    null,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildAttachmentRetentionDecisionState } from "../src/lib/attachmentRetentionDecisionState.ts";

test("buildAttachmentRetentionDecisionState recommends extracted-content retention by default", () => {
  const state = buildAttachmentRetentionDecisionState("keep_extracted_only");

  assert.match(state.headline, /preserves study value without keeping the original file/i);
  assert.match(state.detail, /commercial-standard default/i);
  assert.equal(state.cards[0]?.recommended, true);
  assert.equal(state.cards[0]?.selected, true);
  assert.match(state.cards[0]?.valueAfterRun ?? "", /keeps extracted notes, supertags, and graph links/i);
});

test("buildAttachmentRetentionDecisionState explains when exact-file retention is useful", () => {
  const state = buildAttachmentRetentionDecisionState("keep_file");

  assert.match(state.headline, /preserves the exact file/i);
  assert.equal(state.cards[1]?.selected, true);
  assert.match(state.cards[1]?.searchability ?? "", /original file and extracted notes/i);
  assert.match(state.cards[1]?.storageImpact ?? "", /Highest storage use/i);
});

test("buildAttachmentRetentionDecisionState warns when nothing will be retained", () => {
  const state = buildAttachmentRetentionDecisionState("keep_nothing");

  assert.match(state.headline, /trades away long-term study value/i);
  assert.match(state.detail, /cannot reuse the upload/i);
  assert.equal(state.cards[2]?.selected, true);
  assert.match(state.cards[2]?.searchability ?? "", /Nothing remains searchable/i);
});

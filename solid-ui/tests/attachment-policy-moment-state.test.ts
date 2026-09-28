import assert from "node:assert/strict";
import test from "node:test";

import { buildAttachmentPolicyMomentState } from "../src/lib/attachmentPolicyMomentState.ts";

test("buildAttachmentPolicyMomentState returns null without attachments", () => {
  assert.equal(
    buildAttachmentPolicyMomentState({
      attachedCount: 0,
      readableCount: 0,
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
    }),
    null,
  );
});

test("buildAttachmentPolicyMomentState recommends keeping extracted content for study uploads", () => {
  const state = buildAttachmentPolicyMomentState({
    attachedCount: 2,
    readableCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.match(state?.headline ?? "", /what omnyid should keep/i);
  assert.match(state?.detail ?? "", /connected notes/i);
  const recommended = state?.options.find((option) => option.recommended);
  assert.equal(recommended?.mode, "keep_extracted_only");
  assert.equal(recommended?.selected, true);
});

test("buildAttachmentPolicyMomentState explains blocked readable value when files are unreadable", () => {
  const state = buildAttachmentPolicyMomentState({
    attachedCount: 1,
    readableCount: 0,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_nothing",
  });

  assert.match(state?.detail ?? "", /cannot compound yet/i);
  const selected = state?.options.find((option) => option.selected);
  assert.equal(selected?.mode, "keep_nothing");
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyAttachmentPolicyPresetState } from "../src/lib/studyAttachmentPolicyPresetState.ts";

test("buildStudyAttachmentPolicyPresetState recommends the commercial default for connected notes", () => {
  const state = buildStudyAttachmentPolicyPresetState({
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });
  assert.match(state.headline, /reusable study memory/i);
  assert.equal(state.presets[0]?.recommended, true);
  assert.equal(state.presets[0]?.selected, true);
  assert.match(state.presets[0]?.detail ?? "", /keep extracted notes only/i);
});

test("buildStudyAttachmentPolicyPresetState recognizes the private one-off preset", () => {
  const state = buildStudyAttachmentPolicyPresetState({
    knowledgeMode: "standard",
    retentionMode: "keep_nothing",
  });
  const preset = state.presets.find((entry) => entry.id === "private_one_off");
  assert.equal(preset?.selected, true);
  assert.match(state.headline, /one-off privacy/i);
  assert.match(preset?.storageLabel ?? "", /lowest retention footprint/i);
});

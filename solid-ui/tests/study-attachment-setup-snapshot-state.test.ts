import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyAttachmentSetupSnapshotState } from "../src/lib/studyAttachmentSetupSnapshotState.ts";

test("recommended connected-notes setup is framed as the strongest default", () => {
  const state = buildStudyAttachmentSetupSnapshotState({
    attachedCount: 2,
    readableCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    queryReady: true,
  });

  assert.match(state.headline, /strong first-run connected-notes experience/i);
  assert.equal(state.badge, "Recommended setup");
  assert.equal(state.primaryActionId, "run_now");
  assert.match(state.cards[1]?.detail ?? "", /supertags, and graph links/i);
});

test("zettelkasten mode is framed as a deliberate note-chain path", () => {
  const state = buildStudyAttachmentSetupSnapshotState({
    attachedCount: 1,
    readableCount: 1,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_file",
    queryReady: false,
  });

  assert.match(state.headline, /start of a deliberate note chain/i);
  assert.equal(state.badge, "Zettelkasten path");
  assert.equal(state.primaryActionId, "load_prompt");
  assert.match(state.cards[2]?.detail ?? "", /source-note development/i);
});

test("keep-nothing setup warns that value will not compound", () => {
  const state = buildStudyAttachmentSetupSnapshotState({
    attachedCount: 1,
    readableCount: 1,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_nothing",
    queryReady: true,
  });

  assert.match(state.headline, /will not compound into reusable study memory/i);
  assert.equal(state.badge, "One-off only");
  assert.equal(state.primaryActionId, "use_recommended_setup");
  assert.equal(state.secondaryActionId, "run_now");
});

test("missing readable sources is treated as the first blocker", () => {
  const state = buildStudyAttachmentSetupSnapshotState({
    attachedCount: 2,
    readableCount: 0,
    knowledgeMode: "standard",
    retentionMode: "keep_extracted_only",
    queryReady: false,
  });

  assert.match(state.headline, /not yet strong enough to prove connected-note value/i);
  assert.equal(state.badge, "Needs readable source");
  assert.equal(state.primaryActionId, "pick_files");
  assert.match(state.cards[0]?.detail ?? "", /weaker until at least one readable source/i);
});

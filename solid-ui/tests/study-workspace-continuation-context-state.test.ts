import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdjacentSourceFollowupSeed,
  buildStudyWorkspaceContextLabel,
  buildStudyWorkspaceFocusContext,
  buildStudyWorkspaceGraphContextSuffix,
  cleanStudyWorkspaceStringList,
} from "../src/lib/studyWorkspaceContinuationContextState.ts";

test("buildStudyWorkspaceContextLabel keeps scoped course unit and chapter readable", () => {
  assert.equal(buildStudyWorkspaceContextLabel([]), "my retained study material");
  assert.equal(
    buildStudyWorkspaceContextLabel(["course:psy101", "unit:2", "chapter:5"]),
    "course:psy101, unit:2, and chapter:5",
  );
});

test("cleanStudyWorkspaceStringList removes blanks and duplicate graph tags", () => {
  assert.deepEqual(
    cleanStudyWorkspaceStringList([" topic:memory ", "", "topic:memory", "chapter:5"]),
    ["topic:memory", "chapter:5"],
  );
});

test("buildStudyWorkspaceGraphContextSuffix carries anchors links and next note moves", () => {
  const suffix = buildStudyWorkspaceGraphContextSuffix({
    knowledgeGraphGroupKey: "topic:contract_formation",
    knowledgeGraphLinkTags: ["course:law101", "topic:contract_formation"],
    zettelkastenNextAction: "Promote the issue-rule distinction.",
  });

  assert.match(suffix, /graph anchor topic:contract_formation/i);
  assert.match(suffix, /course:law101, topic:contract_formation/i);
  assert.match(suffix, /Promote the issue-rule distinction/i);
});

test("buildStudyWorkspaceFocusContext centralizes course unit chapter and graph badges", () => {
  const context = buildStudyWorkspaceFocusContext({
    activeTag: " topic:duty ",
    academicKind: "lecture_slides",
    courseTag: "course:law101",
    unitTag: "unit:negligence",
    chapterTag: "chapter:4",
    knowledgeGraphGroupKey: "topic:duty",
    knowledgeGraphLinkTags: ["topic:duty", "course:law101", "topic:duty"],
    zettelkastenStage: "review_pending",
  }, {
    activeLens: "linked_ideas",
    activeConnectionStrength: "high",
  });

  assert.equal(context.contextLabel, "lecture slides, course:law101, unit:negligence, chapter:4, topic:duty, and tag topic:duty");
  assert.ok(context.focusBadges.includes("unit:negligence"));
  assert.ok(context.focusBadges.includes("chapter:4"));
  assert.ok(context.focusBadges.includes("lens linked ideas"));
  assert.ok(context.focusBadges.includes("high links"));
  assert.deepEqual(context.knowledgeGraphLinkTags, ["topic:duty", "course:law101"]);
});

test("buildAdjacentSourceFollowupSeed keeps adjacent-source prompts narrow", () => {
  const seed = buildAdjacentSourceFollowupSeed({
    contextLabel: "course:law101, unit:negligence, and chapter:4",
    focusBadges: ["course:law101", "unit:negligence", "chapter:4"],
    notice: "Adjacent-source prompt loaded.",
    originLabel: "From Files focus",
    knowledgeMode: "connected_notes",
    adjacentSource: null,
    graphSuffix: " Use graph anchor unit:negligence.",
  });

  assert.equal(seed.flowKind, "adjacent_source_planning");
  assert.equal(seed.originLabel, "From Files focus");
  assert.ok(seed.focusBadges?.includes("chapter:4"));
  assert.match(seed.query, /single best adjacent source/i);
  assert.match(seed.query, /unit:negligence/i);
  assert.match(seed.query, /graph anchor unit:negligence/i);
});

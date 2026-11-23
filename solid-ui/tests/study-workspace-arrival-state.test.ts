import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilesWorkspaceArrivalState,
  buildKnowledgeGraphWorkspaceArrivalState,
} from "../src/lib/studyWorkspaceArrivalState.ts";

test("buildFilesWorkspaceArrivalState explains retained extracted study memory", () => {
  const state = buildFilesWorkspaceArrivalState({
    notice: "Showing the extracted study sources retained from your latest upload.",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    sourceCount: 2,
    courseTag: "course:bio101",
    unitTag: "unit:2",
    chapterTag: "chapter:4",
    weekTag: "week:3",
    knowledgeGraphGroupKey: "topic:cellular_respiration",
    knowledgeGraphLinkTags: ["topic:cellular_respiration", "week:3"],
  });

  assert.ok(state);
  assert.equal(state!.badge, "Retained study memory");
  assert.match(state!.cards[1]?.detail ?? "", /unit:2/i);
  assert.match(state!.cards[1]?.detail ?? "", /chapter:4/i);
  assert.match(state!.cards[1]?.detail ?? "", /graph anchor topic:cellular_respiration/i);
  assert.match(state!.cards[1]?.detail ?? "", /link topic:cellular_respiration/i);
  assert.match(state!.cards[2]?.detail ?? "", /Supertags keep related lectures/i);
  assert.match(state!.nextStep, /matching graph view|strongest supertag cluster/i);
});

test("buildFilesWorkspaceArrivalState explains zettelkasten carryover", () => {
  const state = buildFilesWorkspaceArrivalState({
    notice: "Showing the extracted study sources retained from your latest upload.",
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    sourceCount: 1,
    zettelkastenStage: "source_note",
    zettelkastenNextAction: "Write one permanent note that challenges the original argument.",
    knowledgeGraphGroupKey: "topic:epistemology",
    knowledgeGraphLinkTags: ["topic:epistemology"],
  });

  assert.ok(state);
  assert.equal(state!.badge, "Zettelkasten carryover");
  assert.match(state!.headline, /note-development flow/i);
  assert.match(state!.cards[1]?.detail ?? "", /note chain/i);
  assert.match(state!.cards[1]?.detail ?? "", /graph anchor topic:epistemology/i);
  assert.match(state!.nextStep, /challenges the original argument/i);
});

test("buildKnowledgeGraphWorkspaceArrivalState explains linked study graph carryover", () => {
  const state = buildKnowledgeGraphWorkspaceArrivalState({
    activeLens: "linked_ideas",
    preferredConnectionStrength: "high",
    activeTag: "course:bio101",
    searchQuery: "",
    academicKind: "lecture_slides",
    courseTag: "course:bio101",
    unitTag: "unit:2",
    chapterTag: "chapter:4",
    weekTag: "week:3",
    lectureTag: null,
    zettelkastenStage: null,
    highlightCardId: null,
    highlightSourceMessageId: null,
    fileName: "Week 3 Lecture.pdf and 1 more",
    notice: "Focused on the newest retained study pack, with the strongest cross-source links shown first.",
    origin: "files",
    createdAt: Date.now(),
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    sourceCount: 2,
    knowledgeGraphGroupKey: "course:bio101",
    knowledgeGraphLinkTags: ["course:bio101", "week:3", "topic:respiration"],
  });

  assert.ok(state);
  assert.equal(state!.badge, "Linked study graph");
  assert.match(state!.cards[1]?.detail ?? "", /strongest cross-source links/i);
  assert.match(state!.cards[1]?.detail ?? "", /unit:2/i);
  assert.match(state!.cards[1]?.detail ?? "", /chapter:4/i);
  assert.match(state!.cards[1]?.detail ?? "", /graph anchor course:bio101/i);
  assert.match(state!.cards[1]?.detail ?? "", /link topic:respiration/i);
  assert.match(state!.nextStep, /strongest linked cluster/i);
});

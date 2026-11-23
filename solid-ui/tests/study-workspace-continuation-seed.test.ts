import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilesAdjacentSourceSeed,
  buildFilesStudyContinuationSeed,
  buildKnowledgeGraphAdjacentSourceSeed,
  buildKnowledgeGraphStudyContinuationSeed,
} from "../src/lib/studyWorkspaceContinuationSeed.ts";

test("buildFilesStudyContinuationSeed preserves zettelkasten progression", () => {
  const seed = buildFilesStudyContinuationSeed({
    knowledgeMode: "zettelkasten",
    zettelkastenStage: "review_pending",
    courseTag: "course:law101",
    zettelkastenNextAction: "Promote the issue-rule distinction into a permanent note.",
    knowledgeGraphGroupKey: "topic:contract_formation",
    knowledgeGraphLinkTags: ["topic:contract_formation", "course:law101"],
  });
  assert.equal(seed.knowledgeMode, "zettelkasten");
  assert.equal(seed.originLabel, "From Files focus");
  assert.ok(seed.focusBadges?.includes("course:law101"));
  assert.ok(seed.focusBadges?.includes("topic:contract_formation"));
  assert.match(seed.query, /Zettelkasten material/i);
  assert.match(seed.query, /review pending/i);
  assert.match(seed.query, /graph anchor topic:contract_formation/i);
  assert.match(seed.query, /supertag links/i);
  assert.match(seed.query, /permanent note/i);
  assert.match(seed.helper ?? "", /course:law101/i);
  assert.match(seed.recommendedUpload ?? "", /course:law101/i);
  assert.match(seed.checklist[2] ?? "", /same branch|rough note|reading/i);
});

test("buildFilesStudyContinuationSeed builds week-focused study follow-up prompts", () => {
  const seed = buildFilesStudyContinuationSeed({
    academicKind: "lecture_slides",
    weekTag: "week:3",
    courseTag: "course:econ101",
  });
  assert.equal(seed.knowledgeMode, "connected_notes");
  assert.equal(seed.originLabel, "From Files focus");
  assert.ok(seed.focusBadges?.includes("week:3"));
  assert.match(seed.query, /week:3/i);
  assert.match(seed.query, /examinable ideas|revision priorities/i);
  assert.match(seed.recommendedUpload ?? "", /course:econ101/i);
  assert.match(seed.checklist[2] ?? "", /reading|tutorial sheet|rough note/i);
});

test("buildFilesStudyContinuationSeed carries chapter and unit focus into prompts", () => {
  const seed = buildFilesStudyContinuationSeed({
    academicKind: "reading",
    courseTag: "course:psy101",
    unitTag: "unit:2",
    chapterTag: "chapter:5",
  });

  assert.equal(seed.knowledgeMode, "connected_notes");
  assert.ok(seed.focusBadges?.includes("unit:2"));
  assert.ok(seed.focusBadges?.includes("chapter:5"));
  assert.match(seed.query, /unit:2/i);
  assert.match(seed.query, /chapter:5/i);
  assert.match(seed.helper ?? "", /unit:2|chapter:5/i);
  assert.match(seed.recommendedUpload ?? "", /unit:2|chapter:5/i);
});

test("buildKnowledgeGraphStudyContinuationSeed favors linked-idea comparison prompts", () => {
  const seed = buildKnowledgeGraphStudyContinuationSeed({
    activeLens: "linked_ideas",
    activeConnectionStrength: "high",
    activeTag: "topic:market_failures",
  });
  assert.equal(seed.label, "Ask from linked ideas");
  assert.equal(seed.originLabel, "From Knowledge Graph focus");
  assert.ok(seed.focusBadges?.includes("lens linked ideas"));
  assert.match(seed.query, /strongest overlaps/i);
  assert.match(seed.query, /topic:market_failures/i);
  assert.match(seed.helper ?? "", /same study topic/i);
  assert.match(seed.recommendedUpload ?? "", /same study topic|topic:market_failures/i);
});

test("buildKnowledgeGraphStudyContinuationSeed preserves zettelkasten graph focus", () => {
  const seed = buildKnowledgeGraphStudyContinuationSeed({
    activeLens: "zettelkasten",
    zettelkastenStage: "source_note",
    courseTag: "course:phil201",
    zettelkastenNextAction: "Write how this challenges the previous argument note.",
    knowledgeGraphGroupKey: "topic:phenomenology",
    knowledgeGraphLinkTags: ["topic:phenomenology", "course:phil201"],
  });
  assert.equal(seed.knowledgeMode, "zettelkasten");
  assert.equal(seed.originLabel, "From Knowledge Graph focus");
  assert.ok(seed.focusBadges?.includes("stage source note"));
  assert.ok(seed.focusBadges?.includes("topic:phenomenology"));
  assert.match(seed.query, /permanent notes/i);
  assert.match(seed.query, /source note/i);
  assert.match(seed.query, /graph anchor topic:phenomenology/i);
  assert.match(seed.query, /supertag links/i);
  assert.match(seed.query, /challenges the previous argument note/i);
  assert.match(seed.helper ?? "", /course:phil201/i);
  assert.match(seed.recommendedUpload ?? "", /course:phil201/i);
});

test("buildFilesAdjacentSourceSeed plans the next connected-notes source narrowly", () => {
  const seed = buildFilesAdjacentSourceSeed({
    academicKind: "lecture_slides",
    weekTag: "week:3",
    courseTag: "course:econ101",
    knowledgeGraphGroupKey: "week:3",
    knowledgeGraphLinkTags: ["week:3", "topic:market_failures"],
  });

  assert.equal(seed.knowledgeMode, "connected_notes");
  assert.equal(seed.originLabel, "From Files focus");
  assert.match(seed.label, /next adjacent source/i);
  assert.match(seed.query, /single best adjacent source/i);
  assert.match(seed.query, /strengthen the same study thread/i);
  assert.match(seed.query, /graph anchor week:3/i);
  assert.match(seed.query, /topic:market_failures/i);
  assert.match(seed.recommendedUpload ?? "", /course:econ101/i);
});

test("buildKnowledgeGraphAdjacentSourceSeed plans the next Zettelkasten source narrowly", () => {
  const seed = buildKnowledgeGraphAdjacentSourceSeed({
    activeLens: "zettelkasten",
    zettelkastenStage: "source_note",
    courseTag: "course:phil201",
  });

  assert.equal(seed.knowledgeMode, "zettelkasten");
  assert.equal(seed.originLabel, "From Knowledge Graph focus");
  assert.match(seed.label, /note-chain source/i);
  assert.match(seed.query, /single best adjacent source/i);
  assert.match(seed.query, /deepen the same note chain/i);
  assert.match(seed.recommendedUpload ?? "", /course:phil201/i);
});

test("buildKnowledgeGraphAdjacentSourceSeed keeps chapter and unit anchors narrow", () => {
  const seed = buildKnowledgeGraphAdjacentSourceSeed({
    activeLens: "linked_ideas",
    courseTag: "course:law101",
    unitTag: "unit:negligence",
    chapterTag: "chapter:4",
  });

  assert.ok(seed.focusBadges?.includes("unit:negligence"));
  assert.ok(seed.focusBadges?.includes("chapter:4"));
  assert.match(seed.query, /unit:negligence/i);
  assert.match(seed.query, /chapter:4/i);
  assert.match(seed.recommendedUpload ?? "", /unit:negligence|chapter:4/i);
});

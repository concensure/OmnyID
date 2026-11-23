import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyResultCommandCenterState } from "../src/lib/studyResultCommandCenterState.ts";
import type { StudyResultContinuationState } from "../src/lib/studyResultContinuationState.ts";
import type { StudyResultHandoffState } from "../src/lib/studyResultHandoffState.ts";
import type { StudyResultMomentumState } from "../src/lib/studyResultMomentumState.ts";
import type { StudyResultValuePathState } from "../src/lib/studyResultValuePathState.ts";

test("buildStudyResultCommandCenterState prioritizes retention repair", () => {
  const valuePath: StudyResultValuePathState = {
    grade: "fix_retention",
    headline: "The answer is grounded, but the reusable study system did not start yet.",
    detail: "Rerun with kept extracted notes so Files, supertags, and linked retrieval can remember this material.",
    badge: "Fix retention first",
    cards: [],
    primaryActionId: "search",
    primaryActionLabel: "Rerun with retention",
    secondaryActionId: null,
    secondaryActionLabel: null,
  };
  const momentum: StudyResultMomentumState = {
    grade: "one_off",
    headline: "This answer is useful, but it did not create reusable study memory.",
    detail: "The result is grounded in the current chat only.",
    tone: "amber",
    primaryActionId: "search",
    primaryActionLabel: "Rerun with retention",
    secondaryActionId: null,
    secondaryActionLabel: null,
  };

  const state = buildStudyResultCommandCenterState({
    valuePath,
    continuation: null,
    momentum,
    handoff: null,
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.eyebrowLabel, "Best next move from this study result");
  assert.equal(state?.primaryActionId, "search");
  assert.match(state?.cards[1]?.detail ?? "", /same topic|retained/i);
});

test("buildStudyResultCommandCenterState prioritizes linked ideas for connected study packs", () => {
  const valuePath: StudyResultValuePathState = {
    grade: "connected_pack_ready",
    headline: "This first answer already created a reusable connected study pack.",
    detail: "The student should be able to feel the value immediately.",
    badge: "Connected pack ready",
    cards: [],
    primaryActionId: "graph",
    primaryActionLabel: "Open Linked ideas",
    secondaryActionId: "search",
    secondaryActionLabel: "Continue this topic",
  };
  const continuation: StudyResultContinuationState = {
    headline: "Your first study result can continue directly into retained sources and Linked ideas.",
    detail: "Retained study material should already be useful in Files and should expose cross-source overlap in the graph.",
    actions: [
      { id: "files", label: "Open retained sources", description: "Review the retained extracted notes immediately.", tone: "sky" },
      { id: "graph", label: "Open Linked ideas", description: "Inspect overlap and divergence across retained sources.", tone: "violet" },
    ],
  };
  const momentum: StudyResultMomentumState = {
    grade: "reusable",
    headline: "This run created a reusable connected study pack.",
    detail: "Multiple grounded sources were retained with study context.",
    tone: "emerald",
    primaryActionId: "graph",
    primaryActionLabel: "Open Linked ideas",
    secondaryActionId: "files",
    secondaryActionLabel: "Open retained sources",
  };

  const state = buildStudyResultCommandCenterState({
    valuePath,
    continuation,
    momentum,
    handoff: null,
  });

  assert.equal(state?.tone, "emerald");
  assert.equal(state?.primaryActionId, "graph");
  assert.equal(state?.secondaryActionId, "search");
  assert.match(state?.cards[0]?.detail ?? "", /retained/i);
});

test("buildStudyResultCommandCenterState supports zettelkasten follow-through", () => {
  const valuePath: StudyResultValuePathState = {
    grade: "zettelkasten_ready",
    headline: "This result can continue as a reusable note branch immediately.",
    detail: "The next value comes from reviewing the branch and promoting stronger notes.",
    badge: "Zettelkasten ready",
    cards: [],
    primaryActionId: "graph",
    primaryActionLabel: "Open Zettelkasten view",
    secondaryActionId: "search",
    secondaryActionLabel: "Continue this note chain",
  };
  const handoff: StudyResultHandoffState = {
    headline: "This result can continue straight into note development.",
    detail: "The retained material is already organized for source-note progression.",
    badge: "Note chain ready",
    steps: [
      {
        id: "graph",
        label: "Inspect the Zettelkasten chain",
        detail: "Open the Zettelkasten view to review linked notes.",
        actionId: "graph",
        actionLabel: "Open Zettelkasten view",
        tone: "emerald",
      },
    ],
  };

  const state = buildStudyResultCommandCenterState({
    valuePath,
    continuation: null,
    momentum: null,
    handoff,
  });

  assert.equal(state?.tone, "violet");
  assert.equal(state?.primaryActionLabel, "Open Zettelkasten view");
  assert.match(state?.cards[2]?.detail ?? "", /branch|notes/i);
});

test("buildStudyResultCommandCenterState keeps report follow-through visible at the top level", () => {
  const valuePath: StudyResultValuePathState = {
    grade: "connected_pack_ready",
    headline: "This first answer already created a reusable connected study pack.",
    detail: "The student should be able to feel the value immediately. Because this came from a assignment plan report, strengthen it next with assignment brief or rubric.",
    badge: "Connected pack ready",
    cards: [],
    primaryActionId: "graph",
    primaryActionLabel: "Open Linked ideas",
    secondaryActionId: "search",
    secondaryActionLabel: "Continue this topic",
  };

  const state = buildStudyResultCommandCenterState({
    valuePath,
    continuation: null,
    momentum: null,
    handoff: null,
  });

  assert.equal(state?.eyebrowLabel, "Best next move from this assignment plan report");
  assert.equal(state?.cards[0]?.label, "What this report created");
  assert.equal(state?.cards[2]?.label, "Best report follow-through");
});

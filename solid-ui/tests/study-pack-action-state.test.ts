import assert from "node:assert/strict";
import test from "node:test";

import type { FileLibraryItem } from "../src/lib/api.ts";
import type { KnowledgeCard } from "../src/lib/knowledgeGraphTypes.ts";
import {
  buildFileStudyPackActionState,
  buildKnowledgeGraphStudyPackActionState,
} from "../src/lib/studyPackActionState.ts";

function fileItem(overrides: Partial<FileLibraryItem> = {}): FileLibraryItem {
  return {
    id: "file-1",
    message_id: "msg-1",
    derived_message_id: "derived-1",
    name: "week3.pdf",
    mime_type: "application/pdf",
    size_bytes: 1000,
    created_at: "2026-09-03T10:00:00.000Z",
    download_url: null,
    source_type: "attachment",
    source_kind: "parsed_document",
    source_metadata: {
      knowledge_mode: "connected_notes",
      academic_course_tag: "course:econ101",
    },
    source_supertags: ["course:econ101", "resource:study_material"],
    ...overrides,
  } as FileLibraryItem;
}

function card(overrides: Partial<KnowledgeCard> = {}): KnowledgeCard {
  return {
    id: "card-1",
    title: "Market failures",
    summary: "Summary",
    supertags: ["topic:market_failures"],
    knowledgeMode: "connected_notes",
    reviewPending: false,
    sourceNote: false,
    permanentNote: false,
    backlinks: [],
    timestamp: "2026-09-03T10:00:00.000Z",
    ...overrides,
  };
}

test("buildFileStudyPackActionState recommends comparing a multi-source ready pack", () => {
  const state = buildFileStudyPackActionState([
    fileItem(),
    fileItem({ id: "file-2", message_id: "msg-2", name: "reading.pdf", source_metadata: { knowledge_mode: "connected_notes", academic_course_tag: "course:econ101" } }),
  ]);
  assert.equal(state?.headline, "Best next step: compare the retained pack");
  assert.equal(state?.primaryActionLabel, "Ask from this study focus");
});

test("buildFileStudyPackActionState recommends note development for zettelkasten material", () => {
  const state = buildFileStudyPackActionState([
    fileItem({ source_metadata: { knowledge_mode: "zettelkasten", zettelkasten_stage: "source_note" } }),
  ]);
  assert.equal(state?.headline, "Best next step: develop the note chain");
  assert.equal(state?.primaryActionLabel, "Continue note chain");
});

test("buildKnowledgeGraphStudyPackActionState recommends strongest-link use when graph is ready", () => {
  const state = buildKnowledgeGraphStudyPackActionState([
    card({ connectionStrength: "high" }),
    card({ id: "card-2", connectionStrength: "medium" }),
  ]);
  assert.equal(state?.headline, "Best next step: use the strongest links");
  assert.equal(state?.secondaryActionLabel, "Show strongest links");
});

test("buildKnowledgeGraphStudyPackActionState recommends note-chain continuation for zettelkasten graph", () => {
  const state = buildKnowledgeGraphStudyPackActionState([
    card({ knowledgeMode: "zettelkasten", zettelkastenStage: "source_note" }),
  ]);
  assert.equal(state?.headline, "Best next step: continue the note chain");
  assert.equal(state?.primaryActionLabel, "Continue note chain");
});

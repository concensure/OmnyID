import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import {
  buildStudyResultContinuationState,
  explicitStudyResultContinuation,
} from "../src/lib/studyResultContinuationState.ts";

function evidence(
  overrides: Partial<AttachmentGroundingEvidence> = {},
): AttachmentGroundingEvidence {
  return {
    sourceCount: 1,
    selectedFileCount: 1,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 slides.pdf"],
    footerLabel: "Based on 1 uploaded source",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 1 uploaded file",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keeps extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes - Keeps extracted notes only",
    policyOutcome: "Only extracted notes remain available for future study sessions.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [{
      title: "Week 3 slides.pdf",
      kindLabel: "Uploaded study source - parsed document",
      academicKind: "lecture_slides",
      academicSummary: "Week 3 slides organized for study retrieval.",
      courseTag: "course:bio101",
      weekTag: "week:3",
      lectureTag: "lecture:week_3",
      zettelkastenStage: null,
      knowledgeGraphGroupKey: "week:3",
      knowledgeGraphLinkTags: ["course:bio101", "week:3", "topic:cellular_respiration"],
    }],
    ...overrides,
  };
}

test("buildStudyResultContinuationState prioritizes Files and linked graph for multi-source connected notes", () => {
  const state = buildStudyResultContinuationState({
    attachmentGrounding: evidence({ sourceCount: 2 }),
    fileLibraryIntent: { query: "week 3", notice: "Showing retained study sources." },
    knowledgeGraphIntent: {
      activeLens: "linked_ideas",
      activeTag: null,
      searchQuery: "",
      academicKind: null,
      courseTag: null,
      weekTag: null,
      lectureTag: null,
      zettelkastenStage: null,
      highlightCardId: null,
      highlightSourceMessageId: null,
      fileName: null,
      origin: "files",
      createdAt: Date.now(),
      knowledgeGraphGroupKey: "week:3",
      knowledgeGraphLinkTags: ["course:bio101", "week:3", "topic:cellular_respiration"],
    },
  });

  assert.ok(state);
  assert.match(state!.headline, /retained sources and Linked ideas/i);
  assert.equal(state!.actions[0]?.id, "files");
  assert.match(state!.actions[0]?.description ?? "", /graph anchor week:3/i);
  assert.equal(state!.actions[1]?.label, "Open Linked ideas");
  assert.match(state!.actions[1]?.description ?? "", /topic:cellular_respiration/i);
});

test("buildStudyResultContinuationState prioritizes zettelkasten progression when selected", () => {
  const state = buildStudyResultContinuationState({
    attachmentGrounding: evidence({
      knowledgeMode: "zettelkasten",
      sourceDescriptors: [{
        ...evidence().sourceDescriptors[0]!,
        zettelkastenStage: "source_note",
        zettelkastenNextAction: "Write one permanent note about the strongest contradiction.",
        knowledgeGraphGroupKey: "topic:epistemology",
        knowledgeGraphLinkTags: ["topic:epistemology"],
      }],
    }),
    fileLibraryIntent: { query: "week 3" },
    knowledgeGraphIntent: {
      activeLens: "zettelkasten",
      activeTag: null,
      searchQuery: "",
      academicKind: null,
      courseTag: null,
      weekTag: null,
      lectureTag: null,
      zettelkastenStage: "source_note",
      highlightCardId: null,
      highlightSourceMessageId: null,
      fileName: null,
      origin: "files",
      createdAt: Date.now(),
      zettelkastenNextAction: "Write one permanent note about the strongest contradiction.",
      knowledgeGraphGroupKey: "topic:epistemology",
      knowledgeGraphLinkTags: ["topic:epistemology"],
    },
  });

  assert.ok(state);
  assert.match(state!.headline, /Zettelkasten workflow/i);
  assert.equal(state!.actions[1]?.label, "Open Zettelkasten view");
  assert.match(state!.actions[1]?.description ?? "", /graph anchor topic:epistemology/i);
  assert.match(state!.actions[1]?.description ?? "", /next note move/i);
});

test("buildStudyResultContinuationState warns when nothing was retained", () => {
  const state = buildStudyResultContinuationState({
    attachmentGrounding: evidence({ retentionMode: "keep_nothing" }),
    fileLibraryIntent: null,
    knowledgeGraphIntent: null,
  });

  assert.ok(state);
  assert.match(state!.headline, /nothing from the upload will remain/i);
  assert.deepEqual(state!.actions, [
    {
      id: "search",
      label: "Rerun with retention",
      description: "Go back to study chat and keep extracted notes on the next run so the material stays searchable.",
      tone: "amber",
    },
  ]);
});

test("explicitStudyResultContinuation reads server-provided continuation actions", () => {
  const message = {
    content: {
      study_continuation: {
        headline: "Continue this study result through retained sources and Linked ideas.",
        detail: "Review what was retained and inspect where the sources overlap or diverge.",
        actions: [
          {
            id: "files",
            label: "Open retained sources",
            description: "Review the retained extracted notes, classifications, and supertags in Files.",
            tone: "sky",
          },
          {
            id: "graph",
            label: "Open Linked ideas",
            description: "Inspect cross-source overlap, divergence, and revision gaps without hunting through folders.",
            tone: "violet",
          },
        ],
      },
    },
  } as AfpMessage;

  const state = explicitStudyResultContinuation(message);
  assert.ok(state);
  assert.equal(state!.actions[0]?.id, "files");
  assert.equal(state!.actions[1]?.label, "Open Linked ideas");
});

test("explicitStudyResultContinuation hides encrypted continuation payloads until local decryption is available", () => {
  const message = {
    content: {
      study_continuation: {
        headline: "Hidden continuation",
        detail: "Private chapter scope.",
        actions: [
          {
            id: "files",
            label: "Open hidden source",
            description: "Secret source.",
            tone: "sky",
          },
        ],
      },
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
  } as any as AfpMessage;

  assert.equal(explicitStudyResultContinuation(message), null);
});

test("explicitStudyResultContinuation ignores incomplete continuation payloads", () => {
  const message = {
    content: {
      study_continuation: {
        headline: "Continue",
        actions: [{ id: "files", label: "Open retained sources", tone: "sky" }],
      },
    },
  } as AfpMessage;

  assert.equal(explicitStudyResultContinuation(message), null);
});

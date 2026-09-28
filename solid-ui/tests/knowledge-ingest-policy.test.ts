import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACHMENT_RETENTION_OPTIONS,
  KNOWLEDGE_MODE_OPTIONS,
  attachmentRetentionOption,
  attachmentRetentionOutcome,
  attachmentRetentionSummary,
  combinedKnowledgePolicySummary,
  knowledgeModeOption,
  knowledgeModeSummary,
} from "../src/lib/knowledgeIngestPolicy.ts";

test("knowledge ingest policy options expose all supported modes", () => {
  assert.deepEqual(
    KNOWLEDGE_MODE_OPTIONS.map((option) => option.value),
    ["connected_notes", "zettelkasten", "standard"],
  );
  assert.deepEqual(
    ATTACHMENT_RETENTION_OPTIONS.map((option) => option.value),
    ["keep_extracted_only", "keep_file", "keep_nothing"],
  );
});

test("knowledge ingest policy lookups return student-facing summaries", () => {
  assert.equal(knowledgeModeOption("connected_notes").label, "Connected notes");
  assert.match(knowledgeModeSummary("connected_notes"), /uni students/i);
  assert.equal(attachmentRetentionOption("keep_file").label, "Keep file and extracted notes");
  assert.match(attachmentRetentionSummary("keep_nothing"), /sensitive|temporary/i);
});

test("knowledge ingest policy outcomes describe storage consequences clearly", () => {
  assert.match(
    attachmentRetentionOutcome("keep_extracted_only"),
    /keeps the extracted notes/i,
  );
  assert.match(
    attachmentRetentionOutcome("keep_file"),
    /Files library/i,
  );
  assert.match(
    attachmentRetentionOutcome("keep_nothing"),
    /removes both the file and extracted content/i,
  );
  assert.equal(
    combinedKnowledgePolicySummary("zettelkasten", "keep_extracted_only"),
    "Zettelkasten + Keep extracted notes only",
  );
});

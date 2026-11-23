import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, AttachmentBatchIngestItem, UiCommandResponse } from "../src/lib/api.ts";
import {
  buildAttachmentGroundingEvidence,
  deriveAttachmentGroundingEvidenceFromMessage,
  decoratePreviewMessageWithAttachmentGrounding,
  enrichUiCommandResponseWithAttachmentGrounding,
  withAttachmentGroundingCleanupStatus,
  withAttachmentGroundingRetentionMode,
} from "../src/lib/attachmentGroundingEvidence.ts";

function buildPreviewMessage(): AfpMessage {
  return {
    id: "msg.preview.1",
    thread_id: "thread.search.1",
    from: "omnyid://workspace/command-bar",
    timestamp: "2026-09-02T10:00:00.000Z",
    type: "research",
    content: {
      kind: "web_research",
      summary: "Study summary",
      sources: [
        {
          title: "Existing source",
          url: "https://example.com/existing",
          snippet: "Existing context",
          origin: "web",
        },
      ],
    },
    metadata: {
      source_count: 1,
    },
    views: [
      {
        format: "search_result",
        content: {
          summary: "Study summary",
          sources: [
            {
              title: "Existing source",
              url: "https://example.com/existing",
              snippet: "Existing context",
              origin: "web",
            },
          ],
        },
      },
      {
        format: "a2ui.v1",
        content: {
          schema_version: "a2ui.v1",
          kind: "panel",
          title: "Study answer",
          nodes: [
            {
              id: "summary",
              type: "text",
              props: {
                value: "Study answer",
              },
            },
          ],
        },
      },
    ],
    attachments: [],
  };
}

test("buildAttachmentGroundingEvidence summarizes ingested uploaded sources", () => {
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      academic_kind: "lecture slides",
      academic_course_tag: "course:bio101",
      academic_week_tag: "week:3",
      academic_chapter_tag: "chapter:4",
      academic_unit_tag: "unit:cellular-respiration",
      academic_lecture_tag: "lecture:3",
      academic_summary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
    {
      source_message_id: "msg.source.2",
      output_message_id: "msg.out.2",
      file_name: "lecture.m4a",
      mime_type: "audio/mp4",
      output_type: "transcript",
      supertags: [],
      academic_kind: "lecture recording",
      academic_week_tag: "week:3",
      academic_summary: "lecture recording · week 3 organized for study retrieval.",
      zettelkasten_stage: "source_note_review_pending",
      zettelkasten_entry_type: "source_note",
      zettelkasten_next_action: "Review this source note and write a permanent note.",
      knowledge_graph_group_key: "week:3",
      knowledge_graph_link_tags: ["week:3", "topic:biology"],
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
    {
      source_message_id: "msg.source.3",
      file_name: "skip.ppt",
      mime_type: "application/vnd.ms-powerpoint",
      supertags: [],
      kept_source_file: false,
      ephemeral_output: true,
      ingested: false,
    },
  ] satisfies AttachmentBatchIngestItem[]);

  assert.ok(evidence);
  assert.equal(evidence.sourceCount, 2);
  assert.equal(evidence.selectedFileCount, 2);
  assert.equal(evidence.skippedFileCount, 0);
  assert.equal(evidence.unreadableFileCount, 0);
  assert.equal(evidence.footerLabel, "Based on 2 uploaded sources");
  assert.equal(evidence.coverageStatus, "complete");
  assert.equal(evidence.coverageLabel, "Coverage complete for 2 uploaded files");
  assert.equal(evidence.retentionMode, "keep_extracted_only");
  assert.equal(evidence.retentionLabel, "Keep extracted notes only");
  assert.equal(evidence.knowledgeMode, "connected_notes");
  assert.equal(evidence.knowledgeLabel, "Connected notes");
  assert.equal(
    evidence.policyLabel,
    "Connected notes + Keep extracted notes only",
  );
  assert.equal(
    evidence.policyOutcome,
    "Outcome: OmnyID keeps the extracted notes, supertags, and knowledge links, but removes the original file.",
  );
  assert.equal(evidence.cleanupStatus, "not_needed");
  assert.equal(evidence.cleanupLabel, null);
  assert.deepEqual(evidence.sourceLabels, ["week3.pdf", "lecture.m4a"]);
  assert.deepEqual(evidence.sourceLinks.map((link) => link.kind), [
    "Uploaded study source - parsed document",
    "Uploaded study source - transcript",
  ]);
  assert.deepEqual(evidence.sourceDescriptors, [
    {
      title: "week3.pdf",
      kindLabel: "Uploaded study source - parsed document",
      academicKind: "lecture slides",
      academicSummary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
      courseTag: "course:bio101",
      weekTag: "week:3",
      lectureTag: "lecture:3",
      chapterTag: "chapter:4",
      unitTag: "unit:cellular-respiration",
      zettelkastenStage: null,
    },
    {
      title: "lecture.m4a",
      kindLabel: "Uploaded study source - transcript",
      academicKind: "lecture recording",
      academicSummary: "lecture recording · week 3 organized for study retrieval.",
      courseTag: null,
      weekTag: "week:3",
      lectureTag: null,
      chapterTag: null,
      unitTag: null,
      zettelkastenStage: "source_note_review_pending",
      zettelkastenEntryType: "source_note",
      zettelkastenNextAction: "Review this source note and write a permanent note.",
      knowledgeGraphGroupKey: "week:3",
      knowledgeGraphLinkTags: ["week:3", "topic:biology"],
    },
  ]);
});

test("decoratePreviewMessageWithAttachmentGrounding appends uploaded sources across preview surfaces", () => {
  const preview = buildPreviewMessage();
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      academic_summary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
      academic_course_tag: "course:bio101",
      academic_week_tag: "week:3",
      academic_chapter_tag: "chapter:4",
      academic_unit_tag: "unit:cellular-respiration",
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[]);

  const decorated = decoratePreviewMessageWithAttachmentGrounding(preview, evidence);
  const topLevelSources = Array.isArray(decorated.content.sources) ? decorated.content.sources : [];
  assert.equal(topLevelSources.length, 2);
  assert.equal(topLevelSources[1]?.title, "week3.pdf");
  assert.equal(decorated.metadata?.uploaded_source_count, 1);
  assert.equal(decorated.metadata?.uploaded_source_selected_count, 1);
  assert.equal(decorated.metadata?.uploaded_source_skipped_count, 0);
  assert.equal(decorated.metadata?.uploaded_source_unreadable_count, 0);
  assert.equal(decorated.metadata?.grounding_label, "Based on 1 uploaded source");
  assert.equal(decorated.metadata?.source_coverage_status, "complete");
  assert.equal(decorated.metadata?.source_coverage_label, "Coverage complete for 1 uploaded file");
  assert.equal(decorated.metadata?.attachment_retention_mode, "keep_extracted_only");
  assert.equal(decorated.metadata?.attachment_retention_label, "Keep extracted notes only");
  assert.equal(decorated.metadata?.knowledge_organization_mode, "connected_notes");
  assert.equal(decorated.metadata?.knowledge_organization_label, "Connected notes");
  assert.equal(
    decorated.metadata?.attachment_policy_label,
    "Connected notes + Keep extracted notes only",
  );
  assert.equal(
    decorated.metadata?.attachment_policy_outcome,
    "Outcome: OmnyID keeps the extracted notes, supertags, and knowledge links, but removes the original file.",
  );
  assert.equal(decorated.metadata?.attachment_cleanup_status, "not_needed");
  assert.equal(decorated.metadata?.attachment_cleanup_label, null);
  assert.equal(decorated.metadata?.source_count, 2);
  assert.deepEqual(decorated.content.attachment_policy, {
    retention_mode: "keep_extracted_only",
    retention_label: "Keep extracted notes only",
    knowledge_mode: "connected_notes",
    knowledge_label: "Connected notes",
    policy_label: "Connected notes + Keep extracted notes only",
    policy_outcome: "Outcome: OmnyID keeps the extracted notes, supertags, and knowledge links, but removes the original file.",
    cleanup_status: "not_needed",
    cleanup_label: null,
  });
  assert.deepEqual(decorated.content.uploaded_source_descriptors, [
    {
      title: "week3.pdf",
      kindLabel: "Uploaded study source - parsed document",
      academicKind: null,
      academicSummary: "lecture slides · course bio101 · week 3 organized for study retrieval.",
      courseTag: "course:bio101",
      weekTag: "week:3",
      lectureTag: null,
      chapterTag: "chapter:4",
      unitTag: "unit:cellular-respiration",
      zettelkastenStage: null,
    },
  ]);

  const searchView = decorated.views[0];
  assert.equal(searchView?.format, "search_result");
  assert.equal((searchView?.content.sources as Array<unknown>).length, 2);

  const panelView = decorated.views[1];
  assert.equal(panelView?.format, "a2ui.v1");
  const panelNodes = Array.isArray(panelView?.content.nodes) ? panelView.content.nodes : [];
  const uploadedSourcesNode = panelNodes.find((node) => (
    typeof node === "object" && node !== null && "id" in node && node.id === "uploaded-study-sources"
  )) as { props?: { title?: string; items?: Array<{ title: string }> } } | undefined;
  assert.equal(uploadedSourcesNode?.props?.title, "Uploaded sources (1)");
  assert.deepEqual(uploadedSourcesNode?.props?.items?.map((item) => item.title), ["week3.pdf"]);
  const uploadedSourceMapNode = panelNodes.find((node) => (
    typeof node === "object" && node !== null && "id" in node && node.id === "uploaded-study-source-map"
  )) as { props?: { rows?: string[][] } } | undefined;
  assert.deepEqual(uploadedSourceMapNode?.props?.rows, [[
    "week3.pdf",
    "parsed document",
    "lecture slides · course bio101 · week 3 organized for study retrieval.",
  ]]);
});

test("attachment grounding does not merge readable source details into encrypted preview content", () => {
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      academic_summary: "Private chapter summary.",
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[]);
  const encrypted = {
    ...buildPreviewMessage(),
    content: {
      summary: "Hidden study summary",
      sources: [{ title: "Hidden source", url: "https://example.com/hidden" }],
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
  } as any as AfpMessage;

  assert.equal(decoratePreviewMessageWithAttachmentGrounding(encrypted, evidence), encrypted);

  const derived = deriveAttachmentGroundingEvidenceFromMessage({
    ...encrypted,
    metadata: {
      uploaded_source_count: 1,
      source_labels: ["metadata-safe.pdf"],
    },
  });
  assert.equal(derived?.sourceCount, 1);
  assert.deepEqual(derived?.sourceLabels, ["metadata-safe.pdf"]);
});

test("enrichUiCommandResponseWithAttachmentGrounding merges response links without duplicates", () => {
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[]);

  const response: UiCommandResponse = {
    intent: "search",
    suggested_view: "search",
    summary: "Study summary",
    engine: "primary",
    links: [
      {
        title: "Reference",
        url: "https://example.com/reference",
        kind: "source",
        origin: "web",
      },
      {
        title: "week3.pdf",
        url: "afp://message/msg.out.1",
        kind: "Uploaded study source - parsed document",
        origin: "uploaded_source",
      },
    ],
    preview_message: buildPreviewMessage(),
  };

  const enriched = enrichUiCommandResponseWithAttachmentGrounding(response, evidence);
  assert.equal(enriched.links.length, 2);
  assert.equal(enriched.preview_message?.metadata?.uploaded_source_count, 1);
});

test("buildAttachmentGroundingEvidence marks partial coverage when files were skipped or unreadable", () => {
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[], {
    selectedFileCount: 3,
    skippedFileCount: 1,
    unreadableFileCount: 1,
    retentionMode: "keep_nothing",
    knowledgeMode: "zettelkasten",
  });

  assert.ok(evidence);
  assert.equal(evidence.coverageStatus, "partial");
  assert.equal(evidence.coverageLabel, "Coverage incomplete: used 1 of 3 files");
  assert.equal(evidence.skippedFileCount, 1);
  assert.equal(evidence.unreadableFileCount, 1);
  assert.equal(evidence.retentionLabel, "Do not keep anything");
  assert.equal(evidence.knowledgeLabel, "Zettelkasten");
  assert.equal(
    evidence.policyLabel,
    "Zettelkasten + Do not keep anything",
  );
  assert.equal(
    evidence.policyOutcome,
    "Outcome: OmnyID answers this request, then removes both the file and extracted content after the run.",
  );
  assert.equal(evidence.cleanupStatus, "pending");
  assert.equal(evidence.cleanupLabel, "Temporary cleanup pending");
});

test("withAttachmentGroundingCleanupStatus updates keep-nothing cleanup status labels", () => {
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[], {
    retentionMode: "keep_nothing",
    knowledgeMode: "connected_notes",
  });

  const completed = withAttachmentGroundingCleanupStatus(evidence, "complete");
  assert.equal(completed?.cleanupStatus, "complete");
  assert.equal(completed?.cleanupLabel, "Temporary copies deleted");

  const pending = withAttachmentGroundingCleanupStatus(completed, "pending");
  assert.equal(pending?.cleanupStatus, "pending");
  assert.equal(pending?.cleanupLabel, "Temporary cleanup pending");
});

test("withAttachmentGroundingRetentionMode promotes keep-nothing evidence to extracted-only storage", () => {
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "week3.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[], {
    retentionMode: "keep_nothing",
    knowledgeMode: "zettelkasten",
  });

  const promoted = withAttachmentGroundingRetentionMode(
    evidence,
    "keep_extracted_only",
    "not_needed",
  );
  assert.equal(promoted?.retentionMode, "keep_extracted_only");
  assert.equal(promoted?.retentionLabel, "Keep extracted notes only");
  assert.equal(
    promoted?.policyLabel,
    "Zettelkasten + Keep extracted notes only",
  );
  assert.equal(
    promoted?.policyOutcome,
    "Outcome: OmnyID keeps the extracted notes, supertags, and knowledge links, but removes the original file.",
  );
  assert.equal(promoted?.cleanupStatus, "not_needed");
  assert.equal(promoted?.cleanupLabel, null);
});

test("deriveAttachmentGroundingEvidenceFromMessage rebuilds retained study context from search-result metadata", () => {
  const preview = buildPreviewMessage();
  const evidence = buildAttachmentGroundingEvidence([
    {
      source_message_id: "msg.source.1",
      output_message_id: "msg.out.1",
      file_name: "Week 3 market failures.pdf",
      mime_type: "application/pdf",
      output_type: "parsed_document",
      supertags: [],
      academic_kind: "lecture_slides",
      academic_course_tag: "course:econ101",
      academic_week_tag: "week:3",
      academic_summary: "lecture slides Â· course econ101 Â· week 3 organized for study retrieval.",
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
    {
      source_message_id: "msg.source.2",
      output_message_id: "msg.out.2",
      file_name: "lecture-audio.m4a",
      mime_type: "audio/mp4",
      output_type: "transcript",
      supertags: [],
      academic_kind: "transcript",
      academic_course_tag: "course:econ101",
      academic_week_tag: "week:3",
      zettelkasten_stage: "source_note_review_pending",
      kept_source_file: false,
      ephemeral_output: true,
      ingested: true,
    },
  ] satisfies AttachmentBatchIngestItem[], {
    retentionMode: "keep_extracted_only",
    knowledgeMode: "connected_notes",
  });
  const decorated = decoratePreviewMessageWithAttachmentGrounding(preview, evidence);

  const rebuilt = deriveAttachmentGroundingEvidenceFromMessage(decorated, decorated.views[0]);
  assert.ok(rebuilt);
  assert.equal(rebuilt?.sourceCount, 2);
  assert.equal(rebuilt?.retentionMode, "keep_extracted_only");
  assert.equal(rebuilt?.knowledgeMode, "connected_notes");
  assert.equal(rebuilt?.coverageStatus, "complete");
  assert.deepEqual(rebuilt?.sourceLabels, [
    "Week 3 market failures.pdf",
    "lecture-audio.m4a",
  ]);
  assert.deepEqual(rebuilt?.sourceDescriptors, [
    {
      title: "Week 3 market failures.pdf",
      kindLabel: "Uploaded study source - parsed document",
      academicKind: "lecture_slides",
      academicSummary: "lecture slides Â· course econ101 Â· week 3 organized for study retrieval.",
      courseTag: "course:econ101",
      weekTag: "week:3",
      lectureTag: null,
      chapterTag: null,
      unitTag: null,
      zettelkastenStage: null,
    },
    {
      title: "lecture-audio.m4a",
      kindLabel: "Uploaded study source - transcript",
      academicKind: "transcript",
      academicSummary: null,
      courseTag: "course:econ101",
      weekTag: "week:3",
      lectureTag: null,
      chapterTag: null,
      unitTag: null,
      zettelkastenStage: "source_note_review_pending",
    },
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";

import type { FileLibraryItem } from "../src/lib/api.ts";
import {
  fileLibraryAcademicSummary,
  fileLibraryAvailabilityState,
  fileLibraryCardState,
  fileLibraryKnowledgeGraphGroupKey,
  fileLibraryKnowledgeGraphLinkTags,
  fileLibraryHasRetainedFile,
  fileLibraryPolicyOutcome,
  fileLibraryPrimaryAction,
  fileLibraryProvenanceSummary,
  fileLibraryRetentionHint,
  fileLibraryRetentionLabel,
  fileLibraryRetentionMode,
  fileLibraryStorageSummary,
  fileLibraryStudyReadiness,
  fileLibraryStudyReadinessLabel,
  fileLibraryStudyReadinessSummary,
  fileLibraryZettelkastenEntryType,
  fileLibraryZettelkastenNextAction,
} from "../src/lib/fileLibraryState.ts";

function buildItem(overrides: Partial<FileLibraryItem> = {}): FileLibraryItem {
  return {
    id: "att_1",
    message_id: "msg_1",
    thread_id: "thread_1",
    source_thread_id: "thread_1",
    name: "week3.pdf",
    mime_type: "application/pdf",
    size_bytes: 4096,
    storage: {},
    encryption: {},
    sha256: null,
    created_at: "2026-09-01T10:00:00.000Z",
    source_timestamp: "2026-09-01T10:00:00.000Z",
    source_type: "document",
    source_kind: "parsed_document",
    source_summary: "Week 3 lecture notes",
    source_metadata: {},
    source_supertags: [],
    download_url: null,
    derived_message_id: null,
    derived_thread_id: null,
    derived_type: null,
    ...overrides,
  };
}

test("file library state prefers download when the original file is retained", () => {
  const item = buildItem({
    download_url: "/attachments/att_1?token=x&sig=y",
    derived_message_id: "msg_note_1",
    derived_thread_id: "thread_notes_1",
    derived_type: "parsed_document",
    source_metadata: {
      attachment_retention_mode: "keep_file",
      attachment_retention_label: "Keeps original file",
      attachment_policy_outcome: "Original file and extracted notes remain available for future study sessions.",
      knowledge_mode: "connected_notes",
      source_file_name: "Week 3 Lecture.pdf",
      academic_summary: "lecture slides - course bio101 - week 3 organized for study retrieval.",
      academic_kind: "lecture_slides",
      academic_course_tag: "course:bio101",
      academic_week_tag: "week:3",
    },
    source_supertags: ["course:bio101", "topic:cell-cycle"],
  });

  assert.equal(fileLibraryHasRetainedFile(item), true);
  assert.equal(fileLibraryRetentionMode(item), "keep_file");
  assert.equal(fileLibraryRetentionLabel(item), "Keeps original file");
  assert.equal(fileLibraryPolicyOutcome(item), "Original file and extracted notes remain available for future study sessions.");
  assert.equal(fileLibraryAcademicSummary(item), "lecture slides - course bio101 - week 3 organized for study retrieval.");
  assert.equal(fileLibraryRetentionHint(item), "Keeps original file");
  assert.equal(fileLibraryStorageSummary(item), "Original file stored in your account library");
  assert.equal(fileLibraryStudyReadiness(item), "ready_now");
  assert.equal(fileLibraryStudyReadinessLabel(fileLibraryStudyReadiness(item)), "Study ready");
  assert.equal(
    fileLibraryStudyReadinessSummary(item),
    "This source is already classified, tagged, and retained in a way that should make later study retrieval immediate.",
  );
  assert.equal(
    fileLibraryProvenanceSummary(item),
    "Week 3 Lecture.pdf entered via parsed document and linked into connected notes. Original file and extracted notes remain available for future study sessions.",
  );
  assert.deepEqual(fileLibraryAvailabilityState(item), {
    kind: "downloadable",
    label: "File retained",
    tone: "sky",
  });
  assert.deepEqual(fileLibraryPrimaryAction(item), {
    kind: "download",
    label: "Open file",
    disabled: false,
  });
  assert.deepEqual(fileLibraryCardState(item), {
    availability: {
      kind: "downloadable",
      label: "File retained",
      tone: "sky",
    },
    retentionLabel: "Keeps original file",
    retentionHint: "Keeps original file",
    academicSummary: "lecture slides - course bio101 - week 3 organized for study retrieval.",
    storageSummary: "Original file stored in your account library",
    provenanceSummary: "Week 3 Lecture.pdf entered via parsed document and linked into connected notes. Original file and extracted notes remain available for future study sessions.",
    studyReadiness: "ready_now",
    studyReadinessLabel: "Study ready",
    studyReadinessSummary: "This source is already classified, tagged, and retained in a way that should make later study retrieval immediate.",
    primaryAction: {
      kind: "download",
      label: "Open file",
      disabled: false,
    },
    secondaryThreadLabel: "Open notes",
  });
});

test("file library state upgrades extracted-only items into openable notes", () => {
  const item = buildItem({
    source_thread_id: null,
    thread_id: "thread_notes_1",
    derived_message_id: "msg_note_1",
    derived_thread_id: "thread_notes_1",
    derived_type: "parsed_document",
    source_metadata: {
      attachment_retention_mode: "keep_extracted_only",
      attachment_retention_label: "Keeps extracted notes only",
    },
  });

  assert.equal(fileLibraryHasRetainedFile(item), false);
  assert.equal(fileLibraryRetentionMode(item), "keep_extracted_only");
  assert.equal(fileLibraryRetentionHint(item), "Original removed after extraction");
  assert.equal(fileLibraryStorageSummary(item), "Only extracted notes are stored for future retrieval");
  assert.equal(fileLibraryStudyReadiness(item), "developing");
  assert.deepEqual(fileLibraryAvailabilityState(item), {
    kind: "extracted_only",
    label: "Extracted notes",
    tone: "emerald",
  });
  assert.deepEqual(fileLibraryPrimaryAction(item), {
    kind: "thread",
    label: "Open notes",
    disabled: false,
  });
  assert.deepEqual(fileLibraryCardState(item), {
    availability: {
      kind: "extracted_only",
      label: "Extracted notes",
      tone: "emerald",
    },
    retentionLabel: "Keeps extracted notes only",
    retentionHint: "Original removed after extraction",
    academicSummary: null,
    storageSummary: "Only extracted notes are stored for future retrieval",
    provenanceSummary: "week3.pdf entered via parsed document.",
    studyReadiness: "developing",
    studyReadinessLabel: "Linking up",
    studyReadinessSummary: "This source has some useful metadata or supertags, but it likely needs another related note, lecture, or reading before retrieval becomes stronger.",
    primaryAction: {
      kind: "thread",
      label: "Open notes",
      disabled: false,
    },
    secondaryThreadLabel: "Open source",
  });
});

test("file library state treats graph metadata as active study context", () => {
  const item = buildItem({
    source_metadata: {
      attachment_retention_mode: "keep_extracted_only",
      knowledge_mode: "zettelkasten",
      knowledge_graph_group_key: "course:law101",
      knowledge_graph_link_tags: ["course:law101", "week:5"],
      zettelkasten_entry_type: "source_note",
      zettelkasten_next_action: "Write a permanent note about duty of care.",
    },
    source_supertags: [],
  });

  assert.equal(fileLibraryKnowledgeGraphGroupKey(item), "course:law101");
  assert.deepEqual(fileLibraryKnowledgeGraphLinkTags(item), ["course:law101", "week:5"]);
  assert.equal(fileLibraryZettelkastenEntryType(item), "source_note");
  assert.equal(fileLibraryZettelkastenNextAction(item), "Write a permanent note about duty of care.");
  assert.equal(fileLibraryStudyReadiness(item), "ready_now");
});

test("file library state marks session-only items as unavailable", () => {
  const item = buildItem({
    source_thread_id: null,
    source_metadata: {
      attachment_retention_mode: "keep_nothing",
      attachment_retention_label: "Keeps nothing from attachment",
    },
  });

  assert.equal(fileLibraryHasRetainedFile(item), false);
  assert.equal(fileLibraryRetentionMode(item), "keep_nothing");
  assert.equal(fileLibraryRetentionHint(item), "File was used for a session-only synthesis");
  assert.equal(fileLibraryStorageSummary(item), "No file or extracted content was retained after this session");
  assert.equal(fileLibraryStudyReadiness(item), "archival");
  assert.deepEqual(fileLibraryAvailabilityState(item), {
    kind: "session_only",
    label: "Session only",
    tone: "amber",
  });
  assert.deepEqual(fileLibraryPrimaryAction(item), {
    kind: "unavailable",
    label: "Not retained",
    disabled: true,
  });
  assert.deepEqual(fileLibraryCardState(item), {
    availability: {
      kind: "session_only",
      label: "Session only",
      tone: "amber",
    },
    retentionLabel: "Keeps nothing from attachment",
    retentionHint: "File was used for a session-only synthesis",
    academicSummary: null,
    storageSummary: "No file or extracted content was retained after this session",
    provenanceSummary: "week3.pdf entered via parsed document.",
    studyReadiness: "archival",
    studyReadinessLabel: "Archive",
    studyReadinessSummary: "This source is retained more like storage than an active study asset and may need extraction, tagging, or connected-note context.",
    primaryAction: {
      kind: "unavailable",
      label: "Not retained",
      disabled: true,
    },
    secondaryThreadLabel: "Open thread",
  });
});

test("file library state falls back to unavailable when no retained artifact or policy is present", () => {
  const item = buildItem();

  assert.equal(fileLibraryHasRetainedFile(item), false);
  assert.equal(fileLibraryRetentionMode(item), null);
  assert.equal(fileLibraryRetentionLabel(item), null);
  assert.equal(fileLibraryRetentionHint(item), "Original file is unavailable");
  assert.equal(fileLibraryStorageSummary(item), "Retention state is unavailable for this file");
  assert.equal(fileLibraryStudyReadiness(item), "developing");
  assert.deepEqual(fileLibraryAvailabilityState(item), {
    kind: "unavailable",
    label: "Unavailable",
    tone: "slate",
  });
  assert.deepEqual(fileLibraryPrimaryAction(item), {
    kind: "unavailable",
    label: "Unavailable",
    disabled: true,
  });
  assert.deepEqual(fileLibraryCardState(item), {
    availability: {
      kind: "unavailable",
      label: "Unavailable",
      tone: "slate",
    },
    retentionLabel: null,
    retentionHint: "Original file is unavailable",
    academicSummary: null,
    storageSummary: "Retention state is unavailable for this file",
    provenanceSummary: "week3.pdf entered via parsed document.",
    studyReadiness: "developing",
    studyReadinessLabel: "Linking up",
    studyReadinessSummary: "This source has some useful metadata or supertags, but it likely needs another related note, lecture, or reading before retrieval becomes stronger.",
    primaryAction: {
      kind: "unavailable",
      label: "Unavailable",
      disabled: true,
    },
    secondaryThreadLabel: "Open thread",
  });
});

test("file library state falls back to opening the thread when extracted-only items have no derived note target", () => {
  const item = buildItem({
    source_metadata: {
      attachment_retention_mode: "keep_extracted_only",
      attachment_retention_label: "Keeps extracted notes only",
    },
  });

  assert.deepEqual(fileLibraryPrimaryAction(item), {
    kind: "thread",
    label: "Open thread",
    disabled: false,
  });
  assert.deepEqual(fileLibraryCardState(item), {
    availability: {
      kind: "extracted_only",
      label: "Extracted notes",
      tone: "emerald",
    },
    retentionLabel: "Keeps extracted notes only",
    retentionHint: "Original removed after extraction",
    academicSummary: null,
    storageSummary: "Only extracted notes are stored for future retrieval",
    provenanceSummary: "week3.pdf entered via parsed document.",
    studyReadiness: "developing",
    studyReadinessLabel: "Linking up",
    studyReadinessSummary: "This source has some useful metadata or supertags, but it likely needs another related note, lecture, or reading before retrieval becomes stronger.",
    primaryAction: {
      kind: "thread",
      label: "Open thread",
      disabled: false,
    },
    secondaryThreadLabel: "Open thread",
  });
});

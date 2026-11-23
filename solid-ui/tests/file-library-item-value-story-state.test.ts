import assert from "node:assert/strict";
import test from "node:test";

import type { FileLibraryItem } from "../src/lib/api.ts";
import { buildFileLibraryItemValueStoryState } from "../src/lib/fileLibraryItemValueStoryState.ts";

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

test("buildFileLibraryItemValueStoryState stays hidden when no study cues exist", () => {
  assert.equal(buildFileLibraryItemValueStoryState(buildItem()), null);
});

test("buildFileLibraryItemValueStoryState explains strong study-ready files", () => {
  const state = buildFileLibraryItemValueStoryState(buildItem({
    source_metadata: {
      attachment_retention_mode: "keep_file",
      attachment_policy_outcome: "Original file and extracted notes remain available for future study sessions.",
      knowledge_mode: "connected_notes",
      academic_kind: "lecture_slides",
      academic_course_tag: "course:bio101",
      academic_week_tag: "week:3",
    },
    source_supertags: ["course:bio101", "topic:cell_respiration"],
    download_url: "/file",
  }));

  assert.equal(state?.grade, "strong");
  assert.match(state?.headline ?? "", /live study anchor/i);
});

test("buildFileLibraryItemValueStoryState explains developing connected files", () => {
  const state = buildFileLibraryItemValueStoryState(buildItem({
    source_metadata: {
      attachment_retention_mode: "keep_extracted_only",
      knowledge_mode: "connected_notes",
      academic_kind: "reading",
    },
    source_supertags: ["topic:market_failures"],
  }));

  assert.equal(state?.grade, "developing");
  assert.match(state?.nextStep ?? "", /adjacent lecture, reading, or note/i);
});

test("buildFileLibraryItemValueStoryState explains zettelkasten branch files", () => {
  const state = buildFileLibraryItemValueStoryState(buildItem({
    source_metadata: {
      attachment_retention_mode: "keep_extracted_only",
      knowledge_mode: "zettelkasten",
      zettelkasten_stage: "source_note",
      academic_course_tag: "course:philo201",
    },
    source_supertags: ["zk:source_note", "topic:ethics"],
  }));

  assert.equal(state?.grade, "developing");
  assert.ok(state?.signals.some((signal) => signal.label === "Note-chain role"));
});

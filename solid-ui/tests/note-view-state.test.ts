import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "@/lib/api";
import type { Note } from "@/lib/noteDomain";
import {
  afpNoteFromMessage,
  areaFromRuleMessage,
  folderFromRuleMessage,
  noteFromAfpMessage,
  notePreviewFromBody,
  noteStringArray,
  noteTagUpdateFromMessage,
  resolveNoteTags,
} from "@/lib/noteViewState";

function message(overrides: Partial<AfpMessage> & Pick<AfpMessage, "id" | "thread_id" | "type">): AfpMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id,
    from: overrides.from ?? "user",
    to: overrides.to ?? [],
    timestamp: overrides.timestamp ?? "2026-08-31T12:00:00.000Z",
    type: overrides.type,
    kind: overrides.kind ?? "note",
    subtype: overrides.subtype ?? null,
    supertags: overrides.supertags ?? [],
    content: overrides.content ?? {},
    metadata: overrides.metadata ?? {},
    views: overrides.views ?? [],
    attachments: overrides.attachments ?? [],
    references: overrides.references ?? [],
    encryption: overrides.encryption ?? null,
    signature: overrides.signature ?? "",
  };
}

function note(overrides: Partial<Note> & Pick<Note, "id" | "title">): Note {
  return {
    id: overrides.id,
    title: overrides.title,
    preview: overrides.preview ?? "",
    blocks: overrides.blocks ?? [],
    summary: overrides.summary ?? "",
    tags: overrides.tags ?? [],
    supertags: overrides.supertags ?? [],
    backlinks: overrides.backlinks ?? [],
    updatedAt: overrides.updatedAt ?? "2026-08-31T12:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-08-31T12:00:00.000Z",
    metadata: overrides.metadata ?? {},
    threadId: overrides.threadId,
    messageId: overrides.messageId,
    folderId: overrides.folderId,
    areaId: overrides.areaId,
  };
}

test("note view state normalizes previews arrays and AFP notes", () => {
  assert.equal(notePreviewFromBody("  alpha   beta  "), "alpha beta");
  assert.deepEqual(noteStringArray(["work", "", 1, "deep"]), ["work", "deep"]);

  const parsed = noteFromAfpMessage(message({
    id: "note-1",
    thread_id: "thread-1",
    type: "note",
    content: {
      title: "Launch notes",
      body: "  First line\n\nSecond line  ",
      summary: "Summary",
      tags: ["project", "", "launch"],
      supertags: ["Work"],
      folder_id: "inbox",
      area_id: "ops",
    },
  }));

  assert.equal(parsed.title, "Launch notes");
  assert.equal(parsed.preview, "First line Second line");
  assert.deepEqual(parsed.tags, ["project", "launch"]);
  assert.deepEqual(parsed.supertags, ["Work"]);
  assert.equal(parsed.folderId, "inbox");
  assert.equal(parsed.areaId, "ops");
});

test("note view state hides encrypted note payloads until local decryption is available", () => {
  const encrypted = message({
    id: "note-encrypted",
    thread_id: "thread-encrypted",
    type: "note",
    content: {
      title: "Hidden vow draft",
      body: "Private relationship detail",
      summary: "Secret summary",
      tags: ["private"],
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
  });

  const parsed = noteFromAfpMessage(encrypted);
  assert.equal(parsed.title, "Encrypted message - unlock this device to view");
  assert.equal(parsed.preview, "");
  assert.equal(parsed.summary, "");
  assert.deepEqual(parsed.tags, []);

  const afpNote = afpNoteFromMessage(encrypted);
  assert.equal(afpNote.title, "Encrypted message - unlock this device to view");
  assert.equal(afpNote.summary, "");
});

test("note view state parses folder and area rule messages with stable fallbacks", () => {
  const folder = folderFromRuleMessage(message({
    id: "folder-1",
    thread_id: "thread-folder",
    type: "folder_rule",
    content: {
      folder_id: "archive",
      area_id: "ops",
      summary_style: "brief",
      tag_suggestions: ["finance", "", "planning"],
    },
  }));
  const area = areaFromRuleMessage(message({
    id: "area-1",
    thread_id: "thread-area",
    type: "area_rules",
    content: {
      area: "ops",
      backlink_rules: "dense",
      tag_suggestions: ["project:apollo"],
    },
  }));

  assert.equal(folder?.name, "Archive");
  assert.deepEqual(folder?.rule?.tag_suggestions, ["finance", "planning"]);
  assert.equal(area?.id, "ops");
  assert.deepEqual(area?.rules.tag_suggestions, ["project:apollo"]);
});

test("note view state centralizes tag update parsing and resolution", () => {
  const base = note({
    id: "note-1",
    title: "Base",
    tags: ["alpha", "beta"],
    supertags: ["Work"],
  });
  const update = noteTagUpdateFromMessage(message({
    id: "tag-1",
    thread_id: "thread-1",
    type: "tag_update",
    timestamp: "2026-08-31T12:05:00.000Z",
    references: [{ id: "note-1" }],
    content: {
      remove_tags: ["alpha"],
      add_tags: ["gamma", "beta"],
      remove_supertags: ["Work"],
      add_supertags: ["Priority"],
    },
  }));

  assert.equal(update.sourceId, "note-1");
  assert.deepEqual(resolveNoteTags(base, [update]), {
    tags: ["beta", "gamma"],
    supertags: ["Priority"],
  });
});

test("note view state builds AFP-backed note rows", () => {
  const parsed = afpNoteFromMessage(message({
    id: "card-1",
    thread_id: "thread-1",
    type: "knowledge_card",
    content: {
      title: "Knowledge",
      summary: "Curated summary",
      tags: ["research"],
      supertags: ["Engineering"],
    },
  }));

  assert.equal(parsed.title, "Knowledge");
  assert.equal(parsed.summary, "Curated summary");
  assert.deepEqual(parsed.tags, ["research"]);
  assert.deepEqual(parsed.supertags, ["Engineering"]);
});

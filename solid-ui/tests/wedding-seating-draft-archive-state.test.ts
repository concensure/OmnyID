import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingSeatingDraftArchiveFromAfpMessage,
  weddingSeatingDraftArchiveToAfpMessage,
  weddingSeatingDraftArchiveToAfpSendInput,
} from "@/lib/weddingSeatingDraftArchiveState";

const metadata = {
  weddingPlanId: "wedding_plan:archive",
  responseWorkspaceId: "response_workspace:archive",
  sourceResponseId: "response:archive",
  supertags: ["template:wedding_planning", "event:wedding"],
};

test("weddingSeatingDraftArchiveToAfpMessage creates an auditable ledger object", () => {
  const message = weddingSeatingDraftArchiveToAfpMessage({
    fingerprint: "guest-1:table-1|guest-2:table-2",
    metadata,
    reasonLabel: "Couple hid an old option.",
    createdAt: "2026-09-26T00:00:00.000Z",
  });

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_seating_draft_archive");
  assert.equal(message.subtype, "wedding_seating_draft_archive");
  assert.equal(message.content.seating_draft_fingerprint, "guest-1:table-1|guest-2:table-2");
  assert.equal(message.content.archive_action, "hide");
  assert.ok(message.supertags?.includes("wedding_seating:draft_archive"));
  assert.ok(message.references?.some((reference) => reference.type === "seating_draft_fingerprint"));
  assert.equal(message.metadata?.e2ee_required, true);
});

test("weddingSeatingDraftArchiveFromAfpMessage reloads hidden draft fingerprints", () => {
  const message = weddingSeatingDraftArchiveToAfpMessage({
    fingerprint: "guest-1:table-1",
    metadata,
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  const archive = weddingSeatingDraftArchiveFromAfpMessage(message);

  assert.equal(archive?.fingerprint, "guest-1:table-1");
  assert.equal(archive?.statusLabel, "Saved seating draft hidden.");
  assert.equal(archive?.createdAt, "2026-09-26T00:00:00.000Z");
  assert.equal(archive?.action, "hide");
});

test("Wedding seating draft archive lifecycle restores without deleting history", () => {
  const message = weddingSeatingDraftArchiveToAfpMessage({
    fingerprint: "guest-1:table-1",
    metadata,
    action: "restore",
    createdAt: "2026-09-26T00:10:00.000Z",
  });
  const archive = weddingSeatingDraftArchiveFromAfpMessage(message);
  assert.equal(message.content.archive_action, "restore");
  assert.equal(archive?.action, "restore");
  assert.equal(archive?.statusLabel, "Saved seating draft restored.");
});

test("weddingSeatingDraftArchiveToAfpSendInput keeps relational storage enabled", () => {
  const input = weddingSeatingDraftArchiveToAfpSendInput({
    fingerprint: "guest-1:table-1",
    metadata,
  });

  assert.equal(input.store_in_relational, true);
  assert.equal(input.kind, "wedding_seating_draft_archive");
  assert.equal(input.content && typeof input.content === "object" ? (input.content as Record<string, unknown>).seating_draft_fingerprint : null, "guest-1:table-1");
});

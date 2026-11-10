import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api";
import { projectWeddingOverviewNotes, weddingOverviewNoteToAfpSendInput } from "../src/lib/weddingOverviewNoteState";

test("wedding overview writes an AFP note that the Notes view can project", () => {
    const input = weddingOverviewNoteToAfpSendInput({
      domain: "budget",
      body: "Confirm whether the venue minimum spend includes drinks.",
      responseWorkspaceId: "workspace-1",
      weddingPlanId: "plan-1",
      nowIso: "2026-11-10T01:00:00.000Z",
    });
    assert.deepEqual(input && {
      thread_id: input.thread_id,
      type: input.type,
      kind: input.kind,
      subtype: input.subtype,
      store_in_relational: input.store_in_relational,
      content: { domain: (input.content as Record<string, unknown>).domain, body: (input.content as Record<string, unknown>).body },
    }, {
      thread_id: "wedding_overview_note:workspace-1:budget",
      type: "note",
      kind: "note",
      subtype: "wedding_overview_note",
      store_in_relational: true,
      content: {
        domain: "budget",
        body: "Confirm whether the venue minimum spend includes drinks.",
      },
    });
});

test("wedding overview projects only valid overview notes and keeps newest first", () => {
    const message = (id: string, domain: string, body: string, timestamp: string): AfpMessage => ({
      id,
      thread_id: `thread-${id}`,
      from: "user://wedding-overview",
      timestamp,
      type: "note",
      kind: "note",
      subtype: "wedding_overview_note",
      content: { kind: "wedding_overview_note", domain, body, title: `${domain} note` },
      views: [],
      attachments: [],
    });
    assert.deepEqual(projectWeddingOverviewNotes([
      message("older", "guests", "Ask Pat for the final surname.", "2026-11-09T01:00:00.000Z"),
      message("newer", "seating", "Keep the accessible aisle clear.", "2026-11-10T01:00:00.000Z"),
      message("invalid", "vendors", "Not an overview domain.", "2026-11-11T01:00:00.000Z"),
    ]).map((note) => note.id), ["newer", "older"]);
});

test("wedding overview does not create an empty ledger entry", () => {
  assert.equal(weddingOverviewNoteToAfpSendInput({ domain: "guests", body: "  " }), null);
});

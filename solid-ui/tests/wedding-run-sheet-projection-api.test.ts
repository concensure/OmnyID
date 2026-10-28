import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingRunSheetProjectionState } from "../src/lib/weddingRunSheetProjectionApi.ts";

test("projection API state maps server checkpoints and ledger messages", () => {
  const state = normalizeWeddingRunSheetProjectionState({
    checkpoint: {
      source_cursor: "cursor-2",
      source_fingerprint: "fnv1a-12345678",
      projector_version: 1,
    },
    messages: [{
      id: "message-1",
      message_type: "database_record",
      timestamp: "2026-10-29T00:00:00Z",
      content: { kind: "database_record" },
      metadata: { model_calls: 0 },
    }],
  });
  assert.deepEqual(state.checkpoint, {
    sourceCursor: "cursor-2",
    sourceFingerprint: "fnv1a-12345678",
    projectorVersion: 1,
  });
  assert.equal(state.messages[0].type, "database_record");
  assert.equal((state.messages[0].metadata as Record<string, unknown>).model_calls, 0);
});

test("projection API state rejects incomplete checkpoint and malformed messages", () => {
  const state = normalizeWeddingRunSheetProjectionState({
    checkpoint: { source_cursor: "cursor-only" },
    messages: [{ id: "missing-type" }, null, "bad"],
  });
  assert.equal(state.checkpoint, null);
  assert.deepEqual(state.messages, []);
});

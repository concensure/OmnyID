import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, DashboardBootstrap } from "../src/lib/api.ts";
import { resolveReversibleAuditReviewTarget } from "../src/lib/operationalLaneTrustReviewState.ts";

type ActionLogEntry = NonNullable<DashboardBootstrap["action_log"]>[number];

function buildMessage(id: string, threadId: string): AfpMessage {
  return {
    id,
    thread_id: threadId,
    from: "agent",
    to: ["user"],
    timestamp: "2026-08-18T00:00:00Z",
    type: "ledger",
    content: {},
    views: [],
    attachments: [],
  };
}

function buildActionLogEntry(
  overrides: Partial<ActionLogEntry> & Pick<ActionLogEntry, "thread_id" | "capability_id" | "status" | "output">,
): ActionLogEntry {
  return {
    capability_id: overrides.capability_id,
    thread_id: overrides.thread_id,
    status: overrides.status,
    output: overrides.output,
    recorded_at: "2026-08-18T00:00:00Z",
    external_reference: null,
    reversible_summary: overrides.reversible_summary,
  };
}

test("resolveReversibleAuditReviewTarget prefers direct action message ids", () => {
  const entry = buildActionLogEntry({
    capability_id: "calendar:hold",
    thread_id: "thread-1",
    status: "completed",
    output: {},
    reversible_summary: {
      reversible: true,
      action_message_id: "msg-action",
      rollback_checkpoint_id: "msg-checkpoint",
      provenance_record_id: "prov-1",
    },
  });

  assert.deepEqual(
    resolveReversibleAuditReviewTarget(entry, [entry], [buildMessage("msg-action", "thread-1")]),
    { threadId: "thread-1", messageId: "msg-action" },
  );
});

test("resolveReversibleAuditReviewTarget resolves older checkpoint-only audit rows to a concrete thread artifact", () => {
  const legacyEntry = buildActionLogEntry({
    capability_id: "calendar:hold",
    thread_id: "thread-1",
    status: "completed",
    output: {},
    reversible_summary: {
      reversible: true,
      action_message_id: null,
      rollback_checkpoint_id: "msg-checkpoint",
      provenance_record_id: "prov-1",
    },
  });
  const relatedEntry = buildActionLogEntry({
    capability_id: "calendar:hold:undo",
    thread_id: "thread-1",
    status: "completed",
    output: {
      checkpoint_message_id: "msg-checkpoint",
      revert_result_message_id: "msg-reverted",
    },
    reversible_summary: null,
  });

  assert.deepEqual(
    resolveReversibleAuditReviewTarget(
      legacyEntry,
      [legacyEntry, relatedEntry],
      [buildMessage("msg-reverted", "thread-1")],
    ),
    { threadId: "thread-1", messageId: "msg-reverted" },
  );
});

test("resolveReversibleAuditReviewTarget can fall back from provenance record ids when they map to a later concrete message", () => {
  const legacyEntry = buildActionLogEntry({
    capability_id: "inbox:stage",
    thread_id: "thread-2",
    status: "completed",
    output: {},
    reversible_summary: {
      reversible: true,
      action_message_id: null,
      rollback_checkpoint_id: null,
      provenance_record_id: "prov-2",
    },
  });
  const relatedEntry = buildActionLogEntry({
    capability_id: "inbox:stage",
    thread_id: "thread-2",
    status: "completed",
    output: {
      target_message_id: "msg-stage",
    },
    reversible_summary: {
      reversible: true,
      action_message_id: "msg-stage",
      rollback_checkpoint_id: null,
      provenance_record_id: "prov-2",
    },
  });

  assert.deepEqual(
    resolveReversibleAuditReviewTarget(
      legacyEntry,
      [legacyEntry, relatedEntry],
      [buildMessage("msg-stage", "thread-2")],
    ),
    { threadId: "thread-2", messageId: "msg-stage" },
  );
});

test("resolveReversibleAuditReviewTarget returns null when no concrete message can be resolved", () => {
  const entry = buildActionLogEntry({
    capability_id: "files:stage",
    thread_id: "thread-3",
    status: "completed",
    output: {},
    reversible_summary: {
      reversible: true,
      action_message_id: null,
      rollback_checkpoint_id: "msg-missing",
      provenance_record_id: "prov-missing",
    },
  });

  assert.equal(resolveReversibleAuditReviewTarget(entry, [entry], []), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingPreferenceConflictLifecycleActionToAfpSendInput,
  weddingPreferenceConflictLifecycleFromAfpMessage,
  weddingPreferenceConflictLifecycleToAfpMessage,
} from "@/lib/weddingPreferenceConflictLifecycleAfpState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { runWeddingPreferenceConflictLifecycleAction } from "@/lib/weddingPreferenceConflictLifecycleExecutionState";

const metadata = {
  weddingPlanId: "wedding_plan:harbour",
  responseWorkspaceId: "response_workspace:harbour",
};

const input = {
  conflictId: "wedding_preference_conflict:harbour:style",
  sourceMessageId: "afp-conflict-revision-1",
  revisionFingerprint: "signal:constraint-1|signal:constraint-2",
  outcome: "resolved" as const,
  metadata,
  createdAt: "2026-10-19T01:00:00Z",
};

test("preference conflict lifecycle is an append-only exact-revision successor", () => {
  const message = weddingPreferenceConflictLifecycleToAfpMessage(input);

  assert.equal(message.parent_id, input.sourceMessageId);
  assert.equal(message.kind, "wedding_preference_conflict_lifecycle");
  assert.equal(message.content.schema_version, "wedding.preference_conflict_lifecycle.v1");
  assert.equal(message.content.creates_planning_rule, false);
  assert.equal(message.metadata?.e2ee_required, true);
  assert.equal(JSON.stringify(message).includes("private rationale"), false);
  assert.equal(weddingPreferenceConflictLifecycleFromAfpMessage(message)?.outcome, "resolved");
});

test("dismissed lifecycle records replay without becoming a planning rule", () => {
  const message = weddingPreferenceConflictLifecycleToAfpMessage({ ...input, outcome: "dismissed" });
  const record = weddingPreferenceConflictLifecycleFromAfpMessage(message);

  assert.equal(record?.conflictId, input.conflictId);
  assert.equal(record?.revisionFingerprint, input.revisionFingerprint);
  assert.equal(record?.outcome, "dismissed");
  assert.equal(message.content.creates_planning_rule, false);
});

test("lifecycle parser rejects records detached from their conflict revision", () => {
  const message = weddingPreferenceConflictLifecycleToAfpMessage(input);

  assert.equal(weddingPreferenceConflictLifecycleFromAfpMessage({ ...message, parent_id: "different" }), null);
  assert.equal(weddingPreferenceConflictLifecycleFromAfpMessage({
    ...message,
    metadata: { ...message.metadata, e2ee_required: false },
  }), null);
});

test("lifecycle action conversion accepts only a complete closed outcome packet", () => {
  const action: WeddingWorkspaceSidebarAction = {
    kind: "record_resilience_lifecycle",
    label: "Resolved together",
    enabled: true,
    reason: null,
    metadata: { preference_conflict_lifecycle: {
      conflict_id: input.conflictId,
      source_message_id: input.sourceMessageId,
      revision_fingerprint: input.revisionFingerprint,
      outcome: "resolved",
    } },
  };

  const sendInput = weddingPreferenceConflictLifecycleActionToAfpSendInput(action, metadata, input.createdAt);
  assert.match(sendInput?.id ?? "", /^afp-wedding_preference_conflict_lifecycle:/);
  assert.equal(sendInput?.parent_id, input.sourceMessageId);
  assert.equal(sendInput?.content.outcome, "resolved");
  assert.equal(weddingPreferenceConflictLifecycleActionToAfpSendInput({
    ...action,
    metadata: { preference_conflict_lifecycle: { outcome: "resolved" } },
  }, metadata), null);
});

test("lifecycle execution saves before refreshing and fails closed without persistence", async () => {
  const action: WeddingWorkspaceSidebarAction = {
    kind: "record_resilience_lifecycle",
    label: "Resolved together",
    enabled: true,
    reason: null,
    metadata: { preference_conflict_lifecycle: {
      conflict_id: input.conflictId,
      source_message_id: input.sourceMessageId,
      revision_fingerprint: input.revisionFingerprint,
      outcome: "resolved",
    } },
  };
  const notices: string[] = [];
  let saved: unknown = null;
  let refreshes = 0;
  assert.equal(runWeddingPreferenceConflictLifecycleAction({
    action,
    metadata,
    saveProjection: async (message) => { saved = message; },
    onNotice: (notice) => notices.push(notice),
    onSaved: () => { refreshes += 1; },
  }), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((saved as { subtype?: string })?.subtype, "wedding_preference_conflict_lifecycle");
  assert.equal(refreshes, 1);
  assert.match(notices.at(-1) ?? "", /No planning rule/i);

  const offlineNotices: string[] = [];
  runWeddingPreferenceConflictLifecycleAction({ action, metadata, onNotice: (notice) => offlineNotices.push(notice) });
  assert.match(offlineNotices[0] ?? "", /still open/i);
});

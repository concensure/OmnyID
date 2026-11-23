import test from "node:test";
import assert from "node:assert/strict";

import { traceMessageState } from "../src/lib/taskDetailTraceMessageState.ts";

function makeMessage(content: Record<string, unknown>) {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    type: "agent",
    subtype: "approval_request",
    from: "planner",
    timestamp: "2026-08-18T09:00:00.000Z",
    content,
    metadata: {},
  } as const;
}

test("traceMessageState hides encrypted simulator preview content until local decryption is available", () => {
  const state = traceMessageState({
    ...makeMessage({
      kind: "simulator_approval_preview",
      description: "Hidden approval detail.",
      artifact_summary_lines: ["Hidden artifact line"],
      ciphertext: "abc123",
      nonce: "nonce123",
    }),
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
  } as any);

  assert.equal(state.simulatorKind, null);
  assert.deepEqual(state.simulatorLines, []);
  assert.equal(state.descriptionText, null);
  assert.equal(state.showDescriptionText, false);
});

test("traceMessageState suppresses duplicate approval trust cues already present in approval review", () => {
  const state = traceMessageState(
    makeMessage({
      kind: "simulator_approval_preview",
      description: "A prepared approval preview is ready.",
      selection_reason: "Prepared work already covers the risky step.",
      approval_or_reversibility_hint: "Approving will send the staged reply.",
      provenance_cue: "Grounded in 2 source references.",
      source_summary: "Based on 2 sources.",
      preview_boundary_summary: "Preview only. No external work executes.",
      source_refs: ["message:1", "message:2"],
      approval_review: {
        title: "Approval review",
        reason: "A prepared approval preview is ready.",
        consequence_summary_lines: ["Approving will send the staged reply."],
        provenance_summary: "Grounded in 2 source references.",
        source_refs: ["message:1", "message:2"],
      },
    }),
  );

  assert.equal(state.showApprovalSelectionReason, false);
  assert.equal(state.showApprovalPreviewBoundary, true);
  assert.equal(state.showApprovalConsequencePreview, false);
  assert.equal(state.showApprovalProvenanceCue, false);
  assert.equal(state.showApprovalSourceSummary, false);
  assert.equal(state.timestampText, "7:00 PM");
});

test("traceMessageState keeps distinct approval trust cues outside the shared approval review", () => {
  const state = traceMessageState(
    makeMessage({
      kind: "simulator_approval_preview",
      description: "A prepared approval preview is ready.",
      approval_or_reversibility_hint: "Approving will send the staged reply and notify finance.",
      provenance_cue: "Grounded in 2 source references plus billing policy.",
      source_summary: "Based on 3 sources.",
      preview_boundary_summary: "Preview only. No external work executes.",
      source_refs: ["message:1", "message:2"],
      approval_review: {
        title: "Approval review",
        reason: "A prepared approval preview is ready.",
        consequence_summary_lines: ["Approving will send the staged reply."],
        provenance_summary: "Grounded in 2 source references.",
        source_refs: ["message:1", "message:2"],
      },
    }),
  );

  assert.equal(state.showApprovalConsequencePreview, true);
  assert.equal(state.showApprovalProvenanceCue, true);
  assert.equal(state.showApprovalSourceSummary, true);
});

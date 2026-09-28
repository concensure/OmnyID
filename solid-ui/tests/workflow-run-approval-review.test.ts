import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowRun } from "../src/lib/api.ts";
import {
  compactExecutionLogEntries,
  nextReplayStepState,
  recentFailedRunNodeIds,
  runTimelineSteps,
  truncateCanvasLabel,
  workflowApprovalPreviewSummary,
  workflowDryRunFeedback,
  workflowExecutionExplanationText,
  workflowRunActionFeedback,
  workflowRunApprovalReview,
  workflowRunApprovalReviewPanelState,
} from "../src/lib/workflowRunAnalysis.ts";
import { runNodeCanvasCallout, runStatusSummary } from "../src/lib/workflowRunSummary.ts";
import type { WorkflowNodeDraft } from "../src/lib/workflowGraphTypes.ts";

function makeWorkflowRun(overrides: Partial<WorkflowRun>): WorkflowRun {
  return {
    run_id: "run-1",
    workflow_id: "workflow-1",
    deployment_id: "deployment-1",
    owner_user_id: "user-1",
    status: "completed",
    trigger_kind: "manual",
    timeline: [],
    result: {},
    started_at: "2026-07-18T00:00:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

test("workflow run approval review normalizes structured preview and autonomy fields", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        title: "Approval review",
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        consequence_summary_lines: ["Will send the prepared reply"],
        source_refs: ["message:1"],
        approval_kind: "send",
        draft_preview: {
          label: "Reply draft",
          content: "Subject: Status update | Body: Ready to send",
          content_type: "text",
        },
        autonomy_decision: {
          autonomy_level: "request_approval",
          reason: "Outbound send requires approval.",
        },
      },
    },
  });

  const review = workflowRunApprovalReview(run);
  assert.ok(review);
  assert.equal(review.title, "Approval review");
  assert.equal(review.reason, "Please confirm before sending.");
  assert.equal(review.draftPreviewLabel, "Reply draft");
  assert.equal(review.draftPreviewContent, "Subject: Status update | Body: Ready to send");
  assert.equal(review.draftPreviewContentType, "text");
  assert.deepEqual(review.autonomy_decision, {
    autonomy_level: "request_approval",
    reason: "Outbound send requires approval.",
  });
  assert.equal(
    workflowApprovalPreviewSummary(review),
    "Subject: Status update Body: Ready to send",
  );
});

test("workflow run approval review falls back to autonomy tiers when structured policy is absent", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        title: "Approval review",
        reason: "Please confirm before sending.",
        autonomy_tier: "ask_always",
      },
    },
  });

  const review = workflowRunApprovalReview(run);
  assert.ok(review);
  assert.deepEqual(review.autonomy_decision, {
    autonomy_level: "ask_always",
  });
});

test("workflow run approval review panel state preserves shared approval review payloads", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_reason: "Please confirm before sending.",
      approval_review: {
        title: "Approval review",
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        source_refs: ["message:1", "message:2"],
        consequence_summary_lines: ["Will send the prepared reply."],
        autonomy_tier: "ask_always",
      },
    },
  });

  assert.deepEqual(
    workflowRunApprovalReviewPanelState(run),
    {
      reviewValue: {
        title: "Approval review",
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        source_refs: ["message:1", "message:2"],
        consequence_summary_lines: ["Will send the prepared reply."],
        autonomy_decision: {
          autonomy_level: "ask_always",
        },
      },
      showPanel: true,
      fallbackReasonText: "Please confirm before sending.",
      autonomyDecision: {
        autonomy_level: "ask_always",
      },
    },
  );
});

test("run status summary includes normalized approval preview text for waiting approvals", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      paused_at_label: "approval checkpoint",
      approval_review: {
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        source_refs: ["message:1", "message:2"],
        draft_preview: {
          content: "Subject: Status update | Body: Ready to send",
          content_type: "text",
        },
      },
    },
  });

  const summary = runStatusSummary(run);
  assert.ok(summary);
  assert.match(summary, /^Waiting at approval checkpoint: Please confirm before sending\./);
  assert.match(summary, /high confidence\./i);
  assert.match(summary, /Based on 2 sources/);
  assert.match(summary, /Preview: Subject: Status update Body: Ready to send/);
});

test("run status summary prefers first consequence summary over draft preview", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      paused_at_label: "approval checkpoint",
      approval_review: {
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        consequence_summary_lines: ["Will send the prepared reply."],
        source_refs: ["message:1", "message:2"],
        draft_preview: {
          content: "Subject: Status update | Body: Ready to send",
          content_type: "text",
        },
      },
    },
  });

  const summary = runStatusSummary(run);
  assert.ok(summary);
  assert.match(summary, /^Waiting at approval checkpoint: Please confirm before sending\./);
  assert.match(summary, /high confidence\./i);
  assert.match(summary, /Based on 2 sources/);
  assert.match(summary, /Next consequence: Will send the prepared reply\./);
  assert.doesNotMatch(summary, /Preview:/);
});

test("run status summary falls back to provenance when no consequence or preview exists", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      paused_at_label: "approval checkpoint",
      approval_review: {
        reason: "Please confirm before sending.",
        provenance_summary: "Based on 2 sources",
      },
    },
  });

  const summary = runStatusSummary(run);
  assert.ok(summary);
  assert.match(summary, /^Waiting at approval checkpoint: Please confirm before sending\./);
  assert.match(summary, /Based on 2 sources/);
});

test("run status summary falls back to source summary when provenance is absent", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      paused_at_label: "approval checkpoint",
      approval_review: {
        reason: "Please confirm before sending.",
        source_refs: ["message:1", "message:2"],
      },
    },
  });

  const summary = runStatusSummary(run);
  assert.ok(summary);
  assert.match(summary, /^Waiting at approval checkpoint: Please confirm before sending\./);
  assert.match(summary, /2 sources/i);
});

test("workflow node canvas callout preserves approval trust and preview context", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        source_refs: ["message:1", "message:2"],
        draft_preview: {
          content: "Subject: Status update | Body: Ready to send",
          content_type: "text",
        },
      },
    },
  });
  const node: WorkflowNodeDraft = {
    id: "node-a",
    kind: "approval",
    label: "Approval gate",
    position: { x: 0, y: 0 },
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {},
  };

  const callout = runNodeCanvasCallout(run, node, "waiting_for_approval");
  assert.ok(callout);
  assert.match(callout.text, /^Please confirm before sending\./);
  assert.match(callout.text, /high confidence\./i);
  assert.match(callout.text, /Based on 2 sources/);
  assert.match(callout.text, /Preview: Subject: Status update Body: Ready to send/);
});

test("workflow node canvas callout prefers consequence summary over preview", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        consequence_summary_lines: ["Will send the prepared reply."],
        source_refs: ["message:1", "message:2"],
        draft_preview: {
          content: "Subject: Status update | Body: Ready to send",
          content_type: "text",
        },
      },
    },
  });
  const node: WorkflowNodeDraft = {
    id: "node-a",
    kind: "approval",
    label: "Approval gate",
    position: { x: 0, y: 0 },
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {},
  };

  const callout = runNodeCanvasCallout(run, node, "waiting_for_approval");
  assert.ok(callout);
  assert.match(callout.text, /^Please confirm before sending\./);
  assert.match(callout.text, /high confidence\./i);
  assert.match(callout.text, /Based on 2 sources/);
  assert.match(callout.text, /Next consequence: Will send the prepared reply\./);
  assert.doesNotMatch(callout.text, /Preview:/);
});

test("workflow node canvas callout falls back to source summary when provenance is absent", () => {
  const run = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        reason: "Please confirm before sending.",
        source_refs: ["message:1", "message:2"],
      },
    },
  });
  const node: WorkflowNodeDraft = {
    id: "node-a",
    kind: "approval",
    label: "Approval gate",
    position: { x: 0, y: 0 },
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {},
  };

  const callout = runNodeCanvasCallout(run, node, "waiting_for_approval");
  assert.ok(callout);
  assert.match(callout.text, /^Please confirm before sending\./);
  assert.match(callout.text, /2 sources/i);
});

test("workflow run action feedback covers approval, terminal, and replay states", () => {
  const approvalRun = makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        reason: "Approve send.",
        confidence: "medium",
        provenance_summary: "Based on source.",
        source_refs: ["message:1"],
        draft_preview: {
          content: "Subject: Hi | Body: Ship it",
          content_type: "text",
        },
      },
    },
  });

  assert.match(
    workflowRunActionFeedback({ kind: "start", run: approvalRun }),
    /^Workflow run run-1 is waiting for approval: Approve send\./,
  );
  assert.match(
    workflowRunActionFeedback({ kind: "start", run: approvalRun }),
    /medium confidence\./i,
  );
  assert.match(
    workflowRunActionFeedback({ kind: "start", run: makeWorkflowRun({
      status: "waiting_for_approval",
      result: {
        approval_review: {
          reason: "Approve send.",
          confidence: "medium",
          provenance_summary: "Based on source.",
          consequence_summary_lines: ["Will send the prepared reply."],
          source_refs: ["message:1"],
          draft_preview: {
            content: "Subject: Hi | Body: Ship it",
            content_type: "text",
          },
        },
      },
    }) }),
    /Next consequence: Will send the prepared reply\./,
  );
  assert.equal(
    workflowRunActionFeedback({ kind: "start", run: makeWorkflowRun({ status: "waiting_for_resume" }) }),
    "Workflow run run-1 is waiting for a delayed resume.",
  );
  assert.equal(
    workflowRunActionFeedback({ kind: "start", run: makeWorkflowRun({ status: "blocked" }) }),
    "Workflow run run-1 was blocked by policy.",
  );
  assert.equal(
    workflowRunActionFeedback({ kind: "start", run: makeWorkflowRun({ status: "failed" }) }),
    "Workflow run run-1 failed.",
  );
  assert.equal(
    workflowRunActionFeedback({ kind: "replay", replayRunId: "source-run", run: makeWorkflowRun({ status: "completed" }) }),
    "Replay started from run source-run as run-1.",
  );
  assert.equal(
    workflowRunActionFeedback({ kind: "start", run: makeWorkflowRun({ status: "completed" }) }),
    "Workflow run run-1 completed.",
  );
});

test("workflow execution explanation uses shared pending approval fallback and ascii replay summary", () => {
  assert.equal(
    workflowExecutionExplanationText(makeWorkflowRun({
      status: "waiting_for_approval",
      result: {},
    })),
    "Awaiting your approval",
  );

  assert.equal(
    workflowExecutionExplanationText(makeWorkflowRun({
      status: "completed",
      replay_of_run_id: "1234567890abcdef",
    })),
    "Replay of run 12345678...",
  );

  const approvalExplanation = workflowExecutionExplanationText(makeWorkflowRun({
    status: "waiting_for_approval",
    result: {
      approval_review: {
        reason: "Please confirm before sending.",
        confidence: "high",
        provenance_summary: "Based on 2 sources",
        consequence_summary_lines: ["Will send the prepared reply."],
        source_refs: ["message:1", "message:2"],
        draft_preview: {
          content: "Subject: Status update | Body: Ready to send",
          content_type: "text",
        },
      },
    },
  }));
  assert.ok(approvalExplanation);
  assert.match(approvalExplanation, /^This run is waiting for approval: Please confirm before sending\./);
  assert.match(approvalExplanation, /high confidence\./i);
  assert.match(approvalExplanation, /Based on 2 sources/);
  assert.match(approvalExplanation, /Next consequence: Will send the prepared reply\./);
  assert.doesNotMatch(approvalExplanation, /Preview:/);
});

test("cancelled and resumed workflow summaries keep approval decision follow-through aligned", () => {
  const decisionResult = {
    approval_decision: {
      decision: "approved",
      note: "Keep the audit trail intact.",
      selected_option: {
        label: "Approve & send",
        consequence_summary: "This will send the prepared reply.",
      },
    },
  };

  const cancelledRun = makeWorkflowRun({
    status: "cancelled",
    result: {
      ...decisionResult,
      cancel_reason: "approval_rejected",
    },
  });
  const resumedRun = makeWorkflowRun({
    status: "resumed_pending_execution",
    result: {
      ...decisionResult,
      summary: "Workflow resumed and is ready for downstream execution.",
    },
  });

  const cancelledStatus = runStatusSummary(cancelledRun);
  const resumedStatus = runStatusSummary(resumedRun);
  const cancelledExplanation = workflowExecutionExplanationText(cancelledRun);
  const resumedExplanation = workflowExecutionExplanationText(resumedRun);

  assert.ok(cancelledStatus);
  assert.ok(resumedStatus);
  assert.ok(cancelledExplanation);
  assert.ok(resumedExplanation);

  for (const text of [cancelledStatus, resumedStatus, cancelledExplanation, resumedExplanation]) {
    assert.match(text, /Decision: Approve & send\./);
    assert.match(text, /This will send the prepared reply\./);
    assert.match(text, /Note: Keep the audit trail intact\./);
  }
});

test("workflow dry-run feedback preserves dry-run specific status copy", () => {
  assert.equal(
    workflowDryRunFeedback(makeWorkflowRun({ status: "waiting_for_resume" })),
    "Dry run run-1 paused at a delayed resume boundary.",
  );
  assert.equal(
    workflowDryRunFeedback(makeWorkflowRun({ status: "blocked" })),
    "Dry run run-1 was blocked by policy.",
  );
  assert.equal(
    workflowDryRunFeedback(makeWorkflowRun({ status: "failed" })),
    "Dry run run-1 failed.",
  );
  assert.equal(
    workflowDryRunFeedback(makeWorkflowRun({ status: "completed" })),
    "Dry run run-1 completed.",
  );
  assert.match(
    workflowDryRunFeedback(makeWorkflowRun({
      status: "waiting_for_approval",
      result: { approval_review: { reason: "Dry approval.", confidence: "high" } },
    })),
    /^Dry run run-1 paused at an approval boundary: Dry approval\./,
  );
  assert.match(
    workflowDryRunFeedback(makeWorkflowRun({
      status: "waiting_for_approval",
      result: { approval_review: { reason: "Dry approval.", confidence: "high" } },
    })),
    /high confidence\./i,
  );
  assert.match(
    workflowDryRunFeedback(makeWorkflowRun({
      status: "waiting_for_approval",
      result: {
        approval_review: {
          reason: "Dry approval.",
          confidence: "high",
          provenance_summary: "Based on 2 sources",
          consequence_summary_lines: ["Would dispatch the prepared run."],
          source_refs: ["message:1", "message:2"],
          draft_preview: {
            content: "Subject: Dry | Body: Preview",
            content_type: "text",
          },
        },
      },
    })),
    /Next consequence: Would dispatch the prepared run\./,
  );
});

test("compact execution log entries keep approval-decision follow-up as separate detail lines", () => {
  const run = makeWorkflowRun({
    status: "cancelled",
    timeline: [
      {
        node_id: "node-a",
        label: "Approval gate",
        status: "cancelled",
      },
    ],
    result: {
      cancel_reason: "approval_rejected",
      approval_decision: {
        decision: "approved",
        note: "Keep the audit trail intact.",
        selected_option: {
          label: "Approve & send",
          consequence_summary: "This will send the prepared reply.",
        },
      },
    },
  });

  const entries = compactExecutionLogEntries(run);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0]?.detailLines, [
    "Decision: Approve & send.",
    "This will send the prepared reply.",
    "Note: Keep the audit trail intact.",
  ]);
});

test("run timeline helper returns only array timelines", () => {
  const run = makeWorkflowRun({
    timeline: [{ node_id: "node-a", status: "completed" }],
  });

  assert.deepEqual(runTimelineSteps(run), [{ node_id: "node-a", status: "completed" }]);
  assert.deepEqual(runTimelineSteps({ timeline: "bad" }), []);
  assert.deepEqual(runTimelineSteps({ timeline: [null, "bad", { node_id: "node-b" }] }), [{ node_id: "node-b" }]);
  assert.deepEqual(runTimelineSteps(null), []);
});

test("recentFailedRunNodeIds returns failed node ids from the recent run window", () => {
  const runs = [
    makeWorkflowRun({
      run_id: "run-1",
      timeline: [
        { node_id: " node-a ", status: "failed" },
        { node_id: "node-b", status: "completed" },
        { node_id: "", status: "failed" },
      ],
    }),
    makeWorkflowRun({
      run_id: "run-2",
      timeline: [
        { node_id: "node-c", status: "error" },
        { node_id: "node-a", status: "failed" },
      ],
    }),
    { timeline: "bad" },
    makeWorkflowRun({
      run_id: "run-4",
      timeline: [{ node_id: "node-d", status: "failed" }],
    }),
  ];

  assert.deepEqual([...recentFailedRunNodeIds(runs)].sort(), ["node-a", "node-c"]);
  assert.deepEqual([...recentFailedRunNodeIds(runs, 4)].sort(), ["node-a", "node-c", "node-d"]);
  assert.equal(recentFailedRunNodeIds(runs, 0).size, 0);
});

test("nextReplayStepState advances replay and reports terminal state", () => {
  const steps = [
    { node_id: "node-a" },
    { node_id: " node-b " },
    { status: "completed" },
  ];

  assert.deepEqual(nextReplayStepState(0, steps), {
    done: false,
    nextIndex: 1,
    nextNodeId: "node-b",
  });
  assert.deepEqual(nextReplayStepState(1, steps), {
    done: false,
    nextIndex: 2,
    nextNodeId: null,
  });
  assert.deepEqual(nextReplayStepState(2, steps), {
    done: true,
    nextIndex: 2,
    nextNodeId: null,
  });
  assert.deepEqual(nextReplayStepState(0, []), {
    done: true,
    nextIndex: 0,
    nextNodeId: null,
  });
});

test("truncateCanvasLabel uses ascii ellipsis within the length budget", () => {
  assert.equal(truncateCanvasLabel("Alpha   Beta", 20), "Alpha Beta");
  assert.equal(truncateCanvasLabel("abcdefghijklmnopqrstuvwxyz", 10), "abcdefg...");
});

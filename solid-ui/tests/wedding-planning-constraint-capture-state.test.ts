import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmedPlanningConstraintRequest,
  normalizePlanningConstraintCaptureResponse,
  planningConstraintCaptureUiEnabled,
  planningConstraintCaptureUserMessage,
  preparePlanningRemark,
} from "../src/lib/planningConstraintCapture.ts";
import { normalizeWeddingPlanningMetadata } from "../src/lib/weddingPlanningTemplateState.ts";

const metadata = normalizeWeddingPlanningMetadata({
  weddingPlanId: "wedding_plan:harbour",
  responseWorkspaceId: "response_workspace:harbour",
});

test("planning remark source and retry identity are deterministic for the same capture attempt", () => {
  const first = preparePlanningRemark(metadata, " We need step-free access. ", "2026-10-19T01:02:03Z");
  const retry = preparePlanningRemark(metadata, "We need step-free access.", "2026-10-19T01:02:03Z");
  assert.equal(first.source.id, retry.source.id);
  assert.equal(first.source.thread_id, retry.source.thread_id);
  assert.equal(first.captureRequest["source_message_id"], first.source.id);
  assert.equal((first.source.metadata as Record<string, unknown>).privacy_scope, "tenant_private");
  assert.equal(first.captureRequest["remark"], "We need step-free access.");
});

test("capture normalisation keeps only plain confirmation copy", () => {
  const result = normalizePlanningConstraintCaptureResponse({
    status: "proposal",
    retained_remark: "We need step-free access.",
    proposals: [{
      summary: "Postgres provider payload failed",
      confirmation_label: "Run model",
      constraint: {
        constraint_id: "constraint:capture:abc",
        status: "proposed",
        authority: "deterministic",
        strength: "hard",
        source_anchor: { exact_excerpt: "step-free" },
      },
    }],
    clarifying_question: null,
    model: "internal-model-name",
  });
  assert.equal(result.proposals[0]?.summary, "Planning preference");
  assert.equal(result.proposals[0]?.confirmationLabel, "Confirm must-have");
  assert.equal(JSON.stringify(result).includes("internal-model-name"), false);
});

test("confirmation explicitly escalates proposal authority without mutating the proposal", () => {
  const result = normalizePlanningConstraintCaptureResponse({
    status: "proposal",
    retained_remark: "We need step-free access.",
    proposals: [{
      summary: "Step-free access",
      confirmation_label: "Confirm must-have",
      constraint: {
        constraint_id: "constraint:capture:abc",
        status: "proposed",
        authority: "deterministic",
        strength: "hard",
        source_anchor: { exact_excerpt: "step-free" },
      },
    }],
  });
  const proposal = result.proposals[0]!.constraint;
  const request = confirmedPlanningConstraintRequest("thread-1", proposal);
  assert.equal((request["constraint"] as Record<string, unknown>).status, "confirmed");
  assert.equal((request["constraint"] as Record<string, unknown>).authority, "user");
  assert.equal(proposal.status, "proposed");
});

test("capture UI stays rollout-gated and maps technical errors to friendly copy", () => {
  assert.equal(planningConstraintCaptureUiEnabled({}), false);
  assert.equal(planningConstraintCaptureUiEnabled({ VITE_PLANNING_CONSTRAINT_CAPTURE_ENABLED: "true" }), true);
  assert.doesNotMatch(planningConstraintCaptureUserMessage(new Error("Postgres HTTP 500 payload")), /postgres|http|payload/i);
});

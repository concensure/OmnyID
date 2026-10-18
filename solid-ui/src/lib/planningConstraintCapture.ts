import { apiFetch, normalizeAfpTransportInput, type SendAfpMessageInput } from "@/lib/api";
import { safeWeddingLabel, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";

export type PlanningConstraintRecord = Record<string, unknown> & {
  constraint_id: string;
  status: string;
  authority: string;
  strength: "hard" | "strong" | "nice";
  source_anchor: Record<string, unknown> & { exact_excerpt: string };
};

export type PlanningConstraintCaptureProposal = {
  summary: string;
  confirmationLabel: string;
  constraint: PlanningConstraintRecord;
};

export type PlanningConstraintCaptureResponse = {
  status: "proposal" | "needs_clarification";
  retainedRemark: string;
  proposals: PlanningConstraintCaptureProposal[];
  clarifyingQuestion: string | null;
  a2ui: Record<string, unknown> | null;
};

export type PreparedPlanningRemark = {
  source: SendAfpMessageInput;
  captureRequest: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shortFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export function planningConstraintCaptureUiEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  return ["1", "true", "yes", "on"].includes(text(env["VITE_PLANNING_CONSTRAINT_CAPTURE_ENABLED"]).toLowerCase());
}

export function preparePlanningRemark(
  metadata: WeddingPlanningMetadata,
  remarkInput: string,
  nowIso = new Date().toISOString(),
): PreparedPlanningRemark {
  const remark = remarkInput.trim();
  if (!remark || remark.length > 2_000) throw new Error("invalid planning note");
  const fingerprint = shortFingerprint(`${metadata.weddingPlanId}|${remark}`);
  const sourceVersionId = `planning_remark:${fingerprint}:v1`;
  const source = normalizeAfpTransportInput({
    id: `planning_remark:${safeWeddingLabel(metadata.weddingPlanId)}:${fingerprint}`,
    thread_id: `planning_constraints:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "user://wedding-planner",
    to: ["agent://planning-intelligence"],
    timestamp: nowIso,
    type: "note",
    kind: "planning_remark",
    subtype: "planning_constraint_source",
    content: { kind: "planning_remark", remark, source_version_id: sourceVersionId },
    supertags: ["planning", "planning_constraint_source", `template:${metadata.template}`],
    metadata: {
      store: true,
      privacy_scope: "tenant_private",
      e2ee_required: true,
      source_version_id: sourceVersionId,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
    },
    store_in_relational: true,
  });
  return {
    source,
    captureRequest: {
      thread_id: source.thread_id,
      template_id: metadata.template,
      plan_id: metadata.weddingPlanId,
      subject_ref: { kind: "plan", id: `plan:wedding:${safeWeddingLabel(metadata.weddingPlanId)}` },
      source_message_id: source.id,
      source_version_id: sourceVersionId,
      locator: "content.remark",
      remark,
    },
  };
}

export function normalizePlanningConstraintCaptureResponse(value: unknown): PlanningConstraintCaptureResponse {
  const root = record(value);
  const status = root?.["status"] === "proposal" ? "proposal" : "needs_clarification";
  const proposals = Array.isArray(root?.["proposals"])
    ? root.proposals.flatMap((item): PlanningConstraintCaptureProposal[] => {
      const row = record(item);
      const constraint = record(row?.["constraint"]);
      const anchor = record(constraint?.["source_anchor"]);
      const strength = constraint?.["strength"];
      if (!row || !constraint || !anchor || !text(row["summary"]) || !text(constraint["constraint_id"])
        || !["hard", "strong", "nice"].includes(text(strength)) || !text(anchor["exact_excerpt"])) return [];
      return [{
        summary: safeWeddingUiText(text(row["summary"]), "Planning preference"),
        confirmationLabel: text(strength) === "hard" ? "Confirm must-have" : "Remember this",
        constraint: {
          ...constraint,
          constraint_id: text(constraint["constraint_id"]),
          status: text(constraint["status"]),
          authority: text(constraint["authority"]),
          strength: text(strength) as PlanningConstraintRecord["strength"],
          source_anchor: { ...anchor, exact_excerpt: text(anchor["exact_excerpt"]) },
        },
      }];
    })
    : [];
  return {
    status: status === "proposal" && proposals.length > 0 ? "proposal" : "needs_clarification",
    retainedRemark: text(root?.["retained_remark"]),
    proposals,
    clarifyingQuestion: text(root?.["clarifying_question"])
      ? safeWeddingUiText(text(root?.["clarifying_question"]), "What practical planning rule should we remember?")
      : null,
    a2ui: record(root?.["a2ui"]),
  };
}

export async function capturePlanningRemark(prepared: PreparedPlanningRemark): Promise<PlanningConstraintCaptureResponse> {
  return normalizePlanningConstraintCaptureResponse(await apiFetch<unknown>("/planning/constraints/capture", {
    method: "POST",
    bodyJson: prepared.captureRequest,
  }));
}

export async function confirmPlanningConstraint(
  threadId: string,
  constraint: PlanningConstraintRecord,
): Promise<void> {
  await apiFetch<unknown>("/planning/constraints", {
    method: "POST",
    bodyJson: confirmedPlanningConstraintRequest(threadId, constraint),
  });
}

export function confirmedPlanningConstraintRequest(
  threadId: string,
  constraint: PlanningConstraintRecord,
): Record<string, unknown> {
  return {
    thread_id: threadId,
    authority: "user_confirmed",
    constraint: { ...constraint, authority: "user", status: "confirmed" },
  };
}

export function planningConstraintCaptureUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("sign in") || message.includes("unauthorized")) {
    return "Sign in again to save this planning note.";
  }
  if (message.includes("not available") || message.includes("404")) {
    return "This planning helper is not available yet.";
  }
  return "Your note is still here. We could not prepare it for confirmation, so please try again.";
}

import { apiFetch } from "@/lib/api";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingAssistantAction = {
  kind: "open_view" | "stage_update";
  target: WeddingWorkspaceMenuId;
  label: string;
  draftFields: { budgetTargetAud?: number } | null;
};

export type WeddingAssistantResponse = {
  answer: string;
  suggestedAction: WeddingAssistantAction | null;
  model: string;
};

const TARGETS = new Set<WeddingWorkspaceMenuId>([
  "home", "people", "plan", "tasks", "vision", "documents", "budget", "guests",
  "inspiration", "seating", "helpers", "response_queue", "timeline", "advanced",
]);

export function normalizeWeddingAssistantResponse(value: unknown): WeddingAssistantResponse {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawAction = record.suggested_action && typeof record.suggested_action === "object" && !Array.isArray(record.suggested_action)
    ? record.suggested_action as Record<string, unknown>
    : null;
  const target = rawAction?.target;
  const kind = rawAction?.kind;
  const action: WeddingAssistantAction | null = typeof target === "string" && TARGETS.has(target as WeddingWorkspaceMenuId)
    && (kind === "open_view" || kind === "stage_update")
    ? {
      kind: kind as WeddingAssistantAction["kind"],
      target: target as WeddingWorkspaceMenuId,
      label: typeof rawAction?.label === "string" && rawAction.label.trim() ? rawAction.label.trim() : "Open Wedding",
      draftFields: (() => {
        const fields = rawAction?.draft_fields && typeof rawAction.draft_fields === "object" && !Array.isArray(rawAction.draft_fields)
          ? rawAction.draft_fields as Record<string, unknown>
          : null;
        const amount = fields?.budget_target_aud;
        return typeof amount === "number" && Number.isFinite(amount) && amount >= 1_000
          ? { budgetTargetAud: Math.round(amount) }
          : null;
      })(),
    }
    : null;
  return {
    answer: typeof record.answer === "string" ? record.answer.trim() : "",
    suggestedAction: action,
    model: typeof record.model === "string" ? record.model.trim() : "",
  };
}

export async function askWeddingAssistant(input: {
  question: string;
  weddingPlanId?: string | null;
  currentView?: string | null;
}): Promise<WeddingAssistantResponse> {
  const response = await apiFetch<unknown>("/wedding/assistant", {
    method: "POST",
    bodyJson: {
      question: input.question,
      wedding_plan_id: input.weddingPlanId ?? null,
      current_view: input.currentView ?? null,
    },
  });
  return normalizeWeddingAssistantResponse(response);
}

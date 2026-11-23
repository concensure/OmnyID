// @locs-version: 1.0
import {
  apiFetch,
  normalizeAfpTransportInput,
  normalizeSupertagMessagesResponse,
  type AfpMessage,
  type SendAfpMessageInput,
  type SupertagMessagesResponse,
} from "@/lib/api";

export type WeddingBudgetProjectionScope = {
  weddingPlanId: string;
  responseWorkspaceId: string;
};

export class WeddingBudgetProjectionConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super("This shared budget changed elsewhere. Refresh and review the latest values before saving again.");
    this.name = "WeddingBudgetProjectionConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function artifactId(value: { content: unknown }): string {
  const valueArtifactId = record(value.content).artifact_id;
  return typeof valueArtifactId === "string" ? valueArtifactId.trim() : "";
}

function messageRevision(message: AfpMessage): number {
  const value = message.metadata?.budgetRevision ?? message.metadata?.budget_revision;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function weddingBudgetProjectionExpectedRevision(
  messages: readonly AfpMessage[],
  input: SendAfpMessageInput,
): number {
  const targetArtifactId = artifactId(input);
  if (!targetArtifactId) return 0;
  return messages.reduce((revision, message) => artifactId(message) === targetArtifactId
    ? Math.max(revision, messageRevision(message))
    : revision, 0);
}

function query(scope: WeddingBudgetProjectionScope): string {
  return new URLSearchParams({
    wedding_plan_id: scope.weddingPlanId,
    response_workspace_id: scope.responseWorkspaceId,
  }).toString();
}

export function fetchWeddingBudgetProjectionMessages(
  scope: WeddingBudgetProjectionScope,
): Promise<SupertagMessagesResponse> {
  return apiFetch<unknown>(`/wedding/budget/projections?${query(scope)}`)
    .then(normalizeSupertagMessagesResponse);
}

export async function sendWeddingBudgetProjection(
  scope: WeddingBudgetProjectionScope,
  input: SendAfpMessageInput,
  expectedRevision: number,
) {
  const message = normalizeAfpTransportInput(input);
  try {
    return await apiFetch<{ success: boolean; message_id: string; owner_user_id: string; actor_user_id: string; revision: number }>("/wedding/budget/projections", {
      method: "POST",
      bodyJson: {
        wedding_plan_id: scope.weddingPlanId,
        response_workspace_id: scope.responseWorkspaceId,
        expected_revision: expectedRevision,
        message: {
          id: message.id,
          thread_id: message.thread_id,
          parent_id: message.parent_id ?? null,
          from: message.from,
          to: message.to,
          timestamp: message.timestamp,
          type: message.type,
          kind: message.kind ?? null,
          subtype: message.subtype ?? null,
          content: message.content,
          views: message.views ?? [],
          attachments: message.attachments ?? [],
          references: message.references ?? [],
          supertags: message.supertags ?? [],
          metadata: message.metadata ?? {},
          store_in_relational: message.store_in_relational ?? false,
          signature: message.signature ?? "",
        },
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const match = detail.match(/wedding_budget_revision_conflict:\s*expected\s+(\d+),\s*current\s+(\d+)/i);
    if (match) throw new WeddingBudgetProjectionConflictError(Number(match[1]), Number(match[2]));
    throw error;
  }
}

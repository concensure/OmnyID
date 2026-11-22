// @locs-version: 1.0
import {
  apiFetch,
  normalizeAfpTransportInput,
  normalizeSupertagMessagesResponse,
  type SendAfpMessageInput,
  type SupertagMessagesResponse,
} from "@/lib/api";

export type WeddingBudgetProjectionScope = {
  weddingPlanId: string;
  responseWorkspaceId: string;
};

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

export function sendWeddingBudgetProjection(
  scope: WeddingBudgetProjectionScope,
  input: SendAfpMessageInput,
) {
  const message = normalizeAfpTransportInput(input);
  return apiFetch<{ success: boolean; message_id: string; owner_user_id: string; actor_user_id: string }>("/wedding/budget/projections", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: scope.weddingPlanId,
      response_workspace_id: scope.responseWorkspaceId,
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
}

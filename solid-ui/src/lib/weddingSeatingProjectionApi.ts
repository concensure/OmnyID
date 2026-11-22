// @locs-version: 1.0
import {
  apiFetch,
  normalizeAfpTransportInput,
  normalizeSupertagMessagesResponse,
  type AfpMessage,
  type SendAfpMessageInput,
  type SupertagMessagesResponse,
} from "@/lib/api";

export type WeddingSeatingProjectionScope = {
  weddingPlanId: string;
  responseWorkspaceId: string;
};

export class WeddingSeatingProjectionConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super("This shared seating plan changed elsewhere. Refresh and review the latest plan before saving again.");
    this.name = "WeddingSeatingProjectionConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isWeddingSeatingProjection(value: { kind?: unknown; subtype?: unknown; supertags?: readonly string[] | null }): boolean {
  const kind = typeof value.kind === "string" ? value.kind : typeof value.subtype === "string" ? value.subtype : "";
  return value.supertags?.includes("wedding_seating") === true
    && ["wedding_seating_constraint", "wedding_seating_optimization", "wedding_seating_draft_archive"].includes(kind);
}

function seatingArtifactId(value: { kind?: unknown; subtype?: unknown; content: unknown }): string {
  const kind = typeof value.kind === "string" ? value.kind : typeof value.subtype === "string" ? value.subtype : "";
  const content = record(value.content);
  if (kind === "wedding_seating_optimization") return "wedding-seating-current-plan";
  if (kind === "wedding_seating_constraint") {
    const id = typeof content.constraint_id === "string" ? content.constraint_id.trim() : "";
    return id ? `wedding-seating-constraint:${id}` : "";
  }
  if (kind === "wedding_seating_draft_archive") {
    const fingerprint = typeof content.seating_draft_fingerprint === "string" ? content.seating_draft_fingerprint.trim() : "";
    return fingerprint ? `wedding-seating-draft-archive:${fingerprint}` : "";
  }
  return "";
}

function messageRevision(message: AfpMessage): number {
  const value = message.metadata?.seatingRevision ?? message.metadata?.seating_revision;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function weddingSeatingProjectionExpectedRevision(
  messages: readonly AfpMessage[],
  input: SendAfpMessageInput,
): number {
  const targetArtifactId = seatingArtifactId(input);
  if (!targetArtifactId) return 0;
  return messages.reduce((revision, message) => seatingArtifactId(message) === targetArtifactId
    ? Math.max(revision, messageRevision(message))
    : revision, 0);
}

function query(scope: WeddingSeatingProjectionScope): string {
  return new URLSearchParams({
    wedding_plan_id: scope.weddingPlanId,
    response_workspace_id: scope.responseWorkspaceId,
  }).toString();
}

export function fetchWeddingSeatingProjectionMessages(
  scope: WeddingSeatingProjectionScope,
): Promise<SupertagMessagesResponse> {
  return apiFetch<unknown>(`/wedding/seating/projections?${query(scope)}`)
    .then(normalizeSupertagMessagesResponse);
}

export async function sendWeddingSeatingProjection(
  scope: WeddingSeatingProjectionScope,
  input: SendAfpMessageInput,
  expectedRevision: number,
) {
  const message = normalizeAfpTransportInput(input);
  try {
    return await apiFetch<{
      success: boolean;
      message_id: string;
      owner_user_id: string;
      actor_user_id: string;
      artifact_id: string;
      revision: number;
    }>("/wedding/seating/projections", {
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
    const match = detail.match(/wedding_seating_revision_conflict:\s*expected\s+(\d+),\s*current\s+(\d+)/i);
    if (match) throw new WeddingSeatingProjectionConflictError(Number(match[1]), Number(match[2]));
    throw error;
  }
}

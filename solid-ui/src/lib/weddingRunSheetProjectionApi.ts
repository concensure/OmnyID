// @locs-version: 1.0
import { apiFetch } from "@/lib/api";
import type {
  DatabaseProjectionReceiptContent,
  CanonicalDatabaseRecordContent,
  CanonicalDatabaseRevisionContent,
} from "@/lib/databaseContract";
import type { CompatibleDatabaseMessage } from "@/lib/databaseMessageCompatibility";
import type { WeddingRunSheetProjectionCheckpoint } from "@/lib/weddingRunSheetProjectorState";

export type WeddingRunSheetProjectionState = {
  checkpoint: WeddingRunSheetProjectionCheckpoint | null;
  messages: CompatibleDatabaseMessage[];
};

export type WeddingRunSheetProjectionCommitResult = {
  replayed: boolean;
  messageIds: string[];
  state: WeddingRunSheetProjectionState;
  explanation: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function normalizeCheckpoint(value: unknown): WeddingRunSheetProjectionCheckpoint | null {
  const record = objectValue(value);
  const sourceCursor = stringValue(record.source_cursor);
  const sourceFingerprint = stringValue(record.source_fingerprint);
  const projectorVersion = numberValue(record.projector_version);
  return sourceCursor && sourceFingerprint && projectorVersion > 0
    ? { sourceCursor, sourceFingerprint, projectorVersion }
    : null;
}

export function normalizeWeddingRunSheetProjectionState(value: unknown): WeddingRunSheetProjectionState {
  const record = objectValue(value);
  const checkpointRecord = objectValue(record.checkpoint);
  const messages = Array.isArray(record.messages) ? record.messages.flatMap((entry) => {
    const message = objectValue(entry);
    const id = stringValue(message.id);
    const type = stringValue(message.message_type);
    if (!id || !type) return [];
    return [{ id, type, timestamp: stringValue(message.timestamp), content: message.content, metadata: message.metadata }];
  }) : [];
  return { checkpoint: normalizeCheckpoint(checkpointRecord), messages };
}

export async function loadWeddingRunSheetProjection(input: {
  databaseId: string;
  weddingPlanId: string;
  responseWorkspaceId: string;
}): Promise<WeddingRunSheetProjectionState> {
  const query = new URLSearchParams({
    database_id: input.databaseId,
    wedding_plan_id: input.weddingPlanId,
    response_workspace_id: input.responseWorkspaceId,
  });
  return normalizeWeddingRunSheetProjectionState(await apiFetch<unknown>(`/database/wedding-runsheet/projection?${query}`));
}

export async function ensureWeddingRunSheetProjection(input: {
  databaseId: string;
  weddingPlanId: string;
  responseWorkspaceId: string;
}): Promise<WeddingRunSheetProjectionState> {
  return normalizeWeddingRunSheetProjectionState(await apiFetch<unknown>("/database/wedding-runsheet/install", {
    method: "POST",
    bodyJson: {
      database_id: input.databaseId,
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
    },
  }));
}

export async function commitWeddingRunSheetProjection(input: {
  databaseId: string;
  weddingPlanId: string;
  responseWorkspaceId: string;
  expectedCheckpoint: WeddingRunSheetProjectionCheckpoint | null;
  nextCheckpoint: WeddingRunSheetProjectionCheckpoint;
  records: CanonicalDatabaseRecordContent[];
  revisions: CanonicalDatabaseRevisionContent[];
  receipt: DatabaseProjectionReceiptContent;
  explanation: string;
}): Promise<WeddingRunSheetProjectionCommitResult> {
  const checkpoint = (value: WeddingRunSheetProjectionCheckpoint | null) => value ? {
    source_cursor: value.sourceCursor,
    projector_version: value.projectorVersion,
    source_fingerprint: value.sourceFingerprint,
  } : null;
  const response = objectValue(await apiFetch<unknown>("/database/wedding-runsheet/projection", {
    method: "POST",
    bodyJson: {
      database_id: input.databaseId,
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      profile_id: "wedding_runsheet.v1",
      expected_checkpoint: checkpoint(input.expectedCheckpoint),
      next_checkpoint: checkpoint(input.nextCheckpoint),
      records: input.records,
      revisions: input.revisions,
      receipt: input.receipt,
      explanation: input.explanation,
      model_calls: 0,
    },
  }));
  const commit = objectValue(response.commit);
  return {
    replayed: commit.replayed === true,
    messageIds: Array.isArray(commit.message_ids) ? commit.message_ids.map(stringValue).filter(Boolean) : [],
    state: normalizeWeddingRunSheetProjectionState(response.state),
    explanation: stringValue(response.explanation) || input.explanation,
  };
}

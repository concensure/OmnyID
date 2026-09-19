// @locs-version: 2.0
import {
  buildWeddingApprovalReceiptState,
  type WeddingApprovalActionKind,
  type WeddingApprovalReceiptState,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";

export type WeddingApprovalExecutionStatus = "executed" | "blocked" | "missing_executor" | "failed";

export type WeddingApprovalExecutorResult = {
  ok: boolean;
  externalId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WeddingApprovalExecutor = (
  request: WeddingApprovalRequestState,
) => Promise<WeddingApprovalExecutorResult> | WeddingApprovalExecutorResult;

export type WeddingApprovalExecutionHandlers = Partial<Record<WeddingApprovalActionKind, WeddingApprovalExecutor>>;

export type WeddingApprovalExecutionState = {
  requestId: string;
  actionKind: WeddingApprovalActionKind;
  status: WeddingApprovalExecutionStatus;
  canRetry: boolean;
  receipt: WeddingApprovalReceiptState;
  externalId: string | null;
  message: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const DURABLE_RECEIPT_METADATA_KEYS = [
  "external_id",
  "provider_receipt_id",
  "provider_message_id",
  "provider_event_id",
  "provider_publish_id",
  "message_id",
] as const;

function durableReceiptId(result: WeddingApprovalExecutorResult): string | null {
  const externalId = clean(result.externalId);
  if (externalId) return externalId;

  const metadata = result.metadata ?? {};
  for (const key of DURABLE_RECEIPT_METADATA_KEYS) {
    const metadataId = clean(metadata[key]);
    if (metadataId) return metadataId;
  }

  return null;
}

function stateFromReceipt(input: {
  request: WeddingApprovalRequestState;
  receipt: WeddingApprovalReceiptState;
  status: WeddingApprovalExecutionStatus;
  externalId?: string | null;
  message?: string | null;
}): WeddingApprovalExecutionState {
  return {
    requestId: input.request.id,
    actionKind: input.request.actionKind,
    status: input.status,
    canRetry: input.status === "missing_executor" || input.status === "failed",
    receipt: input.receipt,
    externalId: clean(input.externalId) || null,
    message: clean(input.message)
      || (input.status === "executed"
        ? "Wedding action executed after explicit approval."
        : input.receipt.metadata.blocked_reason
          ? String(input.receipt.metadata.blocked_reason)
          : "Wedding action did not execute."),
  };
}

export async function runWeddingApprovalExecution(input: {
  request: WeddingApprovalRequestState;
  handlers?: WeddingApprovalExecutionHandlers | null;
  nowIso?: string | null;
}): Promise<WeddingApprovalExecutionState> {
  const receipt = buildWeddingApprovalReceiptState(input.request, clean(input.nowIso) || new Date().toISOString());
  if (!input.request.canExecute) {
    return stateFromReceipt({
      request: input.request,
      receipt,
      status: "blocked",
      message: input.request.blockedReason,
    });
  }

  const handler = input.handlers?.[input.request.actionKind];
  if (!handler) {
    return stateFromReceipt({
      request: input.request,
      receipt: {
        ...receipt,
        status: "blocked",
        metadata: {
          ...receipt.metadata,
          blocked_reason: "No executor is connected for this wedding action.",
        },
      },
      status: "missing_executor",
      message: "No executor is connected for this wedding action.",
    });
  }

  try {
    const result = await handler(input.request);
    if (!result.ok) {
      return stateFromReceipt({
        request: input.request,
        receipt: {
          ...receipt,
          status: "blocked",
          metadata: {
            ...receipt.metadata,
            blocked_reason: clean(result.message) || "The connected executor declined this action.",
            ...(result.metadata ?? {}),
          },
        },
        status: "failed",
        message: result.message || "The connected executor declined this action.",
      });
    }

    const receiptId = durableReceiptId(result);
    if (!receiptId) {
      const message = clean(result.message)
        || "The connected executor did not return a durable provider receipt.";
      return stateFromReceipt({
        request: input.request,
        receipt: {
          ...receipt,
          status: "blocked",
          metadata: {
            ...receipt.metadata,
            blocked_reason: message,
            missing_durable_provider_receipt: true,
            ...(result.metadata ?? {}),
          },
        },
        status: "failed",
        message,
      });
    }

    return stateFromReceipt({
      request: input.request,
      receipt: {
        ...receipt,
        metadata: {
          ...receipt.metadata,
          ...(result.metadata ?? {}),
          external_id: receiptId,
        },
      },
      status: "executed",
      externalId: receiptId,
      message: result.message || "Wedding action executed after explicit approval.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The connected executor failed.";
    return stateFromReceipt({
      request: input.request,
      receipt: {
        ...receipt,
        status: "blocked",
        metadata: {
          ...receipt.metadata,
          blocked_reason: message,
        },
      },
      status: "failed",
      message,
    });
  }
}

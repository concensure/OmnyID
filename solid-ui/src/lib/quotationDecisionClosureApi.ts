import { apiFetch } from "@/lib/api";
import type {
  QuotationClosureAction,
  QuotationDecisionClosureReplay,
} from "@/lib/quotationDecisionClosureState";
import type { QuotationClosureStatus } from "@/lib/quotationClosureState";

export type StoredQuotationMessages = {
  messageIds: string[];
};

export class QuotationActionError extends Error {
  readonly recoverable: boolean;

  constructor(message: string, recoverable: boolean) {
    super(message);
    this.name = "QuotationActionError";
    this.recoverable = recoverable;
  }
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new QuotationActionError(`${label} is required. Refresh and try again.`, true);
  return normalized;
}

function storedMessages(value: unknown): StoredQuotationMessages {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ids = Array.isArray(record.message_ids)
    ? record.message_ids.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  if (ids.length === 0) throw new QuotationActionError("The server did not return a durable AFP message. Refresh before retrying.", true);
  return { messageIds: ids };
}

function actionError(error: unknown): QuotationActionError {
  if (error instanceof QuotationActionError) return error;
  const message = error instanceof Error ? error.message : "Quotation action failed.";
  const recoverable = /stale|active|current|changed|conflict|idempotency|revision|enabled/i.test(message);
  return new QuotationActionError(
    recoverable ? `${message} Refresh the quotation state before trying again.` : message,
    recoverable,
  );
}

export async function fetchQuotationDecisionClosureReplay(
  threadId: string,
): Promise<QuotationDecisionClosureReplay> {
  return apiFetch<QuotationDecisionClosureReplay>(
    `/quotation/state?thread_id=${encodeURIComponent(nonEmpty(threadId, "Thread id"))}`,
  );
}

export async function persistQuotationSelection(input: {
  threadId: string;
  selectionId: string;
  quotationId: string;
  quotationVersionId: string;
  vendorId: string;
  comparisonId: string;
  comparisonRevision: string;
  expectedSelectionId?: string | null;
  idempotencyKey: string;
  userAuthority: true;
}): Promise<StoredQuotationMessages> {
  try {
    const value = await apiFetch<unknown>("/quotation/decisions", {
      method: "POST",
      bodyJson: {
        thread_id: nonEmpty(input.threadId, "Thread id"),
        selection_id: nonEmpty(input.selectionId, "Selection id"),
        comparison_id: nonEmpty(input.comparisonId, "Comparison id"),
        expected_comparison_revision: nonEmpty(input.comparisonRevision, "Comparison revision"),
        quotation_id: nonEmpty(input.quotationId, "Quotation id"),
        quotation_version_id: nonEmpty(input.quotationVersionId, "Quotation version"),
        vendor_id: nonEmpty(input.vendorId, "Vendor id"),
        expected_selection_id: input.expectedSelectionId?.trim() || null,
        idempotency_key: nonEmpty(input.idempotencyKey, "Idempotency key"),
        user_authority: input.userAuthority,
      },
    });
    return storedMessages(value);
  } catch (error) {
    throw actionError(error);
  }
}

export async function persistQuotationClosureAction(input: {
  threadId: string;
  action: QuotationClosureAction;
  eventId: string;
  idempotencyKey: string;
  evidenceMessageId: string;
  contractChangesReviewed?: boolean;
  userAuthority: true;
}): Promise<StoredQuotationMessages> {
  const { action } = input;
  if (action.kind !== "closure_transition" || !action.targetState) {
    throw new QuotationActionError("This action does not mutate booking progress.", false);
  }
  const expectedState = expectedStateForTarget(action.targetState);
  try {
    const value = await apiFetch<unknown>("/quotation/closure-transitions", {
      method: "POST",
      bodyJson: {
        thread_id: nonEmpty(input.threadId, "Thread id"),
        event_id: nonEmpty(input.eventId, "Event id"),
        quotation_id: nonEmpty(action.binding.quotationId, "Quotation id"),
        quotation_version_id: nonEmpty(action.binding.quotationVersionId, "Quotation version"),
        comparison_id: nonEmpty(action.binding.comparisonId, "Comparison id"),
        expected_comparison_revision: nonEmpty(action.binding.comparisonRevision, "Comparison revision"),
        expected_closure_revision: nonEmpty(action.binding.closureRevision, "Closure revision"),
        expected_state: expectedState,
        target_state: action.targetState,
        user_authority: input.userAuthority,
        evidence_message_id: nonEmpty(input.evidenceMessageId, "Validated evidence message"),
        contract_changes_reviewed: input.contractChangesReviewed ?? false,
        idempotency_key: nonEmpty(input.idempotencyKey, "Idempotency key"),
      },
    });
    return storedMessages(value);
  } catch (error) {
    throw actionError(error);
  }
}

function expectedStateForTarget(target: QuotationClosureStatus): QuotationClosureStatus {
  const expected: Partial<Record<QuotationClosureStatus, QuotationClosureStatus>> = {
    contract_received: "selected",
    contract_reviewed: "contract_received",
    deposit_requested: "contract_reviewed",
    deposit_recorded_paid: "deposit_requested",
    booking_confirmed: "deposit_recorded_paid",
    refunded: "cancelled",
  };
  const value = expected[target];
  if (!value) throw new QuotationActionError(`Unsupported closure transition to ${target}.`, false);
  return value;
}

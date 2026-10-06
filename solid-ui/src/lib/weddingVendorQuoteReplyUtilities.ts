// @locs-version: 1.0
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";

const DURABLE_SENT_RECEIPT_METADATA_KEYS = [
  "external_id",
  "provider_receipt_id",
  "provider_message_id",
  "message_id",
] as const;

export function cleanWeddingQuoteValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function uniqueWeddingQuoteStrings(values: readonly unknown[], limit = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = cleanWeddingQuoteValue(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function weddingQuoteDisplayDateTime(value: string | null | undefined): string | null {
  const raw = cleanWeddingQuoteValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function weddingVendorQuoteReplyDurableSentReceiptId(
  execution?: WeddingApprovalExecutionState | null,
): string | null {
  if (execution?.status !== "executed") return null;
  if (execution.actionKind !== "send_email" || execution.receipt.actionKind !== "send_email") return null;
  if (execution.receipt.status !== "executed") return null;
  const metadata = execution.receipt.metadata ?? {};
  if (metadata.external_delivery_performed !== true) return null;
  if (metadata.missing_durable_provider_receipt === true) return null;
  if (metadata.provider_result_ok === false) return null;
  const externalId = cleanWeddingQuoteValue(execution.externalId);
  if (externalId) return externalId;
  for (const key of DURABLE_SENT_RECEIPT_METADATA_KEYS) {
    const metadataId = cleanWeddingQuoteValue(metadata[key]);
    if (metadataId) return metadataId;
  }
  return null;
}

// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";
import { buildWeddingVendorQuoteDecisionOsProjection } from "@/lib/weddingVendorQuoteDecisionOsProjectionState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function persistedDecisionKeys(messages: readonly AfpMessage[]): Set<string> {
  return new Set(messages.flatMap((message) => {
    if (message.type !== "decision_request") return [];
    const key = clean(message.metadata?.idempotency_key);
    return key ? [key] : [];
  }));
}

/** Selects only unpersisted DecisionOS projections for visible unresolved quote flows. */
export function weddingVendorQuoteDecisionDispatches(input: {
  flows: readonly WeddingVendorQuoteReplyFlowState[];
  messages: readonly AfpMessage[];
  attemptedKeys?: ReadonlySet<string>;
}): Array<{ idempotencyKey: string; sendInput: SendAfpMessageInput }> {
  const alreadyPersisted = persistedDecisionKeys(input.messages);
  return input.flows.flatMap((flow) => {
    if (!flow.quoteMessageId) return [];
    const projection = buildWeddingVendorQuoteDecisionOsProjection({
      quoteMessageId: flow.quoteMessageId,
      quoteThreadId: flow.threadId,
      quote: flow.quote,
      metadata: flow.metadata,
    });
    if (projection.status !== "active" || !projection.sendInput
      || alreadyPersisted.has(projection.idempotencyKey)
      || input.attemptedKeys?.has(projection.idempotencyKey)) return [];
    return [{ idempotencyKey: projection.idempotencyKey, sendInput: projection.sendInput }];
  });
}

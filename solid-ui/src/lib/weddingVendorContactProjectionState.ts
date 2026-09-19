// @locs-version: 2.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";

export type WeddingVendorContactProjectionMethod =
  | "master_agent"
  | "agent_email_draft"
  | "personal_email"
  | "phone"
  | "website_form"
  | "other";

export type WeddingVendorContactProjectionRequest = {
  vendorId: string;
  body: {
    contact_method: WeddingVendorContactProjectionMethod;
    follow_up_due_at?: string | null;
    response_received_at?: string | null;
    thread_id?: string | null;
    receipt_ref?: string | null;
    notes?: string | null;
  };
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validMethod(value: unknown): WeddingVendorContactProjectionMethod {
  const method = clean(value);
  if (
    method === "master_agent"
    || method === "agent_email_draft"
    || method === "personal_email"
    || method === "phone"
    || method === "website_form"
    || method === "other"
  ) {
    return method;
  }
  return "agent_email_draft";
}

function plusDays(nowIso: string, days: number): string | null {
  const now = new Date(nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

function nextFollowUpDueAt(stage: string | null, nowIso: string): string | null {
  if (stage === "initial_outreach") return plusDays(nowIso, 5);
  if (stage === "follow_up_due") return plusDays(nowIso, 2);
  return null;
}

function savedTaskItems(receipt: WeddingProjectionDispatchReceiptState): Map<string, string | null> {
  const saved = new Map<string, string | null>();
  for (const item of receipt.savedItems) {
    if (item.kind === "task") saved.set(item.sourceId, clean(item.messageId));
  }
  return saved;
}

export function weddingVendorContactProjectionRequests(input: {
  receipt: WeddingProjectionDispatchReceiptState;
  sendInputs?: readonly SendAfpMessageInput[] | null;
  nowIso?: string | null;
}): WeddingVendorContactProjectionRequest[] {
  const saved = savedTaskItems(input.receipt);
  const nowIso = clean(input.nowIso) ?? new Date().toISOString();
  const requests: WeddingVendorContactProjectionRequest[] = [];
  const seen = new Set<string>();

  for (const sendInput of input.sendInputs ?? []) {
    if (sendInput.type !== "task") continue;
    const metadata = record(sendInput.metadata);
    const taskId = clean(metadata.wedding_task_item_id);
    const savedMessageId = taskId ? saved.get(taskId) : null;
    if (!taskId || !saved.has(taskId)) continue;
    const vendorId = clean(metadata.vendor_id);
    const stage = clean(metadata.outreach_escalation_stage);
    if (!vendorId || (stage !== "initial_outreach" && stage !== "follow_up_due")) continue;
    const key = `${vendorId}:${taskId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    requests.push({
      vendorId,
      body: {
        contact_method: validMethod(metadata.vendor_contact_method),
        follow_up_due_at: nextFollowUpDueAt(stage, nowIso),
        thread_id: clean(metadata.vendor_contact_thread_id) ?? clean(sendInput.thread_id),
        receipt_ref: clean(metadata.vendor_contact_receipt_ref) ?? savedMessageId,
        notes: clean(record(sendInput.content).title) ?? clean(metadata.outreach_vendor_label),
      },
    });
  }

  return requests;
}

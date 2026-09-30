// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { safeWeddingLabel, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function timestampOrNow(value: string | null | undefined): string {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();
  return Number.isFinite(Date.parse(raw)) ? raw : new Date().toISOString();
}

export function weddingVendorOutreachThreadId(input: {
  responseWorkspaceId: string;
  choiceId: string;
}): string {
  return `wedding_vendor_outreach:${safeWeddingLabel(input.responseWorkspaceId)}:${safeWeddingLabel(input.choiceId)}`;
}

export function weddingVendorOutreachDraftAfpSendInput(input: {
  flow: WeddingVendorOutreachFlowState;
  metadata: WeddingPlanningMetadata;
  sourceArtifactId?: string | null;
  vendorId?: string | null;
  editorHtml?: string | null;
  createdAt?: string | null;
}): SendAfpMessageInput {
  const timestamp = timestampOrNow(input.createdAt);
  const threadId = weddingVendorOutreachThreadId({
    responseWorkspaceId: input.metadata.responseWorkspaceId,
    choiceId: input.flow.choiceId,
  });
  const to = clean(input.flow.recipientEmail ?? "");
  const subject = clean(input.flow.subject);
  const text = clean(input.flow.bodyMarkdown);
  const html = clean(input.editorHtml ?? "");
  const id = `afp-${safeWeddingLabel(threadId)}-draft-${safeWeddingLabel(timestamp)}`;
  return {
    thread_id: threadId,
    from: "agent://wedding-planning",
    to: ["user://couple", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "email_draft",
    kind: "wedding_vendor_outreach_draft",
    subtype: "wedding_vendor_outreach_draft",
    content: {
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      vendor_label: input.flow.vendorName,
      vendor_id: input.vendorId ?? null,
      choice_id: input.flow.choiceId,
      grounded_on: input.flow.groundedOnLabels,
      source_artifact_id: input.sourceArtifactId ?? null,
    },
    views: [{
      format: "email",
      content: { to, subject, text, ...(html ? { html } : {}) },
    }],
    attachments: [],
    references: input.sourceArtifactId
      ? [{ type: "wedding_vendor_search_artifact", target: input.sourceArtifactId, label: "Vendor search result" }]
      : [],
    supertags: uniqueStrings([
      ...input.metadata.supertags,
      "wedding_vendor_outreach",
      "wedding_email_draft",
    ]),
    metadata: {
      id,
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      choice_id: input.flow.choiceId,
      vendor_id: input.vendorId ?? null,
      vendor_label: input.flow.vendorName,
    },
    store_in_relational: true,
  };
}

export function weddingVendorOutreachSentAfpSendInput(input: {
  flow: WeddingVendorOutreachFlowState;
  metadata: WeddingPlanningMetadata;
  draftMessageId: string;
  providerReceipt: { providerMessageId: string | null; clientMessageId: string | null };
  vendorId?: string | null;
  createdAt?: string | null;
}): SendAfpMessageInput {
  const timestamp = timestampOrNow(input.createdAt);
  const threadId = weddingVendorOutreachThreadId({
    responseWorkspaceId: input.metadata.responseWorkspaceId,
    choiceId: input.flow.choiceId,
  });
  const to = clean(input.flow.recipientEmail ?? "");
  const subject = clean(input.flow.subject);
  const text = clean(input.flow.bodyMarkdown);
  return {
    thread_id: threadId,
    parent_id: input.draftMessageId,
    from: "agent://wedding-planning",
    to: ["user://couple", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "email",
    kind: "wedding_vendor_outreach_sent",
    subtype: "wedding_vendor_outreach_sent",
    content: {
      to,
      subject,
      text,
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      vendor_label: input.flow.vendorName,
      vendor_id: input.vendorId ?? null,
      choice_id: input.flow.choiceId,
      provider: "gmail",
      provider_message_id: input.providerReceipt.providerMessageId,
      client_message_id: input.providerReceipt.clientMessageId,
      sent_at: timestamp,
    },
    views: [{
      format: "email",
      content: { to, subject, text },
    }],
    attachments: [],
    references: [{ type: "wedding_vendor_outreach_draft", target: input.draftMessageId, label: "Outreach draft" }],
    supertags: uniqueStrings([
      ...input.metadata.supertags,
      "wedding_vendor_outreach",
      "delivery_confirmed",
    ]),
    metadata: {
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      vendor_contact_thread_id: threadId,
      vendor_contact_receipt_ref: input.providerReceipt.clientMessageId,
      approval_mode: "explicit_user_send",
    },
    store_in_relational: true,
  };
}

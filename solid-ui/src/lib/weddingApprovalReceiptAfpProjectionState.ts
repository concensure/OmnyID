// @locs-version: 2.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import type { WeddingSemanticUiObject } from "@/lib/weddingSemanticUiState";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(clean).filter((item): item is string => item !== null)
    : [];
}

function firstStringArray(...values: readonly unknown[]): string[] {
  for (const value of values) {
    const items = stringArray(value);
    if (items.length > 0) return items;
  }
  return [];
}

function durableReceiptId(receipt: WeddingApprovalReceiptState): string | null {
  return clean(receipt.metadata.external_id)
    || clean(receipt.metadata.provider_receipt_id)
    || clean(receipt.metadata.provider_message_id)
    || clean(receipt.metadata.message_id);
}

function hasDurableExternalDeliveryProof(receipt: WeddingApprovalReceiptState): boolean {
  return Boolean(durableReceiptId(receipt))
    && receipt.metadata.external_delivery_performed === true
    && receipt.metadata.missing_durable_provider_receipt !== true
    && receipt.metadata.provider_result_ok !== false;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function uniqueStrings(values: readonly unknown[], limit = 64): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function markdownFor(receipt: WeddingApprovalReceiptState): string {
  const blockedReason = clean(receipt.metadata.blocked_reason);
  const blockKind = clean(receipt.metadata.block_kind);
  const externalId = clean(receipt.metadata.external_id);
  const providerReceiptId = clean(receipt.metadata.provider_receipt_id);
  const provider = clean(receipt.metadata.provider);
  const providerMessageId = clean(receipt.metadata.provider_message_id);
  const messageId = clean(receipt.metadata.message_id);
  const clientMessageId = clean(receipt.metadata.client_message_id);
  const executionMode = clean(receipt.metadata.execution_mode);
  const providerCapability = clean(receipt.metadata.provider_capability);
  const requiredProvider = clean(receipt.metadata.required_provider);
  const providerCredentialStatus = clean(receipt.metadata.provider_credential_status);
  const providerExecutorStatus = clean(receipt.metadata.provider_executor_status);
  const providerSetupView = clean(receipt.metadata.provider_setup_view);
  const delivery = record(receipt.metadata.delivery);
  const deliveryChannel = clean(delivery.channel) || clean(receipt.metadata.delivery_channel);
  const deliverySubject = clean(delivery.subject) || clean(receipt.metadata.delivery_subject);
  const deliveryThreadId = clean(delivery.threadId) || clean(receipt.metadata.delivery_thread_id);
  const deliveryInReplyTo = clean(delivery.inReplyTo) || clean(receipt.metadata.delivery_in_reply_to);
  const deliveryRecipients = firstStringArray(delivery.to, delivery.recipients, receipt.metadata.delivery_recipients);
  const deliveryReferences = firstStringArray(delivery.references, receipt.metadata.delivery_references);
  const hasProviderContext = Boolean(
    executionMode
      || providerCapability
      || provider
      || providerReceiptId
      || providerMessageId
      || messageId
      || clientMessageId
      || requiredProvider
      || providerCredentialStatus
      || providerExecutorStatus
      || providerSetupView
      || receipt.metadata.external_provider_required === true,
  );
  const hasDeliveryContext = Boolean(
    deliveryChannel
      || deliverySubject
      || deliveryThreadId
      || deliveryInReplyTo
      || deliveryRecipients.length > 0
      || deliveryReferences.length > 0,
  );
  return [
    `# ${receipt.title}`,
    "",
    `- Action: ${receipt.actionKind.replace(/_/g, " ")}`,
    `- Status: ${receipt.status}`,
    `- Created: ${receipt.createdAt}`,
    blockKind ? `- Block kind: ${blockKind.replace(/_/g, " ")}` : null,
    blockedReason ? `- Blocked reason: ${blockedReason}` : null,
    externalId ? `- External ID: ${externalId}` : null,
    providerReceiptId ? `- Provider receipt ID: ${providerReceiptId}` : null,
    messageId ? `- Message ID: ${messageId}` : null,
    hasProviderContext ? "" : null,
    hasProviderContext ? "## Connected app status" : null,
    hasProviderContext ? "" : null,
    provider ? `- Provider: ${provider}` : null,
    providerMessageId ? `- Provider message ID: ${providerMessageId}` : null,
    clientMessageId ? `- Local send ID: ${clientMessageId}` : null,
    executionMode ? `- Send mode: ${executionMode.replace(/_/g, " ")}` : null,
    providerCapability ? `- App type: ${providerCapability.replace(/_/g, " ")}` : null,
    requiredProvider ? `- Needed app: ${requiredProvider}` : null,
    providerCredentialStatus ? `- Sign-in status: ${providerCredentialStatus.replace(/_/g, " ")}` : null,
    providerExecutorStatus ? `- App action status: ${providerExecutorStatus.replace(/_/g, " ")}` : null,
    providerSetupView ? `- Setup page: ${providerSetupView.replace(/_/g, " ")}` : null,
    receipt.metadata.external_provider_required === true ? "- Connected app needed: yes" : null,
    receipt.metadata.provider_executor_connected === true ? "- Connected app active: yes" : null,
    receipt.metadata.provider_executor_connected === false ? "- Connected app active: no" : null,
    hasDeliveryContext ? "" : null,
    hasDeliveryContext ? "## Delivery context" : null,
    hasDeliveryContext ? "" : null,
    deliveryChannel ? `- Channel: ${deliveryChannel}` : null,
    deliverySubject ? `- Subject: ${deliverySubject}` : null,
    deliveryThreadId ? `- Vendor thread: ${deliveryThreadId}` : null,
    deliveryInReplyTo ? `- In reply to: ${deliveryInReplyTo}` : null,
    deliveryReferences.length > 0 ? `- Delivery references: ${deliveryReferences.join(", ")}` : null,
    deliveryRecipients.length > 0 ? `- Recipient${deliveryRecipients.length === 1 ? "" : "s"}: ${deliveryRecipients.join(", ")}` : null,
    "",
    "## Disclosure",
    "",
    ...(receipt.disclosureLines.length > 0
      ? receipt.disclosureLines.map((line) => `- ${line}`)
      : ["- No disclosure lines recorded."]),
    "",
    "## Risks",
    "",
    ...(receipt.riskLabels.length > 0
      ? receipt.riskLabels.map((line) => `- ${line}`)
      : ["- No risk labels recorded."]),
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function weddingApprovalReceiptDeliveryThreadId(
  receipt: Pick<WeddingApprovalReceiptState, "metadata">,
): string | null {
  const delivery = record(receipt.metadata.delivery);
  return clean(receipt.metadata.delivery_thread_id) || clean(delivery.threadId) || null;
}

function semanticObjectForApprovalReceipt(receipt: WeddingApprovalReceiptState): WeddingSemanticUiObject {
  const blocked = receipt.status !== "executed";
  const providerNeeded = receipt.metadata.external_provider_required === true
    || clean(receipt.metadata.provider_executor_status) === "missing"
    || clean(receipt.metadata.provider_credential_status) === "missing";
  const actionLabel = receipt.actionKind.replace(/_/g, " ");
  return {
    id: `semantic:wedding_approval_receipt:${safeWeddingLabel(receipt.id)}`,
    kind: blocked || providerNeeded ? "wedding_approval_required" : "wedding_active_loop",
    title: receipt.title,
    stateLabel: blocked ? "Blocked" : providerNeeded ? "Needs connected app" : "Approved",
    tone: blocked || providerNeeded ? "action" : "status",
    summary: blocked
      ? clean(receipt.metadata.blocked_reason) ?? `The ${actionLabel} action needs attention before it can run.`
      : providerNeeded
        ? `The ${actionLabel} action is approved, but a connected app still needs setup before it can run automatically.`
        : `The ${actionLabel} action has been approved and recorded.`,
    comparison: null,
    actions: [{
      label: blocked ? "Review approval" : providerNeeded ? "Open connected apps" : "View receipt",
      kind: blocked ? "review_wedding_approval" : providerNeeded ? "open_connected_apps" : "view_wedding_receipt",
      enabled: true,
      targetMenu: providerNeeded ? "plan" : "response_queue",
    }],
    semanticTags: uniqueStrings([
      blocked || providerNeeded ? "wedding_approval_required" : "wedding_active_loop",
      "wedding_approval_receipt",
      `approval_action:${safeWeddingLabel(receipt.actionKind)}`,
      `approval_status:${receipt.status}`,
      providerNeeded ? "wedding_provider_setup_needed" : null,
      clean(receipt.metadata.block_kind),
      clean(receipt.metadata.provider_capability),
      ...receipt.riskLabels,
    ], 16),
  };
}

export function weddingApprovalReceiptToAfpMessage(
  receipt: WeddingApprovalReceiptState,
): AfpMessage {
  const weddingPlanId = clean(receipt.metadata.wedding_plan_id);
  const responseWorkspaceId = clean(receipt.metadata.response_workspace_id);
  const sourceResponseId = clean(receipt.metadata.source_response_id);
  const artifactIds = stringArray(receipt.metadata.artifact_ids);
  const scheduleItemIds = stringArray(receipt.metadata.schedule_item_ids);
  const taskItemIds = stringArray(receipt.metadata.task_item_ids);
  const blockKind = clean(receipt.metadata.block_kind);
  const providerCapability = clean(receipt.metadata.provider_capability);
  const requiredProvider = clean(receipt.metadata.required_provider);
  const providerCredentialStatus = clean(receipt.metadata.provider_credential_status);
  const providerExecutorStatus = clean(receipt.metadata.provider_executor_status);
  const providerSetupView = clean(receipt.metadata.provider_setup_view);
  const executionMode = clean(receipt.metadata.execution_mode);
  const providerResultOk = optionalBoolean(receipt.metadata.provider_result_ok);
  const externalDeliveryPerformed = optionalBoolean(receipt.metadata.external_delivery_performed);
  const missingDurableProviderReceipt = optionalBoolean(receipt.metadata.missing_durable_provider_receipt);
  const provider = clean(receipt.metadata.provider);
  const providerReceiptId = clean(receipt.metadata.provider_receipt_id);
  const providerMessageId = clean(receipt.metadata.provider_message_id);
  const messageId = clean(receipt.metadata.message_id);
  const clientMessageId = clean(receipt.metadata.client_message_id);
  const recipient = clean(receipt.metadata.recipient);
  const subject = clean(receipt.metadata.subject);
  const threadId = clean(receipt.metadata.thread_id);
  const delivery = record(receipt.metadata.delivery);
  const deliveryChannel = clean(delivery.channel) || clean(receipt.metadata.delivery_channel);
  const deliverySubject = clean(delivery.subject) || clean(receipt.metadata.delivery_subject);
  const deliveryThreadId = clean(delivery.threadId) || clean(receipt.metadata.delivery_thread_id);
  const deliveryInReplyTo = clean(delivery.inReplyTo) || clean(receipt.metadata.delivery_in_reply_to);
  const deliveryRecipients = firstStringArray(delivery.to, delivery.recipients, receipt.metadata.delivery_recipients);
  const deliveryReferences = firstStringArray(delivery.references, receipt.metadata.delivery_references);
  const markdown = markdownFor(receipt);
  const semanticObject = semanticObjectForApprovalReceipt(receipt);
  return {
    id: `afp-${receipt.id}`,
    thread_id: `wedding_approval:${safeWeddingLabel(responseWorkspaceId ?? receipt.requestId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://search"],
    timestamp: receipt.createdAt,
    type: "approval_receipt",
    kind: "receipt",
    subtype: "wedding_approval_receipt",
    supertags: uniqueStrings([
      "template:wedding_planning",
      "event:wedding",
      "wedding_approval_receipt",
      `approval_action:${safeWeddingLabel(receipt.actionKind)}`,
      `approval_status:${receipt.status}`,
      providerCapability ? `provider_capability:${safeWeddingLabel(providerCapability)}` : null,
      providerExecutorStatus ? `provider_executor:${safeWeddingLabel(providerExecutorStatus)}` : null,
      weddingPlanId,
      responseWorkspaceId,
    ]),
    content: {
      kind: "wedding_approval_receipt",
      receipt_id: receipt.id,
      request_id: receipt.requestId,
      action_kind: receipt.actionKind,
      title: receipt.title,
      status: receipt.status,
      created_at: receipt.createdAt,
      markdown,
      disclosure_lines: receipt.disclosureLines,
      risk_labels: receipt.riskLabels,
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      source_response_id: sourceResponseId,
      artifact_ids: artifactIds,
      schedule_item_ids: scheduleItemIds,
      task_item_ids: taskItemIds,
      blocked_reason: clean(receipt.metadata.blocked_reason),
      block_kind: blockKind,
      external_id: clean(receipt.metadata.external_id),
      provider,
      provider_receipt_id: providerReceiptId,
      provider_message_id: providerMessageId,
      message_id: messageId,
      client_message_id: clientMessageId,
      recipient,
      subject,
      thread_id: threadId,
      delivery_channel: deliveryChannel,
      delivery_subject: deliverySubject,
      delivery_thread_id: deliveryThreadId,
      delivery_in_reply_to: deliveryInReplyTo,
      delivery_references: deliveryReferences,
      delivery_recipients: deliveryRecipients,
      execution_mode: executionMode,
      provider_capability: providerCapability,
      provider_result_ok: providerResultOk,
      external_delivery_performed: externalDeliveryPerformed,
      missing_durable_provider_receipt: missingDurableProviderReceipt,
      required_provider: requiredProvider,
      provider_credential_status: providerCredentialStatus,
      provider_executor_status: providerExecutorStatus,
      provider_executor_connected: receipt.metadata.provider_executor_connected === true,
      provider_setup_view: providerSetupView,
      external_provider_required: receipt.metadata.external_provider_required === true,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticObject.semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_approval_receipt_to_afp",
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      source_response_id: sourceResponseId,
      receipt_id: receipt.id,
      request_id: receipt.requestId,
      action_kind: receipt.actionKind,
      approval_status: receipt.status,
      block_kind: blockKind,
      provider,
      provider_receipt_id: providerReceiptId,
      provider_message_id: providerMessageId,
      message_id: messageId,
      client_message_id: clientMessageId,
      delivery_channel: deliveryChannel,
      delivery_subject: deliverySubject,
      delivery_thread_id: deliveryThreadId,
      delivery_in_reply_to: deliveryInReplyTo,
      delivery_references: deliveryReferences,
      delivery_recipients: deliveryRecipients,
      execution_mode: executionMode,
      provider_capability: providerCapability,
      provider_result_ok: providerResultOk,
      external_delivery_performed: externalDeliveryPerformed,
      missing_durable_provider_receipt: missingDurableProviderReceipt,
      required_provider: requiredProvider,
      provider_credential_status: providerCredentialStatus,
      provider_executor_status: providerExecutorStatus,
      provider_executor_connected: receipt.metadata.provider_executor_connected === true,
      provider_setup_view: providerSetupView,
      external_provider_required: receipt.metadata.external_provider_required === true,
      artifact_ids: artifactIds,
      schedule_item_ids: scheduleItemIds,
      task_item_ids: taskItemIds,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticObject.semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
      searchable_terms: uniqueStrings([
        receipt.id,
        receipt.requestId,
        receipt.actionKind,
        receipt.title,
        receipt.status,
        blockKind,
        provider,
        providerReceiptId,
        providerMessageId,
        messageId,
        clientMessageId,
        recipient,
        subject,
        threadId,
        deliveryChannel,
        deliverySubject,
        deliveryThreadId,
        deliveryInReplyTo,
        ...deliveryRecipients,
        ...deliveryReferences,
        executionMode,
        providerCapability,
        requiredProvider,
        providerCredentialStatus,
        providerExecutorStatus,
        providerSetupView,
        receipt.metadata.provider_executor_connected === true ? "provider executor connected" : "provider executor not connected",
        receipt.metadata.external_provider_required === true ? "external provider required" : null,
        weddingPlanId,
        responseWorkspaceId,
        sourceResponseId,
        ...receipt.disclosureLines,
        ...receipt.riskLabels,
        ...artifactIds,
        ...scheduleItemIds,
        ...taskItemIds,
      ], 96),
    },
    views: [{
      format: "document",
      priority: 1,
      content: {
        receipt_id: receipt.id,
        title: receipt.title,
        markdown,
        semantic_object: semanticObject,
        semantic_objects: [semanticObject],
      },
    }],
    attachments: [],
    references: [
      sourceResponseId ? { type: "wedding_response", target: sourceResponseId, label: "Source response" } : null,
      ...artifactIds.map((artifactId) => ({ type: "wedding_artifact", target: artifactId, label: "Approved artifact" })),
      ...scheduleItemIds.map((itemId) => ({ type: "wedding_calendar_event", target: itemId, label: "Approved schedule item" })),
      ...taskItemIds.map((taskId) => ({ type: "wedding_task", target: taskId, label: "Approved task" })),
    ].filter((value): value is NonNullable<typeof value> => Boolean(value)),
  };
}

export function weddingApprovalReceiptToAfpSendInput(
  receipt: WeddingApprovalReceiptState,
): SendAfpMessageInput {
  const message = weddingApprovalReceiptToAfpMessage(receipt);
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function weddingApprovalReceiptToVendorThreadAfpSendInput(
  receipt: WeddingApprovalReceiptState,
  input: {
    threadId: string;
    parentId?: string | null;
  },
): SendAfpMessageInput | null {
  const threadId = clean(input.threadId);
  if (!threadId) return null;
  if (receipt.status !== "executed") return null;
  if (receipt.actionKind !== "send_email") return null;
  if (!hasDurableExternalDeliveryProof(receipt)) return null;
  const message = weddingApprovalReceiptToAfpMessage(receipt);
  return {
    thread_id: threadId,
    parent_id: input.parentId ?? null,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: {
      ...message.content,
      vendor_thread_id: threadId,
    },
    views: message.views,
    attachments: message.attachments,
    references: [
      ...(message.references ?? []),
      { type: "wedding_vendor_thread", target: threadId, label: "Vendor conversation" },
    ],
    supertags: uniqueStrings([
      ...(message.supertags ?? []),
      "wedding_vendor_thread_receipt",
      threadId,
    ]),
    metadata: {
      ...(message.metadata ?? {}),
      projection: "wedding_approval_receipt_to_vendor_thread_afp",
      vendor_thread_id: threadId,
      searchable_terms: uniqueStrings([
        ...stringArray(message.metadata?.searchable_terms),
        "vendor conversation receipt",
        threadId,
      ], 96),
    },
    store_in_relational: true,
  };
}

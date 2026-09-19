// @locs-version: 2.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
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
  const executionMode = clean(receipt.metadata.execution_mode);
  const providerCapability = clean(receipt.metadata.provider_capability);
  const requiredProvider = clean(receipt.metadata.required_provider);
  const providerCredentialStatus = clean(receipt.metadata.provider_credential_status);
  const providerExecutorStatus = clean(receipt.metadata.provider_executor_status);
  const providerSetupView = clean(receipt.metadata.provider_setup_view);
  const hasProviderContext = Boolean(
    executionMode
      || providerCapability
      || requiredProvider
      || providerCredentialStatus
      || providerExecutorStatus
      || providerSetupView
      || receipt.metadata.external_provider_required === true,
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
    hasProviderContext ? "" : null,
    hasProviderContext ? "## Provider handoff" : null,
    hasProviderContext ? "" : null,
    executionMode ? `- Execution mode: ${executionMode.replace(/_/g, " ")}` : null,
    providerCapability ? `- Capability: ${providerCapability.replace(/_/g, " ")}` : null,
    requiredProvider ? `- Required provider: ${requiredProvider}` : null,
    providerCredentialStatus ? `- Credential status: ${providerCredentialStatus.replace(/_/g, " ")}` : null,
    providerExecutorStatus ? `- Executor status: ${providerExecutorStatus.replace(/_/g, " ")}` : null,
    providerSetupView ? `- Setup destination: ${providerSetupView.replace(/_/g, " ")}` : null,
    receipt.metadata.external_provider_required === true ? "- External provider required: yes" : null,
    receipt.metadata.provider_executor_connected === true ? "- Provider executor connected: yes" : null,
    receipt.metadata.provider_executor_connected === false ? "- Provider executor connected: no" : null,
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
  const markdown = markdownFor(receipt);
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
      execution_mode: executionMode,
      provider_capability: providerCapability,
      required_provider: requiredProvider,
      provider_credential_status: providerCredentialStatus,
      provider_executor_status: providerExecutorStatus,
      provider_executor_connected: receipt.metadata.provider_executor_connected === true,
      provider_setup_view: providerSetupView,
      external_provider_required: receipt.metadata.external_provider_required === true,
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
      execution_mode: executionMode,
      provider_capability: providerCapability,
      required_provider: requiredProvider,
      provider_credential_status: providerCredentialStatus,
      provider_executor_status: providerExecutorStatus,
      provider_executor_connected: receipt.metadata.provider_executor_connected === true,
      provider_setup_view: providerSetupView,
      external_provider_required: receipt.metadata.external_provider_required === true,
      artifact_ids: artifactIds,
      schedule_item_ids: scheduleItemIds,
      task_item_ids: taskItemIds,
      searchable_terms: uniqueStrings([
        receipt.id,
        receipt.requestId,
        receipt.actionKind,
        receipt.title,
        receipt.status,
        blockKind,
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
    metadata: message.metadata,
    store_in_relational: true,
  };
}

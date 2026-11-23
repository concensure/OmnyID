// @locs-version: 2.0
import {
  buildWeddingApprovalRequestState,
  buildWeddingIntegrationReadinessState,
  type WeddingApprovalActionKind,
  type WeddingApprovalRequestState,
  type WeddingIntegrationReadinessState,
} from "@/lib/weddingApprovalState";
import type {
  WeddingOutreachEscalationOption,
  WeddingOutreachEscalationState,
} from "@/lib/weddingOutreachEscalationState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingOutreachEscalationApprovalSelectionState =
  | {
    kind: "approval_request";
    option: WeddingOutreachEscalationOption;
    request: WeddingApprovalRequestState;
    readiness: WeddingIntegrationReadinessState;
    disclosureLines: string[];
    riskLabels: string[];
  }
  | {
    kind: "local_decision";
    option: WeddingOutreachEscalationOption;
    title: string;
    canExecute: true;
    disclosureLines: string[];
    riskLabels: string[];
    metadata: Record<string, unknown>;
  }
  | {
    kind: "unavailable";
    optionId: string;
    title: string;
    canExecute: false;
    disclosureLines: string[];
    riskLabels: string[];
    metadata: Record<string, unknown>;
  };

export type WeddingOutreachEscalationApprovalSelectionInput = {
  escalation: WeddingOutreachEscalationState;
  optionId: string;
  recipients?: readonly string[] | null;
  externalProvider?: string | null;
  proposedMessage?: string | null;
  userApproved?: boolean | null;
};

const SEND_OPTION_ACTIONS: Partial<Record<WeddingOutreachEscalationOption["id"], WeddingApprovalActionKind>> = {
  send_initial: "contact_vendor",
  send_one_follow_up: "contact_vendor",
  follow_up_again: "contact_vendor",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function sendOptionTitle(option: WeddingOutreachEscalationOption, escalation: WeddingOutreachEscalationState): string {
  if (option.id === "send_initial") return `Approve initial outreach to ${escalation.vendorLabel}`;
  if (option.id === "send_one_follow_up") return `Approve one follow-up to ${escalation.vendorLabel}`;
  if (option.id === "follow_up_again") return `Approve final follow-up to ${escalation.vendorLabel}`;
  return option.label;
}

function localDecisionTitle(option: WeddingOutreachEscalationOption, escalation: WeddingOutreachEscalationState): string {
  if (option.id === "move_on") return `Move on from ${escalation.vendorLabel}`;
  if (option.id === "call_vendor") return `Call ${escalation.vendorLabel}`;
  if (option.id === "suggest_alternatives") return `Mark ${escalation.vendorLabel} unresponsive`;
  return option.label;
}

function localRiskLabels(option: WeddingOutreachEscalationOption): string[] {
  if (option.id === "call_vendor") {
    return [
      "Manual call only; no vendor message is sent by OmnyID.",
      "Record the outcome after the call so DecisionOS can close or continue the loop.",
    ];
  }
  if (option.id === "suggest_alternatives") {
    return [
      "No external message is sent.",
      "The vendor is collapsed from the active shortlist and alternatives should be researched.",
    ];
  }
  if (option.id === "move_on") {
    return [
      "No external message is sent.",
      "Reports should use remaining selected vendors unless the user reopens this option.",
    ];
  }
  return ["No external provider action is required."];
}

export function buildWeddingOutreachEscalationApprovalSelectionState(
  input: WeddingOutreachEscalationApprovalSelectionInput,
): WeddingOutreachEscalationApprovalSelectionState {
  const option = input.escalation.options.find((candidate) => candidate.id === input.optionId);
  const metadata = normalizeWeddingPlanningMetadata({
    ...input.escalation.metadata,
    outreach_escalation_stage: input.escalation.stage,
    outreach_selected_option_id: input.optionId,
    vendor_label: input.escalation.vendorLabel,
    second_order_loop: "contact_follow_up",
    no_spam_policy: true,
  });

  if (!option) {
    return {
      kind: "unavailable",
      optionId: input.optionId,
      title: "Outreach option unavailable",
      canExecute: false,
      disclosureLines: [
        `Option ${input.optionId} is not available at the ${input.escalation.stage.replace(/_/g, " ")} stage.`,
      ],
      riskLabels: ["Refresh the outreach escalation state before taking action."],
      metadata,
    };
  }

  const actionKind = SEND_OPTION_ACTIONS[option.id];
  if (actionKind) {
    const request = buildWeddingApprovalRequestState({
      id: `wedding_approval:outreach_escalation:${safeWeddingLabel(input.escalation.metadata.responseWorkspaceId)}:${safeWeddingLabel(input.escalation.vendorLabel)}:${safeWeddingLabel(option.id)}`,
      actionKind,
      title: sendOptionTitle(option, input.escalation),
      metadata,
      artifacts: input.escalation.generatedArtifact ? [input.escalation.generatedArtifact.summary] : [],
      taskItems: [input.escalation.taskItem],
      recipients: uniqueStrings(input.recipients ?? []),
      shareScope: "shared_vendor",
      externalProvider: clean(input.externalProvider) || null,
      proposedMessage: clean(input.proposedMessage) || input.escalation.decisionPrompt,
      decisionScopes: [{
        title: input.escalation.vendorLabel,
        detail: `${input.escalation.stageLabel}; ${option.description}`,
        artifactId: input.escalation.artifactInput.id,
        artifactTitle: input.escalation.artifactInput.title,
      }],
      userApproved: input.userApproved,
    });
    const readiness = buildWeddingIntegrationReadinessState(request);
    return {
      kind: "approval_request",
      option,
      request,
      readiness,
      disclosureLines: request.disclosureLines,
      riskLabels: uniqueStrings([
        ...request.riskLabels,
        "No-spam ladder: initial outreach, one day-5 follow-up, day-7 user escalation, day-10 unresponsive fallback.",
        option.id === "follow_up_again" ? "This is the final follow-up option before marking the vendor unresponsive." : null,
      ]),
    };
  }

  return {
    kind: "local_decision",
    option,
    title: localDecisionTitle(option, input.escalation),
    canExecute: true,
    disclosureLines: uniqueStrings([
      `Decision: ${option.label}`,
      `Vendor: ${input.escalation.vendorLabel}`,
      `Stage: ${input.escalation.stageLabel}`,
      input.escalation.vendorPhoneLabel ? `Phone: ${input.escalation.vendorPhoneLabel}` : null,
      option.description,
    ]),
    riskLabels: localRiskLabels(option),
    metadata: {
      ...metadata,
      local_decision_only: true,
      external_delivery_performed: false,
    },
  };
}

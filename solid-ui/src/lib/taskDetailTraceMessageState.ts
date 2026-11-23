// @locs-version: 1.0
import {
  approvalEventLabel,
  type ApprovalReviewLike,
  type AutonomyDecisionLike,
} from "afp-ts/continuity";
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  approvalMessageContent,
  approvalReviewForMessage,
  approvalStateRecord,
  approvalStateString,
  autonomyDecisionForMessage,
  simulatorApprovalReviewFromUnknown,
  simulatorPreviewDetailsFromUnknown,
  simulatorPreviewKindFromUnknown,
  simulatorPreviewLinesFromUnknown,
} from "@/lib/approvalReviewState";
import type { SimulatorPreviewKind } from "@/lib/simulatorPreviewCopy";
import { approvalReviewTrustBlockState } from "@/lib/approvalReviewSummaryState";
import { surfaceTimeLabel } from "@/lib/surfaceTimestampPresentation";

export type TraceMessageState = {
  approvalReview: ApprovalReviewLike | null;
  autonomyDecision: AutonomyDecisionLike | null;
  capabilityNameText: string | null;
  capabilityStatusText: string | null;
  descriptionText: string | null;
  fallbackReasonText: string | null;
  finalAnswerText: string | null;
  rationaleText: string | null;
  showApprovalPreviewBoundary: boolean;
  showApprovalProvenanceCue: boolean;
  showApprovalSelectionReason: boolean;
  showApprovalSourceSummary: boolean;
  showApprovalConsequencePreview: boolean;
  showCapabilityStatus: boolean;
  showDescriptionText: boolean;
  showFinalAnswerText: boolean;
  showFusionPreview: boolean;
  showRationaleText: boolean;
  showReversiblePreview: boolean;
  showSimulatorRolloutSummary: boolean;
  showSimulatorApprovalBadge: boolean;
  showSimulatorFusionBadge: boolean;
  showSimulatorReversibleBadge: boolean;
  simulatorDetails: ReturnType<typeof simulatorPreviewDetailsFromUnknown>;
  simulatorKind: SimulatorPreviewKind | null;
  simulatorLines: string[];
  stepBadgeClassName: string;
  timestampText: string;
  typeLabelText: string;
};

const MSG_TYPE_LABEL: Record<string, string> = {
  agent_plan: "Plan",
  agent_step: "Step",
  agent_result: "Result",
  agent_escalation: "Escalation",
  capability_invoke: "Invoke",
  capability_result: "Result",
  "agent:plan": "Plan",
  "agent:step": "Step",
  "agent:result": "Result",
  "agent:provisioned": "Provisioned",
  "agent:research_result": "Research Result",
  "agent:approval_request": approvalEventLabel("request"),
  "agent:approval_granted": approvalEventLabel("approved"),
  "agent:approval_rejected": approvalEventLabel("rejected"),
  "agent:conflict_detected": "Conflict",
  "agent:triage": "Triage",
  "agent:message": "Message",
  "agent:escalation": "Escalation",
  proactive_suggestion: "Suggestion",
};

function messageTypeKey(message: AfpMessage): string {
  return message.subtype ? `${message.type}:${message.subtype}` : message.type;
}

function stepBadgeColor(message: AfpMessage): string {
  const key = messageTypeKey(message);
  if (key === "agent:result" || key === "agent_result") return "bg-green-500/20 text-green-600";
  if (key === "agent:conflict_detected" || key === "agent_escalation") return "bg-red-500/20 text-red-400";
  if (key === "agent:escalation") return "bg-red-500/20 text-red-400";
  if (key === "agent:plan" || key === "agent_plan") return "bg-primary/20 text-primary";
  if (key === "agent:provisioned") return "bg-secondary/20 text-secondary";
  return "bg-white/10 text-on-surface-variant";
}

function simulatorApprovalReviewForMessage(message: AfpMessage): ApprovalReviewLike | null {
  return simulatorApprovalReviewFromUnknown(decryptedDisplayContent(message));
}

function messageContentRecord(message: AfpMessage): Record<string, unknown> | null {
  return approvalStateRecord(approvalMessageContent(message));
}

function normalizeTrustText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/[.]+$/g, "").toLowerCase();
}

export function traceMessageState(message: AfpMessage): TraceMessageState {
  const content = messageContentRecord(message);
  const displayContent = decryptedDisplayContent(message);
  const simulatorKind = simulatorPreviewKindFromUnknown(displayContent);
  const simulatorDetails = simulatorPreviewDetailsFromUnknown(displayContent);
  const simulatorLines = simulatorPreviewLinesFromUnknown(displayContent);
  const approvalReview =
    approvalReviewForMessage(message) ?? simulatorApprovalReviewForMessage(message);
  const autonomyDecision = autonomyDecisionForMessage(message);
  const rationaleText = approvalStateString(content?.rationale);
  const descriptionText = approvalStateString(content?.description);
  const finalAnswerText = approvalStateString(content?.final_answer);
  const capabilityNameText = approvalStateString(content?.capability_name);
  const capabilityStatusText = approvalStateString(content?.status);
  const fallbackReasonText =
    simulatorDetails.boundedReason ?? rationaleText ?? descriptionText ?? null;
  const approvalReviewTrust = approvalReviewTrustBlockState({
    approvalReview,
    autonomyDecision,
    fallbackReason: fallbackReasonText,
  });
  const showApprovalConsequencePreview =
    simulatorKind === "approval"
    && Boolean(simulatorDetails.consequencePreview)
    && normalizeTrustText(simulatorDetails.consequencePreview)
      !== normalizeTrustText(approvalReviewTrust.consequencePreview);
  const showApprovalProvenanceCue =
    simulatorKind === "approval"
    && Boolean(simulatorDetails.provenanceCue)
    && normalizeTrustText(simulatorDetails.provenanceCue)
      !== normalizeTrustText(approvalReviewTrust.provenanceCue);
  const showApprovalSourceSummary =
    simulatorKind === "approval"
    && Boolean(simulatorDetails.sourceSummary)
    && normalizeTrustText(simulatorDetails.sourceSummary)
      !== normalizeTrustText(approvalReviewTrust.sourceSummary);

  return {
    approvalReview,
    autonomyDecision,
    capabilityNameText,
    capabilityStatusText,
    descriptionText,
    fallbackReasonText,
    finalAnswerText,
    rationaleText,
    showApprovalPreviewBoundary:
      simulatorKind === "approval" && Boolean(simulatorDetails.previewBoundarySummary),
    showApprovalProvenanceCue,
    showApprovalSelectionReason:
      simulatorKind === "approval" && simulatorDetails.hasDistinctSelectionReason,
    showApprovalSourceSummary,
    showApprovalConsequencePreview,
    showCapabilityStatus: Boolean(capabilityStatusText),
    showDescriptionText: !simulatorKind && !rationaleText && Boolean(descriptionText),
    showFinalAnswerText: Boolean(finalAnswerText),
    showFusionPreview:
      simulatorKind === "fusion"
      && (
        Boolean(simulatorDetails.boundedReason)
        || simulatorLines.length > 0
        || Boolean(simulatorDetails.consequencePreview)
        || Boolean(simulatorDetails.provenanceCue)
        || Boolean(simulatorDetails.previewBoundarySummary)
        || Boolean(simulatorDetails.sourceSummary)
      ),
    showRationaleText: !simulatorKind && Boolean(rationaleText),
    showReversiblePreview:
      simulatorKind === "reversible" && simulatorLines.length > 0,
    showSimulatorRolloutSummary: Boolean(simulatorDetails.rolloutSummary),
    showSimulatorApprovalBadge: simulatorKind === "approval",
    showSimulatorFusionBadge: simulatorKind === "fusion",
    showSimulatorReversibleBadge: simulatorKind === "reversible",
    simulatorDetails,
    simulatorKind,
    simulatorLines,
    stepBadgeClassName: stepBadgeColor(message),
    timestampText: surfaceTimeLabel(message.timestamp) || message.timestamp,
    typeLabelText:
      MSG_TYPE_LABEL[messageTypeKey(message)] ?? MSG_TYPE_LABEL[message.type] ?? messageTypeKey(message),
  };
}

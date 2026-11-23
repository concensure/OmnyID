// @locs-version: 2.0
import type { WeddingBoundaryState } from "@/lib/weddingBoundaryLedgerState";
import type { WeddingBoundaryTopologyNode, WeddingBoundaryTopologyState } from "@/lib/weddingBoundaryTopologyState";

export type WeddingBoundaryManagementViewState = {
  includeText: string;
  excludeText: string;
  approvalItems: WeddingBoundaryManagementListItem[];
  ruleItems: WeddingBoundaryManagementListItem[];
  visibilityItems: WeddingBoundaryManagementListItem[];
  privateItemsLabel: string | null;
  hasApprovalItems: boolean;
  hasRules: boolean;
  hasVisibilityItems: boolean;
};

export type WeddingBoundaryManagementListItem = {
  id: string;
  label: string;
  detail: string;
};

export function visibleWeddingBoundaryApprovalItems(
  items: readonly WeddingBoundaryManagementListItem[],
  completedRequestIds?: Readonly<Record<string, boolean>> | null,
): WeddingBoundaryManagementListItem[] {
  const completed = completedRequestIds ?? {};
  return items.filter((item) => completed[item.id] !== true);
}

export function visibleWeddingBoundaryApprovalCount(
  requestIds: readonly string[],
  completedRequestIds?: Readonly<Record<string, boolean>> | null,
): number {
  const completed = completedRequestIds ?? {};
  return requestIds.filter((id) => completed[id] !== true).length;
}

export function weddingBoundaryDecisionNoticeFromError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/no longer waiting|already/i.test(message)) {
    return "That request was already handled. Refresh the wedding planner to see the latest guest-list state.";
  }
  if (/saving is not connected|sign in|reconnect/i.test(message)) {
    return "Saving is not connected right now. Sign in again or reconnect saving, then try once more.";
  }
  return "Could not save that decision right now. Try again in a moment.";
}

export function weddingBoundaryDraftSaveUnavailableNotice(kind: "request" | "rule"): string {
  return kind === "request"
    ? "This family request is ready to review, but saving is not connected right now. Sign in or reconnect saving to keep it with this wedding."
    : "This family rule is ready, but saving is not connected right now. Sign in or reconnect saving to keep it with this wedding.";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function displayList(values: readonly string[], fallback: string): string {
  const cleaned = values.map(text).filter(Boolean);
  if (cleaned.length === 0) return fallback;
  if (cleaned.length <= 3) return cleaned.join(", ");
  return `${cleaned.slice(0, 3).join(", ")} and ${cleaned.length - 3} more`;
}

function words(value: unknown, fallback: string): string {
  const cleaned = text(value);
  return cleaned ? cleaned.replace(/_/g, " ") : fallback;
}

function sentence(value: unknown, fallback: string): string {
  const label = words(value, fallback);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function personLabel(value: unknown): string {
  const cleaned = text(value).replace(/^person:/i, "").replace(/[_-]+/g, " ").trim();
  return cleaned || "a helper";
}

function nodeDetail(node: WeddingBoundaryTopologyNode): string {
  if (node.kind === "boundary_policy") {
    return text(node.metadata.plain_language) || `Handled as ${words(node.metadata.enforcement, "a wedding rule")}.`;
  }
  if (node.kind === "boundary_role") {
    return `Can see ${displayList(Array.isArray(node.metadata.can_view) ? node.metadata.can_view : [], "approved wedding details")}.`;
  }
  if (node.kind === "guest") {
    return `Guest profile is ${words(node.metadata.visibility, "shared carefully")}.`;
  }
  return "Shown only where the current permissions allow it.";
}

export function buildWeddingBoundaryManagementViewState(input: {
  state: WeddingBoundaryState;
  topology: WeddingBoundaryTopologyState;
}): WeddingBoundaryManagementViewState {
  const policyNodes = input.topology.nodes.filter((node) => node.kind === "boundary_policy");
  const roleNodes = input.topology.nodes.filter((node) => node.kind === "boundary_role");
  const guestNodes = input.topology.nodes.filter((node) => node.kind === "guest");
  const visibleRoleLabels = roleNodes.map((node) => node.label);
  const visibleGuestLabels = guestNodes.map((node) => node.label);
  const ruleLabels = policyNodes.map((node) => node.label);
  const hasPrivateSignals = input.state.privateObjectCount > 0
    || input.topology.nodes.some((node) => (
      node.supertags.includes("wedding_boundary:couple_only")
      || node.metadata.private_rationale_encrypted === true
      || node.metadata.private_notes_encrypted === true
    ));
  const includeText = displayList([
    ...visibleGuestLabels.slice(0, 4),
    ...visibleRoleLabels.slice(0, 3),
  ], "Named guests, assigned helpers, and approved family viewers");
  const excludeText = displayList([
    hasPrivateSignals ? "private couple notes" : null,
    ...ruleLabels.filter((label) => /plus|child|private|family/i.test(label)).slice(0, 3),
  ].filter((value): value is string => Boolean(value)), "Extra plus-ones, private notes, and couple-only reasons");

  return {
    includeText,
    excludeText,
    approvalItems: input.state.approvalQueue.slice(0, 8).map((request) => ({
      id: request.requestId,
      label: request.title,
      detail: `${sentence(request.changeType, "Guest-list change")} from ${personLabel(request.requestedBy)}${request.publicReason ? `: ${request.publicReason}` : "."}`,
    })),
    ruleItems: policyNodes.slice(0, 8).map((node) => ({
      id: node.id,
      label: node.label,
      detail: nodeDetail(node),
    })),
    visibilityItems: [...roleNodes, ...guestNodes].slice(0, 16).map((node) => ({
      id: node.id,
      label: node.label,
      detail: node.kind === "boundary_role" ? words(node.metadata.role, "helper") : nodeDetail(node),
    })),
    privateItemsLabel: input.state.privateObjectCount > 0
      ? `${input.state.privateObjectCount} private item${input.state.privateObjectCount === 1 ? "" : "s"} stay visible only to the couple.`
      : hasPrivateSignals
        ? "Private notes and reasons stay visible only to the couple."
        : null,
    hasApprovalItems: input.state.approvalQueue.length > 0,
    hasRules: policyNodes.length > 0,
    hasVisibilityItems: roleNodes.length > 0 || guestNodes.length > 0,
  };
}

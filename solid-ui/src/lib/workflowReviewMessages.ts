// @locs-version: 1.0
import type {
  CompiledAfpGapFilter,
  CompiledAfpReadinessFocus,
  CompiledOrchestrationRole,
} from "@/lib/workflowGraphTypes";

export function unavailableReviewTargetMessage(kind: "compiled_route" | "compiled_manifest" | "branch_edge" | "compiled_target"): string {
  if (kind === "compiled_route") {
    return "No matching compiled route is available for this review mode yet.";
  }
  if (kind === "compiled_manifest") {
    return "No matching compiled manifest is available for this review mode yet.";
  }
  if (kind === "branch_edge") {
    return "No matching traced branch edge is available for this review mode yet.";
  }
  return "No matching compiled review target is available for this review mode yet.";
}

export function availableReviewTargetMessage(kind: "compiled_route" | "compiled_manifest" | "branch_edge" | "contract_focus"): string {
  if (kind === "compiled_route") {
    return "Open the matching compiled route review target for this review mode.";
  }
  if (kind === "compiled_manifest") {
    return "Open the matching compiled manifest review target for this review mode.";
  }
  if (kind === "branch_edge") {
    return "Open the matching traced branch edge for this review mode.";
  }
  return "Open the current contract-focus target for this review mode.";
}

export function clearReviewFocusMessage(kind: "manifest_health" | "afp_route" | "route_linkage" | "combined_canvas" | "compiled_manifest" | "compiled_route" | "review_health" | "contract_focus" | "branch_focus"): string {
  if (kind === "manifest_health") {
    return "Clear the current manifest health focus for this review mode.";
  }
  if (kind === "afp_route") {
    return "Clear the current AFP route focus for this review mode.";
  }
  if (kind === "route_linkage") {
    return "Clear the current route linkage focus for this review mode.";
  }
  if (kind === "combined_canvas") {
    return "Clear the current manifest, route, and linkage focus for this review mode.";
  }
  if (kind === "compiled_manifest") {
    return "Clear the current manifest focus for this review mode.";
  }
  if (kind === "compiled_route") {
    return "Clear the current compiled route focus for this review mode.";
  }
  if (kind === "review_health") {
    return "Clear the current review-health focus for this review mode.";
  }
  if (kind === "contract_focus") {
    return "Clear the current contract focus for this review mode.";
  }
  return "Clear the current branch focus for this review mode.";
}

export function broadenOrchestrationRoleRouteReviewMessage(): string {
  return "Return to the broader orchestration-role route review while keeping the current role focus.";
}

export function clearOverlappingRouteNarrowingMessage(kind: "linked" | "manifest_only"): string {
  return kind === "linked"
    ? "Clear branch-review-ready route focus while keeping the current orchestration role focus."
    : "Clear inspector-only route focus while keeping the current orchestration role focus.";
}

export function overlappingOrchestrationRouteSummaryMessage(kind: "linked" | "manifest_only"): string {
  return kind === "linked"
    ? "Showing only branch-review-ready routes that touch this orchestration role. Clear route narrowing to return to the broader role slice."
    : "Showing only inspector-only routes that touch this orchestration role. Clear route narrowing to return to the broader role slice.";
}

export function clearOrchestrationRoleFocusMessage(): string {
  return "Clear the current orchestration role focus for this review mode.";
}

export function orchestrationRoleRailGuideMessage(): string {
  return "Use this card to review master-agent decomposition while keeping the rest of the canvas review context intact.";
}

export function orchestrationRoleOutsideFocusMessage(): string {
  return "Dimmed nodes and routes are outside the current orchestration role focus.";
}

export function orchestrationRoleFocusTargetLabel(role: CompiledOrchestrationRole): string {
  if (role === "supervisor_orchestration") {
    return "supervisor orchestration units";
  }
  if (role === "delegated_capability") {
    return "delegated capability units";
  }
  if (role === "delegated_decision") {
    return "delegated decision units";
  }
  return "workflow summary units";
}

export function focusOrchestrationRoleReviewMessage(role: CompiledOrchestrationRole): string {
  return `Focus review on ${orchestrationRoleFocusTargetLabel(role)}.`;
}

export function focusOrchestrationRouteReviewMessage(role: CompiledOrchestrationRole): string {
  return `Focus route review on routes that touch ${orchestrationRoleFocusTargetLabel(role)}.`;
}

export function focusRouteLinkageReviewMessage(kind: "linked" | "manifest_only"): string {
  return kind === "linked"
    ? "Focus route review on branch-review-ready routes."
    : "Focus route review on inspector-only routes.";
}

export function clearRouteReviewFilterMessage(): string {
  return "Clear the compiled route review filter.";
}

export function resetRouteReviewStatesLabel(): string {
  return "Show all route review states";
}

export function clearAfpReadinessFocusMessage(): string {
  return "Clear the current AFP readiness focus for this review mode.";
}

export function afpReadinessFocusTitle(kind: CompiledAfpReadinessFocus): string {
  if (kind === "ready_manifests") {
    return "Focus review on AFP-ready manifests.";
  }
  if (kind === "needs_contract_work") {
    return "Focus review on manifests that still need AFP contract work.";
  }
  return "Focus review on AFP-ready handoffs.";
}

export function afpReadinessFocusSummary(kind: CompiledAfpReadinessFocus): string {
  if (kind === "ready_manifests") {
    return "Showing manifests that already compile as concrete AFP boundaries without the currently tracked gap signals.";
  }
  if (kind === "needs_contract_work") {
    return "Showing manifests that still act like AFP scaffolds or still expose tracked contract gaps.";
  }
  return "Showing compiled routes that connect two AFP-ready manifests, plus the manifests participating in those handoffs.";
}

export function compiledManifestMatchesAfpReadinessFocus(
  kind: CompiledAfpReadinessFocus | null,
  options: {
    manifestNodeId: string | null;
    readyManifestIds: Set<string>;
    readyHandoffManifestIds: Set<string>;
    afpGapKinds: CompiledAfpGapFilter[];
    afpCategory: "capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold";
  },
): boolean {
  if (!kind || !options.manifestNodeId) {
    return true;
  }
  if (kind === "ready_manifests") {
    return options.readyManifestIds.has(options.manifestNodeId);
  }
  if (kind === "ready_handoffs") {
    return options.readyHandoffManifestIds.has(options.manifestNodeId);
  }
  return options.afpCategory === "orchestration_scaffold" || options.afpGapKinds.length > 0;
}

export function compiledManifestEmptyStateMessage(options: {
  afpReadinessFocus: CompiledAfpReadinessFocus | null;
  orchestrationRoleFilter: CompiledOrchestrationRole | null;
  afpGapFilter: CompiledAfpGapFilter | null;
  afpFilter: "capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold" | null;
  manifestLinkageFilter: "linked" | "inspector_only" | null;
}): string {
  if (options.afpReadinessFocus === "ready_manifests") {
    return "No AFP-ready manifests remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "needs_contract_work") {
    return "No manifests that still need AFP contract work remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "ready_handoffs") {
    return "No manifests participating in AFP-ready handoffs remain in the current review focus.";
  }
  if (options.manifestLinkageFilter === "linked") {
    return "No node-review-ready manifests remain in the current review focus.";
  }
  if (options.manifestLinkageFilter === "inspector_only") {
    return "No inspector-only manifests remain in the current review focus.";
  }
  if (options.orchestrationRoleFilter) {
    return "No compiled runtime manifests match the current orchestration-role review.";
  }
  if (options.afpGapFilter) {
    return "No compiled runtime manifests match the current AFP contract-gap review.";
  }
  if (options.afpFilter) {
    return "No compiled runtime manifests match the current AFP review focus.";
  }
  return "No compiled runtime manifests match the current review focus.";
}

export function compiledRouteEmptyStateMessage(options: {
  afpReadinessFocus: CompiledAfpReadinessFocus | null;
  orchestrationRoleFilter: CompiledOrchestrationRole | null;
  routeLinkageFilter: "linked" | "manifest_only" | null;
  afpRouteFocus: "full" | "partial" | null;
}): string {
  if (options.afpReadinessFocus === "ready_handoffs") {
    return "No AFP-ready handoffs remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "ready_manifests") {
    return "No compiled routes touching AFP-ready manifests remain in the current review focus.";
  }
  if (options.afpReadinessFocus === "needs_contract_work") {
    return "No compiled routes touching manifests that still need AFP contract work remain in the current review focus.";
  }
  if (options.orchestrationRoleFilter && options.routeLinkageFilter) {
    return "No compiled routes remain after applying the current orchestration role and route-review narrowing.";
  }
  if (options.routeLinkageFilter === "linked") {
    return "No branch-review-ready routes remain in the current review focus.";
  }
  if (options.routeLinkageFilter === "manifest_only") {
    return "No inspector-only routes remain in the current review focus.";
  }
  if (options.orchestrationRoleFilter) {
    return "No compiled routes match the current orchestration-role review.";
  }
  if (options.afpRouteFocus) {
    return "No compiled routes match the current AFP route review focus.";
  }
  return "No compiled routes match the current review focus.";
}

export function recoveryReviewTargetMessage(kind: "compiled_manifest" | "compiled_route" | "branch_edge"): string {
  if (kind === "compiled_manifest") {
    return "This review target stays in inspector-only review context until its node review target is restored.";
  }
  if (kind === "compiled_route") {
    return "This review target stays in inspector-only review context until its route review target is restored.";
  }
  return "This review target stays in review-only context until its branch review target is restored.";
}

export function compiledLinkageStatusLabel(kind: "manifest_linked" | "manifest_only" | "route_linked" | "route_manifest_only" | "route_source_linked" | "route_source_unavailable"): string {
  if (kind === "manifest_linked") {
    return "Node review available";
  }
  if (kind === "manifest_only") {
    return "Inspector-only manifest";
  }
  if (kind === "route_linked") {
    return "Branch review available";
  }
  if (kind === "route_manifest_only") {
    return "Inspector-only route";
  }
  if (kind === "route_source_linked") {
    return "Source review available";
  }
  return "Route review unavailable";
}

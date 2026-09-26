// @locs-version: 2.0
import {
  weddingArtifactEvidenceStatus,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingSeatingConstraintAction } from "@/lib/weddingSeatingConstraintActionState";
import {
  compactWeddingSeatingOptimizationResults,
  type WeddingSeatingOptimizationResult,
  weddingSeatingOptimizationFingerprint,
} from "@/lib/weddingSeatingOptimizationState";
import type { WeddingInspirationItem } from "@/lib/weddingInspirationState";

export type WeddingGraphNodeKind =
  | "wedding_plan"
  | "response_workspace"
  | "artifact"
  | "vendor"
  | "location"
  | "calendar_event"
  | "task"
  | "decision"
  | "guest"
  | "social_group"
  | "seating_constraint"
  | "seating_draft"
  | "seating_table"
  | "inspiration"
  | "preference"
  | "risk";

export type WeddingGraphEdgeKind =
  | "contains"
  | "created"
  | "mentions_vendor"
  | "mentions_location"
  | "creates_deadline"
  | "requires"
  | "constrains"
  | "applies_to"
  | "keeps_apart"
  | "keeps_together"
  | "prefers_quiet"
  | "places_guest"
  | "seats_at"
  | "inspires"
  | "signals_preference"
  | "requires_approval"
  | "has_risk"
  | "next_action";

export type WeddingDecisionInput = {
  id?: string | null;
  title: string;
  status?: "open" | "decided" | "blocked" | null;
  sourceArtifactId?: string | null;
  selectedOptionId?: string | null;
  selectedOptionLabel?: string | null;
  selectedOptionDetail?: string | null;
  constrains?: readonly string[] | null;
  requiresApproval?: boolean | null;
  metadata?: unknown;
};

export type WeddingRiskInput = {
  id?: string | null;
  title: string;
  severity?: "low" | "medium" | "high" | null;
  evidence?: string | null;
  metadata?: unknown;
};

export type WeddingGraphNode = {
  id: string;
  kind: WeddingGraphNodeKind;
  label: string;
  supertags: string[];
  metadata: Record<string, unknown>;
  degree: number;
};

export type WeddingGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: WeddingGraphEdgeKind;
  label: string;
  metadata: Record<string, unknown>;
};

export type WeddingKnowledgeGraphInput = {
  metadata?: unknown;
  artifacts?: readonly WeddingArtifactSummary[];
  scheduleItems?: readonly WeddingPlanningScheduleItem[];
  taskItems?: readonly WeddingPlanningTaskItem[];
  decisions?: readonly WeddingDecisionInput[];
  seatingConstraints?: readonly WeddingSeatingConstraintAction[];
  seatingOptimizations?: readonly WeddingSeatingOptimizationResult[];
  seatingDraftArchiveFingerprints?: readonly string[];
  inspirationItems?: readonly WeddingInspirationItem[];
  risks?: readonly WeddingRiskInput[];
};

export type WeddingKnowledgeGraphState = {
  metadata: WeddingPlanningMetadata;
  nodes: WeddingGraphNode[];
  edges: WeddingGraphEdge[];
  summaryLabel: string;
  highDegreeNodes: WeddingGraphNode[];
  riskNodes: WeddingGraphNode[];
  nextActionLabel: string;
  missingEvidenceLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrls(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => clean(value))
    .filter((value) => /^https?:\/\//i.test(value));
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function privateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: readonly unknown[], limit = 40): string[] {
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

function uniqueArrayStrings(value: unknown, limit = 40): string[] {
  return Array.isArray(value) ? uniqueStrings(value, limit) : [];
}

function sanitizedSelectedDecisionScope(value: unknown): Record<string, unknown> {
  const scope = record(value);
  if (Object.keys(scope).length === 0) return {};
  const {
    artifactTitle: _artifactTitle,
    sourceLabels: _sourceLabels,
    sourceUrls: _sourceUrls,
    metadataLabels: _metadataLabels,
    ...rest
  } = scope;
  const artifactTitle = clean(scope.artifact_title ?? scope.artifactTitle);
  const sourceLabels = uniqueArrayStrings(scope.source_labels ?? scope.sourceLabels, 12);
  const metadataLabels = uniqueArrayStrings(scope.metadata_labels ?? scope.metadataLabels, 12);
  const importedPrivateScope = [
    artifactTitle,
    ...sourceLabels,
    ...metadataLabels,
  ].filter((label): label is string => Boolean(label)).some(importedPrivateLabel);
  const sourceUrls = uniqueArrayStrings(scope.source_urls ?? scope.sourceUrls, 12)
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url) => !importedPrivateScope || !privateImportSourceUrl(url));

  return {
    ...rest,
    artifact_title: importedPrivateScope ? "Imported private planning file" : artifactTitle,
    source_labels: importedPrivateScope && sourceLabels.length > 0 ? ["Imported private planning file"] : sourceLabels,
    source_urls: sourceUrls,
    metadata_labels: importedPrivateScope
      ? metadataLabels.filter((label) => !importedPrivateLabel(label))
      : metadataLabels,
    imported_private_evidence: importedPrivateScope || scope.imported_private_evidence === true,
  };
}

function nodeId(kind: WeddingGraphNodeKind, value: unknown): string {
  return `wedding_graph:${kind}:${safeWeddingLabel(value)}`;
}

function graphPersonLabel(value: unknown): string {
  const raw = clean(value);
  if (!raw) return "Guest";
  return raw.replace(/^person:/i, "").replace(/[-_:]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function edgeId(source: string, kind: WeddingGraphEdgeKind, target: string): string {
  return `wedding_graph_edge:${safeWeddingLabel(`${source}:${kind}:${target}`)}`;
}

function baseTags(metadata: WeddingPlanningMetadata, extra: readonly unknown[] = []): string[] {
  return uniqueStrings([
    ...metadata.supertags,
    "wedding_graph",
    "topology:wedding_planning",
    ...extra,
  ]);
}

function addNode(
  nodes: Map<string, WeddingGraphNode>,
  metadata: WeddingPlanningMetadata,
  id: string,
  kind: WeddingGraphNodeKind,
  label: string,
  extraTags: readonly unknown[] = [],
  extraMetadata: Record<string, unknown> = {},
): void {
  const existing = nodes.get(id);
  const supertags = baseTags(metadata, [`wedding_node:${kind}`, ...extraTags]);
  if (existing) {
    nodes.set(id, {
      ...existing,
      supertags: uniqueStrings([...existing.supertags, ...supertags]),
      metadata: { ...existing.metadata, ...extraMetadata },
    });
    return;
  }
  nodes.set(id, {
    id,
    kind,
    label,
    supertags,
    metadata: {
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      ...extraMetadata,
    },
    degree: 0,
  });
}

function addEdge(
  edges: Map<string, WeddingGraphEdge>,
  source: string,
  target: string,
  kind: WeddingGraphEdgeKind,
  label: string,
  metadata: Record<string, unknown> = {},
): void {
  if (source === target) return;
  const id = edgeId(source, kind, target);
  if (edges.has(id)) return;
  edges.set(id, { id, source, target, kind, label, metadata });
}

function degreeCounts(edges: Iterable<WeddingGraphEdge>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }
  return counts;
}

function normalizeDecision(input: WeddingDecisionInput, metadata: WeddingPlanningMetadata): WeddingDecisionInput {
  return {
    ...input,
    id: clean(input.id) || `decision:${safeWeddingLabel(input.title)}`,
    status: input.status ?? "open",
    metadata: input.metadata ?? metadata,
  };
}

function normalizeRisk(input: WeddingRiskInput): WeddingRiskInput {
  return {
    ...input,
    id: clean(input.id) || `risk:${safeWeddingLabel(input.title)}`,
    severity: input.severity ?? "medium",
  };
}

function secondOrderLoopLabel(loopKind: string): string {
  if (loopKind === "weather_backup") return "Weather backup Smart Action";
  if (loopKind === "commitment_timing") return "Legal and contract Smart Action";
  if (loopKind === "guest_logistics") return "Guest logistics Smart Action";
  if (loopKind === "budget_drift") return "Budget check Smart Action";
  if (loopKind === "contact_follow_up") return "Contact follow-up Smart Action";
  return `${loopKind.replace(/_/g, " ")} Smart Action`;
}

function dayOfExecutionCapability(value: string): string | null {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("day_of_")) return normalized;
  if (/\b(day-of|day of|vendor delay|no-show|lost item|live update|payment verification|receipt verification)\b/.test(normalized)) {
    return "day_of_execution";
  }
  return null;
}

function dayOfExecutionRiskLabel(capability: string | null, fallback: string): string {
  if (capability === "day_of_realtime_run_sheet_updates") return "Day-of run-sheet update proof needs closure";
  if (capability === "day_of_emergency_handling") return "Day-of emergency fallback proof needs closure";
  if (capability === "day_of_guest_coordination") return "Day-of guest coordination proof needs closure";
  if (capability === "day_of_payment_verification") return "Day-of payment verification proof needs closure";
  if (capability) return `${capability.replace(/_/g, " ")} proof needs closure`;
  return fallback;
}

function sourceVerificationSeverity(artifact: WeddingArtifactSummary): "low" | "medium" | "high" | null {
  if (weddingArtifactEvidenceStatus(artifact) === "source_linked") return null;
  if (!["research", "vendor_table", "budget_sheet", "legal", "registry", "map_collection"].includes(artifact.kind)) {
    return null;
  }
  if (artifact.kind === "budget_sheet" || artifact.kind === "legal" || artifact.kind === "vendor_table") {
    return artifact.sourceLabels.length > 0 ? "medium" : "high";
  }
  return artifact.sourceLabels.length > 0 ? "low" : "medium";
}

function isWeddingImportArtifact(artifact: WeddingArtifactSummary): boolean {
  return artifact.id.startsWith("wedding_import:")
    || artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag));
}

function graphSourceLabelsForArtifact(artifact: WeddingArtifactSummary): string[] {
  if (!isWeddingImportArtifact(artifact)) return artifact.sourceLabels;
  return artifact.sourceLabels.length > 0 ? ["Imported private planning file"] : [];
}

function graphLabelForArtifact(artifact: WeddingArtifactSummary): string {
  return isWeddingImportArtifact(artifact) ? "Imported private planning file" : artifact.title;
}

function sourceVerificationEvidence(artifact: WeddingArtifactSummary): string {
  if (isWeddingImportArtifact(artifact)) {
    return artifact.sourceLabels.length > 0
      ? `${artifact.sourceLabels.length} private import source label${artifact.sourceLabels.length === 1 ? "" : "s"} redacted; no source URL is attached.`
      : "Imported private planning file has no source URL attached.";
  }
  if (artifact.sourceLabels.length > 0) {
    return `Source labels exist (${artifact.sourceLabels.slice(0, 3).join(", ")}), but no source URL is attached.`;
  }
  return "No source label or source URL is attached to this planning artifact.";
}

function missingEvidenceLabels(
  artifacts: readonly WeddingArtifactSummary[],
  scheduleItems: readonly WeddingPlanningScheduleItem[],
  taskItems: readonly WeddingPlanningTaskItem[],
): string[] {
  const kinds = new Set(artifacts.map((artifact) => artifact.kind));
  const labels = [
    kinds.has("vendor_table") ? null : "No vendor comparison artifact yet.",
    kinds.has("budget_sheet") ? null : "No budget sheet artifact yet.",
    kinds.has("timeline") || scheduleItems.length > 0 ? null : "No timeline or scheduled milestone yet.",
    taskItems.length > 0 ? null : "No planning task projection yet.",
  ];
  return labels.filter((value): value is string => Boolean(value));
}

function nextActionFor(missing: readonly string[], riskCount: number, decisionCount: number): string {
  if (missing.length > 0) return missing[0] ?? "Add planning evidence.";
  if (riskCount > 0) return "Resolve the highest-risk wedding planning gap.";
  if (decisionCount > 0) return "Confirm the next open wedding decision.";
  return "Continue planning from the wedding workspace.";
}

export function buildWeddingKnowledgeGraphState(input: WeddingKnowledgeGraphInput): WeddingKnowledgeGraphState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const artifacts = input.artifacts ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const taskItems = input.taskItems ?? [];
  const decisions = (input.decisions ?? []).map((decision) => normalizeDecision(decision, metadata));
  const seatingConstraints = input.seatingConstraints ?? [];
  const hiddenSeatingDrafts = new Set((input.seatingDraftArchiveFingerprints ?? []).map((fingerprint) => clean(fingerprint)).filter(Boolean));
  const seatingOptimizations = compactWeddingSeatingOptimizationResults(input.seatingOptimizations)
    .filter((result) => !hiddenSeatingDrafts.has(clean(result.fingerprint) || weddingSeatingOptimizationFingerprint(result)));
  const inspirationItems = input.inspirationItems ?? [];
  const risks = (input.risks ?? []).map(normalizeRisk);
  const nodes = new Map<string, WeddingGraphNode>();
  const edges = new Map<string, WeddingGraphEdge>();

  const planId = nodeId("wedding_plan", metadata.weddingPlanId);
  const workspaceId = nodeId("response_workspace", metadata.responseWorkspaceId);
  addNode(nodes, metadata, planId, "wedding_plan", "Wedding plan", [metadata.weddingPlanId]);
  addNode(nodes, metadata, workspaceId, "response_workspace", "Wedding workspace", [metadata.responseWorkspaceId]);
  addEdge(edges, planId, workspaceId, "contains", "contains workspace");

  for (const artifact of artifacts) {
    const artifactId = nodeId("artifact", artifact.id);
    const evidenceStatus = weddingArtifactEvidenceStatus(artifact);
    const importedArtifact = isWeddingImportArtifact(artifact);
    const graphSourceLabels = graphSourceLabelsForArtifact(artifact);
    const graphArtifactLabel = graphLabelForArtifact(artifact);
    addNode(nodes, metadata, artifactId, "artifact", graphArtifactLabel, [
      `wedding_artifact:${artifact.kind}`,
      `approval:${artifact.approvalState}`,
      `evidence:${evidenceStatus}`,
      importedArtifact ? "wedding_import_private_evidence" : null,
    ], {
      artifact_id: artifact.id,
      artifact_kind: artifact.kind,
      category: artifact.category,
      export_targets: artifact.exportTargets,
      evidence_status: evidenceStatus,
      source_labels: graphSourceLabels,
      source_label_count: artifact.sourceLabels.length,
      source_link_count: artifact.sourceLinks.length,
      imported_private_evidence: importedArtifact,
    });
    addEdge(edges, workspaceId, artifactId, "created", "created artifact", { artifact_kind: artifact.kind });
    const verificationSeverity = sourceVerificationSeverity(artifact);
    if (verificationSeverity) {
      const riskId = nodeId("risk", `source-verification:${artifact.id}`);
      addNode(nodes, metadata, riskId, "risk", `Verify sources for ${graphArtifactLabel}`, [
        "wedding_risk",
        "wedding_source_verification",
        `risk:${verificationSeverity}`,
      ], {
        risk_id: `source-verification:${artifact.id}`,
        severity: verificationSeverity,
        evidence: sourceVerificationEvidence(artifact),
        source_artifact_id: artifact.id,
        artifact_kind: artifact.kind,
        source_labels: graphSourceLabels,
        source_label_count: artifact.sourceLabels.length,
        imported_private_evidence: importedArtifact,
      });
      addEdge(edges, planId, riskId, "has_risk", "has source verification risk");
      addEdge(edges, artifactId, riskId, "has_risk", "needs source verification");
      addEdge(edges, riskId, workspaceId, "next_action", "verify source evidence in workspace");
    }
    if (artifact.approvalState === "pending_user_approval") {
      addEdge(edges, artifactId, planId, "requires_approval", "requires approval");
    }
    for (const vendor of artifact.vendorLabels) {
      const vendorId = nodeId("vendor", vendor);
      addNode(nodes, metadata, vendorId, "vendor", vendor, ["wedding_vendor"]);
      addEdge(edges, artifactId, vendorId, "mentions_vendor", "mentions vendor");
    }
    for (const location of artifact.locationLabels) {
      const locationId = nodeId("location", location);
      addNode(nodes, metadata, locationId, "location", location, ["wedding_location"]);
      addEdge(edges, artifactId, locationId, "mentions_location", "mentions location");
    }
  }

  for (const item of scheduleItems) {
    const eventId = nodeId("calendar_event", item.id);
    addNode(nodes, metadata, eventId, "calendar_event", item.title, [
      "wedding_calendar",
      `wedding_calendar:${item.kind}`,
    ], {
      schedule_item_id: item.id,
      start_at: clean(item.startAt) || null,
      end_at: clean(item.endAt) || null,
      location: clean(item.location) || null,
      review_status: item.reviewStatus ?? "accepted",
    });
    addEdge(edges, planId, eventId, "creates_deadline", "creates calendar event", { event_kind: item.kind });
    if (clean(item.linkedArtifactId)) {
      addEdge(edges, nodeId("artifact", item.linkedArtifactId), eventId, "creates_deadline", "creates calendar event");
    }
    if (clean(item.location)) {
      const locationId = nodeId("location", item.location);
      addNode(nodes, metadata, locationId, "location", clean(item.location), ["wedding_location"]);
      addEdge(edges, eventId, locationId, "mentions_location", "located at");
    }
  }

  for (const item of taskItems) {
    const taskId = nodeId("task", item.id);
    const itemMetadata = record(item.metadata);
    const secondOrderLoop = clean(itemMetadata.second_order_loop);
    const secondOrderEvidenceLabels = Array.isArray(itemMetadata.second_order_evidence_labels)
      ? itemMetadata.second_order_evidence_labels.filter((label): label is string => typeof label === "string" && label.trim().length > 0)
      : [];
    const selectedDecisionScope = sanitizedSelectedDecisionScope(itemMetadata.selected_decision_scope);
    const expectedCapability = clean(itemMetadata.expected_behavior_capability);
    const dayOfCapability = dayOfExecutionCapability(expectedCapability) ?? dayOfExecutionCapability(`${item.title} ${item.notes ?? ""}`);
    const outreachEscalationStage = clean(itemMetadata.outreach_escalation_stage);
    const budgetPaymentReview = itemMetadata.budget_payment_review === true;
    const budgetQuoteVerification = itemMetadata.budget_quote_verification === true;
    addNode(nodes, metadata, taskId, "task", item.title, [
      "wedding_task",
      `wedding_task:${item.kind}`,
      clean(item.priority) ? `priority:${clean(item.priority)}` : null,
      budgetPaymentReview || budgetQuoteVerification ? "wedding_budget" : null,
      budgetPaymentReview ? "wedding_budget:payment_schedule" : null,
      budgetQuoteVerification ? "wedding_budget:quote_verification" : null,
      secondOrderLoop ? "wedding_second_order_task" : null,
      secondOrderLoop ? `second_order_loop:${secondOrderLoop}` : null,
      outreachEscalationStage ? "wedding_outreach_escalation" : null,
      outreachEscalationStage ? `outreach_escalation:${outreachEscalationStage}` : null,
      dayOfCapability ? "wedding_day_of_execution" : null,
      dayOfCapability ? `day_of_execution:${dayOfCapability}` : null,
    ], {
      task_item_id: item.id,
      due_at: clean(item.dueAt) || null,
      priority: clean(item.priority) || "normal",
      review_status: item.reviewStatus ?? "accepted",
      second_order_loop: secondOrderLoop || null,
      second_order_evidence_labels: secondOrderEvidenceLabels,
      selected_decision_scope: Object.keys(selectedDecisionScope).length > 0 ? selectedDecisionScope : null,
      budget_payment_review: budgetPaymentReview,
      budget_quote_verification: budgetQuoteVerification,
      budget_vendor_label: clean(itemMetadata.budget_vendor_label) || null,
      budget_category_label: clean(itemMetadata.budget_category_label) || null,
      budget_payment_due_amount_label: clean(itemMetadata.budget_payment_due_amount_label) || null,
      budget_payment_due_date_label: clean(itemMetadata.budget_payment_due_date_label) || null,
      expected_behavior_capability: expectedCapability || null,
      day_of_execution_capability: dayOfCapability,
      outreach_escalation_stage: outreachEscalationStage || null,
    });
    addEdge(edges, planId, taskId, "requires", "requires task", { task_kind: item.kind });
    if (clean(item.linkedArtifactId)) {
      addEdge(edges, nodeId("artifact", item.linkedArtifactId), taskId, "requires", "requires task");
    }
    if (secondOrderLoop) {
      const riskId = nodeId("risk", `second-order:${secondOrderLoop}:${item.id}`);
      addNode(nodes, metadata, riskId, "risk", dayOfExecutionRiskLabel(dayOfCapability, secondOrderLoopLabel(secondOrderLoop)), [
        "wedding_risk",
        "wedding_second_order_loop",
        `second_order_loop:${secondOrderLoop}`,
        outreachEscalationStage ? "wedding_outreach_escalation" : null,
        outreachEscalationStage ? `outreach_escalation:${outreachEscalationStage}` : null,
        dayOfCapability ? "wedding_day_of_execution" : null,
        dayOfCapability ? `day_of_execution:${dayOfCapability}` : null,
      ], {
        risk_id: `second-order:${secondOrderLoop}:${item.id}`,
        severity: item.priority === "urgent" || item.priority === "high" ? "high" : "medium",
        second_order_loop: secondOrderLoop,
        day_of_execution_capability: dayOfCapability,
        expected_behavior_capability: expectedCapability || null,
        outreach_escalation_stage: outreachEscalationStage || null,
        evidence: secondOrderEvidenceLabels.join("; ") || null,
        selected_decision_scope: Object.keys(selectedDecisionScope).length > 0 ? selectedDecisionScope : null,
      });
      addEdge(edges, planId, riskId, "has_risk", "has Smart Action");
      addEdge(edges, riskId, taskId, "next_action", "closed by task", { second_order_loop: secondOrderLoop });
    }
  }

  for (const decision of decisions) {
    const decisionId = nodeId("decision", decision.id);
    const decisionMetadata = record(decision.metadata);
    const budgetDecision = decisionMetadata.budget_decision === true
      || /\bbudget|quote|price|cost|payment|deposit|invoice|contract\b/i.test(`${decision.sourceArtifactId ?? ""} ${decision.title} ${decision.selectedOptionDetail ?? ""}`);
    addNode(nodes, metadata, decisionId, "decision", decision.title, [
      "wedding_decision",
      `decision_status:${decision.status}`,
      budgetDecision ? "wedding_budget" : null,
      budgetDecision ? "topology:wedding_budget" : null,
    ], {
      decision_id: decision.id,
      decision_status: decision.status,
      budget_decision: budgetDecision,
      source_artifact_id: clean(decision.sourceArtifactId) || null,
      artifact_title: clean(decisionMetadata.artifact_title) || null,
      selected_option_id: clean(decision.selectedOptionId) || null,
      selected_option_label: clean(decision.selectedOptionLabel) || null,
      selected_option_detail: clean(decision.selectedOptionDetail) || null,
      source_labels: Array.isArray(decisionMetadata.source_labels) ? decisionMetadata.source_labels : [],
      source_urls: Array.isArray(decisionMetadata.source_urls) ? usableSourceUrls(decisionMetadata.source_urls) : [],
      source_provider_labels: Array.isArray(decisionMetadata.source_provider_labels) ? decisionMetadata.source_provider_labels : [],
    });
    addEdge(edges, planId, decisionId, "requires", "requires decision");
    if (clean(decision.sourceArtifactId)) {
      addEdge(edges, nodeId("artifact", decision.sourceArtifactId), decisionId, "constrains", "selected option");
    }
    if (decision.requiresApproval) addEdge(edges, decisionId, planId, "requires_approval", "requires approval");
    for (const target of decision.constrains ?? []) {
      const targetId = nodeId("decision", target);
      addNode(nodes, metadata, targetId, "decision", target, ["wedding_decision"]);
      addEdge(edges, decisionId, targetId, "constrains", "constrains");
    }
  }

  for (const constraint of seatingConstraints) {
    const constraintId = nodeId("seating_constraint", constraint.id);
    addNode(nodes, metadata, constraintId, "seating_constraint", constraint.statusLabel, [
      "wedding_seating",
      "wedding_seating:constraint",
      `wedding_seating_constraint:${constraint.kind}`,
      "topology:wedding_guest_graph",
      "decisionos:wedding_seating",
    ], {
      seating_constraint_id: constraint.id,
      seating_constraint_kind: constraint.kind,
      instruction: constraint.instruction,
      confidence: constraint.confidence,
      primary_person_id: clean(constraint.primaryPersonId) || null,
      related_person_id: clean(constraint.relatedPersonId) || null,
      social_group: clean(constraint.socialGroup) || null,
    });
    addEdge(edges, planId, constraintId, "requires", "requires seating rule");

    if (clean(constraint.primaryPersonId)) {
      const primaryId = nodeId("guest", constraint.primaryPersonId);
      addNode(nodes, metadata, primaryId, "guest", graphPersonLabel(constraint.primaryPersonId), [
        "wedding_guest",
        "topology:wedding_guest_graph",
      ], { person_id: constraint.primaryPersonId });
      addEdge(edges, constraintId, primaryId, "applies_to", "applies to guest");
      if (constraint.kind === "prefer_quiet") {
        addEdge(edges, primaryId, constraintId, "prefers_quiet", "prefers quiet seating");
      }
    }
    if (clean(constraint.relatedPersonId)) {
      const relatedId = nodeId("guest", constraint.relatedPersonId);
      addNode(nodes, metadata, relatedId, "guest", graphPersonLabel(constraint.relatedPersonId), [
        "wedding_guest",
        "topology:wedding_guest_graph",
      ], { person_id: constraint.relatedPersonId });
      addEdge(edges, constraintId, relatedId, "applies_to", "applies to guest");
    }
    if (constraint.kind === "keep_apart" && clean(constraint.primaryPersonId) && clean(constraint.relatedPersonId)) {
      addEdge(edges, nodeId("guest", constraint.primaryPersonId), nodeId("guest", constraint.relatedPersonId), "keeps_apart", "keep apart");
    }
    if (constraint.kind === "prefer_together" && clean(constraint.primaryPersonId) && clean(constraint.relatedPersonId)) {
      addEdge(edges, nodeId("guest", constraint.primaryPersonId), nodeId("guest", constraint.relatedPersonId), "keeps_together", "keep together where possible");
    }
    if (constraint.kind === "social_group_together" && clean(constraint.socialGroup)) {
      const groupId = nodeId("social_group", constraint.socialGroup);
      addNode(nodes, metadata, groupId, "social_group", clean(constraint.socialGroup), [
        "wedding_social_group",
        "topology:wedding_guest_graph",
      ], { social_group: constraint.socialGroup });
      addEdge(edges, constraintId, groupId, "keeps_together", "keep social group together");
    }
  }

  for (const [index, draft] of seatingOptimizations.entries()) {
    const draftNumber = index + 1;
    const draftId = nodeId("seating_draft", `draft:${draftNumber}:${draft.savedAt ?? draft.assignments.length}`);
    addNode(nodes, metadata, draftId, "seating_draft", index === seatingOptimizations.length - 1 ? "Current seating draft" : `Saved seating draft ${draftNumber}`, [
      "wedding_seating",
      "wedding_seating:draft",
      index === seatingOptimizations.length - 1 ? "wedding_seating:current_draft" : "wedding_seating:saved_draft",
      draft.hardViolations.length > 0 ? "wedding_seating:review_required" : "wedding_seating:ready_to_apply",
      "topology:wedding_guest_graph",
      "decisionos:wedding_seating",
    ], {
      seating_draft_index: draftNumber,
      seating_draft_current: index === seatingOptimizations.length - 1,
      saved_at: clean(draft.savedAt) || null,
      assignment_count: draft.assignments.length,
      hard_violation_count: draft.hardViolations.length,
      total_score: draft.totalScore,
      proactive_issue_labels: draft.proactiveIssueLabels,
    });
    addEdge(edges, planId, draftId, "requires", "requires seating review");
    addEdge(edges, workspaceId, draftId, "created", "created seating draft");

    for (const assignment of draft.assignments) {
      const guestId = nodeId("guest", assignment.personId);
      const tableId = nodeId("seating_table", assignment.tableId);
      addNode(nodes, metadata, guestId, "guest", clean(assignment.personLabel) || graphPersonLabel(assignment.personId), [
        "wedding_guest",
        "topology:wedding_guest_graph",
      ], {
        person_id: assignment.personId,
        person_label: assignment.personLabel,
      });
      addNode(nodes, metadata, tableId, "seating_table", clean(assignment.tableLabel) || graphPersonLabel(assignment.tableId), [
        "wedding_seating",
        "wedding_seating:table",
        "topology:wedding_guest_graph",
      ], {
        table_id: assignment.tableId,
        table_label: assignment.tableLabel,
      });
      addEdge(edges, draftId, guestId, "places_guest", "places guest", {
        table_id: assignment.tableId,
        score: assignment.score,
      });
      addEdge(edges, guestId, tableId, "seats_at", "seated at table", {
        seating_draft_id: draftId,
        table_label: assignment.tableLabel,
        reason_labels: assignment.reasonLabels,
      });
      addEdge(edges, draftId, tableId, "contains", "uses table");
    }
  }

  for (const item of inspirationItems) {
    const inspirationId = nodeId("inspiration", item.id);
    addNode(nodes, metadata, inspirationId, "inspiration", item.title, [
      "wedding_inspiration",
      `wedding_inspiration:${item.kind}`,
      "topology:wedding_preference_graph",
      "decisionos:wedding_style",
    ], {
      inspiration_item_id: item.id,
      inspiration_kind: item.kind,
      tags: item.tags,
      uploaded_by: item.uploadedBy,
      created_at: item.createdAt,
    });
    addEdge(edges, workspaceId, inspirationId, "created", "saved inspiration");
    addEdge(edges, planId, inspirationId, "contains", "contains inspiration");

    for (const signal of item.preferenceSignals.slice(0, 8)) {
      const preferenceId = nodeId("preference", signal);
      addNode(nodes, metadata, preferenceId, "preference", signal, [
        "wedding_preference",
        "wedding_inspiration:preference_signal",
        "topology:wedding_preference_graph",
      ], { preference_signal: signal });
      addEdge(edges, inspirationId, preferenceId, "signals_preference", "signals preference");
    }
    for (const link of item.ontologyLinks.slice(0, 8)) {
      const targetId = nodeId("preference", link.target);
      addNode(nodes, metadata, targetId, "preference", link.target, [
        "wedding_preference",
        "wedding_inspiration:ontology_target",
        "topology:wedding_preference_graph",
      ], { ontology_target: link.target });
      addEdge(edges, inspirationId, targetId, "inspires", link.label);
    }
  }

  for (const risk of risks) {
    const riskId = nodeId("risk", risk.id);
    addNode(nodes, metadata, riskId, "risk", risk.title, [
      "wedding_risk",
      `risk:${risk.severity}`,
    ], {
      risk_id: risk.id,
      severity: risk.severity,
      evidence: clean(risk.evidence) || null,
    });
    addEdge(edges, planId, riskId, "has_risk", "has risk");
    addEdge(edges, riskId, workspaceId, "next_action", "needs follow-up in workspace");
  }

  const counts = degreeCounts(edges.values());
  const finalNodes = Array.from(nodes.values())
    .map((node) => ({ ...node, degree: counts.get(node.id) ?? 0 }))
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label));
  const finalEdges = Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id));
  const missing = missingEvidenceLabels(artifacts, scheduleItems, taskItems);
  const riskNodes = finalNodes.filter((node) => node.kind === "risk");

  return {
    metadata,
    nodes: finalNodes,
    edges: finalEdges,
    summaryLabel: `${finalNodes.length} wedding node${finalNodes.length === 1 ? "" : "s"} and ${finalEdges.length} relationship${finalEdges.length === 1 ? "" : "s"}`,
    highDegreeNodes: finalNodes.filter((node) => node.degree > 1).slice(0, 5),
    riskNodes,
    nextActionLabel: nextActionFor(missing, riskNodes.length, decisions.filter((decision) => decision.status !== "decided").length),
    missingEvidenceLabels: missing,
  };
}

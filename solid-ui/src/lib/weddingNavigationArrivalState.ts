// @locs-version: 2.0
import type { ViewName } from "@/lib/viewNames";
import type { WeddingNavigationStoredIntent } from "@/lib/weddingNavigationLocalState";
import type {
  WeddingNavigationIntent,
  WeddingNavigationSurface,
} from "@/lib/weddingNavigationState";

export type WeddingNavigationArrivalTone = "sky" | "emerald" | "amber" | "rose" | "violet";

export type WeddingNavigationArrivalCard = {
  label: string;
  detail: string;
  tone: WeddingNavigationArrivalTone;
};

export type WeddingNavigationArrivalState = {
  headline: string;
  detail: string;
  badge: string;
  view: ViewName;
  surface: WeddingNavigationSurface;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
  artifactId: string | null;
  sectionId: string | null;
  savedAt: string | null;
  cards: WeddingNavigationArrivalCard[];
  nextStep: string;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function decisionScopeArtifactTitleForArrival(value: unknown): string | null {
  const title = clean(value);
  if (!title) return null;
  return importedPrivateLabel(title) ? "Imported private planning file" : title;
}

function savedAtFrom(intent: WeddingNavigationIntent | WeddingNavigationStoredIntent): string | null {
  return "savedAt" in intent ? clean(intent.savedAt) : null;
}

function headlineFor(surface: WeddingNavigationSurface): string {
  if (surface === "planning_files") return "Your wedding documents are open.";
  if (surface === "continue_chat") return "This chat continues the wedding plan.";
  if (surface === "probe") return "The next wedding planning question is in focus.";
  if (surface === "map") return "Wedding map context is in focus.";
  if (surface === "calendar") return "Wedding dates are in focus.";
  if (surface === "knowledge_graph") return "Wedding dependencies are in focus.";
  if (surface === "tasks") return "Wedding tasks are in focus.";
  if (surface === "connected_apps") return "Wedding provider setup is in focus.";
  if (surface === "approval") return "Wedding approval review is in focus.";
  return "Wedding export context is in focus.";
}

function badgeFor(surface: WeddingNavigationSurface): string {
  if (surface === "planning_files") return "Wedding documents";
  if (surface === "continue_chat" || surface === "probe") return "Context carried";
  if (surface === "map") return "Map context";
  if (surface === "calendar") return "Calendar context";
  if (surface === "knowledge_graph") return "Dependency context";
  if (surface === "tasks") return "Task context";
  if (surface === "connected_apps") return "Provider setup";
  if (surface === "approval") return "Approval gate";
  return "Export context";
}

function reasonFor(surface: WeddingNavigationSurface): string {
  if (surface === "planning_files") {
    return "Review the research, tables, drafts, registry notes, and attachments OmnyID made for this wedding.";
  }
  if (surface === "continue_chat") {
    return "Continue the conversation with the wedding plan, source response, and current artifact already carried forward.";
  }
  if (surface === "probe") {
    return "Answer only the next need-to-know prompt so the plan improves without forcing a long intake form.";
  }
  if (surface === "map") {
    return "Inspect place-based vendor or venue context before relying on addresses, availability, pricing, or travel assumptions.";
  }
  if (surface === "calendar") {
    return "Review timeline items as first-class calendar context before syncing, inviting, or treating them as committed.";
  }
  if (surface === "knowledge_graph") {
    return "Use topology to see dependencies between budget, vendors, guests, dates, risks, approvals, and missing evidence.";
  }
  if (surface === "tasks") {
    return "Turn response-derived planning work into durable task items only after confirming owner, due date, and priority.";
  }
  if (surface === "connected_apps") {
    return "Connect the email, calendar, registry, or vendor-contact providers needed before approved wedding actions can execute outside OmnyID.";
  }
  if (surface === "approval") {
    return "Check exactly what will be sent, shared, published, booked, or exported before any consequential action runs.";
  }
  return "Choose what to download and check private details before sharing wedding documents.";
}

function nextStepFor(surface: WeddingNavigationSurface, artifactId: string | null, hasDecisionScope = false): string {
  if (hasDecisionScope) {
    if (surface === "continue_chat" || surface === "probe") {
      return "Continue from the selected option first; ask to compare alternatives only if the user requests it.";
    }
    if (surface === "map") return "Verify the selected option's live place details before acting on map results.";
    if (surface === "calendar") return "Review tentative dates for the selected option before syncing or inviting anyone.";
    if (surface === "knowledge_graph") {
      return "Inspect dependencies and missing evidence for the selected option before changing the plan.";
    }
    if (surface === "tasks") return "Confirm owner, priority, and due date for selected-option tasks before committing them.";
    if (surface === "connected_apps") return "Connect only the providers needed for the selected option's approved external actions.";
    if (surface === "approval") return "Review exactly what will be shared or sent for the selected option before approving.";
    if (surface === "export") return "Export selected-option planning material only after checking sensitive files and alternatives.";
  }
  if (surface === "planning_files") {
    return artifactId
      ? `Open ${artifactId}, then approve, export, or continue chat from that document.`
      : "Open or approve the generated wedding documents, then continue chat from the active document.";
  }
  if (surface === "continue_chat" || surface === "probe") {
    return "Answer the next need-to-know question or ask for the next planning artifact.";
  }
  if (surface === "map") return "Verify live venue and vendor details before acting on map results.";
  if (surface === "calendar") return "Review tentative dates before syncing or inviting anyone.";
  if (surface === "knowledge_graph") {
    return "Inspect dependencies and missing evidence before choosing vendors or changing the plan.";
  }
  if (surface === "tasks") return "Confirm owner, priority, and due date before treating a task as committed.";
  if (surface === "connected_apps") return "Connect missing providers, then return to approvals so approved sends, syncs, or publishes can execute.";
  if (surface === "approval") return "Review exactly what will be shared or sent before approving.";
  return "Choose safe export targets and review sensitive files before bundling.";
}

function hasExpectedBehaviorAudit(intent: WeddingNavigationIntent): boolean {
  const packet = intent.metadata?.expected_behavior_audit;
  return Boolean(packet && typeof packet === "object" && !Array.isArray(packet));
}

function expectedBehaviorNextStep(intent: WeddingNavigationIntent): string | null {
  if (intent.surface !== "tasks" || !hasExpectedBehaviorAudit(intent)) return null;
  return "Review the suggested wedding gap tasks, then commit only the follow-ups that have a clear owner, due date, and evidence source.";
}

function carriedContextDetail(intent: WeddingNavigationIntent): string {
  const parts = [
    `Plan: ${intent.weddingPlanId}`,
    `Workspace: ${intent.responseWorkspaceId}`,
  ];
  if (intent.sourceResponseId) parts.push(`Response: ${intent.sourceResponseId}`);
  if (intent.artifactId) parts.push(`Artifact: ${intent.artifactId}`);
  if (intent.sectionId) parts.push(`Section: ${intent.sectionId}`);
  return parts.join(" | ");
}

function continueContextSummary(intent: WeddingNavigationIntent): string | null {
  const packet = intent.metadata?.continue_context;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const record = packet as Record<string, unknown>;
  const summary = clean(record.summaryLabel);
  const importedCount = numberFrom(record.importedArtifactCount);
  const importedReviewCount = numberFrom(record.importedReviewRequiredCount);
  const active = record.activeArtifact && typeof record.activeArtifact === "object" && !Array.isArray(record.activeArtifact)
    ? record.activeArtifact as Record<string, unknown>
    : null;
  const activeTitle = clean(active?.title);
  const parts = [
    summary,
    activeTitle ? `selected document: ${activeTitle}` : null,
    importedCount > 0 ? `${importedCount} imported private planning file${importedCount === 1 ? "" : "s"}` : null,
    importedReviewCount > 0 ? `${importedReviewCount} import${importedReviewCount === 1 ? " needs" : "s need"} review before reuse` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `${parts.join("; ")}.` : null;
}

function numberFrom(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function stringsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function decisionScopeLabels(intent: WeddingNavigationIntent): string[] {
  const scopes = Array.isArray(intent.metadata?.decision_scopes) ? intent.metadata.decision_scopes : [];
  const structured = scopes.flatMap((scope): string[] => {
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) return [];
    const record = scope as Record<string, unknown>;
    const label = clean(record.selected_option_label);
    const artifactTitle = decisionScopeArtifactTitleForArrival(record.artifact_title);
    const artifactKind = clean(record.artifact_kind)?.replace(/_/g, " ");
    if (!label) return [];
    return [artifactTitle || artifactKind ? `${label} from ${artifactTitle ?? artifactKind}` : label];
  });
  const continuePacket = intent.metadata?.continue_context;
  const continued = continuePacket && typeof continuePacket === "object" && !Array.isArray(continuePacket)
    ? stringsFrom((continuePacket as Record<string, unknown>).decisionScopeLabels)
    : [];
  return [...structured, ...continued].slice(0, 4);
}

function decisionScopeSummary(intent: WeddingNavigationIntent): string | null {
  const labels = decisionScopeLabels(intent);
  if (labels.length === 0) return null;
  const suffix = labels.length === 1 ? "" : `; ${labels.length} selected scopes carried`;
  return `Follow-up should prefer: ${labels.join("; ")}${suffix}.`;
}

function decisionDestinationGuidance(intent: WeddingNavigationIntent): string | null {
  if (decisionScopeLabels(intent).length === 0) return null;
  if (intent.surface === "continue_chat" || intent.surface === "probe") {
    return "Frame the next answer around the selected option and keep alternatives as audit context unless the user asks to compare again.";
  }
  if (intent.surface === "map") {
    return "Verify address, travel assumptions, and live availability for the selected option before treating map output as actionable.";
  }
  if (intent.surface === "calendar") {
    return "Show tentative holds, tour dates, payment dates, and legal reminders that are relevant to the selected option first.";
  }
  if (intent.surface === "knowledge_graph") {
    return "Prioritize dependencies, missing evidence, approvals, backup plans, and risks attached to the selected option.";
  }
  if (intent.surface === "tasks") {
    return "Prioritize tasks that close the loop for the selected option, then keep comparison tasks lower in the timing hierarchy.";
  }
  if (intent.surface === "connected_apps") {
    return "Show provider setup for selected-option actions first and keep unticked alternatives from driving extra credentials.";
  }
  if (intent.surface === "approval") {
    return "Approval review should name the selected option and avoid sending or sharing details for unticked alternatives by default.";
  }
  if (intent.surface === "export") {
    return "Exports should foreground the selected option while retaining unticked alternatives only for audit or comparison sections.";
  }
  return "Use the selected option as the active planning path while keeping alternatives reversible and auditable.";
}

function handoffContextSummary(intent: WeddingNavigationIntent): string | null {
  const packet = intent.metadata?.handoff_context;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const record = packet as Record<string, unknown>;
  const summary = clean(record.summaryLabel);
  const dateCount = numberFrom(record.linkedCalendarCount);
  const taskCount = numberFrom(record.linkedTaskCount);
  const approvalCount = numberFrom(record.approvalPromptCount);
  const excludedSensitive = numberFrom(record.exportExcludedSensitiveCount);
  const importedCount = numberFrom(record.importedArtifactCount);
  const importedReviewCount = numberFrom(record.importedHandoffReviewCount);
  const pendingCount = numberFrom(record.projectionPendingCount);
  const decisionScopeCount = numberFrom(record.decisionScopeCount);
  const sourceLinkedCount = numberFrom(record.sourceLinkedCount);
  const sourceLabelledCount = numberFrom(record.sourceLabelledCount);
  const sourceUnverifiedCount = numberFrom(record.sourceUnverifiedCount);
  const parts = [
    summary,
    dateCount > 0 ? `${dateCount} linked date${dateCount === 1 ? "" : "s"}` : null,
    taskCount > 0 ? `${taskCount} linked task${taskCount === 1 ? "" : "s"}` : null,
    decisionScopeCount > 0 ? `${decisionScopeCount} selected decision scope${decisionScopeCount === 1 ? "" : "s"}` : null,
    sourceLinkedCount > 0 ? `${sourceLinkedCount} source-linked file${sourceLinkedCount === 1 ? "" : "s"}` : null,
    sourceLabelledCount > 0 ? `${sourceLabelledCount} source-labelled file${sourceLabelledCount === 1 ? "" : "s"}` : null,
    sourceUnverifiedCount > 0 ? `${sourceUnverifiedCount} source-unverified file${sourceUnverifiedCount === 1 ? "" : "s"}` : null,
    approvalCount > 0 ? `${approvalCount} approval prompt${approvalCount === 1 ? "" : "s"}` : null,
    excludedSensitive > 0 ? `${excludedSensitive} sensitive export${excludedSensitive === 1 ? "" : "s"} excluded by default` : null,
    importedCount > 0 ? `${importedCount} imported private planning file${importedCount === 1 ? "" : "s"} in workspace` : null,
    importedReviewCount > 0 ? `${importedReviewCount} imported file${importedReviewCount === 1 ? " requires" : "s require"} handoff review` : null,
    pendingCount > 0 ? `${pendingCount} unsaved planning output${pendingCount === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") + "." : null;
}

function providerHandoffAuditSummary(intent: WeddingNavigationIntent): string | null {
  const packet = intent.metadata?.provider_handoff_audit;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const record = packet as Record<string, unknown>;
  const status = clean(record.status);
  const pendingCount = numberFrom(record.pending_count) || numberFrom(record.pending_executor_count);
  const connectedCount = numberFrom(record.connected_count) || Math.max(0, numberFrom(record.external_handoff_count) - pendingCount);
  const pendingCapabilities = stringsFrom(record.pending_capabilities).length > 0
    ? stringsFrom(record.pending_capabilities)
    : stringsFrom(record.capabilities);
  const setupViews = stringsFrom(record.setup_views);
  const parts = [
    status ? `status: ${status.replace(/_/g, " ")}` : null,
    pendingCount > 0 ? `${pendingCount} pending provider handoff${pendingCount === 1 ? "" : "s"}` : null,
    connectedCount > 0 ? `${connectedCount} connected provider handoff${connectedCount === 1 ? "" : "s"}` : null,
    pendingCapabilities.length > 0 ? `needs: ${pendingCapabilities.slice(0, 4).join(", ")}` : null,
    setupViews.length > 0 ? `setup: ${setupViews.slice(0, 3).join(", ")}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") + "." : null;
}

function expectedBehaviorAuditSummary(intent: WeddingNavigationIntent): string | null {
  const packet = intent.metadata?.expected_behavior_audit;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const record = packet as Record<string, unknown>;
  const readyCount = numberFrom(record.ready_count);
  const blockedCount = numberFrom(record.blocked_count);
  const suggestedTaskCount = numberFrom(record.suggested_task_count);
  const blockedCapabilities = stringsFrom(record.blocked_capabilities).map((label) => label.replace(/_/g, " "));
  const suggestedTaskTitles = stringsFrom(record.suggested_task_titles);
  const blockerLabels = stringsFrom(record.blocker_labels);
  const parts = [
    `${readyCount} ready behaviour${readyCount === 1 ? "" : "s"}`,
    `${blockedCount} gap${blockedCount === 1 ? "" : "s"}`,
    suggestedTaskCount > 0 ? `${suggestedTaskCount} task candidate${suggestedTaskCount === 1 ? "" : "s"}` : null,
    blockedCapabilities.length > 0 ? `blocked: ${blockedCapabilities.slice(0, 5).join(", ")}` : null,
    suggestedTaskTitles.length > 0 ? `candidate: ${suggestedTaskTitles.slice(0, 3).join("; ")}` : null,
    blockerLabels.length > 0 ? `first blocker: ${blockerLabels[0]}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") + "." : null;
}

function decisionFocusSummary(intent: WeddingNavigationIntent): string | null {
  const packet = intent.metadata?.decision_focus;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const record = packet as Record<string, unknown>;
  const summary = clean(record.summary_label);
  const backlogCount = numberFrom(record.backlog_count);
  const focusItems = Array.isArray(record.focus_items)
    ? record.focus_items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => clean(item.title))
      .filter((title): title is string => Boolean(title))
    : [];
  const topSurface = clean(record.top_source_surface)?.replace(/_/g, " ");
  const parts = [
    summary,
    focusItems.length > 0 ? `focus: ${focusItems.slice(0, 3).join("; ")}` : null,
    backlogCount > 0 ? `${backlogCount} lower-priority decision${backlogCount === 1 ? "" : "s"} kept in backlog` : null,
    topSurface ? `opens from: ${topSurface}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") + "." : null;
}

function graphContextSummary(intent: WeddingNavigationIntent): string | null {
  const packet = intent.metadata?.graph_context;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  const record = packet as Record<string, unknown>;
  const title = clean(record.recommendation_title);
  const kind = clean(record.recommendation_kind)?.replace(/_/g, " ");
  const nextAction = clean(record.next_action_label);
  const sourceNodes = Array.isArray(record.source_node_ids) ? record.source_node_ids.length : 0;
  const edges = Array.isArray(record.edge_ids) ? record.edge_ids.length : 0;
  const parts = [
    title ? `Recommendation: ${title}` : null,
    kind ? `kind: ${kind}` : null,
    `${sourceNodes} source node${sourceNodes === 1 ? "" : "s"}`,
    `${edges} linked edge${edges === 1 ? "" : "s"}`,
    nextAction ? `next: ${nextAction}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") + "." : null;
}

function buildCards(intent: WeddingNavigationIntent): WeddingNavigationArrivalCard[] {
  const chatSummary = continueContextSummary(intent);
  const handoffSummary = handoffContextSummary(intent);
  const graphSummary = graphContextSummary(intent);
  const providerSummary = providerHandoffAuditSummary(intent);
  const expectedBehaviorSummary = expectedBehaviorAuditSummary(intent);
  const decisionFocus = decisionFocusSummary(intent);
  const decisionSummary = decisionScopeSummary(intent);
  const decisionGuidance = decisionDestinationGuidance(intent);
  return [
    {
      label: "What carried over",
      detail: carriedContextDetail(intent),
      tone: "sky",
    },
    chatSummary
      ? {
        label: "Chat context",
        detail: chatSummary,
        tone: "emerald",
      }
      : null,
    handoffSummary
      ? {
        label: "Planning handoff",
        detail: handoffSummary,
        tone: intent.surface === "export" ? "amber" : "sky",
      }
      : null,
    decisionSummary
      ? {
        label: "Selected decision scope",
        detail: decisionSummary,
        tone: "emerald",
      }
      : null,
    decisionGuidance
      ? {
        label: "How to use selected scope",
        detail: decisionGuidance,
        tone: intent.surface === "approval" || intent.surface === "export" ? "amber" : "emerald",
      }
      : null,
    graphSummary
      ? {
        label: "Graph focus",
        detail: graphSummary,
        tone: "violet",
      }
      : null,
    providerSummary
      ? {
        label: "Connected apps",
        detail: providerSummary,
        tone: intent.surface === "connected_apps" ? "amber" : "sky",
      }
      : null,
    expectedBehaviorSummary
      ? {
        label: "Automation setup gaps",
        detail: expectedBehaviorSummary,
        tone: intent.surface === "tasks" ? "amber" : "sky",
      }
      : null,
    decisionFocus
      ? {
        label: "Needs your yes/no",
        detail: decisionFocus,
        tone: intent.surface === "approval" ? "amber" : "emerald",
      }
      : null,
    {
      label: "Why this surface",
      detail: reasonFor(intent.surface),
      tone: intent.surface === "approval" || intent.surface === "connected_apps" ? "amber" : "emerald",
    },
    {
      label: "What not to assume",
      detail: "No vendor booking, external calendar sync, email send, registry publish, or file share happened unless the user explicitly approved it.",
      tone: intent.surface === "approval" || intent.surface === "export" ? "rose" : "violet",
    },
  ].filter((card): card is WeddingNavigationArrivalCard => card !== null);
}

export function buildWeddingNavigationArrivalState(
  intent: WeddingNavigationIntent | WeddingNavigationStoredIntent | null | undefined,
): WeddingNavigationArrivalState | null {
  if (!intent) return null;
  const weddingPlanId = clean(intent.weddingPlanId);
  const responseWorkspaceId = clean(intent.responseWorkspaceId);
  if (!weddingPlanId || !responseWorkspaceId) return null;
  const normalized: WeddingNavigationIntent = {
    ...intent,
    weddingPlanId,
    responseWorkspaceId,
    sourceResponseId: clean(intent.sourceResponseId),
    artifactId: clean(intent.artifactId),
    sectionId: clean(intent.sectionId),
    notice: clean(intent.notice) ?? headlineFor(intent.surface),
  };
  return {
    headline: headlineFor(normalized.surface),
    detail: normalized.notice,
    badge: badgeFor(normalized.surface),
    view: normalized.view,
    surface: normalized.surface,
    weddingPlanId,
    responseWorkspaceId,
    sourceResponseId: normalized.sourceResponseId,
    artifactId: normalized.artifactId,
    sectionId: normalized.sectionId,
    savedAt: savedAtFrom(intent),
    cards: buildCards(normalized),
    nextStep: expectedBehaviorNextStep(normalized)
      ?? nextStepFor(normalized.surface, normalized.artifactId, decisionScopeLabels(normalized).length > 0),
  };
}

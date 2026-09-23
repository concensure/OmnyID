// @locs-version: 2.0
import {
  buildWeddingNeedToKnowProbingState,
  type WeddingPlanningContext,
} from "@/lib/weddingNeedToKnowProbingState";
import {
  buildWeddingResponseWorkspaceState,
  type WeddingResponseWorkspaceState,
} from "@/lib/weddingResponseWorkspaceState";
import type { WeddingArtifactInput, WeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingKnowledgeGraphState } from "@/lib/weddingKnowledgeGraphState";
import {
  buildWeddingRecommendationExplanationState,
  type WeddingRecommendationExplanationState,
} from "@/lib/weddingRecommendationExplanationState";

export type WeddingPresentationSectionId =
  | "overview"
  | "map"
  | "timeline"
  | "legal"
  | "budget"
  | "vendors"
  | "recommendations"
  | "decisions"
  | "tasks"
  | "drafts"
  | "artifacts"
  | "continue";

export type WeddingPresentationActionKind =
  | "open_planning_files"
  | "continue_chat"
  | "answer_probe"
  | "open_map"
  | "open_calendar"
  | "open_graph"
  | "open_task_list"
  | "approve_draft"
  | "export_artifact";

export type WeddingPresentationAction = {
  kind: WeddingPresentationActionKind;
  label: string;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
  artifactId?: string | null;
  sectionId?: WeddingPresentationSectionId | null;
};

export type WeddingPresentationCard = {
  id: string;
  sectionId: WeddingPresentationSectionId;
  title: string;
  body: string;
  badges: string[];
  evidenceLabel: string;
  primaryAction: WeddingPresentationAction | null;
  secondaryAction: WeddingPresentationAction | null;
};

export type WeddingPresentationSection = {
  id: WeddingPresentationSectionId;
  title: string;
  description: string;
  cards: WeddingPresentationCard[];
};

export type WeddingPresentationState = {
  title: string;
  subtitle: string;
  heroLabel: string;
  primaryAction: WeddingPresentationAction;
  sections: WeddingPresentationSection[];
  workspace: WeddingResponseWorkspaceState;
  probing: ReturnType<typeof buildWeddingNeedToKnowProbingState>;
  recommendations: WeddingRecommendationExplanationState | null;
};

const SECTION_COPY: Record<WeddingPresentationSectionId, Pick<WeddingPresentationSection, "title" | "description">> = {
  overview: {
    title: "Overview",
    description: "Assumptions, current readiness, and the next useful planning question.",
  },
  map: {
    title: "Map",
    description: "Venue, vendor, accommodation, travel, and photo-location context.",
  },
  timeline: {
    title: "Timeline",
    description: "Milestones, run-sheet previews, and date-based wedding documents.",
  },
  legal: {
    title: "Legal Setup",
    description: "NOIM status, celebrant coordination, official-source labels, and legal checklist actions.",
  },
  budget: {
    title: "Budget",
    description: "Budget sheets, estimates, confirmed costs, and hidden-cost warnings.",
  },
  vendors: {
    title: "Vendors",
    description: "Shortlists, source labels, fit reasons, and risk flags.",
  },
  recommendations: {
    title: "Recommendations",
    description: "Suggested connections, risks, missing details, and planning anchors.",
  },
  decisions: {
    title: "Decisions",
    description: "Tradeoffs and decision records that should stay inspectable.",
  },
  tasks: {
    title: "Tasks",
    description: "Next actions and critical-path work that should become task messages.",
  },
  drafts: {
    title: "Drafts",
    description: "Email/message drafts that require approval before sending.",
  },
  artifacts: {
    title: "Artifacts",
    description: "Research, tables, registry drafts, maps, and wedding documents.",
  },
  continue: {
    title: "Continue",
    description: "Continue chat with this wedding plan and selected documents.",
  },
};

function action(
  kind: WeddingPresentationActionKind,
  label: string,
  workspace: WeddingResponseWorkspaceState,
  sectionId?: WeddingPresentationSectionId,
  artifactId?: string | null,
): WeddingPresentationAction {
  return {
    kind,
    label,
    weddingPlanId: workspace.metadata.weddingPlanId,
    responseWorkspaceId: workspace.metadata.responseWorkspaceId,
    sourceResponseId: workspace.metadata.sourceResponseId,
    artifactId: artifactId ?? null,
    sectionId: sectionId ?? null,
  };
}

function badgesForArtifact(artifact: WeddingArtifactSummary): string[] {
  return [
    artifact.category,
    artifact.approvalState.replace(/_/g, " "),
    ...artifact.exportTargets.slice(0, 3).map((target) => target.replace(/_/g, " ")),
  ];
}

function isImportedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function isImportedPrivateArtifact(artifact: WeddingArtifactSummary): boolean {
  return artifact.id.startsWith("wedding_import:")
    || artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || [
      artifact.title,
      ...artifact.sourceLabels,
    ].some(isImportedPrivateLabel);
}

function presentationTitleForArtifact(artifact: WeddingArtifactSummary): string {
  return isImportedPrivateArtifact(artifact) ? "Imported private planning file" : artifact.title;
}

function presentationEvidenceLabelForArtifact(artifact: WeddingArtifactSummary): string {
  const sourceLabel = artifact.sourceLabels[0] ?? artifact.metadata.sourceResponseId ?? "Generated planning file";
  if (!isImportedPrivateArtifact(artifact) && !isImportedPrivateLabel(sourceLabel)) return sourceLabel;
  return "Imported private planning file";
}

function cardFromArtifact(
  artifact: WeddingArtifactSummary,
  sectionId: WeddingPresentationSectionId,
  workspace: WeddingResponseWorkspaceState,
): WeddingPresentationCard {
  const body = sectionId === "map"
    ? artifact.locationLabels.length > 0
      ? `Map details found for ${artifact.locationLabels.slice(0, 3).join(", ")}. Check live address, travel time, and availability before booking.`
      : "No clear map details were found yet. Add a venue, vendor address, or travel location to use the map tools."
    : sectionId === "timeline"
      ? "Timeline details for dates, run sheets, reminders, or planning milestones."
      : sectionId === "tasks"
        ? "Wedding tasks that need an owner, due date, and final check."
        : sectionId === "drafts"
          ? "Message draft to review before anything is sent."
          : "Wedding planning document ready to review.";
  return {
    id: `${sectionId}:${artifact.id}`,
    sectionId,
    title: presentationTitleForArtifact(artifact),
    body,
    badges: badgesForArtifact(artifact),
    evidenceLabel: presentationEvidenceLabelForArtifact(artifact),
    primaryAction: sectionId === "drafts"
      ? action("approve_draft", "Review approval", workspace, sectionId, artifact.id)
      : action("open_planning_files", "Open wedding documents", workspace, sectionId, artifact.id),
    secondaryAction: action("export_artifact", "Export", workspace, sectionId, artifact.id),
  };
}

function sectionCards(
  sectionId: WeddingPresentationSectionId,
  workspace: WeddingResponseWorkspaceState,
  context: WeddingPlanningContext,
  recommendations: WeddingRecommendationExplanationState | null,
): WeddingPresentationCard[] {
  if (sectionId === "overview") {
    const probe = buildWeddingNeedToKnowProbingState(context);
    return [{
      id: "overview:readiness",
      sectionId,
      title: probe.nextQuestion ? "Next useful question" : "Planning context ready",
      body: probe.nextQuestion?.question ?? "Enough context exists to produce the first venue, budget, timeline, and artifact recommendations.",
      badges: [
        probe.progressLabel,
        probe.nextQuestion?.sensitivity ? `sensitivity:${probe.nextQuestion.sensitivity}` : "ready",
      ],
      evidenceLabel: probe.nextQuestion?.reason ?? "Based on supplied wedding planning context.",
      primaryAction: probe.nextQuestion
        ? action("answer_probe", "Answer question", workspace, sectionId)
        : action("open_planning_files", "Open wedding documents", workspace, sectionId),
      secondaryAction: action("continue_chat", "Continue chat", workspace, sectionId),
    }];
  }
  if (sectionId === "map") {
    return workspace.results
      .filter((artifact) => artifact.kind === "map_collection" || (artifact.locationLabels.length > 0 && artifact.kind !== "timeline"))
      .slice(0, 3)
      .map((artifact) => ({
        ...cardFromArtifact(artifact, sectionId, workspace),
        primaryAction: action("open_map", "Open map", workspace, sectionId, artifact.id),
      }));
  }
  if (sectionId === "timeline") {
    return workspace.results
      .filter((artifact) => artifact.kind === "timeline" || (artifact.kind !== "legal" && artifact.linkedCalendarEventIds.length > 0))
      .slice(0, 3)
      .map((artifact) => ({
        ...cardFromArtifact(artifact, sectionId, workspace),
        primaryAction: action("open_calendar", "Open calendar", workspace, sectionId, artifact.id),
      }));
  }
  if (sectionId === "legal") {
    return workspace.results.filter((artifact) => artifact.kind === "legal").slice(0, 3)
      .map((artifact) => ({
        ...cardFromArtifact(artifact, sectionId, workspace),
        body: [
          "Legal planning file with official-source labels and conservative caveats.",
          artifact.linkedCalendarEventIds.length > 0 ? "Includes linked calendar reminder." : null,
          artifact.linkedTaskIds.length > 0 ? "Includes linked legal task suggestions." : null,
        ].filter(Boolean).join(" "),
        primaryAction: artifact.linkedTaskIds.length > 0
          ? action("open_task_list", "Open legal tasks", workspace, sectionId, artifact.id)
          : action("open_planning_files", "Open legal document", workspace, sectionId, artifact.id),
        secondaryAction: artifact.linkedCalendarEventIds.length > 0
          ? action("open_calendar", "Open NOIM reminder", workspace, sectionId, artifact.id)
          : action("export_artifact", "Export", workspace, sectionId, artifact.id),
      }));
  }
  if (sectionId === "budget") {
    return workspace.results.filter((artifact) => artifact.kind === "budget_sheet").slice(0, 3)
      .map((artifact) => cardFromArtifact(artifact, sectionId, workspace));
  }
  if (sectionId === "vendors") {
    return workspace.results.filter((artifact) => artifact.kind === "vendor_table").slice(0, 3)
      .map((artifact) => cardFromArtifact(artifact, sectionId, workspace));
  }
  if (sectionId === "recommendations") {
    return (recommendations?.recommendations ?? []).slice(0, 4).map((recommendation) => ({
      id: recommendation.id,
      sectionId,
      title: recommendation.title,
      body: recommendation.body,
      badges: recommendation.badges,
      evidenceLabel: recommendation.evidenceLabel,
      primaryAction: action("continue_chat", recommendation.nextActionLabel, workspace, sectionId),
      secondaryAction: action("open_graph", "Show graph", workspace, sectionId),
    }));
  }
  if (sectionId === "decisions") {
    return workspace.results.filter((artifact) => artifact.kind === "decision_log").slice(0, 3)
      .map((artifact) => cardFromArtifact(artifact, sectionId, workspace));
  }
  if (sectionId === "tasks") {
    const taskArtifacts = workspace.results.filter((artifact) => artifact.linkedTaskIds.length > 0).slice(0, 3);
    return taskArtifacts.length > 0
      ? taskArtifacts.map((artifact) => ({
        ...cardFromArtifact(artifact, sectionId, workspace),
        primaryAction: action("open_task_list", "Open tasks", workspace, sectionId, artifact.id),
      }))
      : [];
  }
  if (sectionId === "drafts") {
    return workspace.results.filter((artifact) => artifact.kind === "email_draft").slice(0, 3)
      .map((artifact) => cardFromArtifact(artifact, sectionId, workspace));
  }
  if (sectionId === "artifacts") {
    return workspace.results.slice(0, 4).map((artifact) => cardFromArtifact(artifact, sectionId, workspace));
  }
  if (sectionId === "continue") {
    return [{
      id: "continue:chat",
      sectionId,
      title: "Continue this wedding plan",
      body: "Continue chat with the wedding plan, documents, source response, and active document carried as context.",
      badges: ["context carried", workspace.summaryLabel],
      evidenceLabel: workspace.metadata.responseWorkspaceId,
      primaryAction: action("continue_chat", "Continue chat", workspace, sectionId, workspace.activeArtifact?.id),
      secondaryAction: action("open_planning_files", "Open wedding documents", workspace, sectionId),
    }];
  }
  return [];
}

export function buildWeddingPresentationState(input: {
  title?: string | null;
  metadata?: unknown;
  planningContext?: WeddingPlanningContext | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
  knowledgeGraph?: WeddingKnowledgeGraphState | null;
}): WeddingPresentationState {
  const context = input.planningContext ?? {};
  const workspace = buildWeddingResponseWorkspaceState({
    metadata: input.metadata,
    artifacts: input.artifacts ?? [],
  });
  const probing = buildWeddingNeedToKnowProbingState(context);
  const recommendations = input.knowledgeGraph
    ? buildWeddingRecommendationExplanationState(input.knowledgeGraph)
    : null;
  const title = input.title?.trim() || "Wedding planning response";
  const sections = (Object.keys(SECTION_COPY) as WeddingPresentationSectionId[])
    .map((id) => ({
      id,
      title: SECTION_COPY[id].title,
      description: SECTION_COPY[id].description,
      cards: sectionCards(id, workspace, context, recommendations),
    }))
    .filter((section) => section.cards.length > 0);

  return {
    title,
    subtitle: probing.nextQuestion
      ? `Needs one more detail: ${probing.nextQuestion.slot.replace(/_/g, " ")}.`
      : `${workspace.summaryLabel}; ready to continue from this response.`,
    heroLabel: workspace.totalArtifacts > 0
      ? "Private wedding operations room"
      : "Wedding plan starter",
    primaryAction: action("open_planning_files", "Open wedding documents", workspace, "artifacts"),
    sections,
    workspace,
    probing,
    recommendations,
  };
}

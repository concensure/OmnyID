// @locs-version: 1.0
import { buildWeddingArtifactGenerationState, type WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingNeedToKnowContextCard, WeddingResponseWorkspaceViewState, WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingDecisionResearchState = {
  kind: "guest_logistics" | "hen_night";
  recommendation: string;
  detailMarkdown: string;
  existingArtifactId: string | null;
  generatedArtifact: WeddingGeneratedArtifact | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function searchable(preview: WeddingWorkspaceArtifactPreview): string {
  return `${preview.title} ${preview.category} ${preview.bodyText ?? ""}`.toLowerCase();
}

function linkedOrMatchingArtifact(
  task: WeddingPlanningTaskItem,
  previews: readonly WeddingWorkspaceArtifactPreview[],
  pattern: RegExp,
): WeddingWorkspaceArtifactPreview | null {
  const exact = task.linkedArtifactId
    ? previews.find((preview) => preview.artifactId === task.linkedArtifactId)
    : null;
  if (exact && pattern.test(searchable(exact))) return exact;
  return previews.find((preview) => pattern.test(searchable(preview))) ?? null;
}

function relevantLines(body: string, pattern: RegExp): string[] {
  return body.split(/\r?\n/)
    .map((line) => line.replace(/^[-*#|\s]+/, "").replace(/\|/g, " · ").trim())
    .filter((line) => line.length >= 12 && pattern.test(line))
    .slice(0, 5);
}

function transportAllocationLabel(state: WeddingResponseWorkspaceViewState): string | null {
  const allocation = state.budgetTracking.budgetAllocation.find((item) => /transport|travel/i.test(`${item.categoryId} ${item.categoryLabel}`));
  if (!allocation || allocation.amount <= 0) return null;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(allocation.amount);
}

function planningPreference(contextCards: readonly WeddingNeedToKnowContextCard[]): string {
  const values = contextCards.flatMap((card) => [
    card.planningContext.atmosphereDescription,
    card.planningContext.vendorPreferences,
    ...(card.planningContext.topPriorities ?? []),
  ]).map(clean).filter(Boolean);
  return Array.from(new Set(values)).join(", ");
}

function henActivityPlan(preference: string): { recommendation: string; notes: string[] } {
  const normalized = preference.toLowerCase();
  if (/intimate|close|closed|quiet|relaxed|cosy|cozy/.test(normalized)) {
    return {
      recommendation: "Choose one private small-group activity and a relaxed shared meal, then confirm transport and each guest's comfort before booking.",
      notes: [
        "Best-fit format: a private cooking, pottery, floral or cocktail workshop where the group can talk rather than split across a noisy venue.",
        "Lower-pressure alternative: a spa or bathhouse session followed by a private dining room or at-home catered meal.",
        "Keep one optional late activity separate so guests can leave without affecting the main celebration.",
      ],
    };
  }
  if (/adventur|bold|exotic|energy|energetic|lively|vibrant/.test(normalized)) {
    return {
      recommendation: "Shortlist one distinctive group experience with a quieter fallback, and price safe door-to-door transport before collecting deposits.",
      notes: [
        "Best-fit format: a guided outdoor, dance, performance or themed group experience with a clear weather and safety fallback.",
        "Pair the main activity with a reserved meal so the group has a dependable meeting point and dietary needs can be handled.",
        "Use one organiser, a firm RSVP date and pre-arranged transport rather than asking guests to coordinate on the night.",
      ],
    };
  }
  return {
    recommendation: "Compare a relaxed group activity with one higher-energy option, then choose using attendance, comfort, transport and per-person cost.",
    notes: [
      "Relaxed option: a private workshop, long lunch, spa session or hosted experience with time for conversation.",
      "Higher-energy option: a dance, performance, games or guided activity with a quieter opt-out path.",
      "Confirm the organiser, guest list, dietary and access needs, payment deadline, transport and cancellation terms before booking.",
    ],
  };
}

function generatedResearch(input: {
  title: string;
  metadata: unknown;
  notes: readonly string[];
  assumptions: readonly string[];
  actions: readonly string[];
  sources: readonly string[];
}): WeddingGeneratedArtifact | null {
  return buildWeddingArtifactGenerationState({
    metadata: input.metadata,
    title: input.title,
    researchNotes: input.notes,
    assumptions: input.assumptions,
    verificationActions: input.actions,
    sourceLabels: input.sources,
  }).artifacts[0] ?? null;
}

export function buildWeddingDecisionResearchState(input: {
  task: WeddingPlanningTaskItem | null;
  state: WeddingResponseWorkspaceViewState;
}): WeddingDecisionResearchState | null {
  const task = input.task;
  if (!task) return null;
  const taskText = `${task.title} ${task.notes ?? ""}`;
  if (/transport|access|guest logistics/i.test(taskText) && !/hen'?s night|hen party/i.test(taskText)) {
    const artifact = linkedOrMatchingArtifact(task, input.state.artifactPreviews, /transport|route|parking|accessib|travel|location|map/);
    const findings = artifact ? relevantLines(artifact.bodyText ?? "", /transport|route|parking|accessib|travel|bus|train|station|location|map/i) : [];
    const allocation = transportAllocationLabel(input.state);
    const budgetClause = allocation ? ` Keep this work within the ${allocation} transport allocation.` : " Add a transport allocation before committing paid travel.";
    const recommendation = findings.length > 0
      ? `The saved evidence identifies ${findings[0]!.replace(/[.!?]+$/, "").toLowerCase()}; confirm parking, accessible arrival and return transport before finalising the guest plan.${budgetClause}`
      : `Route, parking and accessible-arrival evidence is not complete yet; verify those items before finalising the guest plan.${budgetClause}`;
    const generated = artifact ? null : generatedResearch({
      title: "Transport, access and guest logistics research brief",
      metadata: input.state.workspace.metadata,
      notes: [
        "No complete route or access finding is currently saved, so this brief records the exact research gap rather than inventing an answer.",
        allocation ? `${allocation} is allocated to transport in the current budget.` : "No dedicated transport allocation is currently confirmed.",
        "Check public transport disruption, station or bus-stop access, parking limits, accessible drop-off, rideshare pickup, late-night return travel and accommodation links for the selected venue.",
      ],
      assumptions: ["A final venue or exact address may still be unconfirmed."],
      actions: ["Confirm the exact venue address.", "Run live route and disruption checks for the wedding date.", "Record accessible and late-night alternatives with source links."],
      sources: ["Wedding task and current budget allocation"],
    });
    return {
      kind: "guest_logistics",
      recommendation,
      detailMarkdown: artifact?.bodyText || generated?.markdown || "",
      existingArtifactId: artifact?.artifactId ?? null,
      generatedArtifact: generated,
    };
  }
  if (/hen'?s night|hen party/i.test(taskText)) {
    const existing = linkedOrMatchingArtifact(task, input.state.artifactPreviews, /hen'?s night|hen party/);
    if (existing) return {
      kind: "hen_night",
      recommendation: "Use the saved hen's-night brief to shortlist the best-fit format, then confirm attendance, transport and per-person cost before booking.",
      detailMarkdown: existing.bodyText ?? "",
      existingArtifactId: existing.artifactId,
      generatedArtifact: null,
    };
    const preference = planningPreference(input.state.contextCards);
    const plan = henActivityPlan(preference);
    const generated = generatedResearch({
      title: "Hen's night activity research brief",
      metadata: input.state.workspace.metadata,
      notes: [
        preference ? `Saved wedding preference signals: ${preference}.` : "No strong activity-style preference is saved yet, so compare both relaxed and energetic formats.",
        ...plan.notes,
      ],
      assumptions: ["These are activity formats, not verified vendor availability or live prices."],
      actions: ["Confirm the organiser and invitees.", "Set an affordable per-person ceiling.", "Check accessibility, dietary needs, cancellation terms and door-to-door transport.", "Verify current local availability before collecting money."],
      sources: ["Couple's saved Wedding vision, priorities and planning task"],
    });
    return {
      kind: "hen_night",
      recommendation: plan.recommendation,
      detailMarkdown: generated?.markdown ?? "",
      existingArtifactId: null,
      generatedArtifact: generated,
    };
  }
  return null;
}

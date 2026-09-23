// @locs-version: 2.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export const WEDDING_NEED_TO_KNOW_AFP_PROJECTIONS_KEY = "omnyid.wedding-need-to-know-afp-projections";

export type WeddingNeedToKnowProjectionContext = {
  metadata: WeddingPlanningMetadata;
  planningContext: WeddingPlanningContext;
  answeredLabels: string[];
  nextQuestionLabel: string;
  readyForFirstRecommendations: boolean;
  projectionSaved?: boolean;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: readonly unknown[], limit = 48): string[] {
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

function contextId(metadata: WeddingPlanningMetadata): string {
  return `wedding_need_to_know:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
}

function markdownFor(context: WeddingNeedToKnowProjectionContext): string {
  const planning = context.planningContext;
  return [
    "# Wedding Need-To-Know answers",
    "",
    "Captured answers for this wedding plan. Use them to shape future documents, tasks, legal reminders, maps, suggested connections, and follow-up chat.",
    "",
    "## Captured answers",
    "",
    ...(context.answeredLabels.length > 0
      ? context.answeredLabels.map((label) => `- ${label}`)
      : ["- No answers captured yet."]),
    "",
    "## Next question",
    "",
    context.nextQuestionLabel,
    "",
    "## Planning context",
    "",
    `- Date or season: ${clean(planning.dateOrSeason) ?? "Unknown"}`,
    `- Location: ${clean(planning.location) ?? "Unknown"}`,
    `- Guest count: ${clean(planning.guestCount) ?? "Unknown"}`,
    `- Budget comfort: ${clean(planning.budgetComfort) ?? "Unknown"}`,
    `- Top priorities: ${planning.topPriorities?.length ? planning.topPriorities.join(", ") : "Unknown"}`,
    `- NOIM status: ${clean(planning.noimDownloaded) ?? "Unknown"}`,
    `- Celebrant path: ${clean(planning.celebrantPath) ?? "Unknown"}`,
    "",
    "## Guardrails",
    "",
    "- Treat this as user-provided planning context, not verified vendor availability, legal advice, or a booking.",
    "- Keep sensitive family, identity, health, finance, and legal-document details private unless the user explicitly shares them.",
  ].join("\n");
}

function projectionTags(context: WeddingNeedToKnowProjectionContext): string[] {
  const planning = context.planningContext;
  return uniqueStrings([
    ...context.metadata.supertags,
    "wedding",
    "wedding_need_to_know",
    "wedding_context",
    context.readyForFirstRecommendations ? "recommendations:ready" : "recommendations:needs_context",
    clean(planning.location) ? `location:${safeWeddingLabel(planning.location)}` : null,
    clean(planning.noimDownloaded) ? `noim:${safeWeddingLabel(planning.noimDownloaded)}` : null,
    clean(planning.celebrantPath) ? `celebrant:${safeWeddingLabel(planning.celebrantPath)}` : null,
  ]);
}

export function weddingNeedToKnowContextToAfpMessage(
  context: WeddingNeedToKnowProjectionContext,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(context.metadata);
  const id = contextId(metadata);
  const markdown = markdownFor({ ...context, metadata });
  const searchableTerms = uniqueStrings([
    id,
    "wedding planning",
    "need to know",
    "captured answers",
    metadata.weddingPlanId,
    metadata.responseWorkspaceId,
    metadata.sourceResponseId,
    ...context.answeredLabels,
    context.nextQuestionLabel,
    clean(context.planningContext.dateOrSeason),
    clean(context.planningContext.location),
    clean(context.planningContext.guestCount),
    clean(context.planningContext.budgetComfort),
    ...(context.planningContext.topPriorities ?? []),
    clean(context.planningContext.noimDownloaded),
    clean(context.planningContext.celebrantPath),
  ], 80);

  return {
    id: `afp-${id}`,
    thread_id: `wedding_context:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://search", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "context",
    kind: "note",
    subtype: "wedding_need_to_know",
    supertags: projectionTags({ ...context, metadata }),
    content: {
      kind: "wedding_need_to_know",
      context_id: id,
      markdown,
      answered_labels: context.answeredLabels,
      next_question_label: context.nextQuestionLabel,
      ready_for_first_recommendations: context.readyForFirstRecommendations,
      planning_context: context.planningContext as Record<string, unknown>,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      privacy_scope: metadata.privacyScope,
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_need_to_know_context_to_afp",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      context_id: id,
      ready_for_first_recommendations: context.readyForFirstRecommendations,
      searchable_terms: searchableTerms,
    },
    views: [{
      format: "document",
      priority: 1,
      content: {
        context_id: id,
        title: "Wedding Need-To-Know answers",
        markdown,
      },
    }],
    attachments: [],
    references: metadata.sourceResponseId
      ? [{ type: "wedding_response", target: metadata.sourceResponseId, label: "Source response" }]
      : [],
  };
}

export function weddingNeedToKnowContextToAfpSendInput(
  context: WeddingNeedToKnowProjectionContext,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const message = weddingNeedToKnowContextToAfpMessage(context, nowIso);
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

export function loadWeddingNeedToKnowAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(WEDDING_NEED_TO_KNOW_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(WEDDING_NEED_TO_KNOW_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentWeddingNeedToKnowAfpProjection(id: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingNeedToKnowAfpProjectionIds(storage).includes(cleanId) : false;
}

export function markWeddingNeedToKnowAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingNeedToKnowAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(WEDDING_NEED_TO_KNOW_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

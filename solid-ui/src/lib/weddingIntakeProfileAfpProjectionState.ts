// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export const WEDDING_INTAKE_PROFILE_AFP_PROJECTIONS_KEY = "omnyid.wedding-intake-profile-afp-projections";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: readonly unknown[] | null | undefined, limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value ?? []) {
    const cleaned = clean(item);
    const key = cleaned?.toLowerCase();
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function profileIdFor(context: WeddingNeedToKnowProjectionContext): string {
  const metadata = normalizeWeddingPlanningMetadata(context.metadata);
  return `wedding_intake_profile:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
}

export function weddingIntakeProfileProjectionId(context: WeddingNeedToKnowProjectionContext): string {
  return profileIdFor(context);
}

export function weddingIntakeProfileToAfpMessage(
  context: WeddingNeedToKnowProjectionContext,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(context.metadata);
  const planning = context.planningContext ?? {};
  const id = profileIdFor({ ...context, metadata });
  const topPriorities = stringArray(planning.topPriorities, 12);
  const vendorCategories = stringArray(planning.vendorCategories, 16);
  const inspirationImageUrls = stringArray(planning.inspirationImageUrls, 10);
  const relationshipFactLabels = stringArray(planning.relationshipFactLabels, 12);
  const vowChecklistItems = stringArray(planning.vowChecklistItems, 12);
  const searchableTerms = stringArray([
    id,
    "wedding intake profile",
    metadata.weddingPlanId,
    metadata.responseWorkspaceId,
    metadata.sourceResponseId,
    clean(planning.dateOrSeason),
    clean(planning.location),
    clean(planning.guestCount),
    clean(planning.budgetComfort),
    clean(planning.familyOrStakeholderRoles),
    clean(planning.atmosphereDescription),
    clean(planning.noimDownloaded),
    clean(planning.celebrantPath),
    clean(planning.vowPreference),
    clean(planning.vowStyle),
    ...topPriorities,
    ...vendorCategories,
    ...inspirationImageUrls,
  ], 80);

  return {
    id: `afp-${id}`,
    thread_id: `wedding_context:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://search", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "context",
    kind: "note",
    subtype: "wedding_intake_profile",
    supertags: stringArray([
      ...metadata.supertags,
      "wedding",
      "wedding_intake_profile",
      "wedding_context",
      context.readyForFirstRecommendations ? "recommendations:ready" : "recommendations:needs_context",
    ]),
    content: {
      kind: "wedding_intake_profile",
      profile_id: id,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      privacy_scope: metadata.privacyScope,
      date_or_season: clean(planning.dateOrSeason),
      location: clean(planning.location),
      guest_count: typeof planning.guestCount === "number" ? planning.guestCount : clean(planning.guestCount),
      budget_comfort: clean(planning.budgetComfort),
      couple_names: clean(planning.familyOrStakeholderRoles),
      top_priorities: topPriorities,
      vendor_categories: vendorCategories,
      vendor_preferences: clean(planning.vendorPreferences),
      atmosphere_description: clean(planning.atmosphereDescription),
      inspiration_image_urls: inspirationImageUrls,
      noim_downloaded: planning.noimDownloaded ?? null,
      celebrant_path: clean(planning.celebrantPath),
      vow_preference: clean(planning.vowPreference),
      vow_style: clean(planning.vowStyle),
      relationship_fact_labels: relationshipFactLabels,
      vow_checklist_items: vowChecklistItems,
      ready_for_first_recommendations: context.readyForFirstRecommendations,
      answered_labels: context.answeredLabels,
      next_question_label: context.nextQuestionLabel,
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_intake_profile_to_afp",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      profile_id: id,
      searchable_terms: searchableTerms,
    },
    views: [{
      format: "structured",
      priority: 1,
      content: {
        profile_id: id,
        title: "Wedding intake profile",
        fields: {
          guest_count: typeof planning.guestCount === "number" ? planning.guestCount : clean(planning.guestCount),
          budget_comfort: clean(planning.budgetComfort),
          noim_downloaded: planning.noimDownloaded ?? null,
          celebrant_path: clean(planning.celebrantPath),
          vow_preference: clean(planning.vowPreference),
          atmosphere_description: clean(planning.atmosphereDescription),
          inspiration_image_urls: inspirationImageUrls,
        },
      },
    }],
    attachments: [],
    references: metadata.sourceResponseId
      ? [{ type: "wedding_response", target: metadata.sourceResponseId, label: "Source response" }]
      : [],
  };
}

export function weddingIntakeProfileToAfpSendInput(
  context: WeddingNeedToKnowProjectionContext,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const message = weddingIntakeProfileToAfpMessage(context, nowIso);
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

export function loadWeddingIntakeProfileAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(WEDDING_INTAKE_PROFILE_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(WEDDING_INTAKE_PROFILE_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentWeddingIntakeProfileAfpProjection(id: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingIntakeProfileAfpProjectionIds(storage).includes(cleanId) : false;
}

export function markWeddingIntakeProfileAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingIntakeProfileAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(WEDDING_INTAKE_PROFILE_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

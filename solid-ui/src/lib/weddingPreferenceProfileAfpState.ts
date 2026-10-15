// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import { WEDDING_FACET_VOCABULARY_VERSION, weddingFacetById } from "@/lib/weddingFacetVocabularyState";
import { safeWeddingLabel, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

function clean(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function unique(values: readonly string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function stableId(input: { weddingPlanId: string; vocabularyVersion: string; revision: string }): string {
  return `wedding_preference_profile:${safeWeddingLabel(input.weddingPlanId)}:${safeWeddingLabel(input.vocabularyVersion)}:${safeWeddingLabel(input.revision)}`;
}

export type WeddingPreferenceProfileAfpInput = {
  metadata: WeddingPlanningMetadata;
  profile: WeddingPreferenceProfile;
  hardConstraints?: readonly { key: string; anchor: string }[];
  tradeoffs?: readonly { prefer: string; over: string; anchor: string }[];
  derivedFromSignals?: boolean;
  vocabularyVersion?: string;
  parentProfileMessageId?: string | null;
  revision: string;
  createdAt?: string;
};

/** An immutable preference context message; updates always name their parent profile. */
export function weddingPreferenceProfileToAfpSendInput(input: WeddingPreferenceProfileAfpInput): SendAfpMessageInput {
  const vocabularyVersion = clean(input.vocabularyVersion) || WEDDING_FACET_VOCABULARY_VERSION;
  const timestamp = clean(input.createdAt) || new Date().toISOString();
  const profileId = stableId({ weddingPlanId: input.metadata.weddingPlanId, vocabularyVersion, revision: input.revision });
  const facets = input.profile.facets.map((facet) => ({ ...facet }));
  const facetTags = facets.map((facet) => `wedding_facet:${facet.facetId}`);
  return {
    id: profileId,
    thread_id: `wedding_context:${safeWeddingLabel(input.metadata.responseWorkspaceId)}`,
    parent_id: clean(input.parentProfileMessageId) || null,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://search", "agent://knowledge-graph"],
    timestamp,
    type: "context",
    kind: "note",
    subtype: "wedding_preference_profile",
    content: {
      kind: "wedding_preference_profile",
      profile_id: profileId,
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      facets,
      hard_constraints: [...(input.hardConstraints ?? [])],
      tradeoffs: [...(input.tradeoffs ?? [])],
      unmapped_phrases: [...input.profile.unmapped],
      vocabulary_version: vocabularyVersion,
      derived_from_signals: input.derivedFromSignals === true,
    },
    views: [{ format: "structured", priority: 1, content: { title: "Wedding preferences", facets: facets.map((facet) => ({ id: facet.facetId, label: weddingFacetById(facet.facetId)?.label ?? facet.facetId, weight: facet.weight, anchor: facet.anchor })) } }],
    attachments: [],
    references: input.parentProfileMessageId ? [{ type: "wedding_preference_profile", target: input.parentProfileMessageId, label: "Previous preference profile" }] : [],
    supertags: unique(["wedding", "wedding_preference_profile", ...facetTags]),
    metadata: {
      origin: "wedding_planning",
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      profile_id: profileId,
      vocabulary_version: vocabularyVersion,
      parent_profile_message_id: clean(input.parentProfileMessageId) || null,
    },
    store_in_relational: true,
  };
}

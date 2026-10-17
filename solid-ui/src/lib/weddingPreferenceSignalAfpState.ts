// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingPreferenceSignal, WeddingPreferenceSignalReason } from "@/lib/weddingPreferenceSignalState";
import { safeWeddingLabel, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

function clean(value: unknown, limit = 180): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => clean(value, 80)).filter(Boolean))].sort();
}

/** Creates the immutable, plan-private record before a vendor leaves the current deck. */
export function weddingPreferenceSignalToAfpSendInput(input: {
  metadata: WeddingPlanningMetadata;
  vendorId: string;
  comparisonArtifactId: string;
  reason: WeddingPreferenceSignalReason;
  vendorFacetIds: readonly string[];
  profileFingerprint?: string | null;
  createdAt?: string;
}): { signal: WeddingPreferenceSignal; input: SendAfpMessageInput } | null {
  const vendorId = clean(input.vendorId);
  const comparisonArtifactId = clean(input.comparisonArtifactId);
  const weddingPlanId = clean(input.metadata.weddingPlanId);
  if (!vendorId || !comparisonArtifactId || !weddingPlanId) return null;
  const createdAt = clean(input.createdAt, 64) || new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) return null;
  const id = `wedding_preference_signal:${safeWeddingLabel(weddingPlanId)}:${safeWeddingLabel(vendorId)}:${input.reason}:${safeWeddingLabel(createdAt)}`;
  const vendorFacetIds = unique(input.vendorFacetIds);
  const signal: WeddingPreferenceSignal = {
    id,
    weddingPlanId,
    vendorId,
    comparisonArtifactId,
    profileFingerprint: clean(input.profileFingerprint) || null,
    reason: input.reason,
    vendorFacetIds,
    createdAt,
  };
  return {
    signal,
    input: {
      id,
      thread_id: `wedding_context:${safeWeddingLabel(input.metadata.responseWorkspaceId)}`,
      from: "user://wedding-planning",
      to: ["agent://wedding-planning", "agent://search"],
      timestamp: createdAt,
      type: "context",
      kind: "note",
      subtype: "wedding_preference_signal",
      content: {
        kind: "wedding_preference_signal",
        signal_id: id,
        wedding_plan_id: weddingPlanId,
        vendor_id: vendorId,
        comparison_artifact_id: comparisonArtifactId,
        profile_fingerprint: signal.profileFingerprint,
        reason: input.reason,
        vendor_facet_ids: vendorFacetIds,
        created_at: createdAt,
      },
      views: [{ format: "structured", priority: 1, content: { title: "Vendor feedback", reason: input.reason } }],
      attachments: [],
      references: [
        { type: "wedding_vendor_comparison", target: comparisonArtifactId, label: "Vendor comparison" },
        { type: "wedding_vendor", target: vendorId, label: "Vendor" },
      ],
      supertags: ["wedding", "wedding_preference_signal", `feedback:${input.reason}`, ...vendorFacetIds.map((facetId) => `wedding_facet:${facetId}`)],
      metadata: {
        origin: "wedding_vendor_feedback",
        store: true,
        wedding_plan_id: weddingPlanId,
        response_workspace_id: input.metadata.responseWorkspaceId,
        vendor_id: vendorId,
      },
      store_in_relational: true,
    },
  };
}

/** Invalid or foreign records never enter the deterministic preference reducer. */
export function weddingPreferenceSignalFromAfpMessage(value: unknown): WeddingPreferenceSignal | null {
  const message = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (message.subtype !== "wedding_preference_signal") return null;
  const content = message.content && typeof message.content === "object" && !Array.isArray(message.content) ? message.content as Record<string, unknown> : {};
  const id = clean(content.signal_id) || clean(message.id);
  const weddingPlanId = clean(content.wedding_plan_id);
  const vendorId = clean(content.vendor_id);
  const comparisonArtifactId = clean(content.comparison_artifact_id);
  const reason = clean(content.reason);
  const profileFingerprint = clean(content.profile_fingerprint) || null;
  const createdAt = clean(content.created_at) || clean(message.timestamp, 64);
  if (!id || !weddingPlanId || !vendorId || !comparisonArtifactId || !createdAt || !["too_big", "not_our_style", "too_far", "too_expensive", "other", "contacted", "restored"].includes(reason)) return null;
  if (!Number.isFinite(Date.parse(createdAt))) return null;
  return {
    id,
    weddingPlanId,
    vendorId,
    comparisonArtifactId,
    profileFingerprint,
    reason: reason as WeddingPreferenceSignalReason,
    vendorFacetIds: Array.isArray(content.vendor_facet_ids) ? unique(content.vendor_facet_ids.filter((item): item is string => typeof item === "string")) : [],
    createdAt,
  };
}

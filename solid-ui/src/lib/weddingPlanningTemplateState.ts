// @locs-version: 2.0
export const WEDDING_PLANNING_TEMPLATE_ID = "wedding_planning";
export const WEDDING_PLANNING_TEMPLATE_TAG = "template:wedding_planning";

export type WeddingArtifactKind =
  | "research"
  | "vendor_table"
  | "budget_sheet"
  | "guest_list"
  | "timeline"
  | "email_draft"
  | "legal"
  | "registry"
  | "map_collection"
  | "decision_log";

export type WeddingPrivacyScope =
  | "private"
  | "shared_partner"
  | "shared_family"
  | "shared_planner"
  | "shared_vendor";

export type WeddingApprovalState =
  | "draft"
  | "pending_user_approval"
  | "approved"
  | "sent"
  | "archived";

export type WeddingPlanningMetadata = {
  template: typeof WEDDING_PLANNING_TEMPLATE_ID;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
  artifactKind: WeddingArtifactKind | null;
  supertags: string[];
  privacyScope: WeddingPrivacyScope;
  approvalState: WeddingApprovalState;
};

const ARTIFACT_KINDS = new Set<WeddingArtifactKind>([
  "research",
  "vendor_table",
  "budget_sheet",
  "guest_list",
  "timeline",
  "email_draft",
  "legal",
  "registry",
  "map_collection",
  "decision_log",
]);

const PRIVACY_SCOPES = new Set<WeddingPrivacyScope>([
  "private",
  "shared_partner",
  "shared_family",
  "shared_planner",
  "shared_vendor",
]);

const APPROVAL_STATES = new Set<WeddingApprovalState>([
  "draft",
  "pending_user_approval",
  "approved",
  "sent",
  "archived",
]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function safeWeddingLabel(value: unknown, fallback = "wedding"): string {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function uniqueTags(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const tag = clean(value);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= limit) break;
  }
  return result;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function normalizedArtifactKind(value: unknown): WeddingArtifactKind | null {
  const normalized = clean(value) as WeddingArtifactKind;
  return ARTIFACT_KINDS.has(normalized) ? normalized : null;
}

function normalizedPrivacyScope(value: unknown): WeddingPrivacyScope {
  const normalized = clean(value) as WeddingPrivacyScope;
  return PRIVACY_SCOPES.has(normalized) ? normalized : "private";
}

function normalizedApprovalState(value: unknown): WeddingApprovalState {
  const normalized = clean(value) as WeddingApprovalState;
  return APPROVAL_STATES.has(normalized) ? normalized : "draft";
}

export function weddingPlanIdFromSeed(seed: unknown): string {
  const explicit = clean(seed);
  return explicit.startsWith("wedding_plan:") ? explicit : `wedding_plan:${safeWeddingLabel(explicit || "wedding")}`;
}

export function weddingResponseWorkspaceIdFromSeed(seed: unknown, weddingPlanId: string): string {
  const explicit = clean(seed);
  if (explicit.startsWith("response_workspace:")) return explicit;
  return `response_workspace:${safeWeddingLabel(explicit || weddingPlanId.replace(/^wedding_plan:/, ""))}`;
}

export function normalizeWeddingPlanningMetadata(value: unknown): WeddingPlanningMetadata {
  const weddingPlanId = weddingPlanIdFromSeed(
    recordValue(value, "weddingPlanId") ?? recordValue(value, "wedding_plan_id"),
  );
  const responseWorkspaceId = weddingResponseWorkspaceIdFromSeed(
    recordValue(value, "responseWorkspaceId") ?? recordValue(value, "response_workspace_id"),
    weddingPlanId,
  );
  const sourceResponseId = clean(recordValue(value, "sourceResponseId") ?? recordValue(value, "source_response_id")) || null;
  const artifactKind = normalizedArtifactKind(recordValue(value, "artifactKind") ?? recordValue(value, "artifact_kind"));
  const rawTags = Array.isArray(recordValue(value, "supertags")) ? recordValue(value, "supertags") as unknown[] : [];
  const supertags = uniqueTags([
    WEDDING_PLANNING_TEMPLATE_TAG,
    "event:wedding",
    weddingPlanId,
    responseWorkspaceId,
    artifactKind ? `wedding_artifact:${artifactKind}` : null,
    ...rawTags,
  ].filter(Boolean));

  return {
    template: WEDDING_PLANNING_TEMPLATE_ID,
    weddingPlanId,
    responseWorkspaceId,
    sourceResponseId,
    artifactKind,
    supertags,
    privacyScope: normalizedPrivacyScope(recordValue(value, "privacyScope") ?? recordValue(value, "privacy_scope")),
    approvalState: normalizedApprovalState(recordValue(value, "approvalState") ?? recordValue(value, "approval_state")),
  };
}

// @locs-version: 1.0

export type WeddingBoundaryRuleScopeKind = "wedding" | "family_group" | "household" | "guest";
export type WeddingBoundaryRuleEffect = "allow" | "deny" | "limit" | "require_approval" | "notify";
export type WeddingBoundaryRuleAuthority = "system" | "couple" | "partner_pair" | "planner";
export type WeddingBoundaryRuleStatus = "draft" | "active" | "superseded" | "archived";
export type WeddingBoundaryOverridePolicy = "never" | "narrower_scope" | "couple_only";

export type WeddingBoundaryFamilyGroup = {
  id: string;
  kind: "wedding_boundary_family_group";
  title: string;
  status?: string | null;
  visibility?: "couple_only" | "approved_shared" | "family_visible" | "vendor_logistics" | null;
  createdBy?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
  familyGroupId: string;
  label: string;
  householdIds: readonly string[];
  invitationAllocation?: number | null;
  ruleIds?: readonly string[] | null;
  version: number;
  supersedesId?: string | null;
};

export type WeddingBoundaryRuleConflict = {
  ruleIds: string[];
  scopeKind: WeddingBoundaryRuleScopeKind;
  scopeId: string | null;
  reason: string;
};

export type WeddingBoundaryImpactArea =
  | "guest_list"
  | "invitation_entitlement"
  | "rsvp"
  | "seating"
  | "catering"
  | "budget_forecast"
  | "tasks";

export type WeddingBoundaryImpactPreview = {
  command: "split_household" | "merge_households" | "archive_household" | "decide_request" | "change_rule";
  affectedHouseholdIds: string[];
  affectedPersonIds: string[];
  affectedInvitationIds: string[];
  impactAreas: WeddingBoundaryImpactArea[];
  warnings: string[];
  requiresElevatedConfirmation: boolean;
  canApply: boolean;
};

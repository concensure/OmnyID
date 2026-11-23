// @locs-version: 1.0

export type WeddingCollaboratorRole = "co_owner" | "planner" | "contributor" | "viewer";

export type WeddingCollaboratorInviteStatus =
  | "draft"
  | "invited"
  | "accepted"
  | "revoked"
  | "expired";

export type WeddingCollaborationSurfaceId =
  | "planning_files"
  | "budget_guest_timeline"
  | "assigned_tasks"
  | "sensitive_decisions";

export type WeddingCollaborationAction =
  | "view"
  | "edit"
  | "approve"
  | "invite"
  | "revoke"
  | "export"
  | "contact_vendor"
  | "change_sensitive_setting";

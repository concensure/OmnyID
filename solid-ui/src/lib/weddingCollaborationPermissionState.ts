// @locs-version: 2.0
import type {
  WeddingCollaborationAction,
  WeddingCollaborationSurfaceId,
  WeddingCollaboratorRole,
} from "./weddingCollaborationTypes";
export type {
  WeddingCollaborationAction,
  WeddingCollaborationSurfaceId,
} from "./weddingCollaborationTypes";

export type WeddingCollaborationPermissionDecision = {
  allowed: boolean;
  role: WeddingCollaboratorRole;
  action: WeddingCollaborationAction;
  surfaceId: WeddingCollaborationSurfaceId;
  statusLabel: string;
  reasonLabel: string;
  requiredRoleLabels: string[];
  blockerLabels: string[];
};

type PermissionRule = {
  view: WeddingCollaboratorRole[];
  edit: WeddingCollaboratorRole[];
  approve: WeddingCollaboratorRole[];
  export: WeddingCollaboratorRole[];
  contactVendor: WeddingCollaboratorRole[];
};

const roleLabels: Record<WeddingCollaboratorRole, string> = {
  co_owner: "Co-owner",
  planner: "Wedding planner",
  contributor: "Contributor",
  viewer: "Viewer",
};

const actionLabels: Record<WeddingCollaborationAction, string> = {
  view: "view",
  edit: "edit",
  approve: "approve",
  invite: "invite collaborators to",
  revoke: "revoke collaborators from",
  export: "export",
  contact_vendor: "contact vendors from",
  change_sensitive_setting: "change sensitive settings for",
};

const surfaceLabels: Record<WeddingCollaborationSurfaceId, string> = {
  planning_files: "wedding documents and replies",
  budget_guest_timeline: "budget, guest list, and timeline",
  assigned_tasks: "assigned tasks",
  sensitive_decisions: "sensitive decisions and approvals",
};

const permissionRules: Record<WeddingCollaborationSurfaceId, PermissionRule> = {
  planning_files: {
    view: ["co_owner", "planner", "viewer"],
    edit: ["co_owner", "planner"],
    approve: ["co_owner"],
    export: ["co_owner", "planner"],
    contactVendor: ["co_owner", "planner"],
  },
  budget_guest_timeline: {
    view: ["co_owner", "planner", "contributor", "viewer"],
    edit: ["co_owner", "planner"],
    approve: ["co_owner"],
    export: ["co_owner", "planner"],
    contactVendor: ["co_owner", "planner"],
  },
  assigned_tasks: {
    view: ["co_owner", "planner", "contributor", "viewer"],
    edit: ["co_owner", "planner", "contributor"],
    approve: ["co_owner", "planner"],
    export: ["co_owner", "planner"],
    contactVendor: ["co_owner", "planner"],
  },
  sensitive_decisions: {
    view: ["co_owner"],
    edit: ["co_owner"],
    approve: ["co_owner"],
    export: ["co_owner"],
    contactVendor: ["co_owner"],
  },
};

function rolesForAction(surfaceId: WeddingCollaborationSurfaceId, action: WeddingCollaborationAction): WeddingCollaboratorRole[] {
  const rule = permissionRules[surfaceId];
  if (action === "invite" || action === "revoke" || action === "change_sensitive_setting") return ["co_owner"];
  if (action === "contact_vendor") return rule.contactVendor;
  return rule[action];
}

function infrastructureBlockers(input: {
  action: WeddingCollaborationAction;
  backendReady?: boolean | null;
  encryptionReady?: boolean | null;
  auditReady?: boolean | null;
  conflictPolicyReady?: boolean | null;
}): string[] {
  const mutationAction = input.action !== "view";
  return [
    ...(!input.backendReady ? ["Workspace ACL backend not connected"] : []),
    ...(!input.encryptionReady ? ["Shared E2EE key distribution not proven"] : []),
    ...(!input.auditReady ? ["Per-collaborator audit trail not connected"] : []),
    ...(mutationAction && !input.conflictPolicyReady ? ["Concurrent edit conflict policy not connected"] : []),
  ];
}

export function evaluateWeddingCollaborationPermission(input: {
  role: WeddingCollaboratorRole;
  action: WeddingCollaborationAction;
  surfaceId: WeddingCollaborationSurfaceId;
  backendReady?: boolean | null;
  encryptionReady?: boolean | null;
  auditReady?: boolean | null;
  conflictPolicyReady?: boolean | null;
}): WeddingCollaborationPermissionDecision {
  const allowedRoles = rolesForAction(input.surfaceId, input.action);
  const roleAllowed = allowedRoles.includes(input.role);
  const blockers = [
    ...(!roleAllowed
      ? [
          `${roleLabels[input.role]} cannot ${actionLabels[input.action]} ${surfaceLabels[input.surfaceId]}.`,
        ]
      : []),
    ...infrastructureBlockers(input),
  ];
  const allowed = blockers.length === 0;
  return {
    allowed,
    role: input.role,
    action: input.action,
    surfaceId: input.surfaceId,
    statusLabel: allowed ? "Allowed" : "Blocked",
    reasonLabel: allowed
      ? `${roleLabels[input.role]} can ${actionLabels[input.action]} ${surfaceLabels[input.surfaceId]}.`
      : "Shared access is blocked until role scope and production controls both pass.",
    requiredRoleLabels: allowedRoles.map((role) => roleLabels[role]),
    blockerLabels: blockers,
  };
}

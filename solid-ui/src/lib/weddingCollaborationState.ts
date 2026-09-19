// @locs-version: 2.0
import {
  evaluateWeddingCollaborationPermission,
  type WeddingCollaborationAction,
  type WeddingCollaborationPermissionDecision,
  type WeddingCollaborationSurfaceId,
} from "./weddingCollaborationPermissionState";
import { buildWeddingCollaboratorInviteLifecycleState } from "./weddingCollaborationInviteLifecycleState";

export type WeddingCollaboratorRole = "co_owner" | "planner" | "contributor" | "viewer";

export type WeddingCollaboratorInviteStatus =
  | "draft"
  | "invited"
  | "accepted"
  | "revoked"
  | "expired";

export type WeddingCollaboratorInviteInput = {
  email?: string | null;
  displayName?: string | null;
  role?: WeddingCollaboratorRole | null;
  status?: WeddingCollaboratorInviteStatus | null;
  invitedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  invitedBy?: string | null;
  lastActiveAt?: string | null;
};

export type WeddingRoleCapabilityCard = {
  role: WeddingCollaboratorRole;
  title: string;
  summaryLabel: string;
  capabilityLabels: string[];
  restrictionLabels: string[];
};

export type WeddingCollaboratorRoleOptionCard = WeddingRoleCapabilityCard & {
  hoverHelpLabel: string;
  mobileDisclosureLabel: string;
};

export type WeddingSharedEditingSurfaceCard = {
  id: string;
  title: string;
  summaryLabel: string;
  editorRoleLabels: string[];
  viewerRoleLabels: string[];
  blockerLabels: string[];
};

export type WeddingCollaboratorInviteCard = {
  id: string;
  email: string;
  displayName: string;
  role: WeddingCollaboratorRole;
  roleLabel: string;
  roleSummaryLabel: string;
  roleCapabilityLabels: string[];
  roleRestrictionLabels: string[];
  status: WeddingCollaboratorInviteStatus;
  statusLabel: string;
  lifecycleLabel: string;
  nextActionLabel: string;
  canGrantAccess: boolean;
  metadataLabels: string[];
  missingLabels: string[];
  riskLabels: string[];
  readyForInvite: boolean;
};

export type WeddingCollaborationState = {
  productionReady: boolean;
  statusLabel: string;
  summaryLabel: string;
  roleCards: WeddingRoleCapabilityCard[];
  roleAssignmentOptions: WeddingCollaboratorRoleOptionCard[];
  editingSurfaces: WeddingSharedEditingSurfaceCard[];
  permissionProofCards: WeddingCollaborationPermissionDecision[];
  invites: WeddingCollaboratorInviteCard[];
  readyInviteCount: number;
  blockerLabels: string[];
  warningLabels: string[];
};

const roleCards: WeddingRoleCapabilityCard[] = [
  {
    role: "co_owner",
    title: "Co-owner",
    summaryLabel: "Partner-level access for the couple.",
    capabilityLabels: [
      "Edit wedding documents, budget, guest list, seating, run sheet, and decisions",
      "Approve vendor selections and controlled outreach",
      "Invite or revoke collaborators",
    ],
    restrictionLabels: ["Owner-level deletion and billing still require explicit owner confirmation"],
  },
  {
    role: "planner",
    title: "Wedding planner",
    summaryLabel: "Full planning access without account-owner controls.",
    capabilityLabels: [
      "Edit vendor research, timelines, budget projections, checklists, and run sheets",
      "Prepare email drafts and follow-up proposals",
      "Update guest, seating, and logistics files when granted by the couple",
    ],
    restrictionLabels: ["Cannot change encryption, billing, data-sharing, or owner membership settings"],
  },
  {
    role: "contributor",
    title: "Contributor",
    summaryLabel: "Assigned-task editing for family, bridal party, or helpers.",
    capabilityLabels: [
      "Update delegated checklist items",
      "Add notes, contact details, and RSVP follow-up outcomes for assigned areas",
      "View files attached to their delegated responsibilities",
    ],
    restrictionLabels: ["No default access to budget, legal documents, private notes, or full guest list"],
  },
  {
    role: "viewer",
    title: "Viewer",
    summaryLabel: "Read-only access to approved planning surfaces.",
    capabilityLabels: [
      "View approved timelines, checklists, and selected wedding documents",
      "Export only non-sensitive shared packets when allowed",
    ],
    restrictionLabels: ["Cannot edit responses, contact vendors, approve decisions, or view hidden private data"],
  },
];

const sharedEditingSurfaces: Array<{
  id: string;
  title: string;
  summaryLabel: string;
  editorRoles: WeddingCollaboratorRole[];
  viewerRoles: WeddingCollaboratorRole[];
}> = [
  {
    id: "planning_files",
    title: "Wedding documents and replies",
    summaryLabel: "Generated research, vendor comparisons, legal notes, vows, briefs, and exported packets.",
    editorRoles: ["co_owner", "planner"],
    viewerRoles: ["co_owner", "planner", "viewer"],
  },
  {
    id: "budget_guest_timeline",
    title: "Budget, guest list, and timeline",
    summaryLabel: "Real planning surfaces that should sync to Tasks, Calendar, DecisionOS, and Contacts.",
    editorRoles: ["co_owner", "planner"],
    viewerRoles: ["co_owner", "planner", "contributor", "viewer"],
  },
  {
    id: "assigned_tasks",
    title: "Assigned tasks",
    summaryLabel: "Delegated helper work such as RSVP chasing, transport checks, dress fittings, or ceremony items.",
    editorRoles: ["co_owner", "planner", "contributor"],
    viewerRoles: ["co_owner", "planner", "contributor", "viewer"],
  },
  {
    id: "sensitive_decisions",
    title: "Sensitive decisions and approvals",
    summaryLabel: "Contact sharing, paid bookings, public/private settings, admin sharing, and encryption changes.",
    editorRoles: ["co_owner"],
    viewerRoles: ["co_owner"],
  },
];

const permissionProofInputs: Array<{
  role: WeddingCollaboratorRole;
  action: WeddingCollaborationAction;
  surfaceId: WeddingCollaborationSurfaceId;
}> = [
  { role: "co_owner", action: "edit", surfaceId: "sensitive_decisions" },
  { role: "planner", action: "edit", surfaceId: "planning_files" },
  { role: "contributor", action: "edit", surfaceId: "assigned_tasks" },
  { role: "viewer", action: "view", surfaceId: "planning_files" },
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function roleLabel(role: WeddingCollaboratorRole): string {
  return roleCards.find((card) => card.role === role)?.title ?? role;
}

function roleCardFor(role: WeddingCollaboratorRole): WeddingRoleCapabilityCard {
  return roleCards.find((card) => card.role === role) ?? roleCards[3]!;
}

function buildRoleAssignmentOptions(): WeddingCollaboratorRoleOptionCard[] {
  return roleCards.map((card) => ({
    ...card,
    hoverHelpLabel: `${card.title}: ${card.summaryLabel}`,
    mobileDisclosureLabel: `Tap to review ${card.title.toLowerCase()} permissions`,
  }));
}

function buildEditingSurfaces(blockerLabels: readonly string[]): WeddingSharedEditingSurfaceCard[] {
  return sharedEditingSurfaces.map((surface) => ({
    id: surface.id,
    title: surface.title,
    summaryLabel: surface.summaryLabel,
    editorRoleLabels: surface.editorRoles.map(roleLabel),
    viewerRoleLabels: surface.viewerRoles.map(roleLabel),
    blockerLabels: [...blockerLabels],
  }));
}

function statusLabel(status: WeddingCollaboratorInviteStatus): string {
  if (status === "accepted") return "Accepted";
  if (status === "invited") return "Invited";
  if (status === "revoked") return "Revoked";
  if (status === "expired") return "Expired";
  return "Draft";
}

function validRole(role: unknown): role is WeddingCollaboratorRole {
  return role === "co_owner" || role === "planner" || role === "contributor" || role === "viewer";
}

function validStatus(status: unknown): status is WeddingCollaboratorInviteStatus {
  return status === "draft" || status === "invited" || status === "accepted" || status === "revoked" || status === "expired";
}

function inviteCard(input: WeddingCollaboratorInviteInput, index: number, nowIso?: string | null): WeddingCollaboratorInviteCard {
  const email = clean(input.email);
  const displayName = clean(input.displayName) || email || `Collaborator ${index + 1}`;
  const role = validRole(input.role) ? input.role : "viewer";
  const roleCard = roleCardFor(role);
  const status = validStatus(input.status) ? input.status : "draft";
  const lifecycle = buildWeddingCollaboratorInviteLifecycleState({
    status,
    invitedAt: input.invitedAt,
    expiresAt: input.expiresAt,
    revokedAt: input.revokedAt,
    lastActiveAt: input.lastActiveAt,
    nowIso,
  });
  const missingLabels = [
    ...(!email ? ["email required"] : []),
    ...(email && !isEmail(email) ? ["valid email required"] : []),
    ...(!validRole(input.role) ? ["role defaults to viewer until selected"] : []),
  ];
  const invitedBy = clean(input.invitedBy);
  const lastActiveAt = clean(input.lastActiveAt);
  const metadataLabels = [
    roleLabel(role),
    lifecycle.lifecycleLabel || statusLabel(status),
    ...(invitedBy ? [`invited by ${invitedBy}`] : []),
    ...(lastActiveAt ? [`last active ${lastActiveAt}`] : []),
  ];
  return {
    id: `wedding_collaborator:${email || index}`,
    email,
    displayName,
    role,
    roleLabel: roleCard.title,
    roleSummaryLabel: roleCard.summaryLabel,
    roleCapabilityLabels: roleCard.capabilityLabels,
    roleRestrictionLabels: roleCard.restrictionLabels,
    status,
    statusLabel: statusLabel(status),
    lifecycleLabel: lifecycle.lifecycleLabel,
    nextActionLabel: lifecycle.nextActionLabel,
    canGrantAccess: lifecycle.canGrantAccess,
    metadataLabels,
    missingLabels,
    riskLabels: lifecycle.riskLabels,
    readyForInvite:
      missingLabels.length === 0 &&
      (status === "draft" || status === "invited") &&
      lifecycle.lifecycleLabel !== "Expired" &&
      !lifecycle.canGrantAccess,
  };
}

export function buildWeddingCollaborationState(input: {
  invites?: readonly WeddingCollaboratorInviteInput[] | null;
  backendReady?: boolean | null;
  encryptionReady?: boolean | null;
  auditReady?: boolean | null;
  conflictPolicyReady?: boolean | null;
  nowIso?: string | null;
} = {}): WeddingCollaborationState {
  const invites = (input.invites ?? []).map((invite, index) => inviteCard(invite, index, input.nowIso));
  const blockerLabels = [
    ...(!input.backendReady ? ["Workspace ACL backend not connected"] : []),
    ...(!input.encryptionReady ? ["Shared E2EE key distribution not proven"] : []),
    ...(!input.auditReady ? ["Per-collaborator audit trail not connected"] : []),
    ...(!input.conflictPolicyReady ? ["Concurrent edit conflict policy not connected"] : []),
  ];
  const readyInviteCount = invites.filter((invite) => invite.readyForInvite).length;
  const inviteWarnings = invites.flatMap((invite) => invite.missingLabels.map((label) => `${invite.displayName}: ${label}`));
  const productionReady = blockerLabels.length === 0;
  const permissionProofCards = permissionProofInputs.map((proofInput) =>
    evaluateWeddingCollaborationPermission({
      ...proofInput,
      backendReady: input.backendReady,
      encryptionReady: input.encryptionReady,
      auditReady: input.auditReady,
      conflictPolicyReady: input.conflictPolicyReady,
    }),
  );
  return {
    productionReady,
    statusLabel: productionReady ? "Collaboration ready" : "Collaboration scaffolded",
    summaryLabel: productionReady
      ? "Role-based shared editing can be enabled for this wedding workspace."
      : "Invites can be designed now, but live shared editing must wait for ACL, E2EE, audit, and conflict controls.",
    roleCards,
    roleAssignmentOptions: buildRoleAssignmentOptions(),
    editingSurfaces: buildEditingSurfaces(blockerLabels),
    permissionProofCards,
    invites,
    readyInviteCount,
    blockerLabels,
    warningLabels: inviteWarnings,
  };
}

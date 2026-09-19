// @locs-version: 2.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import type {
  WeddingCollaboratorInviteCard,
  WeddingCollaboratorRole,
} from "@/lib/weddingCollaborationState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export const WEDDING_COLLABORATION_AFP_PROJECTIONS_KEY = "omnyid.wedding-collaboration-afp-projections";

export type WeddingCollaborationProjectionInput = {
  metadata?: unknown;
  invite: WeddingCollaboratorInviteCard;
  createdAt?: string | null;
};

export type WeddingCollaborationAccessAction = "invite" | "expire" | "revoke" | "review";

export type WeddingCollaborationAccessProjectionInput = WeddingCollaborationProjectionInput & {
  action: WeddingCollaborationAccessAction;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roleSupertag(role: WeddingCollaboratorRole): string {
  return `wedding_collaborator_role:${safeWeddingLabel(role)}`;
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
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
    metadata: message.metadata,
    store_in_relational: true,
  };
}

function projectionId(metadata: WeddingPlanningMetadata, invite: WeddingCollaboratorInviteCard): string {
  return `wedding_collaboration:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(invite.email || invite.displayName)}`;
}

function accessProjectionId(
  metadata: WeddingPlanningMetadata,
  invite: WeddingCollaboratorInviteCard,
  action: WeddingCollaborationAccessAction,
): string {
  const base = projectionId(metadata, invite);
  return action === "invite" ? base : `${base}:${safeWeddingLabel(action)}`;
}

export function weddingCollaborationInviteProjectionId(
  metadata: unknown,
  invite: WeddingCollaboratorInviteCard,
): string {
  return projectionId(normalizeWeddingPlanningMetadata(metadata), invite);
}

export function weddingCollaborationAccessProjectionId(
  metadata: unknown,
  invite: WeddingCollaboratorInviteCard,
  action: WeddingCollaborationAccessAction,
): string {
  return accessProjectionId(normalizeWeddingPlanningMetadata(metadata), invite, action);
}

export function weddingCollaborationAccessActionForInvite(
  invite: WeddingCollaboratorInviteCard,
): WeddingCollaborationAccessAction | null {
  if (invite.readyForInvite) return "invite";
  if (invite.lifecycleLabel === "Revoked") return "revoke";
  if (invite.lifecycleLabel === "Expired") return "expire";
  if ((invite.riskLabels ?? []).length > 0) return "review";
  return null;
}

function actionLabel(action: WeddingCollaborationAccessAction): string {
  if (action === "revoke") return "revocation";
  if (action === "expire") return "expiry";
  if (action === "review") return "stale-access review";
  return "invite";
}

function markdownFor(metadata: WeddingPlanningMetadata, invite: WeddingCollaboratorInviteCard): string {
  return [
    "# Wedding collaborator invite",
    "",
    `Collaborator: ${invite.displayName}`,
    `Email: ${invite.email || "Email needed"}`,
    `Role: ${invite.roleLabel}`,
    `Status: ${invite.statusLabel}`,
    "",
    "## Access policy",
    "",
    "- Co-owners can edit planning files and approve sensitive wedding decisions when backend ACL and shared E2EE proof exists.",
    "- Wedding planners can edit planning files, budget, guest, vendor, and timeline work but cannot change owner, billing, encryption, or admin-sharing settings.",
    "- Contributors can update assigned task areas only.",
    "- Viewers receive read-only approved planning access.",
    "",
    "## Production blockers",
    "",
    invite.readyForInvite
      ? "- Invite row is complete, but live shared editing still requires backend access-control proof."
      : `- Missing: ${invite.missingLabels.join(", ") || "invite details"}`,
    "",
    "## IDs",
    "",
    `- Wedding plan: ${metadata.weddingPlanId}`,
    `- Wedding workspace: ${metadata.responseWorkspaceId}`,
  ].join("\n");
}

function accessMarkdownFor(
  metadata: WeddingPlanningMetadata,
  invite: WeddingCollaboratorInviteCard,
  action: WeddingCollaborationAccessAction,
): string {
  if (action === "invite") return markdownFor(metadata, invite);
  const riskLabels = invite.riskLabels ?? [];
  return [
    `# Wedding collaborator ${actionLabel(action)}`,
    "",
    `Collaborator: ${invite.displayName}`,
    `Email: ${invite.email || "Email needed"}`,
    `Role: ${invite.roleLabel}`,
    `Lifecycle: ${invite.lifecycleLabel || invite.statusLabel}`,
    `Next action: ${invite.nextActionLabel || "Review collaborator access before enabling shared editing"}`,
    "",
    "## Access policy",
    "",
    "- This record is an audit/review projection only; it must not grant live shared editing access.",
    "- Backend ACL, shared E2EE key distribution, audit receipts, conflict handling, and explicit user approval remain required.",
    "",
    "## Risk labels",
    "",
    ...(riskLabels.length > 0 ? riskLabels.map((label) => `- ${label}`) : ["- No extra risk label supplied."]),
    "",
    "## IDs",
    "",
    `- Wedding plan: ${metadata.weddingPlanId}`,
    `- Wedding workspace: ${metadata.responseWorkspaceId}`,
  ].join("\n");
}

export function weddingCollaborationInviteToAfpMessage(
  input: WeddingCollaborationProjectionInput,
  nowIso = new Date().toISOString(),
): AfpMessage {
  return weddingCollaborationAccessToAfpMessage({ ...input, action: "invite" }, nowIso);
}

export function weddingCollaborationAccessToAfpMessage(
  input: WeddingCollaborationAccessProjectionInput,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const invite = input.invite;
  const action = input.action;
  const id = accessProjectionId(metadata, invite, action);
  const references: AfpReference[] = [
    {
      type: "workspace",
      target: metadata.responseWorkspaceId,
      label: "Wedding workspace",
    },
  ];
  const subtype = action === "invite" ? "wedding_collaborator_invite" : `wedding_collaborator_${action}`;
  const lifecycleLabel = invite.lifecycleLabel || invite.statusLabel;
  const riskLabels = invite.riskLabels ?? [];
  const missingLabels = invite.missingLabels ?? [];
  const metadataLabels = invite.metadataLabels ?? [];
  return {
    id: `afp-${id}`,
    thread_id: `wedding_collaboration:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://contacts", "agent://search", "agent://decision-queue"],
    timestamp: clean(input.createdAt) || nowIso,
    type: "access_control",
    kind: "note",
    subtype,
    supertags: [
      ...metadata.supertags,
      "wedding",
      "wedding_collaboration",
      `access_control:${safeWeddingLabel(action)}`,
      roleSupertag(invite.role),
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    ],
    content: {
      kind: subtype,
      invite_id: id,
      access_action: action,
      display_name: invite.displayName,
      email: invite.email,
      role: invite.role,
      role_label: invite.roleLabel,
      status: invite.status,
      status_label: invite.statusLabel,
      lifecycle_label: lifecycleLabel,
      next_action_label: invite.nextActionLabel ?? "Review collaborator access before enabling shared editing",
      can_grant_access: invite.canGrantAccess ?? false,
      ready_for_invite: invite.readyForInvite,
      missing_labels: missingLabels,
      risk_labels: riskLabels,
      metadata_labels: metadataLabels,
      markdown: accessMarkdownFor(metadata, invite, action),
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      privacy_scope: metadata.privacyScope,
      shared_editing_enabled: false,
      execution_guardrail: "Do not grant account access from this AFP alone; require backend ACL, shared E2EE, audit, conflict, and user-approval proof.",
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_collaboration_invite_to_afp",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      access_action: action,
      collaborator_role: invite.role,
      collaborator_status: invite.status,
      collaborator_lifecycle: lifecycleLabel,
      ready_for_invite: invite.readyForInvite,
      local_only_until_backend_acl: true,
      searchable_terms: [
        "wedding collaboration",
        `wedding collaborator ${actionLabel(action)}`,
        invite.displayName,
        invite.email,
        invite.roleLabel,
        invite.statusLabel,
        lifecycleLabel,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ].filter(Boolean),
    },
    views: [
      {
        format: "access_control_card",
        content: {
          title: invite.displayName,
          subtitle: `${invite.roleLabel} - ${lifecycleLabel}`,
          access_action: action,
          ready_for_invite: invite.readyForInvite,
          blocker_labels: [...missingLabels, ...riskLabels],
          shared_editing_enabled: false,
        },
      },
    ],
    attachments: [],
    references,
  };
}

export function weddingCollaborationInviteToAfpSendInput(
  input: WeddingCollaborationProjectionInput,
): SendAfpMessageInput {
  return messageToSendInput(weddingCollaborationInviteToAfpMessage(input));
}

export function weddingCollaborationAccessToAfpSendInput(
  input: WeddingCollaborationAccessProjectionInput,
): SendAfpMessageInput {
  return messageToSendInput(weddingCollaborationAccessToAfpMessage(input));
}

export function hasSentWeddingCollaborationAfpProjection(
  projectionId: string,
  storage: Storage,
): boolean {
  try {
    const raw = storage.getItem(WEDDING_COLLABORATION_AFP_PROJECTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Boolean(parsed?.[projectionId]);
  } catch {
    return false;
  }
}

export function markWeddingCollaborationAfpProjectionSent(
  projectionId: string,
  storage: Storage = localStorage,
): void {
  const raw = storage.getItem(WEDDING_COLLABORATION_AFP_PROJECTIONS_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  storage.setItem(WEDDING_COLLABORATION_AFP_PROJECTIONS_KEY, JSON.stringify({
    ...parsed,
    [projectionId]: true,
  }));
}

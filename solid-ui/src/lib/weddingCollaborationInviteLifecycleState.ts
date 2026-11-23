// @locs-version: 2.0
import type { WeddingCollaboratorInviteStatus } from "./weddingCollaborationTypes";

export type WeddingCollaboratorInviteLifecycleInput = {
  status: WeddingCollaboratorInviteStatus;
  invitedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastActiveAt?: string | null;
  nowIso?: string | null;
};

export type WeddingCollaboratorInviteLifecycleState = {
  lifecycleLabel: string;
  nextActionLabel: string;
  canGrantAccess: boolean;
  riskLabels: string[];
};

const staleAccessWindowMs = 1000 * 60 * 60 * 24 * 30;

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function buildWeddingCollaboratorInviteLifecycleState(
  input: WeddingCollaboratorInviteLifecycleInput,
): WeddingCollaboratorInviteLifecycleState {
  const nowMs = timeMs(input.nowIso) ?? Date.now();
  const expiresAtMs = timeMs(input.expiresAt);
  const revokedAtMs = timeMs(input.revokedAt);
  const lastActiveAtMs = timeMs(input.lastActiveAt);
  const expiredByTime = expiresAtMs !== null && expiresAtMs <= nowMs;
  const staleAcceptedAccess = input.status === "accepted" && lastActiveAtMs !== null && nowMs - lastActiveAtMs > staleAccessWindowMs;

  if (input.status === "revoked" || revokedAtMs !== null) {
    return {
      lifecycleLabel: "Revoked",
      nextActionLabel: "Create a fresh invite if access is needed again",
      canGrantAccess: false,
      riskLabels: ["Existing shared access must stay closed and auditable."],
    };
  }

  if (input.status === "expired" || expiredByTime) {
    return {
      lifecycleLabel: "Expired",
      nextActionLabel: "Renew invite after confirming the role is still correct",
      canGrantAccess: false,
      riskLabels: ["Expired invites must not grant workspace access."],
    };
  }

  if (input.status === "accepted") {
    return {
      lifecycleLabel: staleAcceptedAccess ? "Accepted, inactive" : "Accepted",
      nextActionLabel: staleAcceptedAccess ? "Review whether this collaborator still needs access" : "Review access periodically",
      canGrantAccess: true,
      riskLabels: staleAcceptedAccess ? ["No recent activity; review or revoke stale access."] : [],
    };
  }

  if (input.status === "invited") {
    return {
      lifecycleLabel: "Invite sent",
      nextActionLabel: "Wait for acceptance or resend before expiry",
      canGrantAccess: false,
      riskLabels: [],
    };
  }

  return {
    lifecycleLabel: "Draft",
    nextActionLabel: "Send invite after role and email are confirmed",
    canGrantAccess: false,
    riskLabels: [],
  };
}

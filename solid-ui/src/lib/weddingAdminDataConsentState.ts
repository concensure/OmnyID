// @locs-version: 2.0
export type WeddingAdminDataConsentInput = {
  enabled?: boolean | null;
  workspaceId?: string | null;
  planId?: string | null;
  submittedResponseCount?: number | null;
  lastSubmittedAt?: string | null;
};

export type WeddingAdminDataConsentState = {
  enabled: boolean;
  toggleLabel: string;
  iconLabel: string;
  hoverMessage: string;
  statusLabel: string;
  adminPacketReady: boolean;
  adminPacket: {
    workspaceId: string | null;
    planId: string | null;
    anonymized: true;
    submittedResponseCount: number;
    consentSource: "wedding_template_toggle";
  } | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function buildWeddingAdminDataConsentState(
  input: WeddingAdminDataConsentInput = {},
): WeddingAdminDataConsentState {
  const enabled = input.enabled === true;
  const submittedResponseCount = count(input.submittedResponseCount);
  const lastSubmittedAt = clean(input.lastSubmittedAt);
  return {
    enabled,
    toggleLabel: "Share anonymized wedding planning data with admin",
    iconLabel: "How admin data sharing works",
    hoverMessage: "If enabled, generated wedding plans and responses are copied anonymously to the admin review interface as anonymized planning data, without names, direct contact details, guest identities, or private documents. Use this only with explicit user consent.",
    statusLabel: enabled
      ? lastSubmittedAt
        ? `Anonymized sharing enabled; last copied ${lastSubmittedAt}.`
        : "Anonymized sharing enabled; new generated plans can be copied to admin."
      : "Anonymized sharing is off. Wedding plans stay in the user's workspace unless separately exported or shared.",
    adminPacketReady: enabled,
    adminPacket: enabled
      ? {
        workspaceId: clean(input.workspaceId),
        planId: clean(input.planId),
        anonymized: true,
        submittedResponseCount,
        consentSource: "wedding_template_toggle",
      }
      : null,
  };
}

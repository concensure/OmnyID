// @locs-version: 1.0
import type { DashboardBootstrap } from "./api";

type SupportAccess = NonNullable<DashboardBootstrap["support_access"]>;
type SupportAccessCarrier = SupportAccess | null | undefined;

export type SupportAccessBoundaryCardState = {
  reason: string | null;
  supportPostureLine: string;
};

export function supportAccessStatus(
  supportAccess?: SupportAccessCarrier,
  fallback = "disabled",
): string {
  return supportAccess?.status ?? fallback;
}

export function supportAccessScope(
  supportAccess?: SupportAccessCarrier,
  fallback = "none",
): string {
  return supportAccess?.access_scope ?? fallback;
}

export function supportAccessReason(
  supportAccess?: SupportAccessCarrier,
): string | null {
  return supportAccess?.reason ?? null;
}

export function supportAccessSupportPostureLabel(
  supportAccess?: SupportAccessCarrier,
): string {
  return supportAccess?.support_disabled_by_default === false
    ? "customized"
    : "disabled by default";
}

export function supportAccessGrantedAt(
  supportAccess?: SupportAccessCarrier,
): string | null {
  return supportAccess?.granted_at ?? null;
}

export function supportAccessExpiresAt(
  supportAccess?: SupportAccessCarrier,
): string | null {
  return supportAccess?.expires_at ?? null;
}

export function supportAccessRevokedAt(
  supportAccess?: SupportAccessCarrier,
): string | null {
  return supportAccess?.revoked_at ?? null;
}

export function supportAccessBoundaryEndAt(
  supportAccess?: SupportAccessCarrier,
): string | null {
  return supportAccessRevokedAt(supportAccess) ?? supportAccessExpiresAt(supportAccess);
}

export function supportAccessBoundaryCardState(
  supportAccess?: SupportAccessCarrier,
): SupportAccessBoundaryCardState {
  return {
    reason: supportAccessReason(supportAccess),
    supportPostureLine: `Support posture: ${supportAccessSupportPostureLabel(supportAccess)}`,
  };
}

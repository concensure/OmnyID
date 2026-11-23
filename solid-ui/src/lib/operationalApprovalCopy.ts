// @locs-version: 1.0
import { approvalPendingStatusLabel } from "afp-ts/continuity";

export function operationalApprovalPendingReason(scope?: string | null): string {
  const normalizedScope = typeof scope === "string" ? scope.trim() : "";
  return normalizedScope
    ? `${approvalPendingStatusLabel()} for ${normalizedScope}`
    : approvalPendingStatusLabel();
}

// @locs-version: 1.0
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

export type SessionEndReason = "manual_sign_out" | "unauthorized" | "account_disabled" | "unknown";

export type SessionChangedDetail<T> = {
  session: T | null;
  reason: SessionEndReason | null;
};

function normalizeSessionEndReason(value: unknown): SessionEndReason | null {
  if (
    value === "manual_sign_out" ||
    value === "unauthorized" ||
    value === "account_disabled" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

export function normalizeSessionChangedDetail<T>(detail: unknown): SessionChangedDetail<T> {
  const objectDetail = afpOptionalRecord(detail);
  if (objectDetail && "session" in objectDetail) {
    return {
      session: (objectDetail.session ?? null) as T | null,
      reason: normalizeSessionEndReason(objectDetail.reason),
    };
  }
  return {
    session: (detail ?? null) as T | null,
    reason: null,
  };
}

export function buildSessionEndedNotice(reason: SessionEndReason | null): {
  showAuthModal: boolean;
  tone: "success" | "error";
  text: string;
} {
  if (reason === "manual_sign_out") {
    return {
      showAuthModal: false,
      tone: "success",
      text: "Signed out of your homeserver.",
    };
  }
  if (reason === "unauthorized") {
    return {
      showAuthModal: true,
      tone: "error",
      text: "Your session expired or was revoked. Sign in again to reconnect to your homeserver.",
    };
  }
  if (reason === "account_disabled") {
    return {
      showAuthModal: false,
      tone: "error",
      text: "Account access is disabled. Contact support or an operator to restore access.",
    };
  }
  return {
    showAuthModal: false,
    tone: "error",
    text: "Your session ended. Sign in again when you want to reconnect to your homeserver.",
  };
}

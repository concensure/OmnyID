// @locs-version: 1.0
import type { Session } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type AuthApiResponse = {
  token?: string;
  user?: Session["user"];
  requires_2fa: boolean;
  verification_required: boolean;
  message?: string;
  email?: string;
};

function normalizeAuthUser(value: unknown): Session["user"] | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== "string"
    || typeof value.email !== "string"
    || typeof value.display_name !== "string"
    || typeof value.auth_provider !== "string"
  ) {
    return undefined;
  }
  return {
    id: value.id,
    email: value.email,
    display_name: value.display_name,
    auth_provider: value.auth_provider,
  };
}

export function parseAuthApiResponse(value: unknown): AuthApiResponse {
  if (!isRecord(value)) {
    return {
      requires_2fa: false,
      verification_required: false,
    };
  }
  return {
    token: typeof value.token === "string" ? value.token : undefined,
    user: normalizeAuthUser(value.user),
    requires_2fa: value.requires_2fa === true,
    verification_required: value.verification_required === true,
    message: typeof value.message === "string" ? value.message : undefined,
    email: typeof value.email === "string" ? value.email : undefined,
  };
}

export function parseAuthMessageResponse(value: unknown): { message?: string } {
  if (!isRecord(value) || typeof value.message !== "string") return {};
  return { message: value.message };
}

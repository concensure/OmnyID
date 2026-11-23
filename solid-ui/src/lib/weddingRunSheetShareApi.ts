// @locs-version: 1.0
import { apiFetch, apiUrlForPath } from "@/lib/api";

export type WeddingRunSheetShareAcknowledgement = {
  acknowledgement_id: string;
  status: "acknowledged" | "changes_requested";
  actor_label: string;
  note?: string | null;
  created_at: string;
};

export type WeddingRunSheetShareGrant = {
  grant_id: string;
  database_id: string;
  wedding_plan_id: string;
  view_id: string;
  view_revision: number;
  recipient_role: "vendor" | "photo_video" | "vip" | "guest";
  recipient_label: string;
  record_ids: string[];
  signoff_required: boolean;
  signoff_due_at?: string | null;
  expires_at: string;
  revoked_at?: string | null;
  view_count: number;
  last_viewed_at?: string | null;
  created_at: string;
  acknowledgement?: WeddingRunSheetShareAcknowledgement | null;
};

export type WeddingRunSheetHostedView = {
  grant: WeddingRunSheetShareGrant;
  view_name: string;
  columns: string[];
  rows: Array<{ record_id: string; values: Record<string, unknown> }>;
};

export async function loadWeddingRunSheetShareCapability(): Promise<{ enabled: boolean; max_expiry_days: number; token_in_fragment: boolean }> {
  return apiFetch("/database/wedding-runsheet/shares/capability");
}

export async function listWeddingRunSheetShareGrants(databaseId: string): Promise<WeddingRunSheetShareGrant[]> {
  return apiFetch(`/database/wedding-runsheet/shares?database_id=${encodeURIComponent(databaseId)}`);
}

export async function createWeddingRunSheetShare(input: {
  databaseId: string;
  weddingPlanId: string;
  viewId: string;
  viewRevision: number;
  recipientRole: WeddingRunSheetShareGrant["recipient_role"];
  recipientLabel: string;
  recordIds: string[];
  signoffRequired: boolean;
  signoffDueAt?: string | null;
  expiresAt: string;
}): Promise<{ grant: WeddingRunSheetShareGrant; token: string }> {
  return apiFetch("/database/wedding-runsheet/shares", {
    method: "POST",
    bodyJson: {
      database_id: input.databaseId, wedding_plan_id: input.weddingPlanId,
      view_id: input.viewId, view_revision: input.viewRevision,
      recipient_role: input.recipientRole, recipient_label: input.recipientLabel,
      record_ids: input.recordIds, signoff_required: input.signoffRequired,
      signoff_due_at: input.signoffDueAt ?? null, expires_at: input.expiresAt,
    },
  });
}

export async function revokeWeddingRunSheetShare(grantId: string): Promise<WeddingRunSheetShareGrant> {
  return apiFetch(`/database/wedding-runsheet/shares/${encodeURIComponent(grantId)}/revoke`, { method: "POST" });
}

async function publicShareFetch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrlForPath(path), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text() || "This protected run sheet is not available.");
  return response.json() as Promise<T>;
}

export function openWeddingRunSheetShare(token: string): Promise<WeddingRunSheetHostedView> {
  return publicShareFetch("/database/wedding-runsheet/shares/open", { token });
}

export function acknowledgeWeddingRunSheetShare(input: {
  token: string;
  status: WeddingRunSheetShareAcknowledgement["status"];
  actorLabel: string;
  note?: string;
  idempotencyKey: string;
}): Promise<WeddingRunSheetShareAcknowledgement> {
  return publicShareFetch("/database/wedding-runsheet/shares/acknowledge", {
    token: input.token, status: input.status, actor_label: input.actorLabel,
    note: input.note?.trim() || null, idempotency_key: input.idempotencyKey,
  });
}

export function weddingRunSheetProtectedLink(token: string, origin = window.location.origin): string {
  return `${origin}/workspace/runsheet-share.html#${token}`;
}

export function weddingRunSheetGrantState(grant: WeddingRunSheetShareGrant, now = Date.now()): "revoked" | "expired" | "changes_requested" | "acknowledged" | "awaiting_signoff" | "active" {
  if (grant.revoked_at) return "revoked";
  if (Date.parse(grant.expires_at) <= now) return "expired";
  if (grant.acknowledgement?.status === "changes_requested") return "changes_requested";
  if (grant.acknowledgement?.status === "acknowledged") return "acknowledged";
  if (grant.signoff_required) return "awaiting_signoff";
  return "active";
}

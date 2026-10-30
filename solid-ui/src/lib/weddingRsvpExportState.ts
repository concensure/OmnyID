// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingRsvpVendorExportAudience = "caterer" | "venue";

export type WeddingRsvpVendorExportPreview = {
  exportId: string;
  audience: WeddingRsvpVendorExportAudience;
  eventId: string;
  fieldLabels: string[];
  rowCount: number;
  rows: Record<string, string>[];
  excludedFieldLabels: string[];
  warningLabels: string[];
  sourceReferences: string[];
};

export type WeddingRsvpExportReceipt = {
  receiptId: string;
  exportId: string;
  audience: WeddingRsvpVendorExportAudience;
  recipientLabel: string;
  eventId: string;
  approvedFields: string[];
  rowCount: number;
  createdAt: string;
  correctsReceiptId: string | null;
  revokedAt: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function explicitDietaryCategory(note: string | null): string {
  const value = clean(note);
  if (!value) return "None recorded";
  const match = /^(allergy|coeliac|preference|other)\s*:/i.exec(value);
  if (!match) return "Unclassified — couple review required";
  const category = match[1]?.toLowerCase();
  if (category === "allergy") return "Allergy";
  if (category === "coeliac") return "Coeliac";
  if (category === "preference") return "Preference";
  return "Other";
}

export function buildWeddingRsvpCoupleCsv(
  guestTracking: WeddingGuestTrackingState,
  eventId?: string | null,
): string {
  const headers = ["guest_id", "name", "household", "event_id", "attendance", "response_source", "response_revision", "contact", "meal", "dietary_note", "accessibility_note"];
  const rows = (guestTracking.guestRows ?? []).flatMap((row) => {
    const responses = eventId
      ? row.eventResponses.filter((response) => response.eventId === eventId)
      : row.eventResponses.length > 0 ? row.eventResponses : [null];
    return responses.map((response) => [
      row.id,
      row.displayName,
      row.householdLabel,
      response?.eventId ?? "",
      response?.attendance ?? row.rsvpStatus,
      response?.responseSource ?? row.sourceLabel,
      response?.revision ?? "",
      row.contactLabel ?? "",
      row.mealPreference ?? "",
      row.dietaryNote ?? "",
      row.accessibilityNote ?? "",
    ]);
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function buildWeddingRsvpVendorExportPreview(input: {
  guestTracking: WeddingGuestTrackingState;
  eventId: string;
  audience: WeddingRsvpVendorExportAudience;
  includeDietaryDetails?: boolean;
}): WeddingRsvpVendorExportPreview {
  const rows = (input.guestTracking.guestRows ?? []).flatMap((guest) => {
    const response = guest.eventResponses.find((item) => item.eventId === input.eventId);
    if (!response || response.attendance !== "Attending") return [];
    const base: Record<string, string> = {
      guest_reference: guest.id,
      guest_name: guest.displayName,
      attendance: "Attending",
    };
    if (input.audience === "caterer") {
      base.meal_choice = clean(guest.mealPreference) || "Not provided";
      base.dietary_category = explicitDietaryCategory(guest.dietaryNote);
      if (input.includeDietaryDetails) base.dietary_detail = clean(guest.dietaryNote) || "None recorded";
    }
    return [base];
  });
  const fieldLabels = rows.length > 0 ? Object.keys(rows[0]!) : ["guest_reference", "guest_name", "attendance"];
  const unclassifiedCount = rows.filter((row) => row.dietary_category === "Unclassified — couple review required").length;
  return {
    exportId: `wedding_rsvp_export:${safeWeddingLabel(input.eventId)}:${input.audience}`,
    audience: input.audience,
    eventId: input.eventId,
    fieldLabels,
    rowCount: rows.length,
    rows,
    excludedFieldLabels: ["Contact details", "Private notes", "Accessibility details", ...(input.includeDietaryDetails ? [] : ["Dietary detail"])],
    warningLabels: [
      unclassifiedCount > 0 ? `${unclassifiedCount} dietary note${unclassifiedCount === 1 ? " needs" : "s need"} the couple to label it as allergy, coeliac, preference, or other.` : null,
      "This preview does not infer health facts from meal choices.",
    ].filter((label): label is string => Boolean(label)),
    sourceReferences: rows.map((row) => `guest:${row.guest_reference}`),
  };
}

export function weddingRsvpExportReceiptToAfpSendInput(input: {
  preview: WeddingRsvpVendorExportPreview;
  recipientLabel: string;
  approvedBy: string;
  metadata?: unknown;
  nowIso?: string;
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const receiptId = `${input.preview.exportId}:receipt:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  return {
    id: receiptId,
    thread_id: `wedding_rsvp_exports:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning", "agent://knowledge-graph"],
    type: "ledger",
    kind: "wedding_rsvp_export_receipt",
    subtype: "wedding_rsvp_export_receipt",
    content: {
      kind: "wedding_rsvp_export_receipt",
      contract_version: 1,
      receipt_id: receiptId,
      export_id: input.preview.exportId,
      audience: input.preview.audience,
      recipient_label: clean(input.recipientLabel),
      event_id: input.preview.eventId,
      approved_fields: input.preview.fieldLabels,
      excluded_fields: input.preview.excludedFieldLabels,
      row_count: input.preview.rowCount,
      source_references: input.preview.sourceReferences,
      approved_by: clean(input.approvedBy) || "couple",
      approval_status: "approved",
      delivery_status: "downloaded_for_manual_handoff",
      corrects_receipt_id: null,
      revoked_at: null,
      created_at: nowIso,
    },
    metadata: {
      template: "wedding_planning",
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      origin: "wedding_rsvp_export",
      approval_status: "approved",
      external_delivery: false,
      model_calls: 0,
    },
    references: input.preview.sourceReferences.map((target) => ({ type: "source", target, label: "RSVP source" })),
    supertags: ["template:wedding_planning", "wedding_rsvp:export_receipt", "approval:recorded", "privacy:minimum_necessary"],
    store_in_relational: true,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function weddingRsvpExportReceiptsFromAfpMessages(
  messages: readonly AfpMessage[] | null | undefined,
): WeddingRsvpExportReceipt[] {
  const revocations = new Map<string, string>();
  for (const message of messages ?? []) {
    if (message.kind !== "wedding_rsvp_export_revocation") continue;
    const content = record(message.content);
    const receiptId = clean(content.receipt_id);
    const revokedAt = clean(content.revoked_at) || message.timestamp;
    if (receiptId) revocations.set(receiptId, revokedAt);
  }
  return (messages ?? []).flatMap((message) => {
    if (message.kind !== "wedding_rsvp_export_receipt") return [];
    const content = record(message.content);
    const receiptId = clean(content.receipt_id);
    const audience = clean(content.audience);
    if (!receiptId || (audience !== "caterer" && audience !== "venue")) return [];
    return [{
      receiptId,
      exportId: clean(content.export_id),
      audience,
      recipientLabel: clean(content.recipient_label),
      eventId: clean(content.event_id),
      approvedFields: strings(content.approved_fields),
      rowCount: Number.isSafeInteger(content.row_count) ? Number(content.row_count) : 0,
      createdAt: clean(content.created_at) || message.timestamp,
      correctsReceiptId: clean(content.corrects_receipt_id) || null,
      revokedAt: revocations.get(receiptId) ?? (clean(content.revoked_at) || null),
    } satisfies WeddingRsvpExportReceipt];
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function weddingRsvpExportCorrectionToAfpSendInput(input: {
  previousReceipt: WeddingRsvpExportReceipt;
  preview: WeddingRsvpVendorExportPreview;
  approvedBy: string;
  metadata?: unknown;
  nowIso?: string;
}): SendAfpMessageInput {
  const next = weddingRsvpExportReceiptToAfpSendInput({
    preview: input.preview,
    recipientLabel: input.previousReceipt.recipientLabel,
    approvedBy: input.approvedBy,
    metadata: input.metadata,
    nowIso: input.nowIso,
  });
  next.content = {
    ...record(next.content),
    receipt_type: "correction",
    corrects_receipt_id: input.previousReceipt.receiptId,
  };
  next.references = [
    ...(next.references ?? []),
    { type: "corrects", target: input.previousReceipt.receiptId, label: "Corrected export receipt" },
  ];
  next.supertags = [...(next.supertags ?? []), "wedding_rsvp:export_correction"];
  return next;
}

export function weddingRsvpExportRevocationToAfpSendInput(input: {
  receipt: WeddingRsvpExportReceipt;
  revokedBy: string;
  reason?: string | null;
  metadata?: unknown;
  nowIso?: string;
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const revocationId = `${input.receipt.receiptId}:revocation:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  return {
    id: revocationId,
    thread_id: `wedding_rsvp_exports:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning", "agent://knowledge-graph"],
    type: "ledger",
    kind: "wedding_rsvp_export_revocation",
    subtype: "wedding_rsvp_export_revocation",
    content: {
      kind: "wedding_rsvp_export_revocation",
      contract_version: 1,
      revocation_id: revocationId,
      receipt_id: input.receipt.receiptId,
      export_id: input.receipt.exportId,
      audience: input.receipt.audience,
      recipient_label: input.receipt.recipientLabel,
      revoked_by: clean(input.revokedBy) || "couple",
      reason: clean(input.reason) || "Permission withdrawn for future use",
      effect: "future_use_only_downloaded_file_cannot_be_recalled",
      revoked_at: nowIso,
    },
    metadata: {
      template: "wedding_planning",
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      origin: "wedding_rsvp_export",
      external_delivery: false,
      model_calls: 0,
    },
    references: [{ type: "revokes", target: input.receipt.receiptId, label: "Export receipt" }],
    supertags: ["template:wedding_planning", "wedding_rsvp:export_revocation", "privacy:future_use_revoked"],
    store_in_relational: true,
  };
}

export function weddingRsvpVendorPreviewCsv(preview: WeddingRsvpVendorExportPreview): string {
  return [preview.fieldLabels, ...preview.rows.map((row) => preview.fieldLabels.map((field) => row[field] ?? ""))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

// @locs-version: 2.0
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { AfpAttachment, WeddingVendor } from "@/lib/api";
import {
  DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS,
  weddingVendorDraftDisclosureFingerprint,
  type WeddingVendorEnquiryPermissions,
} from "@/lib/weddingVendorEnquiryPermissionsState";

export type WeddingVendorOutreachStage =
  | "idle"
  | "drafting"
  | "draft_ready"
  | "draft_failed"
  | "sending"
  | "send_failed"
  | "sent";

export type WeddingVendorOutreachFlowState = {
  choiceId: string;
  vendorName: string;
  recipientEmail: string | null;
  stage: WeddingVendorOutreachStage;
  subject: string;
  bodyMarkdown: string;
  bodyHtml: string | null;
  groundedOnLabels: string[];
  groundedOnFields: string[];
  sourceReferences: Array<{ type: string; target: string; label: string }>;
  generation: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    inputFingerprint: string;
    promptPrefixId: string;
    servedFrom: "model" | "deterministic_template" | "afp_reuse";
  } | null;
  permissions: WeddingVendorEnquiryPermissions;
  draftPermissionFingerprint: string;
  draftMessageId: string | null;
  revision: number;
  hasUnpersistedChanges: boolean;
  sentAtIso: string | null;
  receiptRef: string | null;
  threadId: string | null;
  blockedReason: string | null;
  attachments: AfpAttachment[];
};

/**
 * Existing AFP-backed drafts are the cache for outreach generation. Opening a
 * prepared enquiry must not spend tokens again; only a first attempt, a failed
 * attempt, or an explicit meaningful regeneration may call the model route.
 */
export function weddingVendorOutreachNeedsGeneration(
  flow: WeddingVendorOutreachFlowState,
  forceRegeneration = false,
): boolean {
  return forceRegeneration || flow.stage === "idle" || flow.stage === "draft_failed";
}

function normalizedVendorLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hostnameOf(url: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function weddingVendorOutreachRecipient(
  card: Pick<WeddingVendorChoiceCardData, "email" | "title" | "websiteUrl">,
  directoryVendors: readonly WeddingVendor[],
): string | null {
  if (card.email) return card.email;

  const cardNameKey = normalizedVendorLabel(card.title);
  const byName = directoryVendors.find(
    (vendor) => vendor.contactEmail && normalizedVendorLabel(vendor.vendorName) === cardNameKey,
  );
  if (byName?.contactEmail) return byName.contactEmail;

  const cardHostname = card.websiteUrl ? hostnameOf(card.websiteUrl) : null;
  if (cardHostname) {
    const byHostname = directoryVendors.find(
      (vendor) => vendor.contactEmail && vendor.websiteUrl && hostnameOf(vendor.websiteUrl) === cardHostname,
    );
    if (byHostname?.contactEmail) return byHostname.contactEmail;
  }

  return null;
}

export function weddingVendorOutreachSendGate(
  flow: Pick<WeddingVendorOutreachFlowState, "vendorName" | "recipientEmail" | "bodyMarkdown" | "permissions" | "groundedOnFields" | "draftPermissionFingerprint">,
  gate: { gmailConnected: boolean; protectedRepliesAvailable?: boolean },
): { canSend: boolean; reason: string | null } {
  if (!flow.recipientEmail) {
    return {
      canSend: false,
      reason: `No email address found for ${flow.vendorName}. Open their website to use their contact form, or add an email in the vendor directory.`,
    };
  }
  if (!gate.gmailConnected && !gate.protectedRepliesAvailable) {
    return {
      canSend: false,
      reason: "Connect Gmail to send this enquiry. Nothing is sent until you press Send.",
    };
  }
  if (!flow.bodyMarkdown.trim()) {
    return { canSend: false, reason: "Add a message before sending." };
  }
  if (flow.draftPermissionFingerprint !== weddingVendorDraftDisclosureFingerprint(flow.permissions)) {
    return { canSend: false, reason: "Update the draft so it matches the information you chose to share." };
  }
  if (flow.permissions.shareApproximateBudget !== flow.groundedOnFields.includes("budget_comfort")) {
    return { canSend: false, reason: "Update the draft so its budget wording matches your sharing choice." };
  }
  if (flow.permissions.replyRoute === "omnyid_protected" && !gate.protectedRepliesAvailable) {
    return {
      canSend: false,
      reason: "Protected OmnyID replies are not enabled for this send yet. Choose your connected email to continue.",
    };
  }
  if (!flow.permissions.previewApproved) {
    return { canSend: false, reason: "Review the recipient, message and shared information before sending." };
  }
  return { canSend: true, reason: null };
}

export function weddingVendorOutreachSentLabel(flow: Pick<WeddingVendorOutreachFlowState, "sentAtIso">): string {
  if (!flow.sentAtIso) return "Enquiry sent";
  const date = new Date(flow.sentAtIso);
  if (Number.isNaN(date.getTime())) return "Enquiry sent";
  return `Enquiry sent ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function weddingVendorOutreachIdleFlow(input: {
  choiceId: string;
  vendorName: string;
  recipientEmail: string | null;
}): WeddingVendorOutreachFlowState {
  return {
    choiceId: input.choiceId,
    vendorName: input.vendorName,
    recipientEmail: input.recipientEmail,
    stage: "idle",
    subject: "",
    bodyMarkdown: "",
    bodyHtml: null,
    groundedOnLabels: [],
    groundedOnFields: [],
    sourceReferences: [],
    generation: null,
    permissions: { ...DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS },
    draftPermissionFingerprint: weddingVendorDraftDisclosureFingerprint(DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS),
    draftMessageId: null,
    revision: 0,
    hasUnpersistedChanges: false,
    sentAtIso: null,
    receiptRef: null,
    threadId: null,
    blockedReason: null,
    attachments: [],
  };
}

export function weddingVendorOutreachStartDrafting(
  flow: WeddingVendorOutreachFlowState,
): WeddingVendorOutreachFlowState {
  return { ...flow, stage: "drafting", blockedReason: null };
}

export function weddingVendorOutreachDraftSucceeded(
  flow: WeddingVendorOutreachFlowState,
  draft: {
    subject: string;
    bodyMarkdown: string;
    bodyHtml?: string | null;
    groundedOnLabels: string[];
    groundedOnFields?: string[];
    sourceReferences?: Array<{ type: string; target: string; label: string }>;
    generation?: WeddingVendorOutreachFlowState["generation"];
  },
): WeddingVendorOutreachFlowState {
  return {
    ...flow,
    stage: "draft_ready",
    subject: draft.subject,
    bodyMarkdown: draft.bodyMarkdown,
    bodyHtml: draft.bodyHtml ?? null,
    groundedOnLabels: draft.groundedOnLabels,
    groundedOnFields: draft.groundedOnFields ?? [],
    sourceReferences: draft.sourceReferences ?? [],
    generation: draft.generation ?? null,
    revision: Math.max(1, flow.revision + 1),
    hasUnpersistedChanges: false,
    permissions: { ...flow.permissions, previewApproved: false },
    draftPermissionFingerprint: weddingVendorDraftDisclosureFingerprint(flow.permissions),
    blockedReason: null,
  };
}

export function weddingVendorOutreachDraftFailed(
  flow: WeddingVendorOutreachFlowState,
  reason: string,
): WeddingVendorOutreachFlowState {
  return { ...flow, stage: "draft_failed", blockedReason: reason };
}

export function weddingVendorOutreachBodyChanged(
  flow: WeddingVendorOutreachFlowState,
  bodyMarkdown: string,
  bodyHtml?: string,
): WeddingVendorOutreachFlowState {
  return {
    ...flow,
    bodyMarkdown,
    bodyHtml: bodyHtml?.trim() || null,
    hasUnpersistedChanges: true,
    permissions: { ...flow.permissions, previewApproved: false },
  };
}

export function weddingVendorOutreachPermissionsChanged(
  flow: WeddingVendorOutreachFlowState,
  permissions: WeddingVendorEnquiryPermissions,
): WeddingVendorOutreachFlowState {
  return {
    ...flow,
    permissions,
    hasUnpersistedChanges: true,
  };
}

export function weddingVendorOutreachStartSending(
  flow: WeddingVendorOutreachFlowState,
): WeddingVendorOutreachFlowState {
  return { ...flow, stage: "sending", blockedReason: null };
}

export function weddingVendorOutreachSendSucceeded(
  flow: WeddingVendorOutreachFlowState,
  result: { sentAtIso: string; receiptRef: string | null; threadId: string | null },
): WeddingVendorOutreachFlowState {
  return {
    ...flow,
    stage: "sent",
    sentAtIso: result.sentAtIso,
    receiptRef: result.receiptRef,
    threadId: result.threadId,
    blockedReason: null,
  };
}

export function weddingVendorOutreachSendFailed(
  flow: WeddingVendorOutreachFlowState,
  reason: string,
): WeddingVendorOutreachFlowState {
  return { ...flow, stage: "send_failed", blockedReason: reason };
}

export type WeddingVendorOutreachCoupleContext = {
  date_or_season?: string | null;
  location?: string | null;
  guest_count?: string | null;
  budget_comfort?: string | null;
  top_priorities?: string[];
  atmosphere_description?: string | null;
  vendor_preferences?: string | null;
  couple_names?: string | null;
  deal_breakers?: string[];
};

// Translates the model's raw grounded_on field names (e.g. "top_priorities")
// into plain-language phrases naming the couple's actual value, so the
// composer never shows a machine field name to the user. Unmapped or
// unavailable fields are skipped rather than fabricated.
export function weddingVendorOutreachGroundedOnLabels(
  groundedOn: readonly string[],
  couple: WeddingVendorOutreachCoupleContext,
): string[] {
  const labels: string[] = [];
  for (const field of groundedOn) {
    if (field === "top_priorities" && couple.top_priorities?.length) {
      labels.push(`you mentioned ${couple.top_priorities.join(", ")} as a priority`);
    } else if (field === "location" && couple.location) {
      labels.push(`your wedding is in ${couple.location}`);
    } else if (field === "date_or_season" && couple.date_or_season) {
      labels.push(`your date is in ${couple.date_or_season}`);
    } else if (field === "guest_count" && couple.guest_count) {
      labels.push(`you're planning for ${couple.guest_count} guests`);
    } else if (field === "budget_comfort" && couple.budget_comfort) {
      labels.push("you shared your budget comfort level");
    } else if (field === "atmosphere_description" && couple.atmosphere_description) {
      labels.push("you described the atmosphere you want");
    } else if (field === "vendor_preferences" && couple.vendor_preferences) {
      labels.push("you shared what you're looking for in a vendor");
    } else if (field === "couple_names" && couple.couple_names) {
      labels.push("we used your names");
    } else if (field === "deal_breakers" && couple.deal_breakers?.length) {
      labels.push(`you marked ${couple.deal_breakers.join(", ")} as deal-breakers`);
    }
  }
  return labels;
}

// @locs-version: 1.0
import type { WeddingVendorContactWorkspaceCard } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import { weddingVendorRankingCardFieldsFromRecord } from "@/lib/weddingVendorRankingState";

function contactChipValue(
  card: WeddingVendorContactWorkspaceCard,
  kind: "address" | "email" | "phone",
): string | null {
  return card.contactChips.find((chip) => chip.kind === kind)?.value ?? null;
}

// Lets the follow-up panel's primary CTA reuse the same draft/edit/send
// composer as the vendor choice card, instead of routing to a generic
// approval queue that has no compose surface.
export function weddingVendorFollowUpOutreachChoiceId(card: WeddingVendorContactWorkspaceCard): string {
  return `follow-up:${card.vendorId ?? card.id}`;
}

export function weddingVendorFollowUpOutreachCardData(card: WeddingVendorContactWorkspaceCard): WeddingVendorChoiceCardData {
  return {
    choiceId: weddingVendorFollowUpOutreachChoiceId(card),
    rank: 0,
    title: card.vendorName,
    imageUrl: null,
    imageAlt: null,
    scoreLabel: "",
    provider: "",
    sourceUrl: null,
    websiteUrl: null,
    mapUrl: null,
    instagramUrl: null,
    email: contactChipValue(card, "email"),
    phone: contactChipValue(card, "phone"),
    address: contactChipValue(card, "address"),
    rationaleLabels: [],
    preferenceMatch: "",
    situationFit: "",
    verificationLabel: "",
    ...weddingVendorRankingCardFieldsFromRecord({ vendor_id: card.vendorId }),
  };
}

function vendorContextLabels(card: WeddingVendorContactWorkspaceCard): string[] {
  return [card.vendorName, card.categoryLabel, card.statusLabel].filter((label) => label.trim().length > 0);
}

function vendorDraftRequest(card: WeddingVendorContactWorkspaceCard): Record<string, unknown> {
  const followUp = card.stage === "follow_up_due" || card.stage === "escalate_to_user" || card.stage === "mark_unresponsive";
  return {
    kind: followUp ? "vendor_follow_up_email_draft" : "vendor_initial_outreach_email_draft",
    channel: "email",
    vendor_id: card.vendorId,
    vendor_name: card.vendorName,
    category: card.categoryLabel,
    stage: card.stage,
    user_must_review_before_send: true,
    external_send_performed: false,
    no_spam_policy: true,
    suggested_subject: followUp
      ? `Following up about ${card.categoryLabel.toLowerCase()} availability`
      : `Wedding ${card.categoryLabel.toLowerCase()} enquiry`,
    brief: card.nextActionLabel,
    context: [
      card.detailLabel,
      card.lastContactLabel ? `Last contact: ${card.lastContactLabel}` : null,
      card.followUpDueLabel ? `Follow-up due: ${card.followUpDueLabel}` : null,
    ].filter((label): label is string => Boolean(label)),
  };
}

export function weddingVendorFollowUpPrimaryAction(card: WeddingVendorContactWorkspaceCard): WeddingWorkspaceSidebarAction {
  if (card.actionMode === "waiting") {
    return {
      kind: "open_tasks",
      label: card.primaryActionLabel,
      enabled: true,
      reason: null,
      metadata: {
        wedding_vendor_follow_up_tasks: {
          vendor_id: card.vendorId,
          vendor_name: card.vendorName,
          stage: card.stage,
          waiting_for_reply: true,
          next_step: card.nextActionLabel,
        },
      },
      contextLabels: vendorContextLabels(card),
    };
  }
  return {
    kind: "approve_action",
    label: card.primaryActionLabel,
    enabled: true,
    reason: null,
    metadata: {
      wedding_vendor_follow_up: {
        vendor_id: card.vendorId,
        vendor_name: card.vendorName,
        category: card.categoryLabel,
        status: card.statusLabel,
        stage: card.stage,
        next_step: card.nextActionLabel,
        last_contact: card.lastContactLabel,
        follow_up_due: card.followUpDueLabel,
        approval_required: card.actionMode === "follow_up",
        no_spam_policy: true,
        draft_request: vendorDraftRequest(card),
      },
    },
    contextLabels: vendorContextLabels(card),
  };
}

export function weddingVendorRecordReplyAction(card: WeddingVendorContactWorkspaceCard): WeddingWorkspaceSidebarAction {
  return {
    kind: "approve_action",
    label: "Record reply",
    enabled: true,
    reason: null,
    metadata: {
      wedding_vendor_reply_record: {
        vendor_id: card.vendorId,
        vendor_name: card.vendorName,
        category: card.categoryLabel,
        stage: card.stage,
        last_contact: card.lastContactLabel,
        follow_up_due: card.followUpDueLabel,
        clears_follow_up: true,
        external_send: false,
      },
    },
    contextLabels: vendorContextLabels(card),
  };
}

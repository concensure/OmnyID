import {
  weddingVendorDraftDisclosureFingerprint,
  type WeddingVendorEnquiryPermissions,
} from "@/lib/weddingVendorEnquiryPermissionsState";
import {
  weddingVendorOutreachDraftSucceeded,
  weddingVendorOutreachIdleFlow,
  type WeddingVendorOutreachFlowState,
} from "@/lib/weddingVendorOutreachFlowState";
import type {
  WeddingInviteProposalBrief,
  WeddingInviteProposalSharing,
} from "@/lib/weddingInviteProposalState";

export type WeddingInviteProposalBatchItem = {
  choiceId: string;
  vendorId: string;
  vendorName: string;
  recipientEmail: string;
  flow: WeddingVendorOutreachFlowState;
};

function sharedContextLines(brief: WeddingInviteProposalBrief, sharing: WeddingInviteProposalSharing): string[] {
  return [
    sharing.dateOrSeason && brief.dateOrSeason ? `Date or season: ${brief.dateOrSeason}` : null,
    sharing.location && brief.location ? `Location: ${brief.location}` : null,
    sharing.guestCount && brief.guestCount ? `Guest count: ${brief.guestCount}` : null,
    sharing.stylePriorities && brief.stylePriorities.length > 0 ? `Style and priorities: ${brief.stylePriorities.join(", ")}` : null,
    sharing.approximateCategoryBudget && brief.approximateCategoryBudget
      ? `Approximate ${brief.category ?? "category"} budget: ${brief.approximateCategoryBudget.amount.toLocaleString("en-AU", { style: "currency", currency: brief.approximateCategoryBudget.currency, maximumFractionDigits: 0 })}`
      : null,
  ].filter((line): line is string => Boolean(line));
}

function groundedFields(brief: WeddingInviteProposalBrief, sharing: WeddingInviteProposalSharing): string[] {
  return [
    sharing.dateOrSeason && brief.dateOrSeason ? "date_or_season" : null,
    sharing.location && brief.location ? "location" : null,
    sharing.guestCount && brief.guestCount ? "guest_count" : null,
    sharing.stylePriorities && brief.stylePriorities.length > 0 ? "top_priorities" : null,
    sharing.approximateCategoryBudget && brief.approximateCategoryBudget ? "budget_comfort" : null,
  ].filter((field): field is string => Boolean(field));
}

function permissions(sharing: WeddingInviteProposalSharing): WeddingVendorEnquiryPermissions {
  return {
    shareDateOrSeason: sharing.dateOrSeason,
    shareLocation: sharing.location,
    shareGuestCount: sharing.guestCount,
    shareStylePriorities: sharing.stylePriorities,
    shareApproximateBudget: sharing.approximateCategoryBudget,
    allowPhoneContact: sharing.phoneContact,
    remindUnanswered: true,
    replyRoute: "connected_email",
    previewApproved: false,
  };
}

export function buildWeddingInviteProposalBatch(input: {
  brief: WeddingInviteProposalBrief;
  requestText: string;
  selectedChoiceIds: readonly string[];
  sharing: WeddingInviteProposalSharing;
  approvedRecipients?: ReadonlyArray<{ vendorId: string; recipientEmail: string }>;
}): WeddingInviteProposalBatchItem[] {
  const selected = input.brief.recipients.filter((recipient) => input.selectedChoiceIds.includes(recipient.choiceId));
  const context = sharedContextLines(input.brief, input.sharing);
  const grounded = groundedFields(input.brief, input.sharing);
  const selectedPermissions = permissions(input.sharing);
  return selected.flatMap((recipient) => {
    const approved = input.approvedRecipients?.find((item) => item.vendorId === recipient.vendorId);
    const vendorId = recipient.vendorId ?? "";
    const recipientEmail = approved?.recipientEmail ?? recipient.email ?? "";
    if (!vendorId || !recipientEmail) return [];
    const bodyMarkdown = [
      `Hello ${recipient.vendorName} team,`,
      input.requestText.trim(),
      ...(context.length > 0 ? [context.join("\n")] : []),
      "Could you please confirm availability, package options, inclusions, exclusions and an indicative quote?",
      input.sharing.phoneContact
        ? "You may contact us by phone if a number is included in the approved enquiry."
        : "Please reply by email; we have not approved phone contact.",
      "Thank you.",
    ].filter(Boolean).join("\n\n");
    const base = weddingVendorOutreachIdleFlow({ choiceId: recipient.choiceId, vendorName: recipient.vendorName, recipientEmail });
    const drafted = weddingVendorOutreachDraftSucceeded(
      { ...base, permissions: selectedPermissions, draftPermissionFingerprint: weddingVendorDraftDisclosureFingerprint(selectedPermissions) },
      {
        subject: `${input.brief.category ?? "Wedding"} proposal request`,
        bodyMarkdown,
        bodyHtml: null,
        groundedOnLabels: context,
        groundedOnFields: grounded,
        sourceReferences: input.brief.sourceArtifactId
          ? [{ type: "wedding_vendor_search_artifact", target: input.brief.sourceArtifactId, label: "Vendor shortlist" }]
          : [],
        generation: {
          model: "deterministic_template",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          inputFingerprint: "invite-proposal-deterministic-v1",
          promptPrefixId: "wedding.invite_proposal.v1",
          servedFrom: "deterministic_template",
        },
      },
    );
    return [{
      choiceId: recipient.choiceId,
      vendorId,
      vendorName: recipient.vendorName,
      recipientEmail,
      flow: { ...drafted, permissions: selectedPermissions, draftPermissionFingerprint: weddingVendorDraftDisclosureFingerprint(selectedPermissions) },
    }];
  });
}

export function approveWeddingInviteProposalBatch(items: readonly WeddingInviteProposalBatchItem[]): WeddingInviteProposalBatchItem[] {
  return items.map((item) => ({ ...item, flow: { ...item.flow, permissions: { ...item.flow.permissions, previewApproved: true } } }));
}

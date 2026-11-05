// @locs-version: 1.0
import type { SendAfpMessageInput, WeddingVendor } from "@/lib/api";
import {
  weddingInviteProposalRecipientEligibility,
  type WeddingInviteProposalRecipientRoute,
} from "@/lib/weddingInviteProposalEligibilityState";
import type { WeddingResponseWorkspaceViewState, WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingVendorOutreachThreadId } from "@/lib/weddingVendorOutreachAfpState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT = 5;

export type WeddingInviteProposalRecipient = {
  choiceId: string;
  vendorId: string | null;
  vendorName: string;
  category: string | null;
  email: string | null;
  eligible: boolean;
  route: WeddingInviteProposalRecipientRoute;
  eligibilityLabel: string;
  eligibilityReason: string;
};

export type WeddingInviteProposalSharing = {
  dateOrSeason: boolean;
  location: boolean;
  guestCount: boolean;
  stylePriorities: boolean;
  approximateCategoryBudget: boolean;
  phoneContact: boolean;
};

export type WeddingInviteProposalBrief = {
  id: string;
  category: string | null;
  dateOrSeason: string | null;
  location: string | null;
  guestCount: string | null;
  stylePriorities: string[];
  approximateCategoryBudget: { amount: number; currency: string } | null;
  missingFacts: string[];
  recipients: WeddingInviteProposalRecipient[];
  sourceArtifactId: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function categoryBudget(state: WeddingResponseWorkspaceViewState, category: string | null) {
  if (!category) return null;
  const normalized = category.toLowerCase();
  const match = state.budgetTracking.budgetAllocation.find((item) => {
    const label = item.categoryLabel.toLowerCase();
    if (/venue|ceremony/.test(normalized)) return /venue|ceremony/.test(label);
    if (/photo|video/.test(normalized)) return /photo|video/.test(label);
    if (/music|band|dj|entertain/.test(normalized)) return /music|entertain/.test(label);
    if (/flower|decor/.test(normalized)) return /flower|decor/.test(label);
    if (/cater|food|drink/.test(normalized)) return /cater|drink/.test(label);
    return label.includes(normalized) || normalized.includes(label);
  });
  return match?.amount ? { amount: match.amount, currency: "AUD" } : null;
}

export function buildWeddingInviteProposalBrief(input: {
  state: WeddingResponseWorkspaceViewState;
  preview?: WeddingWorkspaceArtifactPreview | null;
  vendorDirectory?: readonly WeddingVendor[] | null;
}): WeddingInviteProposalBrief {
  const planning = input.state.contextCards[0]?.planningContext ?? {};
  const cards = input.preview?.vendorComparisonCards ?? [];
  const category = clean(input.preview?.category) ?? clean(cards[0]?.category);
  const dateOrSeason = clean(planning.dateOrSeason);
  const location = clean(planning.location);
  const guestCount = clean(planning.guestCount);
  const stylePriorities = [
    ...(planning.topPriorities ?? []),
    clean(planning.atmosphereDescription),
  ].filter((item): item is string => Boolean(item));
  const budget = categoryBudget(input.state, category);
  const missingFacts = [
    !category ? "Vendor category" : null,
    !dateOrSeason ? "Wedding date or season" : null,
    !location ? "Wedding location" : null,
    !guestCount ? "Guest count" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    id: `proposal-${input.state.workspace.metadata.responseWorkspaceId}-${input.preview?.artifactId ?? "new"}`,
    category,
    dateOrSeason,
    location,
    guestCount,
    stylePriorities: [...new Set(stylePriorities)].slice(0, 8),
    approximateCategoryBudget: budget,
    missingFacts,
    recipients: cards.slice(0, WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT).map((card) => {
      const candidate = {
        vendorId: card.vendorId ?? null,
        vendorName: card.title,
        category: clean(card.category),
        email: clean(card.email),
      };
      const eligibility = weddingInviteProposalRecipientEligibility({
        candidate,
        vendorDirectory: input.vendorDirectory,
        requestedCategory: category,
        requestedLocation: location,
      });
      return {
        choiceId: card.choiceId,
        vendorId: candidate.vendorId,
        vendorName: candidate.vendorName,
        category: candidate.category,
        email: clean(eligibility.vendor?.contactEmail) ?? candidate.email,
        eligible: eligibility.eligible,
        route: eligibility.route,
        eligibilityLabel: eligibility.label,
        eligibilityReason: eligibility.reason,
      };
    }),
    sourceArtifactId: input.preview?.artifactId ?? null,
  };
}

export function defaultWeddingInviteProposalSharing(brief: WeddingInviteProposalBrief): WeddingInviteProposalSharing {
  return {
    dateOrSeason: Boolean(brief.dateOrSeason),
    location: Boolean(brief.location),
    guestCount: Boolean(brief.guestCount),
    stylePriorities: brief.stylePriorities.length > 0,
    approximateCategoryBudget: false,
    phoneContact: false,
  };
}

export function validateWeddingInviteProposalDraft(input: {
  brief: WeddingInviteProposalBrief;
  requestText: string;
  recipientChoiceIds: readonly string[];
}): string | null {
  const count = new Set(input.recipientChoiceIds).size;
  if (!input.requestText.trim()) return "Add what you want vendors to propose.";
  if (count === 0) return "Choose at least one vendor.";
  if (count > WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT) return `Choose up to ${WEDDING_INVITE_PROPOSAL_RECIPIENT_LIMIT} vendors.`;
  if (input.brief.recipients.filter((item) => input.recipientChoiceIds.includes(item.choiceId)).length !== count) {
    return "One or more selected vendors are not in this wedding shortlist.";
  }
  const ineligible = input.brief.recipients.find((item) => input.recipientChoiceIds.includes(item.choiceId) && !item.eligible);
  if (ineligible) return `${ineligible.vendorName} cannot be invited yet: ${ineligible.eligibilityReason}`;
  return null;
}

export function weddingInviteProposalDraftToAfpSendInput(input: {
  brief: WeddingInviteProposalBrief;
  requestText: string;
  recipientChoiceIds: readonly string[];
  sharing: WeddingInviteProposalSharing;
  metadata: WeddingPlanningMetadata;
  createdAt?: string;
}): SendAfpMessageInput {
  const error = validateWeddingInviteProposalDraft(input);
  if (error) throw new Error(error);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const recipients = input.brief.recipients.filter((item) => input.recipientChoiceIds.includes(item.choiceId));
  const threadId = weddingVendorOutreachThreadId({
    responseWorkspaceId: input.metadata.responseWorkspaceId,
    choiceId: `proposal:${input.brief.id}`,
  });
  const eventId = weddingVendorOutreachThreadId({
    responseWorkspaceId: input.metadata.responseWorkspaceId,
    choiceId: `proposal:${input.brief.id}:${timestamp}`,
  });
  const sharedContext = {
    date_or_season: input.sharing.dateOrSeason ? input.brief.dateOrSeason : null,
    location: input.sharing.location ? input.brief.location : null,
    guest_count: input.sharing.guestCount ? input.brief.guestCount : null,
    style_priorities: input.sharing.stylePriorities ? input.brief.stylePriorities : [],
    approximate_category_budget: input.sharing.approximateCategoryBudget ? input.brief.approximateCategoryBudget : null,
    allow_phone_contact: input.sharing.phoneContact,
  };
  const markdown = [
    "# Proposal invitation draft",
    "",
    `**Category:** ${input.brief.category ?? "Not selected"}`,
    "",
    input.requestText.trim(),
    "",
    "## Intended recipients",
    ...recipients.map((item) => `- ${item.vendorName}`),
    "",
    "This is a private draft. No vendor has been contacted.",
  ].join("\n");
  return {
    id: eventId,
    thread_id: threadId,
    from: "user://couple",
    to: ["user://couple", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "document",
    kind: "wedding_vendor_proposal_invitation_draft",
    subtype: "wedding_vendor_proposal_invitation_draft",
    content: {
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      brief_id: input.brief.id,
      revision: 1,
      category: input.brief.category,
      request_text: input.requestText.trim(),
      recipients,
      shared_context: sharedContext,
      missing_facts: input.brief.missingFacts,
      approval_status: "pending_user_approval",
      external_action: false,
    },
    views: [
      { format: "a2ui", priority: 1, content: {
        kind: "wedding_vendor_proposal_invitation_draft",
        title: "Proposal invitation draft",
        category: input.brief.category,
        recipient_labels: recipients.map((item) => item.vendorName),
        approval_status: "pending_user_approval",
        external_action: false,
      } },
      { format: "markdown", priority: 2, content: markdown },
    ],
    attachments: [],
    references: input.brief.sourceArtifactId
      ? [{ type: "wedding_vendor_search_artifact", target: input.brief.sourceArtifactId, label: "Vendor shortlist" }]
      : [],
    supertags: [...input.metadata.supertags, "wedding", "wedding_vendor_proposal", "private_draft"],
    metadata: {
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      brief_id: input.brief.id,
      recipient_count: recipients.length,
      approval_status: "pending_user_approval",
      external_action: false,
    },
    store_in_relational: true,
  };
}

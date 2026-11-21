// @locs-version: 2.0

export type WeddingCoworkingJourneyMember = {
  display_name: string;
  role: "owner" | "co_owner";
};

export type WeddingCoworkingJourneyInvite = {
  status: "pending" | "accepted" | "revoked" | "expired";
};

export type WeddingCoworkingJourneyState = {
  stage: "private" | "invited" | "shared" | "renew";
  partnerNames: string[];
  currentStep: string;
  nextStep: string;
  followingStep: string;
  actionLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildWeddingCoworkingJourneyState(input: {
  members?: readonly WeddingCoworkingJourneyMember[] | null;
  invites?: readonly WeddingCoworkingJourneyInvite[] | null;
}): WeddingCoworkingJourneyState {
  const partnerNames = (input.members ?? [])
    .filter((member) => member.role === "co_owner")
    .map((member) => clean(member.display_name))
    .filter(Boolean);
  if (partnerNames.length > 0) {
    const partner = partnerNames.join(" and ");
    return {
      stage: "shared",
      partnerNames,
      currentStep: `${partner} can open this shared Wedding plan from their own account.`,
      nextStep: `Assign one open task to yourself or ${partner}, with a due date.`,
      followingStep: "Review the next shared decision together before any enquiry or commitment is sent.",
      actionLabel: "Assign the next task",
    };
  }

  const invites = input.invites ?? [];
  if (invites.some((invite) => invite.status === "pending")) {
    return {
      stage: "invited",
      partnerNames: [],
      currentStep: "The partner invitation is waiting for acceptance and grants no access yet.",
      nextStep: "Your partner signs in with the invited email and accepts the invitation.",
      followingStep: "After acceptance, assign one open task and review one shared decision together.",
      actionLabel: "Check invitation status",
    };
  }

  if (invites.some((invite) => invite.status === "expired" || invite.status === "revoked")) {
    return {
      stage: "renew",
      partnerNames: [],
      currentStep: "The previous invitation grants no access.",
      nextStep: "Confirm the recipient and send a fresh seven-day partner invitation.",
      followingStep: "Your partner accepts from their own account before anything is shared.",
      actionLabel: "Send a fresh invitation",
    };
  }

  return {
    stage: "private",
    partnerNames: [],
    currentStep: "This Wedding plan is private to your account.",
    nextStep: "Invite one partner as co-owner after reviewing the shared and personal-data boundary.",
    followingStep: "They accept from their own account, then you can divide tasks and review decisions together.",
    actionLabel: "Invite my partner",
  };
}

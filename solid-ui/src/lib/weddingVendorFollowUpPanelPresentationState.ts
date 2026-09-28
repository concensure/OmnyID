// @locs-version: 1.0

export type WeddingVendorFollowUpPanelPresentationState = {
  title: string;
  badgeLabel: string;
  descriptionLabel: string;
  showFollowUpTip: boolean;
};

export function buildWeddingVendorFollowUpPanelPresentationState(input: {
  activeCount?: number | null;
  closedCount?: number | null;
}): WeddingVendorFollowUpPanelPresentationState {
  const activeCount = Math.max(0, input.activeCount ?? 0);
  const closedCount = Math.max(0, input.closedCount ?? 0);

  if (activeCount > 0 && closedCount > 0) {
    return {
      title: "Vendor follow-ups and history",
      badgeLabel: `${activeCount} active, ${closedCount} closed`,
      descriptionLabel: "Active vendors stay in follow-up; closed vendor paths remain available as history.",
      showFollowUpTip: true,
    };
  }

  if (activeCount > 0) {
    return {
      title: "Vendors to follow up",
      badgeLabel: `${activeCount} active`,
      descriptionLabel: "Active vendor outreach that may need a reply, next check, or recorded response.",
      showFollowUpTip: true,
    };
  }

  if (closedCount > 0) {
    return {
      title: "Vendor history",
      badgeLabel: `${closedCount} closed`,
      descriptionLabel: "Resolved or stopped vendor paths are out of the live queue and kept here for review.",
      showFollowUpTip: false,
    };
  }

  return {
    title: "Vendor follow-ups",
    badgeLabel: "None active",
    descriptionLabel: "Selected vendors will appear here after outreach or reply tracking starts.",
    showFollowUpTip: false,
  };
}

export type WeddingVendorReplyRoute = "omnyid_protected" | "connected_email";

export type WeddingVendorEnquiryPermissions = {
  shareDateOrSeason: boolean;
  shareLocation: boolean;
  shareGuestCount: boolean;
  shareStylePriorities: boolean;
  shareApproximateBudget: boolean;
  allowPhoneContact: boolean;
  remindUnanswered: boolean;
  replyRoute: WeddingVendorReplyRoute;
  previewApproved: boolean;
};

export const DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS: WeddingVendorEnquiryPermissions = {
  shareDateOrSeason: true,
  shareLocation: true,
  shareGuestCount: true,
  shareStylePriorities: true,
  shareApproximateBudget: false,
  allowPhoneContact: false,
  remindUnanswered: true,
  replyRoute: "omnyid_protected",
  previewApproved: false,
};

export function normalizeWeddingVendorEnquiryPermissions(value: unknown): WeddingVendorEnquiryPermissions {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<WeddingVendorEnquiryPermissions>
    : {};
  return {
    shareDateOrSeason: record.shareDateOrSeason !== false,
    shareLocation: record.shareLocation !== false,
    shareGuestCount: record.shareGuestCount !== false,
    shareStylePriorities: record.shareStylePriorities !== false,
    shareApproximateBudget: record.shareApproximateBudget === true,
    allowPhoneContact: record.allowPhoneContact === true,
    remindUnanswered: record.remindUnanswered !== false,
    replyRoute: record.replyRoute === "connected_email" ? "connected_email" : "omnyid_protected",
    previewApproved: record.previewApproved === true,
  };
}

export function weddingVendorSharedInformationLabels(input: {
  permissions: WeddingVendorEnquiryPermissions;
  groundedOnLabels: readonly string[];
}): string[] {
  const grounded = input.groundedOnLabels.filter((label) => {
    if (/budget/i.test(label)) return input.permissions.shareApproximateBudget;
    if (/date|season/i.test(label)) return input.permissions.shareDateOrSeason;
    if (/location|wedding is in/i.test(label)) return input.permissions.shareLocation;
    if (/guest/i.test(label)) return input.permissions.shareGuestCount;
    if (/priority|atmosphere|looking for/i.test(label)) return input.permissions.shareStylePriorities;
    return true;
  });
  return [
    ...grounded,
    input.permissions.shareDateOrSeason ? "date or season, when known" : "no date or season",
    input.permissions.shareLocation ? "general wedding location, when known" : "no wedding location",
    input.permissions.shareGuestCount ? "estimated guest count, when known" : "no guest count",
    input.permissions.shareStylePriorities ? "selected style and priorities" : "no style or priority profile",
    input.permissions.shareApproximateBudget ? "your approximate category budget" : "no budget figure",
    input.permissions.allowPhoneContact ? "permission to contact you by phone (no number is added automatically)" : "no permission to contact you by phone",
  ];
}

export function weddingVendorEnquiryPermissionFingerprint(
  permissions: WeddingVendorEnquiryPermissions,
): string {
  return [
    permissions.shareDateOrSeason ? "date:yes" : "date:no",
    permissions.shareLocation ? "location:yes" : "location:no",
    permissions.shareGuestCount ? "guests:yes" : "guests:no",
    permissions.shareStylePriorities ? "style:yes" : "style:no",
    permissions.shareApproximateBudget ? "budget:yes" : "budget:no",
    permissions.allowPhoneContact ? "phone:yes" : "phone:no",
    permissions.remindUnanswered ? "reminder:yes" : "reminder:no",
    `reply:${permissions.replyRoute}`,
  ].join("|");
}

/** Only choices that can change generated message facts require regeneration. */
export function weddingVendorDraftDisclosureFingerprint(
  permissions: WeddingVendorEnquiryPermissions,
): string {
  return [
    permissions.shareDateOrSeason ? "date:yes" : "date:no",
    permissions.shareLocation ? "location:yes" : "location:no",
    permissions.shareGuestCount ? "guests:yes" : "guests:no",
    permissions.shareStylePriorities ? "style:yes" : "style:no",
    permissions.shareApproximateBudget ? "budget:yes" : "budget:no",
  ].join("|");
}

export type WeddingVendorReplyRoute = "omnyid_protected" | "connected_email";

export type WeddingVendorEnquiryPermissions = {
  shareApproximateBudget: boolean;
  allowPhoneContact: boolean;
  remindUnanswered: boolean;
  replyRoute: WeddingVendorReplyRoute;
  previewApproved: boolean;
};

export const DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS: WeddingVendorEnquiryPermissions = {
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
  const grounded = input.groundedOnLabels.filter((label) => (
    input.permissions.shareApproximateBudget || !/budget/i.test(label)
  ));
  return [
    ...grounded,
    input.permissions.shareApproximateBudget ? "your approximate category budget" : "no budget figure",
    input.permissions.allowPhoneContact ? "permission to contact you by phone (no number is added automatically)" : "no permission to contact you by phone",
  ];
}

export function weddingVendorEnquiryPermissionFingerprint(
  permissions: WeddingVendorEnquiryPermissions,
): string {
  return [
    permissions.shareApproximateBudget ? "budget:yes" : "budget:no",
    permissions.allowPhoneContact ? "phone:yes" : "phone:no",
    permissions.remindUnanswered ? "reminder:yes" : "reminder:no",
    `reply:${permissions.replyRoute}`,
  ].join("|");
}

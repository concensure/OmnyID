import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS,
  normalizeWeddingVendorEnquiryPermissions,
  weddingVendorEnquiryPermissionFingerprint,
  weddingVendorSharedInformationLabels,
} from "../src/lib/weddingVendorEnquiryPermissionsState.ts";

test("new enquiries default to protected replies without budget or phone sharing", () => {
  assert.deepEqual(DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS, {
    shareApproximateBudget: false,
    allowPhoneContact: false,
    remindUnanswered: true,
    replyRoute: "omnyid_protected",
    previewApproved: false,
  });
});

test("shared-information preview removes budget grounding until permission is granted", () => {
  const hidden = weddingVendorSharedInformationLabels({
    permissions: DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS,
    groundedOnLabels: ["your wedding is in Sydney", "you shared your budget comfort level"],
  });
  assert.deepEqual(hidden, [
    "your wedding is in Sydney",
    "no budget figure",
    "no permission to contact you by phone",
  ]);
  const shared = weddingVendorSharedInformationLabels({
    permissions: { ...DEFAULT_WEDDING_VENDOR_ENQUIRY_PERMISSIONS, shareApproximateBudget: true },
    groundedOnLabels: ["your wedding is in Sydney", "you shared your budget comfort level"],
  });
  assert.ok(shared.includes("your approximate category budget"));
  assert.ok(shared.includes("you shared your budget comfort level"));
});

test("permission fingerprint changes only when a consequential sharing choice changes", () => {
  const base = normalizeWeddingVendorEnquiryPermissions(null);
  assert.equal(base.replyRoute, "omnyid_protected");
  assert.equal(
    weddingVendorEnquiryPermissionFingerprint(base),
    weddingVendorEnquiryPermissionFingerprint({ ...base, previewApproved: true }),
  );
  assert.notEqual(
    weddingVendorEnquiryPermissionFingerprint(base),
    weddingVendorEnquiryPermissionFingerprint({ ...base, allowPhoneContact: true }),
  );
});

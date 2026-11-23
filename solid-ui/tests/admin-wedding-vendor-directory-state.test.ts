import assert from "node:assert/strict";
import test from "node:test";
import type { WeddingVendor } from "../src/lib/api.ts";
import {
  adminWeddingVendorCategories,
  adminWeddingVendorClaimLabel,
  filterAdminWeddingVendors,
} from "../src/lib/adminWeddingVendorDirectoryState.ts";

const vendor = (name: string, category: string, claimStatus = "unclaimed"): WeddingVendor => ({
  vendorId: name.toLowerCase().replace(/\W+/g, "-"), vendorSlug: name.toLowerCase().replace(/\W+/g, "-"),
  vendorName: name, category, serviceArea: "Sydney NSW", address: null, websiteUrl: null,
  contactPhone: null, contactEmail: null, sourceUrl: null, sourceLabel: null, sourceCheckedAt: null,
  status: "active", claimStatus, linkedAgentId: null, notes: null, evidence: {}, caveatLabels: [],
  createdAt: "", updatedAt: "", photos: [], rooms: [], userContact: null, attributes: {},
});

const vendors = [
  vendor("Harbour House", "Venue", "verified"),
  vendor("Willow & Stone", "Florist"),
  vendor("Silver Lining Celebrations", "Celebrant", "claimed"),
];

test("admin vendor search tolerates common spelling mistakes and ranks the name", () => {
  assert.deepEqual(filterAdminWeddingVendors(vendors, "harbor hous", "").map((item) => item.vendorName), ["Harbour House"]);
  assert.deepEqual(filterAdminWeddingVendors(vendors, "selver lining", "").map((item) => item.vendorName), ["Silver Lining Celebrations"]);
});

test("admin vendor filters categories without losing the complete unsearched list", () => {
  assert.deepEqual(adminWeddingVendorCategories(vendors), ["Celebrant", "Florist", "Venue"]);
  assert.deepEqual(filterAdminWeddingVendors(vendors, "", "Florist").map((item) => item.vendorName), ["Willow & Stone"]);
  assert.equal(filterAdminWeddingVendors(vendors, "", "").length, 3);
});

test("admin vendor claim labels distinguish verified, pending and unclaimed listings", () => {
  assert.equal(adminWeddingVendorClaimLabel("verified"), "Claimed and verified");
  assert.equal(adminWeddingVendorClaimLabel("claimed"), "Claimed — verification pending");
  assert.equal(adminWeddingVendorClaimLabel("unclaimed"), "Unclaimed listing");
});

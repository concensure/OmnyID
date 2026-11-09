import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("vendor-source authentication returns to the existing vendor portal", async () => {
  const [app, source, auth] = await Promise.all([
    read("solid-ui/src/App.tsx"),
    read("src/server/auth/verification_source.rs"),
    read("src/server/auth.rs"),
  ]);
  assert.match(app, /pendingVendorAuthSource/);
  assert.match(app, /window\.location\.assign\(vendorPortalUrlFromDeepLink\(\)\)/);
  assert.match(app, /manage your vendor listing/);
  assert.match(source, /VENDOR_TOKEN_PREFIX/);
  assert.match(source, /"vendor" \| "vendor_claim" \| "vendor_portal"/);
  assert.match(source, /source=\{experience\}/);
  assert.match(auth, /token_experience/);
});

test("verified vendors receive one coherent management shell over existing authorities", async () => {
  const dashboard = await read("solid-ui/src/components/vendor/VendorProfileDashboard.tsx");
  for (const label of ["Overview", "Availability", "Enquiries", "Public profile", "Settings"]) {
    assert.match(dashboard, new RegExp(`label: "${label}"`));
  }
  for (const authority of ["VendorPhotoUploadPanel", "VendorSpecialOffersPanel", "VendorProposalOpportunitiesPanel", "VendorQuotationResponsePanel"]) {
    assert.match(dashboard, new RegExp(`<${authority}`));
  }
  assert.match(dashboard, /role="tablist"/);
  assert.match(dashboard, /verification, independent reviews and ranking methodology remain platform-controlled/i);
});

test("Limited Specials supports an explicit authenticated release wildcard without changing false defaults", async () => {
  const [management, evidence, discovery, compose] = await Promise.all([
    read("src/server/wedding_vendor_special_offer_routes.rs"),
    read("src/server/wedding_vendor_search_routes/special_offer_evidence.rs"),
    read("src/server/wedding_vendor_special_offer_routes/discovery.rs"),
    read("docker-compose.oracle.minimal.yml"),
  ]);
  for (const source of [management, evidence, discovery]) assert.match(source, /value == "\*"/);
  assert.match(compose, /SPECIALS_ENABLED:-false/);
  assert.match(compose, /SPECIALS_DISCOVERY_ENABLED:-false/);
});

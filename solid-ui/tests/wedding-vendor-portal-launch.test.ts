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
  assert.match(app, /openVendorPortalFromDeepLink/);
  assert.match(app, /omnyid\.vendorClaim\.returnTo/);
  assert.match(app, /manage your vendor listing/);
  assert.match(source, /VENDOR_TOKEN_PREFIX/);
  assert.match(source, /"vendor" \| "vendor_claim" \| "vendor_portal"/);
  assert.match(source, /source=\{experience\}/);
  assert.match(auth, /token_experience/);
});

test("verified vendors receive one coherent management shell over existing authorities", async () => {
  const dashboard = await read("solid-ui/src/components/vendor/VendorProfileDashboard.tsx");
  for (const label of ["Overview", "How it works", "Availability", "Enquiries", "Sales & records", "Public profile", "Settings"]) {
    assert.match(dashboard, new RegExp(`label: "${label}"`));
  }
  for (const authority of ["VendorPhotoUploadPanel", "VendorPublicationPanel", "VendorResourcesPanel", "VendorSpecialOffersPanel", "VendorProposalOpportunitiesPanel", "VendorQuotationResponsePanel", "VendorPortalSettingsPanel"]) {
    assert.match(dashboard, new RegExp(`<${authority}`));
  }
  assert.match(dashboard, /role="tablist"/);
  assert.match(dashboard, /VendorWorkflowGuide/);
  assert.match(dashboard, /verification, independent reviews and ranking methodology remain platform-controlled/i);
});

test("portal extensions use server-scoped revisions, roles and entitlements", async () => {
  const [api, publication, resources, settings, migration] = await Promise.all([
    read("solid-ui/src/lib/vendorPortalApi.ts"),
    read("src/server/wedding_vendor_portal_routes/publication.rs"),
    read("src/server/wedding_vendor_portal_routes/resources.rs"),
    read("src/server/wedding_vendor_portal_routes/settings.rs"),
    read("postgres/migrations/0157_wedding_vendor_portal_extensions.sql"),
  ]);
  assert.match(api, /expected_revision/);
  assert.match(publication, /pending_review/);
  assert.match(resources, /state='booked'/);
  assert.match(resources, /require_paid_feature/);
  assert.match(settings, /VendorPermission::ManageTeam/);
  assert.match(settings, /security_notifications":"always_on/);
  assert.match(migration, /wedding_vendor_memberships/);
  assert.match(migration, /wedding_vendor_publication_revisions/);
  assert.doesNotMatch(migration, /message_body|couple_email|budget_amount/i);
});

test("vendor sales operations project existing enquiries, resources and availability without a parallel CRM", async () => {
  const [dashboard, panel, routes, migration] = await Promise.all([
    read("solid-ui/src/components/vendor/VendorProfileDashboard.tsx"),
    read("solid-ui/src/components/vendor/VendorSalesOperationsPanel.tsx"),
    read("src/server/wedding_vendor_portal_routes/operations.rs"),
    read("postgres/migrations/0173_wedding_vendor_sales_operations.sql"),
  ]);
  assert.match(dashboard, /VendorSalesOperationsPanel/);
  for (const surface of ["Response and stage history by date", "Customer journeys", "Space availability calendar", "Print summary", "Needs attention"]) {
    assert.match(panel, new RegExp(surface));
  }
  assert.match(routes, /FROM wedding_enquiry_envelopes/);
  assert.match(routes, /FROM wedding_vendor_special_offer_slots/);
  assert.match(routes, /FROM wedding_vendor_rooms/);
  assert.match(routes, /VendorPermission::Enquiries/);
  assert.match(routes, /This customer journey changed in another session/);
  assert.match(migration, /content-light journey stage and due-date decisions/);
  assert.doesNotMatch(migration, /message_body|quote_body|couple_email|couple_phone|budget_amount/i);
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

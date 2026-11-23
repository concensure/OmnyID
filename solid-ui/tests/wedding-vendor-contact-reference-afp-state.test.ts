import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorContactReferenceToAfpSendInput } from "../src/lib/weddingVendorContactReferenceAfpState.ts";
import type { WeddingPlanningMetadata } from "../src/lib/weddingPlanningTemplateState.ts";

const metadata: WeddingPlanningMetadata = {
  template: "wedding_planning",
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
  artifactKind: "vendor_table",
  supertags: ["template:wedding_planning"],
  privacyScope: "private",
  approvalState: "draft",
};

test("selected vendor contact reference AFP carries structured contact fields", () => {
  const sendInput = weddingVendorContactReferenceToAfpSendInput({
    metadata,
    artifactId: "artifact-vendors",
    artifactTitle: "Top vendor comparison",
    optionId: "0:chloes-florals",
    optionLabel: "Chloe's Florals",
    contact: {
      title: "Chloe's Florals",
      provider: "Google Places API",
      websiteUrl: "https://chloes.example",
      instagramUrl: "https://instagram.com/chloesflorals",
      email: "hello@chloes.example",
      phone: "+61 2 9000 0000",
      address: "12 Test Street, Sydney NSW",
      mapUrl: "https://maps.google.com/?cid=example",
      sourceUrl: "https://chloes.example",
    },
  });

  assert.equal(sendInput.type, "wedding_vendor_contact_reference");
  assert.equal(sendInput.subtype, "selected_vendor_contact_details");
  assert.equal(sendInput.thread_id, "artifact-vendors");
  assert.equal(sendInput.store_in_relational, true);
  assert.deepEqual(sendInput.supertags?.slice(0, 2), [
    "wedding_vendor_selected",
    "wedding_vendor_contact_reference",
  ]);

  const content = sendInput.content as Record<string, unknown>;
  const contactDetails = content.contact_details as Record<string, unknown>;
  assert.equal(content.vendor_name, "Chloe's Florals");
  assert.equal(contactDetails.website_url, "https://chloes.example");
  assert.equal(contactDetails.instagram_url, "https://instagram.com/chloesflorals");
  assert.equal(contactDetails.email, "hello@chloes.example");
  assert.equal(contactDetails.phone, "+61 2 9000 0000");
  assert.equal(contactDetails.address, "12 Test Street, Sydney NSW");
  assert.equal(contactDetails.map_url, "https://maps.google.com/?cid=example");
  assert.equal(sendInput.metadata?.contact_details_available, true);
  assert.doesNotMatch(JSON.stringify(sendInput), /GOOGLE_PLACES_API_KEY|secret/i);
});

test("selected vendor contact reference AFP falls back when contact details are absent", () => {
  const sendInput = weddingVendorContactReferenceToAfpSendInput({
    metadata,
    artifactId: "artifact-vendors",
    artifactTitle: "Top vendor comparison",
    optionId: "1:unknown-vendor",
    optionLabel: "Unknown Vendor",
    contact: null,
  });

  const content = sendInput.content as Record<string, unknown>;
  const contactDetails = content.contact_details as Record<string, unknown>;
  assert.equal(content.vendor_name, "Unknown Vendor");
  assert.equal(contactDetails.website_url, null);
  assert.equal(contactDetails.email, null);
  assert.equal(sendInput.metadata?.contact_details_available, false);
  assert.deepEqual(sendInput.references, [{ id: "artifact-vendors", rel: "source_artifact" }]);
});

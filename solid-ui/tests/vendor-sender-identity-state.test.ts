import assert from "node:assert/strict";
import test from "node:test";

import {
  selectedVendorSenderIdentity,
  senderIdentityA2ui,
  type VendorSenderIdentityState,
} from "../src/lib/vendorSenderIdentityState";

const state: VendorSenderIdentityState = {
  vendor_id: "vendor-bejewelled",
  vendor_name: "Bejewelled Jewellery",
  identity_id: "identity-random-internal",
  revision: 1,
  selected_kind: "omnyid_mask",
  relay_delivery_enabled: false,
  options: [
    {
      kind: "connected_email",
      label: "My connected business email",
      address: "hello@bejewelled.example",
      available: true,
      selected: false,
      detail: "Connected Gmail",
    },
    {
      kind: "omnyid_mask",
      label: "OmnyID business address",
      address: "bejewelled_jewellery_mosman@omnyid.com",
      available: true,
      selected: true,
      detail: "External relay is still gated.",
    },
  ],
};

test("projects the selected verified sender without treating relay as enabled", () => {
  assert.deepEqual(selectedVendorSenderIdentity(state), {
    identityId: "identity-random-internal",
    kind: "omnyid_mask",
    address: "bejewelled_jewellery_mosman@omnyid.com",
    label: "OmnyID business address",
    displayName: "Bejewelled Jewellery",
  });
  assert.equal(state.relay_delivery_enabled, false);
});

test("does not select unavailable or unreserved identities", () => {
  assert.equal(selectedVendorSenderIdentity({ ...state, identity_id: null }), null);
  assert.equal(selectedVendorSenderIdentity({
    ...state,
    options: state.options.map((option) => ({ ...option, available: false })),
  }), null);
});

test("keeps the same sender choices consumable through A2UI", () => {
  const projection = senderIdentityA2ui(state) as { kind: string; value: string; options: unknown[] };
  assert.equal(projection.kind, "choice_group");
  assert.equal(projection.value, "omnyid_mask");
  assert.equal(projection.options.length, 2);
});

// @module-id: wedding.vendor-sender-identity-state
// @primary-capability: verified-vendor-response-identity-choice
// @locs-version: 1.0

import { apiFetch } from "@/lib/api";

export type VendorSenderKind = "connected_email" | "omnyid_mask";

export interface VendorSenderOption {
  kind: VendorSenderKind;
  label: string;
  address: string | null;
  available: boolean;
  selected: boolean;
  detail: string;
}

export interface VendorSenderIdentityState {
  vendor_id: string;
  vendor_name: string;
  identity_id: string | null;
  revision: number | null;
  selected_kind: VendorSenderKind | null;
  relay_delivery_enabled: boolean;
  options: VendorSenderOption[];
}

export interface SelectedVendorSenderIdentity {
  identityId: string;
  kind: VendorSenderKind;
  address: string;
  label: string;
  displayName: string;
}

export const loadVendorSenderIdentity = (vendorId: string) =>
  apiFetch<VendorSenderIdentityState>(
    `/api/wedding/vendor/sender-identity?vendor_id=${encodeURIComponent(vendorId)}`,
  );

export const selectVendorSenderIdentity = (vendorId: string, kind: VendorSenderKind) =>
  apiFetch<VendorSenderIdentityState>("/api/wedding/vendor/sender-identity", {
    method: "PUT",
    bodyJson: { vendor_id: vendorId, kind },
  });

export function selectedVendorSenderIdentity(
  state: VendorSenderIdentityState,
): SelectedVendorSenderIdentity | null {
  if (!state.identity_id || !state.selected_kind) return null;
  const option = state.options.find((candidate) => (
    candidate.kind === state.selected_kind
    && candidate.available
    && typeof candidate.address === "string"
    && candidate.address.length > 0
  ));
  if (!option?.address) return null;
  return {
    identityId: state.identity_id,
    kind: option.kind,
    address: option.address,
    label: option.label,
    displayName: state.vendor_name,
  };
}

export function senderIdentityA2ui(state: VendorSenderIdentityState): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "choice_group",
    id: `vendor-sender-${state.vendor_id}`,
    title: "Choose how this response appears",
    description: "Only verified or platform-owned sender identities can be selected.",
    value: state.selected_kind,
    options: state.options.map((option) => ({
      id: option.kind,
      label: option.label,
      description: option.detail,
      disabled: !option.available,
    })),
  };
}

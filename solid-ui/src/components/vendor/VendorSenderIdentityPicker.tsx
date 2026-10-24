// @module-id: wedding.vendor-sender-identity-picker
// @primary-capability: accessible-vendor-response-identity-choice
// @locs-version: 1.0

import { For, Show, createEffect, createResource, createSignal } from "solid-js";

import {
  loadVendorSenderIdentity,
  selectVendorSenderIdentity,
  selectedVendorSenderIdentity,
  senderIdentityA2ui,
  type SelectedVendorSenderIdentity,
  type VendorSenderIdentityState,
  type VendorSenderKind,
} from "@/lib/vendorSenderIdentityState";

interface Props {
  vendorId: string;
  loadIdentity?: (vendorId: string) => Promise<VendorSenderIdentityState>;
  selectIdentity?: (vendorId: string, kind: VendorSenderKind) => Promise<VendorSenderIdentityState>;
  onIdentity: (identity: SelectedVendorSenderIdentity | null) => void;
}

export function VendorSenderIdentityPicker(props: Props) {
  const loader = props.loadIdentity ?? loadVendorSenderIdentity;
  const selector = props.selectIdentity ?? selectVendorSenderIdentity;
  const [state, { mutate }] = createResource(() => props.vendorId, loader);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const loaded = state();
    if (loaded) props.onIdentity(selectedVendorSenderIdentity(loaded));
  });

  const publish = (next: VendorSenderIdentityState) => {
    mutate(next);
    senderIdentityA2ui(next);
    props.onIdentity(selectedVendorSenderIdentity(next));
  };

  const choose = async (kind: VendorSenderKind) => {
    if (busy()) return;
    setBusy(true);
    setError(null);
    props.onIdentity(null);
    try {
      publish(await selector(props.vendorId, kind));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This sender could not be selected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset class="mt-4 rounded-lg border border-wedding-muted bg-white p-3">
      <legend class="px-1 text-sm font-semibold">Send as</legend>
      <p class="text-xs leading-5 text-wedding-muted">
        Choose a connected mailbox or your reserved OmnyID business address. This does not send a separate email.
      </p>
      <Show when={state.loading}><p class="mt-2 text-sm text-wedding-muted" role="status">Loading sender choices…</p></Show>
      <Show when={state.error}><p class="mt-2 text-sm text-red-800" role="alert">Sender choices are not available for this verified listing.</p></Show>
      <div class="mt-2 grid gap-2">
        <For each={state()?.options ?? []}>{(option) => (
          <label class={`flex min-h-11 gap-3 rounded-lg border p-3 ${option.selected ? "border-wedding-accent bg-wedding-surface" : "border-wedding-muted"} ${option.available ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="radio"
              name={`vendor-sender-${props.vendorId}`}
              value={option.kind}
              checked={option.selected}
              disabled={!option.available || busy()}
              onChange={() => void choose(option.kind)}
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold">{option.label}</span>
              <Show when={option.address}><span class="block break-all text-sm">{option.address}</span></Show>
              <span class="mt-1 block text-xs leading-5 text-wedding-muted">{option.detail}</span>
            </span>
          </label>
        )}</For>
      </div>
      <Show when={error()}>{(message) => <p class="mt-2 text-sm text-red-800" role="alert">{message()}</p>}</Show>
    </fieldset>
  );
}

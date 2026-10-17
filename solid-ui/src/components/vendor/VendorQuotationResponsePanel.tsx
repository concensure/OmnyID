// @module-id: quotation.claimed-vendor-response-panel
// @primary-capability: minimal-encrypted-vendor-transaction-inbox
// @locs-version: 1.0
// @stability: draft
// @owner: omnyid

import { For, Show, createResource, createSignal } from "solid-js";

import {
  loadVendorTransactionInbox,
  submitVendorTransactionResponse,
  unlockVendorTransaction,
  vendorResponseA2ui,
  type VendorContextProjectionView,
  type VendorTransactionInboxItem,
} from "@/lib/vendorQuotationResponseState";

type SubmitInput = Parameters<typeof submitVendorTransactionResponse>[0];

interface Props {
  loadTransactions?: () => Promise<VendorTransactionInboxItem[]>;
  unlockTransaction?: (item: VendorTransactionInboxItem) => Promise<VendorContextProjectionView>;
  submitResponse?: (input: SubmitInput) => Promise<{ status: "accepted" | "rejected"; receipt_id: string }>;
}

export function VendorQuotationResponsePanel(props: Props = {}) {
  const loader = props.loadTransactions ?? loadVendorTransactionInbox;
  const unlocker = props.unlockTransaction ?? unlockVendorTransaction;
  const submitter = props.submitResponse ?? submitVendorTransactionResponse;
  const [transactions, { refetch }] = createResource(loader);
  const [selected, setSelected] = createSignal<VendorTransactionInboxItem | null>(null);
  const [projection, setProjection] = createSignal<VendorContextProjectionView | null>(null);
  const [answers, setAnswers] = createSignal<Record<string, string>>({});
  const [attestedBy, setAttestedBy] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [receipt, setReceipt] = createSignal<string | null>(null);

  const unlock = async (item: VendorTransactionInboxItem) => {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const view = await unlocker(item);
      setSelected(item);
      setProjection(view);
      setAnswers(Object.fromEntries(view.questions.map(({ id }) => [id, ""])));
      vendorResponseA2ui(view); // Keep the same field projection consumable by agent-native surfaces.
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not unlock this transaction.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const item = selected();
    const view = projection();
    if (!item || !view) return;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const result = await submitter({
        item,
        projection: view,
        answers: answers(),
        attestedBy: attestedBy(),
      });
      if (result.status !== "accepted") {
        throw new Error("The response was not accepted. Refresh the transaction before retrying.");
      }
      setReceipt(result.receipt_id);
      setSelected(null);
      setProjection(null);
      await refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send this response.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="rounded-2xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-transaction-title">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Private transactions</p>
          <h2 id="vendor-transaction-title" class="mt-1 text-lg font-semibold">Quotation responses</h2>
          <p class="mt-1 text-sm leading-6 text-wedding-muted">Only requests addressed to your current verified AgentCard appear here. Decryption happens on this device.</p>
        </div>
        <button type="button" class="min-h-11 rounded-lg border border-wedding-muted px-3 text-sm font-semibold" disabled={busy()} onClick={() => void refetch()}>Refresh</button>
      </div>

      <Show when={transactions.loading}><p class="mt-4 text-sm text-wedding-muted" role="status">Checking private transactions…</p></Show>
      <Show when={transactions.error}><p class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Quotation responses are not available for this claim yet.</p></Show>
      <Show when={!transactions.loading && !transactions.error && (transactions()?.length ?? 0) === 0}>
        <p class="mt-4 rounded-lg bg-wedding-surface p-3 text-sm text-wedding-muted">No active quotation requests are addressed to this vendor.</p>
      </Show>

      <div class="mt-4 grid gap-3">
        <For each={transactions() ?? []}>{(item) => (
          <article class="rounded-xl border border-wedding-muted p-4">
            <p class="text-sm font-semibold">Quotation {item.quotation_id}</p>
            <p class="mt-1 text-xs text-wedding-muted">Version {item.quotation_version_id} · expires {new Date(item.expires_at).toLocaleString()}</p>
            <button type="button" class="mt-3 min-h-11 rounded-lg bg-wedding-accent px-4 text-sm font-bold text-white disabled:opacity-60" disabled={busy()} onClick={() => void unlock(item)}>Unlock on this device</button>
          </article>
        )}</For>
      </div>

      <Show when={projection()}>{(view) => (
        <form class="mt-5 rounded-xl border border-wedding-accent/30 bg-wedding-surface p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <h3 class="font-semibold">Respond for the couple's review</h3>
          <p class="mt-1 text-sm text-wedding-muted">Sending does not accept a booking, contract, or payment.</p>
          <Show when={view().approvedFields.length > 0}>
            <dl class="mt-4 grid gap-2 rounded-lg bg-white p-3 text-sm">
              <For each={view().approvedFields}>{(field) => <div><dt class="font-medium">{field.key.replaceAll("_", " ")}</dt><dd class="text-wedding-muted">{typeof field.value === "string" || typeof field.value === "number" ? String(field.value) : "Approved context supplied"}</dd></div>}</For>
            </dl>
          </Show>
          <For each={view().questions}>{(question) => (
            <label class="mt-4 block text-sm font-medium">{question.label}
              <textarea required maxLength={4000} rows={4} class="mt-1 w-full rounded-lg border border-wedding-muted p-3" value={answers()[question.id] ?? ""} onInput={(event) => setAnswers((current) => ({ ...current, [question.id]: event.currentTarget.value }))} />
            </label>
          )}</For>
          <label class="mt-4 block text-sm font-medium">Authorised representative
            <input required maxLength={180} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={attestedBy()} onInput={(event) => setAttestedBy(event.currentTarget.value)} />
          </label>
          <button type="submit" class="mt-4 min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-60" disabled={busy()}>{busy() ? "Encrypting and sending…" : "Send response for review"}</button>
        </form>
      )}</Show>

      <Show when={receipt()}>{(id) => <p class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">Response received. Receipt {id()}.</p>}</Show>
      <Show when={error()}>{(message) => <p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{message()}</p>}</Show>
    </section>
  );
}

// @module-id: quotation.claimed-vendor-response-panel
// @primary-capability: minimal-encrypted-vendor-transaction-inbox
// @locs-version: 1.0
// @stability: draft
// @owner: omnyid

import { For, Show, createMemo, createResource, createSignal } from "solid-js";

import { VendorSenderIdentityPicker } from "@/components/vendor/VendorSenderIdentityPicker";
import type {
  SelectedVendorSenderIdentity,
  VendorSenderIdentityState,
  VendorSenderKind,
} from "@/lib/vendorSenderIdentityState";
import {
  loadVendorTransactionInbox,
  submitVendorTransactionResponse,
  uploadVendorResponseAttachment,
  unlockVendorTransaction,
  vendorResponseA2ui,
  type VendorContextProjectionView,
  type VendorTransactionInboxItem,
} from "@/lib/vendorQuotationResponseState";
import {
  buildVendorQuotePreview,
  formatQuoteMoney,
  type VendorQuoteDraft,
  type VendorQuoteLine,
} from "@/lib/vendorQuoteDraftState";

type SubmitInput = Parameters<typeof submitVendorTransactionResponse>[0];
type VendorUpload = Awaited<ReturnType<typeof uploadVendorResponseAttachment>>;

interface Props {
  loadTransactions?: () => Promise<VendorTransactionInboxItem[]>;
  unlockTransaction?: (item: VendorTransactionInboxItem) => Promise<VendorContextProjectionView>;
  submitResponse?: (input: SubmitInput) => Promise<{ status: "accepted" | "rejected"; receipt_id: string }>;
  loadSenderIdentity?: (vendorId: string) => Promise<VendorSenderIdentityState>;
  selectSenderIdentity?: (vendorId: string, kind: VendorSenderKind) => Promise<VendorSenderIdentityState>;
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
  const [senderIdentity, setSenderIdentity] = createSignal<SelectedVendorSenderIdentity | null>(null);
  const [uploads, setUploads] = createSignal<VendorUpload[]>([]);
  const [uploadBusy, setUploadBusy] = createSignal(false);
  const [quoteEnabled, setQuoteEnabled] = createSignal(false);
  const [quoteLines, setQuoteLines] = createSignal<VendorQuoteLine[]>([]);
  const [quoteCurrency, setQuoteCurrency] = createSignal<VendorQuoteDraft["currency"]>("AUD");
  const [quoteTaxTreatment, setQuoteTaxTreatment] = createSignal<VendorQuoteDraft["taxTreatment"]>("inclusive");
  const [quoteTaxAmount, setQuoteTaxAmount] = createSignal("0.00");
  const [quoteExpiry, setQuoteExpiry] = createSignal("");
  const [quoteGuestBasis, setQuoteGuestBasis] = createSignal("");
  const [quoteConditions, setQuoteConditions] = createSignal("");
  const [privateCalculationNotes, setPrivateCalculationNotes] = createSignal("");
  const [quoteApproved, setQuoteApproved] = createSignal(false);

  const resetQuote = () => {
    setQuoteEnabled(false);
    setQuoteLines([{ id: crypto.randomUUID(), description: "", quantity: 1, unitAmount: "" }]);
    setQuoteCurrency("AUD");
    setQuoteTaxTreatment("inclusive");
    setQuoteTaxAmount("0.00");
    setQuoteExpiry("");
    setQuoteGuestBasis("");
    setQuoteConditions("");
    setPrivateCalculationNotes("");
    setQuoteApproved(false);
  };

  const quoteDraft = (): VendorQuoteDraft => ({
    currency: quoteCurrency(), taxTreatment: quoteTaxTreatment(), taxAmount: quoteTaxAmount(),
    expiresOn: quoteExpiry(), conditions: quoteConditions(), lines: quoteLines(),
    guestBasis: quoteGuestBasis().trim() ? Number(quoteGuestBasis()) : undefined,
  });
  const quotePreview = createMemo(() => {
    if (!quoteEnabled()) return null;
    try {
      return { value: buildVendorQuotePreview(quoteDraft()), error: null };
    } catch (reason) {
      return { value: null, error: reason instanceof Error ? reason.message : "Complete the quote details." };
    }
  });

  const unlock = async (item: VendorTransactionInboxItem) => {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const view = await unlocker(item);
      setSelected(item);
      setProjection(view);
      setAnswers(Object.fromEntries(view.questions.map(({ id }) => [id, ""])));
      setSenderIdentity(null);
      setUploads([]);
      resetQuote();
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
    const sender = senderIdentity();
    if (!item || !view || !sender) {
      setError("Choose how this response should appear before sending.");
      return;
    }
    if (quoteEnabled() && !quoteApproved()) {
      setError("Review the normalised quote preview before sending.");
      return;
    }
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const result = await submitter({
        item,
        projection: view,
        answers: answers(),
        attestedBy: attestedBy(),
        senderIdentity: sender,
        attachments: uploads().map((upload) => upload.attachment),
        sources: uploads().map((upload) => upload.source),
        quoteDraft: quoteEnabled() ? quoteDraft() : undefined,
      });
      if (result.status !== "accepted") {
        throw new Error("The response was not accepted. Refresh the transaction before retrying.");
      }
      setReceipt(result.receipt_id);
      setSelected(null);
      setProjection(null);
      setSenderIdentity(null);
      setUploads([]);
      resetQuote();
      await refetch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send this response.");
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (files: FileList | null) => {
    const item = selected();
    if (!item || !files?.length || uploadBusy()) return;
    if (files.length + uploads().length > 5) {
      setError("Attach no more than five files to one response.");
      return;
    }
    setUploadBusy(true);
    setError(null);
    try {
      const added: VendorUpload[] = [];
      for (const file of Array.from(files)) added.push(await uploadVendorResponseAttachment(item, file));
      setUploads((current) => [...current, ...added]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The attachment could not be uploaded.");
    } finally {
      setUploadBusy(false);
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
          <VendorSenderIdentityPicker
            vendorId={view().vendorId}
            loadIdentity={props.loadSenderIdentity}
            selectIdentity={props.selectSenderIdentity}
            onIdentity={setSenderIdentity}
          />
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
          <Show when={view().allowedActions.includes("submit_revision")}>
            <div class="mt-4 rounded-lg border border-wedding-muted bg-white p-3">
              <label class="flex min-h-11 items-center gap-3 text-sm font-semibold">
                <input type="checkbox" class="h-5 w-5" checked={quoteEnabled()} onChange={(event) => { setQuoteEnabled(event.currentTarget.checked); setQuoteApproved(false); }} />
                Include an itemised quote
              </label>
              <Show when={quoteEnabled()}>
                <fieldset class="mt-3 grid gap-3" onInput={() => setQuoteApproved(false)}>
                  <legend class="sr-only">Itemised quote details</legend>
                  <p class="text-xs leading-5 text-wedding-muted">These fields become the couple's normalised quote preview. Nothing is sent until you review and submit.</p>
                  <For each={quoteLines()}>{(line, index) => (
                    <div class="grid gap-2 rounded-lg bg-wedding-surface p-3 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_auto] sm:items-end">
                      <label class="text-xs font-medium">Item
                        <input required maxLength={300} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={line.description} onInput={(event) => setQuoteLines((current) => current.map((item) => item.id === line.id ? { ...item, description: event.currentTarget.value } : item))} />
                      </label>
                      <label class="text-xs font-medium">Quantity
                        <input required type="number" min="1" max="10000" step="1" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={line.quantity} onInput={(event) => setQuoteLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.currentTarget.valueAsNumber } : item))} />
                      </label>
                      <label class="text-xs font-medium">Unit price
                        <input required inputmode="decimal" placeholder="0.00" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={line.unitAmount} onInput={(event) => setQuoteLines((current) => current.map((item) => item.id === line.id ? { ...item, unitAmount: event.currentTarget.value } : item))} />
                      </label>
                      <button type="button" class="min-h-11 rounded-lg border border-wedding-muted px-3 text-sm font-semibold disabled:opacity-50" disabled={quoteLines().length === 1} onClick={() => setQuoteLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button>
                      <span class="sr-only">Quote line {index() + 1}</span>
                    </div>
                  )}</For>
                  <button type="button" class="min-h-11 justify-self-start rounded-lg border border-wedding-accent px-3 text-sm font-semibold disabled:opacity-50" disabled={quoteLines().length >= 20} onClick={() => setQuoteLines((current) => [...current, { id: crypto.randomUUID(), description: "", quantity: 1, unitAmount: "" }])}>Add quote line</button>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="text-sm font-medium">Currency
                      <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={quoteCurrency()} onChange={(event) => setQuoteCurrency(event.currentTarget.value as VendorQuoteDraft["currency"])}><option>AUD</option><option>NZD</option><option>USD</option></select>
                    </label>
                    <label class="text-sm font-medium">Tax treatment
                      <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={quoteTaxTreatment()} onChange={(event) => setQuoteTaxTreatment(event.currentTarget.value as VendorQuoteDraft["taxTreatment"])}><option value="inclusive">Tax included</option><option value="exclusive">Tax added</option><option value="exempt">Tax exempt</option></select>
                    </label>
                    <label class="text-sm font-medium">Tax amount
                      <input required={quoteTaxTreatment() !== "exempt"} disabled={quoteTaxTreatment() === "exempt"} inputmode="decimal" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3 disabled:bg-wedding-surface" value={quoteTaxAmount()} onInput={(event) => setQuoteTaxAmount(event.currentTarget.value)} />
                    </label>
                    <label class="text-sm font-medium">Quote expires
                      <input required type="date" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={quoteExpiry()} onInput={(event) => setQuoteExpiry(event.currentTarget.value)} />
                    </label>
                    <label class="text-sm font-medium">Guest basis (optional)
                      <input type="number" min="1" max="10000" step="1" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={quoteGuestBasis()} onInput={(event) => setQuoteGuestBasis(event.currentTarget.value)} />
                    </label>
                  </div>
                  <label class="text-sm font-medium">Conditions shown to the couple (optional)
                    <textarea maxLength={4000} rows={3} class="mt-1 w-full rounded-lg border border-wedding-muted p-3" value={quoteConditions()} onInput={(event) => setQuoteConditions(event.currentTarget.value)} />
                  </label>
                  <label class="text-sm font-medium">Private calculation notes
                    <textarea maxLength={4000} rows={2} class="mt-1 w-full rounded-lg border border-wedding-muted p-3" value={privateCalculationNotes()} onInput={(event) => setPrivateCalculationNotes(event.currentTarget.value)} />
                    <span class="mt-1 block text-xs leading-5 text-wedding-muted">Only you can see these working notes. They are not included in the encrypted response.</span>
                  </label>
                </fieldset>
                <Show when={quotePreview()}>{(preview) => (
                  <div class="mt-4 rounded-lg border border-wedding-accent/30 bg-wedding-surface p-3" aria-live="polite">
                    <h4 class="text-sm font-semibold">Normalised preview for the couple</h4>
                    <Show when={preview().value} fallback={<p class="mt-2 text-sm text-amber-900">{preview().error}</p>}>
                      {(ready) => <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt>Subtotal</dt><dd class="text-right font-semibold">{formatQuoteMoney(ready().subtotalMinor, ready().currency)}</dd><dt>Tax</dt><dd class="text-right font-semibold">{formatQuoteMoney(ready().taxMinor, ready().currency)}</dd><dt>Total</dt><dd class="text-right text-base font-bold">{formatQuoteMoney(ready().totalMinor, ready().currency)}</dd><dt>Expires</dt><dd class="text-right font-semibold">{new Date(ready().expiresAt).toLocaleDateString()}</dd></dl>}
                    </Show>
                  </div>
                )}</Show>
                <Show when={quotePreview()?.value}>
                  <label class="mt-3 flex min-h-11 items-start gap-3 text-sm font-semibold"><input required type="checkbox" class="mt-1 h-5 w-5" checked={quoteApproved()} onChange={(event) => setQuoteApproved(event.currentTarget.checked)} />I reviewed the itemised total, tax, expiry and conditions shown above.</label>
                </Show>
              </Show>
            </div>
          </Show>
          <div class="mt-4 rounded-lg border border-wedding-muted bg-white p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium">Attachments</p>
                <p class="text-xs leading-5 text-wedding-muted">PDF, DOCX, TXT, JPG, PNG or WebP · up to 10 MB each</p>
              </div>
              <label class="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-wedding-accent px-3 text-sm font-semibold">
                {uploadBusy() ? "Checking…" : "Add files"}
                <input class="sr-only" type="file" multiple accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" disabled={busy() || uploadBusy() || uploads().length >= 5} onChange={(event) => { void addFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
              </label>
            </div>
            <Show when={uploads().length > 0}>
              <ul class="mt-2 space-y-2">
                <For each={uploads()}>{(upload) => <li class="flex items-center justify-between gap-2 rounded-lg bg-wedding-surface px-3 py-2 text-xs"><span class="min-w-0 truncate">{upload.attachment.file_name}</span><button type="button" class="font-semibold underline" onClick={() => setUploads((current) => current.filter((item) => item.attachment.attachment_id !== upload.attachment.attachment_id))}>Remove</button></li>}</For>
              </ul>
            </Show>
          </div>
          <label class="mt-4 block text-sm font-medium">Authorised representative
            <input required maxLength={180} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={attestedBy()} onInput={(event) => setAttestedBy(event.currentTarget.value)} />
          </label>
          <button type="submit" class="mt-4 min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-60" disabled={busy() || uploadBusy() || !senderIdentity()}>{busy() ? "Encrypting and sending…" : "Send response for review"}</button>
        </form>
      )}</Show>

      <Show when={receipt()}>{(id) => <p class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">Response received. Receipt {id()}.</p>}</Show>
      <Show when={error()}>{(message) => <p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{message()}</p>}</Show>
    </section>
  );
}

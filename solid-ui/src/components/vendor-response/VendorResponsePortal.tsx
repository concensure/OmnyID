import { Match, Show, Switch, createSignal, onMount } from "solid-js";
import VendorResponseContext from "./VendorResponseContext";
import VendorResponseForm from "./VendorResponseForm";
import {
  buildQuotationResponseSubmission, initialQuotationResponseForm, validateQuotationResponseForm,
  type FormIssue, type QuotationResponseFormState,
} from "../../lib/quotationResponseFormState";
import {
  exchangeQuotationResponseToken, submitQuotationResponse, takeQuotationResponseToken,
  type QuotationResponseSession, type SubmissionReceipt,
} from "../../lib/quotationResponseSessionApi";

type PortalState =
  | { kind: "loading" }
  | { kind: "ready"; session: QuotationResponseSession }
  | { kind: "receipt"; session: QuotationResponseSession; receipt: SubmissionReceipt }
  | { kind: "unavailable" };

function purposeLabel(purpose: QuotationResponseSession["projection"]["purpose"]): string {
  if (purpose === "refine_vendor_package") return "Review a requested package update";
  if (purpose === "confirm_booking_details") return "Confirm approved booking details";
  return "Answer questions about your quotation";
}

function approvedText(session: QuotationResponseSession, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = session.projection.fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export default function VendorResponsePortal() {
  const [portal, setPortal] = createSignal<PortalState>({ kind: "loading" });
  const [form, setForm] = createSignal<QuotationResponseFormState | null>(null);
  const [issues, setIssues] = createSignal<FormIssue[]>([]);
  const [submitting, setSubmitting] = createSignal(false);

  onMount(async () => {
    const token = takeQuotationResponseToken();
    if (!token) { setPortal({ kind: "unavailable" }); return; }
    try {
      const session = await exchangeQuotationResponseToken(token);
      setForm(initialQuotationResponseForm(session.projection));
      setPortal({ kind: "ready", session });
    } catch {
      setPortal({ kind: "unavailable" });
    }
  });

  async function submit(session: QuotationResponseSession) {
    const current = form();
    if (!current || submitting()) return;
    const nextIssues = validateQuotationResponseForm(current, session.projection);
    setIssues(nextIssues);
    if (nextIssues.length) {
      queueMicrotask(() => document.querySelector<HTMLElement>(".qr-error-summary")?.focus());
      return;
    }
    setSubmitting(true);
    try {
      const receipt = await submitQuotationResponse(session, buildQuotationResponseSubmission(current, session.projection));
      setPortal({ kind: "receipt", session, receipt });
      queueMicrotask(() => document.querySelector<HTMLElement>("#receipt-title")?.focus());
    } catch {
      setIssues([{ field: "submit", message: "We could not confirm receipt. Check your connection and retry once." }]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main class="qr-shell">
      <header class="qr-brand"><span class="qr-mark" aria-hidden="true">O</span><span>OmnyID secure response</span></header>
      <Switch>
        <Match when={portal().kind === "loading"}>
          <section class="qr-card qr-status" aria-live="polite"><div class="qr-spinner" aria-hidden="true" /><h1>Opening the secure request…</h1><p>The link is being exchanged for a short-lived response session.</p></section>
        </Match>
        <Match when={portal().kind === "unavailable"}>
          <section class="qr-card qr-status" role="alert"><h1>This response link is unavailable</h1>
            <p>It may have expired, been revoked, or already been replaced. No quotation details were shown.</p>
            <p><strong>You can still reply to the original email</strong> or ask the sender for a new link.</p></section>
        </Match>
        <Match when={portal().kind === "ready" || portal().kind === "receipt"}>
          {(() => {
            const session = () => (portal() as Extract<PortalState, { session: QuotationResponseSession }>).session;
            return <>
              <section class="qr-hero">
                <p class="qr-eyebrow">Quotation response</p>
                <h1>{purposeLabel(session().projection.purpose)}</h1>
                <p>For <strong>{approvedText(session(), ["vendor.name", "own_quote.vendor_name"], "your business")}</strong>, requested by {approvedText(session(), ["couple.label", "requester.label"], "the requester")}.</p>
                <p class="qr-expiry">Link expires <time datetime={session().capabilityExpiresAt}>{new Date(session().capabilityExpiresAt).toLocaleString()}</time></p>
              </section>
              <Show when={portal().kind === "receipt"} fallback={
                <div class="qr-layout"><VendorResponseContext projection={session().projection} />
                  <Show when={form()}>{(current) => <VendorResponseForm projection={session().projection} state={current()}
                    issues={issues()} submitting={submitting()} onChange={setForm} onSubmit={() => submit(session())} />}</Show></div>
              }>
                <section class="qr-card qr-receipt" aria-live="polite"><h2 id="receipt-title" tabindex="-1">Response received</h2>
                  <p>Your response is now waiting for the requester’s review. It has not accepted a contract, made a booking, or triggered a payment.</p>
                  <dl><div><dt>Receipt</dt><dd>{(portal() as Extract<PortalState, { kind: "receipt" }>).receipt.receiptId}</dd></div><div><dt>Status</dt><dd>Received · review required</dd></div></dl>
                  <p>You can close this page. Retrying the same submission returns this receipt without creating another response.</p></section>
              </Show>
            </>;
          })()}
        </Match>
      </Switch>
      <footer><p>Prefer email? Reply to the original message. Using this portal is optional.</p><p>Never forward a secure response link.</p></footer>
    </main>
  );
}

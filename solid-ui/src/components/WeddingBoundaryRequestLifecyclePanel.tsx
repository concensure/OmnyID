import { For, Show, createMemo, createSignal } from "solid-js";
import type { WeddingBoundaryChangeRequest } from "@/lib/weddingBoundaryLedgerState";

export default function WeddingBoundaryRequestLifecyclePanel(props: {
  requests: readonly WeddingBoundaryChangeRequest[];
  onTransition?: (requestId: string, operation: "submit" | "withdraw") => Promise<string>;
  onNotice: (notice: string) => void;
}) {
  const [savingId, setSavingId] = createSignal<string | null>(null);
  const [confirmingWithdrawalId, setConfirmingWithdrawalId] = createSignal<string | null>(null);
  const capturedRequests = createMemo(() => props.requests.filter((request) => (
    request.metadata?.source_surface === "wedding_boundary_management"
    && ["draft", "pending", "partially_approved"].includes(request.requestStatus)
  )));

  async function transition(requestId: string, operation: "submit" | "withdraw") {
    if (!props.onTransition || savingId()) return;
    setSavingId(requestId);
    try {
      props.onNotice(await props.onTransition(requestId, operation));
      setConfirmingWithdrawalId(null);
    } catch (error) {
      props.onNotice(error instanceof Error && error.message.trim()
        ? error.message
        : "Could not update that family request. Refresh and try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Show when={capturedRequests().length > 0}>
      <section aria-labelledby="family-request-drafts-title" class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
        <h4 id="family-request-drafts-title" class="text-sm font-semibold text-cyan-950">Your family requests</h4>
        <p class="mt-1 text-xs leading-5 text-cyan-950/70">A draft does not enter the decision queue or change the guest list until you submit it.</p>
        <div class="mt-3 space-y-2">
          <For each={capturedRequests()}>
            {(request) => (
              <article class="rounded-xl border border-cyan-100 bg-cyan-50/45 p-3">
                <p class="break-words text-sm font-semibold text-cyan-950">{request.title}</p>
                <p class="mt-1 text-xs leading-5 text-cyan-950/65">{request.requestStatus === "draft" ? "Saved draft · no guest or invitation changes" : "Submitted for couple review · no guest or invitation changes yet"}</p>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <Show when={request.requestStatus === "draft"}>
                    <button type="button" disabled={!props.onTransition || Boolean(savingId())} class="min-h-11 rounded-xl bg-cyan-700 px-3 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void transition(request.requestId, "submit")}>
                      {savingId() === request.requestId ? "Saving…" : "Submit for review"}
                    </button>
                  </Show>
                  <button type="button" disabled={!props.onTransition || Boolean(savingId())} class="min-h-11 rounded-xl border border-cyan-200 bg-white px-3 text-xs font-semibold text-cyan-950 disabled:opacity-50" onClick={() => setConfirmingWithdrawalId(request.requestId)}>
                    {request.requestStatus === "draft" ? "Withdraw draft" : "Withdraw request"}
                  </button>
                </div>
                <Show when={confirmingWithdrawalId() === request.requestId}>
                  <div role="alertdialog" aria-labelledby={`withdraw-title-${request.requestId}`} class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p id={`withdraw-title-${request.requestId}`} class="text-sm font-semibold text-amber-950">Withdraw this request?</p>
                    <p class="mt-1 text-xs leading-5 text-amber-950/75">It will leave the active queue and cannot be submitted again. The guest list will stay unchanged.</p>
                    <div class="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" class="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950" onClick={() => setConfirmingWithdrawalId(null)}>Cancel</button>
                      <button type="button" disabled={Boolean(savingId())} class="min-h-11 rounded-xl bg-amber-800 px-3 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void transition(request.requestId, "withdraw")}>Confirm withdrawal</button>
                    </div>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

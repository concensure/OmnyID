import { createSignal, onCleanup, Show } from "solid-js";
import { apiFetch } from "@/lib/api";
import { toolDecisionPayload, toolProposalMatches, type RunbookActivity, type RunbookToolReview, type RunbookToolProposal } from "@/lib/runbookState";
const buttonClass = "min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 disabled:opacity-60";
export function RunbookToolReviewCard(props: {
  activity: RunbookActivity; review: RunbookToolReview; busy: boolean;
  confirm: (run: () => Promise<unknown>, title: string, detail: string, label: string) => void;
}) {
  const [proposal,setProposal] = createSignal<RunbookToolProposal>();
  const [loading,setLoading] = createSignal(false);
  const [error,setError] = createSignal("");
  const [now,setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()),1000);
  const controller = new AbortController();
  onCleanup(() => { controller.abort(); clearInterval(timer); });
  const base = () => `/runbooks/instances/${encodeURIComponent(props.activity.instance.instance_id)}/tools/${encodeURIComponent(props.review.proposal_ref)}`;
  async function load() {
    if (loading() || props.busy) return;
    setLoading(true); setError("");
    try {
      const result = await apiFetch<{proposal:RunbookToolProposal}>(base(),{signal:controller.signal});
      if (controller.signal.aborted) return;
      if (!toolProposalMatches(props.activity,props.review,result.proposal)) throw new Error("mismatch");
      setProposal(result.proposal);
    } catch { if (!controller.signal.aborted) setError("The exact action could not be verified. Refresh runbooks before reviewing."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function eligible(approved: boolean) {
    try { toolDecisionPayload(props.activity,props.review,proposal()!,approved,now()); return true; }
    catch { return false; }
  }
  function decide(approved: boolean) {
    if (!eligible(approved) || props.busy) return;
    props.confirm(async () => {
      if (controller.signal.aborted) throw new Error("review_closed");
      const bodyJson = toolDecisionPayload(props.activity,props.review,proposal()!,approved);
      return apiFetch(`${base()}/decision`,{method:"POST",bodyJson,signal:controller.signal});
    }, approved ? "Approve this exact tool action?" : "Reject this tool action?",
    approved ? `Records approval for ${props.review.tool_slug}.${props.review.capability} with the exact arguments shown. Tool execution is not available yet; nothing runs now.`
      : "Stops this run and retains its private evidence.",
    approved ? "Approve tool action" : "Reject tool action");
  }
  return <section aria-label="Tool action review" class="min-w-0 space-y-2 rounded-lg border border-slate-300 p-3">
    <h4 class="break-all font-semibold">Tool action: {props.review.tool_slug}.{props.review.capability}</h4>
    <p class="text-sm">Decision: {props.review.status}</p>
    <p class="text-sm">Approval expires {new Date(props.review.expires_at).toLocaleString()}</p>
    <p class="text-sm">Tool execution is not available yet. Reviewing this action does not run it.</p>
    <Show when={props.activity.tool_review_available === true} fallback={<p class="text-sm">Tool review is currently unavailable.</p>}>
      <Show when={!proposal()}><button type="button" class={buttonClass} disabled={props.busy || loading() || !!error()} onClick={() => void load()}>
        {loading() ? "Loading exact action…" : "Review exact tool action"}</button></Show>
      <Show when={error()}><p role="alert">{error()}</p></Show>
      <Show when={proposal()}>{p => <>
        <p class="text-sm font-medium">Exact arguments</p>
        <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-100 p-2 text-sm" tabIndex={0} aria-label="Exact tool arguments">{JSON.stringify(p().request.arguments,null,2)}</pre>
        <details><summary class="min-h-11 cursor-pointer py-2">Action identity</summary><p class="break-all text-xs">{props.review.request_hash}</p></details>
        <Show when={["pending","expired"].includes(props.review.status)}>
          <Show when={!eligible(true)}><p class="text-sm">Approval is unavailable or expired. You can reject a still-pending action or refresh its status.</p></Show>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={buttonClass} disabled={props.busy || !eligible(false)} onClick={() => decide(false)}>Reject tool action…</button>
            <button type="button" class={buttonClass} disabled={props.busy || !eligible(true)} onClick={() => decide(true)}>Approve tool action…</button>
          </div>
        </Show>
      </>}</Show>
    </Show>
  </section>;
}

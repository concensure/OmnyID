import { ApprovalReviewSummary } from "./ApprovalReviewSummary";
import { navigateToView } from "@/lib/decisionosNavigation";
import { createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";
import { apiFetch, readSessionChangedEventDetail, SESSION_CHANGED_EVENT } from "@/lib/api";
import { openRunbookQuestions, runbookIdentifier, runbookStatus, runbookTerminal,
  type RunbookActivity, type RunbookDefinitionSummary } from "@/lib/runbookState";
import { RunbookQuestionCard } from "./RunbookQuestionCard";
import { DialogShell } from "./DialogShell";
import { EmptyState } from "./EmptyState";
import { toast } from "./Toast";

type Confirmation = { title: string; detail: string; label: string; run: () => Promise<unknown> };
const buttonClass = "min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus-visible:outline focus-visible:outline-2 disabled:opacity-60";
export function RunbookPanel(props: { mode?: "manage" | "questions" | "activity"; instanceId?: string; definitionId?: string }) {
  const uid = createUniqueId();
  const [definitions, setDefinitions] = createSignal<RunbookDefinitionSummary[]>([]);
  const [starters, setStarters] = createSignal<RunbookDefinitionSummary[]>([]);
  const [activities, setActivities] = createSignal<RunbookActivity[]>([]);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [available, setAvailable] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [truncated, setTruncated] = createSignal(false);
  const [confirm, setConfirm] = createSignal<Confirmation>();
  let controller: AbortController | undefined;
  let generation = 0;
  let heading: HTMLHeadingElement | undefined;
  const manage = () => !props.mode || props.mode === "manage";
  async function load() {
    const current = ++generation;
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    setLoading(true); setError("");
    try {
      if (manage()) {
        const [list, templates] = await Promise.all([
          apiFetch<{ definitions: RunbookDefinitionSummary[] }>("/runbooks", { signal }),
          apiFetch<{ starters: RunbookDefinitionSummary[] }>("/runbooks/starters", { signal }),
        ]);
        if (current !== generation) return;
        setDefinitions(list.definitions.filter(d => !props.definitionId || d.runbook_id === props.definitionId));
        setStarters(templates.starters.filter(t => !list.definitions.some(d => d.runbook_id === t.runbook_id)));
      }
      if (props.instanceId && !runbookIdentifier(props.instanceId)) throw new Error("invalid_instance");
      const result = props.instanceId
        ? { activities: [await apiFetch<RunbookActivity>(`/runbooks/instances/${encodeURIComponent(props.instanceId)}/activity`, { signal })], truncated: false }
        : await apiFetch<{ activities: RunbookActivity[]; truncated: boolean }>("/runbooks/instances", { signal });
      if (current !== generation) return;
      setActivities(result.activities); setTruncated(result.truncated); setAvailable(true);
    } catch (e) {
      if (current !== generation || signal.aborted) return;
      setActivities([]); setDefinitions([]);
      if (e instanceof Error && e.message === "not_found") setAvailable(false);
      else setError("Runbooks could not be loaded. Refresh to try again.");
    } finally { if (current === generation) setLoading(false); }
  }
  function sessionChanged(event: Event) {
    ++generation; controller?.abort(); setActivities([]); setDefinitions([]); setStarters([]);
    setSelected([]); setConfirm(undefined); setNotice("");
    if (!readSessionChangedEventDetail(event).session) { setAvailable(false); setLoading(false); return; }
    void load();
  }
  onMount(() => { void load(); window.addEventListener(SESSION_CHANGED_EVENT, sessionChanged); });
  onCleanup(() => { ++generation; controller?.abort(); window.removeEventListener(SESSION_CHANGED_EVENT, sessionChanged); });
  async function act(run: () => Promise<unknown>, message: string) {
    if (busy() || loading() || error()) return;
    const current = generation;
    setBusy(true); setError(""); setNotice("");
    try {
      await run();
      if (current !== generation) return;
      setConfirm(undefined); await load();
      if (generation !== current + 1) return;
      setNotice(message); toast.success(message);
      queueMicrotask(() => heading?.focus());
    } catch {
      if (current === generation) { setConfirm(undefined); setError("The change was not confirmed. Refresh before trying again."); toast.error("Runbook change was not confirmed."); queueMicrotask(() => heading?.focus()); }
      throw new Error("runbook_action_failed");
    } finally { setBusy(false); }
  }
  function request(run: () => Promise<unknown>, title: string, detail: string, label: string) {
    setConfirm({ run, title, detail, label });
  }
  async function exportDefinition(d: RunbookDefinitionSummary) {
    const current = generation;
    const value = await apiFetch<unknown>(`/runbooks/${encodeURIComponent(d.runbook_id)}/export`, { signal: controller?.signal });
    if (current !== generation) throw new Error("session_changed");
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `runbook-${d.runbook_id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const visibleActivities = () => props.mode === "questions"
    ? activities().filter(a => openRunbookQuestions(a).length > 0 || (a.reviews?.length ?? 0) > 0 || (a.approval_requests?.length ?? 0) > 0) : activities();
  return <Show when={available()}>
    <section aria-labelledby={uid} class="min-w-0 space-y-3 rounded-2xl border border-slate-300 bg-slate-50 p-3 text-slate-900">
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id={uid} ref={heading} tabIndex={-1} class="break-words text-lg font-semibold">
          {props.mode === "questions" ? "Runbook questions and reviews" : "Runbooks"}
        </h2>
        <button type="button" class={buttonClass} disabled={loading() || busy()} onClick={() => void load()}>Refresh runbooks</button>
      </div>
      <Show when={manage()}><p class="text-sm">Choose routines to keep track of. They are added disabled. Tool and model execution is not available yet.</p></Show>
      <Show when={loading()}><p role="status">Loading runbooks…</p></Show>
      <Show when={error()}><p role="alert" class="break-words text-red-800">{error()}</p></Show>
      <Show when={notice()}><p role="status" class="text-sm">{notice()}</p></Show>
      <Show when={truncated()}><p role="status">Showing up to 50 runs, with questions first. Older runs may be omitted.</p></Show>
      <Show when={manage() && !loading() && !error()}>
        <Show when={starters().length}>
          <details open={definitions().length === 0} class="min-w-0">
            <summary class="min-h-11 cursor-pointer py-2 font-semibold">Choose starter runbooks</summary>
            <div class="space-y-2"><For each={starters()}>{s =>
              <label class="flex min-h-11 items-start gap-2 break-words rounded-lg border border-slate-300 bg-white p-2">
                <input type="checkbox" class="mt-1" disabled={busy()} checked={selected().includes(s.runbook_id)}
                  onChange={e => setSelected(ids => e.currentTarget.checked ? [...ids, s.runbook_id] : ids.filter(id => id !== s.runbook_id))} />
                <span class="min-w-0">{s.name}</span>
              </label>
            }</For></div>
            <button type="button" class={buttonClass} disabled={busy() || !selected().length}
              onClick={() => void act(() => apiFetch("/runbooks/setup", { method: "POST", bodyJson: { selected: selected() } }), "Selected runbooks added disabled.").then(() => setSelected([])).catch(() => {})}>
              Add selected runbooks disabled
            </button>
          </details>
        </Show>
        <For each={definitions()}>{d => <article class="min-w-0 space-y-2 rounded-xl border border-slate-300 bg-white p-3">
          <h3 class="break-words font-semibold">{d.name}</h3>
          <p class="text-sm">{d.status === "archived" ? "Archived" : d.enabled ? "Enabled for event matching" : "Disabled"} · Version {d.version}</p>
          <p class="break-words text-sm">Watches for: {d.trigger_types.join(", ").replaceAll("_", " ")}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={buttonClass} disabled={busy() || loading() || !!error() || d.status === "archived"} onClick={() => request(
              () => apiFetch(`/runbooks/${encodeURIComponent(d.runbook_id)}/enabled`, { method: "POST", bodyJson: { expected_parent: d.message_id, enabled: !d.enabled } }),
              d.enabled ? "Disable this runbook?" : "Enable event matching?",
              d.enabled ? "New matches and further advancement stop. Existing history is retained." : "Eligible persisted events can match this routine when account rollout permits. This grants no permission to send, spend or publish.",
              d.enabled ? "Disable this runbook" : "Enable event matching")}>
              {d.enabled ? "Disable this runbook" : "Enable event matching"}
            </button>
            <button type="button" class={buttonClass} disabled={busy() || loading() || !!error()} onClick={() => request(() => exportDefinition(d),
              "Export this definition?", "Downloads the authored definition. Storage credentials, evidence and answers are excluded. Review its text before sharing.", "Download definition JSON")}>
              Export definition…
            </button>
          </div>
        </article>}</For>
      </Show>
      <Show when={!loading() && !error() && !visibleActivities().length}>
        <EmptyState title={props.mode === "questions" ? "No runbook questions or reviews" : "No runbook activity yet"}
          body={props.mode === "questions" ? "Questions and completed findings appear here when a run needs your attention." : "Matched events and waiting steps will appear here."} />
      </Show>
      <For each={visibleActivities()}>{a => <article class="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-white p-3">
        <h3 class="break-words font-semibold">{a.instance.runbook_id.replaceAll("_", " ")}</h3>
        <p class="text-sm">{runbookStatus(a.instance.status)}</p>
        <Show when={a.instance.next_follow_up_at}><p class="text-sm">Follow-up due {new Date(a.instance.next_follow_up_at!).toLocaleString()}</p></Show>
        <For each={openRunbookQuestions(a)}>{q =>
          <RunbookQuestionCard activity={a} question={q} busy={busy() || loading() || !!error()}
            onAnswer={payload => act(() => apiFetch(`/runbooks/instances/${encodeURIComponent(a.instance.instance_id)}/answers`, { method: "POST", bodyJson: payload }), "Answer saved to this step.")} />
        }</For>
        <For each={a.approval_requests ?? []}>{proposal => <section aria-label="Runbook approval proposal" class="min-w-0 space-y-2">
          <ApprovalReviewSummary approvalReview={proposal.approval_review} />
          <p class="break-all text-sm">Review proposal: {proposal.action_ref}</p>
          <p class="text-sm">Reviewing this proposal does not send or publish anything.</p>
        </section>}</For>
        <For each={a.reviews ?? []}>{review => <section class="min-w-0 space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3" aria-label={review.title}>
          <h4 class="break-words font-semibold">{review.title}</h4>
          <ul class="list-disc space-y-1 pl-5 text-sm"><For each={review.summary_lines}>{line => <li class="break-words">{line}</li>}</For></ul>
          <p class="text-sm">These are saved findings. No external action was taken.</p>
          <details><summary class="min-h-11 cursor-pointer py-2 text-sm">Review sources</summary>
            <ul class="space-y-1 text-sm"><For each={review.source_refs}>{ref => <li class="break-all">{ref}</li>}</For></ul>
          </details>
        </section>}</For>
        <Show when={props.mode !== "questions"}>
          <details class="min-w-0"><summary class="min-h-11 cursor-pointer py-2">Step history and evidence</summary>
            <ol class="space-y-3 border-l border-slate-300 pl-3"><For each={a.traces}>{t =>
              <li class="min-w-0 break-words text-sm">
                <p>{t.step_id.replaceAll("_", " ")} — {t.status.replaceAll("_", " ")} · {new Date(t.started_at).toLocaleString()}</p>
                <p class="break-all">Sources: {t.source_refs.length ? t.source_refs.join(", ") : "No source records"}</p>
                <Show when={t.provenance_ref}><p class="break-all">Provenance record: {t.provenance_ref}</p></Show>
                <Show when={t.approval_ref}><p class="break-all">Approval record: {t.approval_ref}</p>
                  <button type="button" class={buttonClass} onClick={() => navigateToView("decision_queue")}>Review in Decision Queue</button>
                </Show>
              </li>
            }</For></ol>
          </details>
          <Show when={!runbookTerminal(a.instance.status)}>
            <button type="button" class={buttonClass} disabled={busy() || loading() || !!error()} onClick={() => request(
              () => apiFetch(`/runbooks/instances/${encodeURIComponent(a.instance.instance_id)}/cancel`, { method: "POST", bodyJson: { expected_revision: a.instance.revision } }),
              "Cancel this run?", "Stops this run and cancels its outstanding questions and follow-ups. Existing evidence is retained.", "Cancel run and follow-ups")}>Cancel this run…</button>
          </Show>
        </Show>
      </article>}</For>
      <Show when={confirm()}>{confirmation =>
        <DialogShell open labelledBy={`${uid}-confirm`} describedBy={`${uid}-detail`} busy={busy()}
          focusableSelector="button:not([disabled])" overlayClass="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-3"
          dialogClass="w-full max-w-md space-y-3 rounded-xl bg-white p-4 text-slate-900"
          onClose={() => { if (!busy()) setConfirm(undefined); }}>
          <h2 id={`${uid}-confirm`} class="text-lg font-semibold">{confirmation().title}</h2>
          <p id={`${uid}-detail`}>{confirmation().detail}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class={buttonClass} disabled={busy()} onClick={() => setConfirm(undefined)}>Keep unchanged</button>
            <button type="button" class={buttonClass} disabled={busy()} onClick={() => void act(confirmation().run, "Runbook change confirmed.").catch(() => {})}>
              {busy() ? "Saving…" : confirmation().label}
            </button>
          </div>
        </DialogShell>
      }</Show>
    </section>
  </Show>;
}

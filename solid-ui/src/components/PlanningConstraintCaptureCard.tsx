import { createSignal, For, Show } from "solid-js";

import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import {
  capturePlanningRemark,
  confirmPlanningConstraint,
  planningConstraintCaptureUiEnabled,
  planningConstraintCaptureUserMessage,
  preparePlanningRemark,
  type PlanningConstraintCaptureProposal,
  type PlanningConstraintCaptureResponse,
  type PreparedPlanningRemark,
} from "@/lib/planningConstraintCapture";

export function PlanningConstraintCaptureCard(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  enabled?: boolean;
}) {
  const [remark, setRemark] = createSignal("");
  const [prepared, setPrepared] = createSignal<PreparedPlanningRemark | null>(null);
  const [capture, setCapture] = createSignal<PlanningConstraintCaptureResponse | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const enabled = () => props.enabled ?? planningConstraintCaptureUiEnabled();

  async function reviewRemark() {
    const cleanRemark = remark().trim();
    if (!cleanRemark || busy()) return;
    if (!props.workspace.saveProjection) {
      setNotice("Sign in to save this planning note.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let current = prepared();
      if (!current || current.captureRequest["remark"] !== cleanRemark) {
        current = preparePlanningRemark(props.workspace.state.workspace.metadata, cleanRemark);
        setPrepared(current);
        await props.workspace.saveProjection(current.source);
      }
      setCapture(await capturePlanningRemark(current));
    } catch (error: unknown) {
      setNotice(planningConstraintCaptureUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(proposal: PlanningConstraintCaptureProposal) {
    const current = prepared();
    if (!current || confirmingId()) return;
    setConfirmingId(proposal.constraint.constraint_id);
    setNotice(null);
    try {
      await confirmPlanningConstraint(String(current.captureRequest["thread_id"]), proposal.constraint);
      setCapture((value) => value ? { ...value, proposals: value.proposals.filter((item) => item.constraint.constraint_id !== proposal.constraint.constraint_id) } : value);
      setNotice(`Saved: ${proposal.summary}.`);
      props.workspace.onRefreshWorkspace?.();
    } catch (error: unknown) {
      setNotice(planningConstraintCaptureUserMessage(error));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <Show when={enabled()}>
      <section class="mt-3 min-w-0 rounded-2xl border border-wedding-hairline bg-white p-4 shadow-sm" aria-labelledby="planning-constraint-capture-title">
        <p id="planning-constraint-capture-title" class="font-display text-lg font-semibold text-wedding-text">Anything we should remember?</p>
        <p class="mt-1 text-sm leading-5 text-wedding-muted">Add one practical must-have or preference. We only add it to your plan after you confirm it.</p>
        <label class="mt-3 block text-sm font-semibold text-wedding-text">
          Planning note
          <textarea
            value={remark()}
            maxlength={2000}
            rows={3}
            onInput={(event) => { setRemark(event.currentTarget.value); setCapture(null); setPrepared(null); setNotice(null); }}
            placeholder="For example: We need step-free access"
            class="mt-1 min-h-24 w-full resize-y rounded-2xl border border-wedding-hairline bg-wedding-surface px-3 py-3 text-base font-normal leading-6 text-wedding-text outline-none placeholder:text-wedding-muted focus:border-wedding-accent focus:ring-4 focus:ring-wedding-accent/15"
          />
        </label>
        <button
          type="button"
          class="mt-3 min-h-11 w-full rounded-full bg-wedding-cta px-4 text-sm font-bold text-white shadow-wedding-cta transition active:translate-y-[2px] active:shadow-none disabled:opacity-45 sm:w-auto"
          disabled={busy() || !remark().trim()}
          onClick={() => void reviewRemark()}
        >{busy() ? "Checking your note…" : "Review before saving"}</button>

        <Show when={capture()?.clarifyingQuestion}>{(question) => (
          <div class="mt-3 rounded-2xl bg-wedding-surface-blush px-3 py-3 text-sm leading-5 text-wedding-text" role="status">
            <p class="font-semibold">One quick check</p><p class="mt-1">{question()}</p>
          </div>
        )}</Show>
        <For each={capture()?.proposals ?? []}>{(proposal) => (
          <article class="mt-3 min-w-0 rounded-2xl border border-wedding-hairline bg-wedding-surface p-3">
            <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div class="min-w-0"><p class="break-words text-sm font-bold text-wedding-text">{proposal.summary}</p><p class="mt-1 break-words text-xs leading-5 text-wedding-muted">From your note: “{proposal.constraint.source_anchor.exact_excerpt}”</p></div>
              <span class="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-wedding-muted">{proposal.constraint.strength === "hard" ? "Must-have" : "Preference"}</span>
            </div>
            <div class="mt-3 flex flex-col gap-2 xs:flex-row">
              <button type="button" class="min-h-11 rounded-full bg-wedding-cta px-4 text-sm font-bold text-white disabled:opacity-45" disabled={Boolean(confirmingId())} onClick={() => void confirm(proposal)}>{confirmingId() === proposal.constraint.constraint_id ? "Saving…" : proposal.confirmationLabel}</button>
              <button type="button" class="min-h-11 rounded-full border border-wedding-hairline bg-white px-4 text-sm font-semibold text-wedding-text" disabled={Boolean(confirmingId())} onClick={() => { setCapture(null); setNotice("Your note is kept, but nothing was added to the plan."); }}>Not now</button>
            </div>
          </article>
        )}</For>
        <Show when={notice()}>{(message) => <p class="mt-3 break-words text-sm leading-5 text-wedding-muted" role="status" aria-live="polite">{message()}</p>}</Show>
      </section>
    </Show>
  );
}

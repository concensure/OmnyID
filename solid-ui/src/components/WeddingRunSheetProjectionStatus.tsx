// @locs-version: 1.0
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import type { CompatibleDatabaseMessage } from "@/lib/databaseMessageCompatibility";
import { databaseRecordsFromMessages } from "@/lib/databaseViewState";
import {
  buildWeddingRunSheetProjectionPlan,
  weddingRunSheetSourceMessageIds,
} from "@/lib/weddingRunSheetProjectorState";
import {
  commitWeddingRunSheetProjection,
  loadWeddingRunSheetProjection,
  type WeddingRunSheetProjectionState,
} from "@/lib/weddingRunSheetProjectionApi";

export function WeddingRunSheetProjectionStatus(props: {
  databaseId: string;
  weddingPlanId: string;
  messages: CompatibleDatabaseMessage[];
  archived: boolean;
  onMessages: (messages: CompatibleDatabaseMessage[]) => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Preparing your run sheet…");
  const [error, setError] = createSignal("");
  let lastAutomaticKey = "";

  const sourceKey = createMemo(() => weddingRunSheetSourceMessageIds(props.messages, props.weddingPlanId)
    .map((id) => {
      const source = props.messages.find((message) => message.id === id);
      return `${id}:${source?.timestamp ?? ""}`;
    })
    .sort()
    .join("|"));

  function mergeMessages(base: CompatibleDatabaseMessage[], added: CompatibleDatabaseMessage[]) {
    const messages = new Map(base.map((message) => [message.id, message]));
    for (const message of added) messages.set(message.id, message);
    return Array.from(messages.values());
  }

  async function projectionState(): Promise<WeddingRunSheetProjectionState> {
    const state = await loadWeddingRunSheetProjection({ databaseId: props.databaseId, weddingPlanId: props.weddingPlanId });
    props.onMessages(state.messages);
    return state;
  }

  async function synchronize(allowConflictRetry = true) {
    if (busy() || props.archived) return;
    setBusy(true);
    setError("");
    try {
      const state = await projectionState();
      const messages = mergeMessages(props.messages, state.messages);
      const changedMessageIds = weddingRunSheetSourceMessageIds(messages, props.weddingPlanId);
      const plan = buildWeddingRunSheetProjectionPlan({
        databaseId: props.databaseId,
        weddingPlanId: props.weddingPlanId,
        messages,
        changedMessageIds,
        currentRows: databaseRecordsFromMessages(messages),
        checkpoint: state.checkpoint,
      });
      if (!plan.receipt || !plan.nextCheckpoint) {
        setStatus(plan.explanation || "Your run sheet is up to date.");
        return;
      }
      const result = await commitWeddingRunSheetProjection({
        databaseId: props.databaseId,
        weddingPlanId: props.weddingPlanId,
        expectedCheckpoint: state.checkpoint,
        nextCheckpoint: plan.nextCheckpoint,
        records: plan.records,
        revisions: plan.revisions,
        receipt: plan.receipt,
        explanation: plan.explanation,
      });
      props.onMessages(result.state.messages);
      setStatus(result.replayed ? "Your run sheet was already up to date." : result.explanation);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The run sheet could not be updated.";
      if (allowConflictRetry && /changed while|conflict|409/i.test(message)) {
        setBusy(false);
        await synchronize(false);
        return;
      }
      setError(message);
      setStatus("Your saved run sheet is still available.");
    } finally {
      setBusy(false);
    }
  }

  createEffect(() => {
    const key = `${props.databaseId}:${props.weddingPlanId}:${sourceKey()}`;
    if (!props.archived && key !== lastAutomaticKey) {
      lastAutomaticKey = key;
      void synchronize();
    }
  });

  return (
    <section class="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-on-surface">Ledger-backed run sheet</p>
        <p class="mt-0.5 text-xs leading-5 text-on-surface-variant">
          {error() || status()}
        </p>
      </div>
      <button
        type="button"
        disabled={busy() || props.archived}
        onClick={() => void synchronize()}
        class="min-h-11 shrink-0 rounded-lg border border-primary/25 bg-white/70 px-4 text-sm font-medium text-primary transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
      >
        <Show when={busy()} fallback="Sync changes">Syncing…</Show>
      </button>
    </section>
  );
}

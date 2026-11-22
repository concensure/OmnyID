// @locs-version: 1.0
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { CompatibleDatabaseMessage } from "@/lib/databaseMessageCompatibility";
import { databaseRecordsFromMessages } from "@/lib/databaseViewState";
import {
  buildWeddingRunSheetProjectionBatchSeries,
  weddingRunSheetSourceMessageIds,
} from "@/lib/weddingRunSheetProjectorState";
import {
  commitWeddingRunSheetProjection,
  ensureWeddingRunSheetProjection,
  loadWeddingRunSheetProjection,
  type WeddingRunSheetProjectionState,
} from "@/lib/weddingRunSheetProjectionApi";
import {
  readWeddingRunSheetOfflineSnapshot,
  weddingRunSheetProjectionTelemetry,
  weddingRunSheetOfflineMessages,
  writeWeddingRunSheetOfflineSnapshot,
} from "@/lib/weddingRunSheetOfflineState";

export function WeddingRunSheetProjectionStatus(props: {
  databaseId: string;
  weddingPlanId: string;
  responseWorkspaceId: string;
  accountId: string;
  messages: CompatibleDatabaseMessage[];
  archived: boolean;
  onMessages: (messages: CompatibleDatabaseMessage[]) => void;
  onOfflineChange?: (offline: boolean) => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("Preparing your run sheet…");
  const [error, setError] = createSignal("");
  const [offlineAt, setOfflineAt] = createSignal("");
  const [preview, setPreview] = createSignal<{ sources: number; batches: number; writes: number } | null>(null);
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

  function setOffline(value: string) {
    setOfflineAt(value);
    props.onOfflineChange?.(Boolean(value));
  }

  function cacheState(messages: CompatibleDatabaseMessage[]) {
    if (typeof window === "undefined") return;
    try {
      writeWeddingRunSheetOfflineSnapshot(window.localStorage, {
        accountId: props.accountId,
        databaseId: props.databaseId,
        weddingPlanId: props.weddingPlanId,
        messages,
      });
    } catch {
      // Storage can be unavailable in private mode. The ledger remains authoritative.
    }
  }

  function cachedState() {
    if (typeof window === "undefined") return null;
    try {
      return readWeddingRunSheetOfflineSnapshot(window.localStorage, {
        accountId: props.accountId,
        databaseId: props.databaseId,
        weddingPlanId: props.weddingPlanId,
      });
    } catch {
      return null;
    }
  }

  async function projectionState(): Promise<WeddingRunSheetProjectionState> {
    const scope = {
      databaseId: props.databaseId,
      weddingPlanId: props.weddingPlanId,
      responseWorkspaceId: props.responseWorkspaceId,
    };
    await ensureWeddingRunSheetProjection(scope);
    const state = await loadWeddingRunSheetProjection(scope);
    props.onMessages(state.messages);
    cacheState(state.messages);
    setOffline("");
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
      const series = buildWeddingRunSheetProjectionBatchSeries({
        databaseId: props.databaseId,
        weddingPlanId: props.weddingPlanId,
        messages,
        changedMessageIds,
        currentRows: databaseRecordsFromMessages(messages),
        checkpoint: state.checkpoint,
      });
      const telemetry = weddingRunSheetProjectionTelemetry({
        sourceCount: series.sourceCount,
        batchCount: series.batches.length,
        writeCount: series.writeCount,
      });
      if (series.batches.length === 0) {
        setStatus("Your run sheet is up to date. Last checked just now.");
        return;
      }
      let latestState = state;
      let replayed = 0;
      for (const batch of series.batches) {
        const plan = batch.plan;
        if (!plan.receipt || !plan.nextCheckpoint) continue;
        const result = await commitWeddingRunSheetProjection({
          databaseId: props.databaseId,
          weddingPlanId: props.weddingPlanId,
          responseWorkspaceId: props.responseWorkspaceId,
          expectedCheckpoint: batch.expectedCheckpoint,
          nextCheckpoint: plan.nextCheckpoint,
          records: plan.records,
          revisions: plan.revisions,
          receipt: plan.receipt,
          explanation: plan.explanation,
        });
        latestState = result.state;
        if (result.replayed) replayed += 1;
        props.onMessages(result.state.messages);
      }
      cacheState(latestState.messages);
      setStatus(replayed === series.batches.length
        ? "Your run sheet was already up to date."
        : `${telemetry.writeCount} run-sheet change${telemetry.writeCount === 1 ? "" : "s"} saved in ${telemetry.batchCount} bounded batch${telemetry.batchCount === 1 ? "" : "es"}.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The run sheet could not be updated.";
      if (allowConflictRetry && /changed while|conflict|409/i.test(message)) {
        setBusy(false);
        await synchronize(false);
        return;
      }
      const cached = cachedState();
      if (cached) {
        props.onMessages(weddingRunSheetOfflineMessages(cached));
        setOffline(cached.lastSynchronizedAt);
        setError("");
        setStatus(`Offline copy from ${new Date(cached.lastSynchronizedAt).toLocaleString()}. It is read-only until OmnyID reconnects.`);
      } else {
        setError(message);
        setStatus("The run sheet could not be refreshed and no offline copy is available.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function reviewRebuild() {
    if (busy() || props.archived || offlineAt()) return;
    setBusy(true); setError("");
    try {
      const state = await projectionState();
      const messages = mergeMessages(props.messages, state.messages);
      const series = buildWeddingRunSheetProjectionBatchSeries({
        databaseId: props.databaseId,
        weddingPlanId: props.weddingPlanId,
        messages,
        changedMessageIds: weddingRunSheetSourceMessageIds(messages, props.weddingPlanId),
        currentRows: databaseRecordsFromMessages(messages),
        checkpoint: state.checkpoint,
      });
      setPreview({ sources: series.sourceCount, batches: series.batches.length, writes: series.writeCount });
      setStatus("Rebuild review complete. No changes were written.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The rebuild review could not be prepared.");
    } finally { setBusy(false); }
  }

  createEffect(() => {
    const key = `${props.databaseId}:${props.weddingPlanId}:${props.responseWorkspaceId}:${sourceKey()}`;
    if (!props.archived && key !== lastAutomaticKey) {
      lastAutomaticKey = key;
      void synchronize();
    }
  });

  onCleanup(() => props.onOfflineChange?.(false));

  return (
    <section class="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3" aria-live="polite">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-on-surface">Ledger-backed run sheet</p>
          <p class="mt-0.5 text-xs leading-5 text-on-surface-variant">
            {error() || status()}
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy() || props.archived || Boolean(offlineAt())}
            onClick={() => void reviewRebuild()}
            class="min-h-11 shrink-0 rounded-lg border border-primary/20 bg-transparent px-4 text-sm font-medium text-primary transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-55"
          >
            Review rebuild
          </button>
          <button
            type="button"
            disabled={busy() || props.archived}
            onClick={() => void synchronize()}
            class="min-h-11 shrink-0 rounded-lg border border-primary/25 bg-white/70 px-4 text-sm font-medium text-primary transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Show when={busy()} fallback={offlineAt() ? "Try reconnecting" : "Sync changes"}>Syncing…</Show>
          </button>
        </div>
      </div>
      <Show when={preview()}>{(value) => (
        <div class="rounded-lg border border-primary/10 bg-white/55 px-3 py-2 text-xs leading-5 text-on-surface-variant">
          Dry run: checked {value().sources} source{value().sources === 1 ? "" : "s"}; {value().writes} write{value().writes === 1 ? "" : "s"} in {value().batches} bounded batch{value().batches === 1 ? "" : "es"}. No changes were written.
        </div>
      )}</Show>
    </section>
  );
}

// @locs-version: 2.0
import { createSignal, For, Show } from "solid-js";

import { WeddingArtifactDetailPanel, weddingApprovalStateLabel } from "@/components/WeddingArtifactDetailPanel";
import { WeddingProjectionQueuePanel } from "@/components/WeddingProjectionQueuePanel";
import {
  WeddingDecisionFocusCard,
  WeddingHomeOverviewGrid,
  WeddingWorkspaceContextPanels,
} from "@/components/WeddingWorkspaceContextPanels";
import type { SendAfpMessageInput } from "@/lib/api";
import { buildWeddingArtifactExportPayload } from "@/lib/weddingArtifactExportPayloadState";
import {
  approveWeddingApprovalRequestState,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import {
  runWeddingApprovalExecution,
  type WeddingApprovalExecutionHandlers,
  type WeddingApprovalExecutionState,
} from "@/lib/weddingApprovalExecutionState";
import { weddingApprovalReceiptToAfpSendInput } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";
import type {
  WeddingResponseWorkspaceViewState,
  WeddingWorkspaceFilterChip,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import type { ViewName } from "@/lib/viewNames";

type WeddingProjectionSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;
type WeddingWorkspaceRefreshTone = "idle" | "loading" | "success" | "warning";
type WeddingBundleExportFormat = "markdown" | "html" | "word_doc";

function chipLabel(chip: WeddingWorkspaceFilterChip): string {
  return `${chip.label} (${chip.count})`;
}

function downloadText(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WeddingResponseWorkspaceView(props: {
  state: WeddingResponseWorkspaceViewState;
  query?: string | null;
  refreshState?: {
    label: string;
    detail: string;
    tone: WeddingWorkspaceRefreshTone;
    disabled?: boolean;
  } | null;
  saveProjection?: WeddingProjectionSaveFn | null;
  approvalHandlers?: WeddingApprovalExecutionHandlers | null;
  projectionStorage?: Storage | null;
  importNotice?: string | null;
  importRunning?: boolean | null;
  activeMenu?: WeddingWorkspaceMenuId;
  sharePlanOpen?: boolean;
  compact?: boolean;
  onQueryChange?: (query: string) => void;
  onRefreshWorkspace?: () => void;
  onAdminDataConsentChange?: (enabled: boolean) => void;
  onSelectArtifact?: (artifactId: string) => void;
  onFilterChip?: (chip: WeddingWorkspaceFilterChip) => void;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onProjectionDispatched?: (receipt: WeddingProjectionDispatchReceiptState) => void;
  onReviewBlockedOutputs?: () => void;
  onOpenSavedOutputs?: () => void;
  onProviderSetup?: (view: ViewName) => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
}) {
  const state = () => props.state;
  const activePreview = () => state().activePreview;
  const [exportNotice, setExportNotice] = createSignal<string | null>(null);
  const [includeSensitiveBundle, setIncludeSensitiveBundle] = createSignal(false);
  const [bundleExportFormat, setBundleExportFormat] = createSignal<WeddingBundleExportFormat>("markdown");
  const [approvedRequests, setApprovedRequests] = createSignal<Record<string, true>>({});
  const [approvalRunning, setApprovalRunning] = createSignal(false);
  const [approvalReceipt, setApprovalReceipt] = createSignal<WeddingApprovalExecutionState | null>(null);
  const [approvalReceiptSaveNotice, setApprovalReceiptSaveNotice] = createSignal<string | null>(null);
  const [showPlanningFiles, setShowPlanningFiles] = createSignal(false);
  const activeMenu = () => props.activeMenu ?? "home";
  const showTechnicalDetails = () => activeMenu() === "advanced";
  const compactMode = () => Boolean(props.compact);
  const rootClass = () => compactMode() ? "grid min-w-0 gap-3 xl:grid-cols-2" : "grid min-w-0 gap-4 xl:grid-cols-2";
  const primaryColumnClass = () => compactMode() ? "min-w-0 space-y-3" : "min-w-0 space-y-4";
  const sidebarClass = () => compactMode()
    ? "min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start"
    : "min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start";
  const cardClass = () => compactMode()
    ? "rounded-[20px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[24px]"
    : "rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4";

  function approvedApprovalRequest(request: WeddingApprovalRequestState): WeddingApprovalRequestState {
    return approvedRequests()[request.id] ? approveWeddingApprovalRequestState(request) : request;
  }

  async function copyActiveArtifact() {
    const preview = activePreview();
    if (!preview?.bodyText) return;
    try {
      await navigator.clipboard.writeText(preview.bodyText);
      setExportNotice("Copied planning text.");
    } catch {
      setExportNotice("Clipboard copy is unavailable in this browser.");
    }
  }

  function runExport(entry: WeddingExportManifestEntry) {
    const preview = activePreview();
    if (!preview) return;
    const payload = buildWeddingArtifactExportPayload({
      title: preview.title,
      bodyText: preview.bodyText,
      entry,
    });
    if (payload.disabledReason) {
      setExportNotice(payload.disabledReason);
      return;
    }
    if (payload.action === "print") {
      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) {
        setExportNotice("Could not open the browser print window.");
        return;
      }
      printWindow.document.write(payload.content);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      setExportNotice("Opened browser print dialog for PDF export.");
      return;
    }
    downloadText(payload.content, payload.mimeType, payload.filename);
    setExportNotice(`Downloaded ${payload.filename}.`);
  }

  function runBundleExport() {
    const payload = bundleExportFormat() === "html"
      ? includeSensitiveBundle() ? state().sensitiveHtmlBundleExportPayload : state().htmlBundleExportPayload
      : bundleExportFormat() === "word_doc"
        ? includeSensitiveBundle() ? state().sensitiveWordBundleExportPayload : state().wordBundleExportPayload
        : includeSensitiveBundle() ? state().sensitiveBundleExportPayload : state().bundleExportPayload;
    if (payload.disabledReason) {
      setExportNotice(payload.disabledReason);
      return;
    }
    downloadText(payload.content, payload.mimeType, payload.filename);
    const excludedLabel = payload.excludedArtifactIds.length > 0
      ? ` Excluded ${payload.excludedArtifactIds.length} sensitive file${payload.excludedArtifactIds.length === 1 ? "" : "s"}.`
      : "";
    setExportNotice(`Downloaded ${payload.filename}.${excludedLabel}`);
  }

  function handleSidebarAction(action: WeddingWorkspaceSidebarAction) {
    if (action.kind === "export_bundle") runBundleExport();
    props.onSidebarAction?.(action);
  }

  function openArtifactFromContext(artifactId: string) {
    props.onSelectArtifact?.(artifactId);
    props.onSelectMenu?.("home");
    setShowPlanningFiles(true);
  }

  function approveRequest(request: WeddingApprovalRequestState) {
    setApprovedRequests((current) => ({ ...current, [request.id]: true }));
    setApprovalReceipt(null);
    setApprovalReceiptSaveNotice(null);
  }

  async function executeRequest(request: WeddingApprovalRequestState) {
    if (approvalRunning()) return;
    setApprovalRunning(true);
    try {
      const result = await runWeddingApprovalExecution({
        request: approvedApprovalRequest(request),
        handlers: props.approvalHandlers,
      });
      setApprovalReceipt(result);
      if (!props.saveProjection) {
        setApprovalReceiptSaveNotice("Approval is saved on this device until account saving is connected.");
        return;
      }
      try {
        await props.saveProjection(weddingApprovalReceiptToAfpSendInput(result.receipt));
        setApprovalReceiptSaveNotice("Approval saved with this wedding.");
      } catch {
        setApprovalReceiptSaveNotice("Approval finished, but the save record could not be stored.");
      }
    } finally {
      setApprovalRunning(false);
    }
  }

  return (
    <section
      class={rootClass()}
      role="tabpanel"
      id="wedding-tabpanel"
      aria-labelledby={`wedding-tab-${activeMenu()}`}
    >
      <div class={primaryColumnClass()}>
        <Show when={activeMenu() === "home"}>
          <WeddingHomeOverviewGrid
            state={state()}
            onSelectMenu={props.onSelectMenu}
            onSidebarAction={handleSidebarAction}
          />
          <WeddingDecisionFocusCard state={state()} onSidebarAction={handleSidebarAction} />
        </Show>

        <div class={cardClass()} hidden={activeMenu() !== "home"}>
          <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-base font-semibold text-on-surface">Your wedding documents</p>
              <p class="mt-1 text-sm leading-6 text-on-surface-variant">
                Open the plans, lists, drafts, and checklists OmnyID made for this wedding.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPlanningFiles((current) => !current)}
              class="min-h-10 rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-950 transition hover:bg-white"
            >
              {showPlanningFiles() ? "Hide documents" : `Show documents (${state().workspace.results.length})`}
            </button>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="text-xs font-medium text-on-surface-variant">
              Search documents
              <input
                type="search"
                value={props.query ?? state().workspace.query}
                onInput={(event) => props.onQueryChange?.(event.currentTarget.value)}
                placeholder="Search vendors, dates, guests..."
                class="mt-1 w-full rounded-full border border-rose-100/80 bg-white/80 px-3 py-2 text-sm text-on-surface outline-none transition focus:border-rose-300"
              />
            </label>
            <label class="group flex items-start gap-2 rounded-2xl border border-rose-100/80 bg-rose-50/65 px-3 py-2 text-xs font-medium text-on-surface-variant">
              <input
                type="checkbox"
                checked={state().adminDataConsent.enabled}
                onChange={(event) => props.onAdminDataConsentChange?.(event.currentTarget.checked)}
                class="mt-0.5 h-4 w-4 rounded border-rose-200 text-rose-600"
              />
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-1 text-xs font-semibold text-rose-950">
                  {state().adminDataConsent.toggleLabel}
                  <span
                    aria-label={state().adminDataConsent.iconLabel}
                    title={state().adminDataConsent.hoverMessage}
                    class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rose-200 bg-white text-xs text-rose-900"
                  >
                    i
                  </span>
                </span>
                <span class="mt-1 block text-xs leading-5 text-rose-900/70">
                  {state().adminDataConsent.statusLabel}
                </span>
              </span>
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={bundleExportFormat()}
              onChange={(event) => setBundleExportFormat(event.currentTarget.value as WeddingBundleExportFormat)}
              aria-label="Download format"
              class="min-h-10 rounded-full border border-slate-200 bg-white/85 px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-sky-300"
            >
              <option value="markdown">Text file</option>
              <option value="html">Printable page</option>
              <option value="word_doc">Word document</option>
            </select>
            <button
              type="button"
              disabled={state().bundleExportPayload.disabledReason !== null}
              title={state().bundleExportPayload.disabledReason ?? undefined}
              onClick={runBundleExport}
              class="min-h-10 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Download wedding plan
            </button>
            <label class="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={includeSensitiveBundle()}
                onChange={(event) => setIncludeSensitiveBundle(event.currentTarget.checked)}
                class="h-3.5 w-3.5 rounded border-slate-300 text-slate-800"
              />
              Include private details
            </label>
          </div>
          <Show when={state().bundleExportPayload.disabledReason}>
            {(reason) => (
              <p class="mt-2 text-xs leading-5 text-slate-600">
                {reason()}
              </p>
            )}
          </Show>
          <Show when={exportNotice()}>
            {(notice) => <p class="mt-2 text-xs leading-5 text-slate-600">{notice()}</p>}
          </Show>
          <Show when={showPlanningFiles()}>
            <div class="mt-4 border-t border-slate-100 pt-4">
              <Show when={props.refreshState}>
                {(refresh) => (
                  <div class={`mb-3 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    refresh().tone === "warning"
                      ? "border-amber-100 bg-amber-50/80"
                      : refresh().tone === "success"
                        ? "border-emerald-100 bg-emerald-50/80"
                        : "border-sky-100 bg-sky-50/80"
                  }`}>
                    <div class="min-w-0">
                      <p class="break-words text-xs font-semibold text-on-surface">{refresh().label}</p>
                      <p class="mt-1 break-words text-xs leading-5 text-on-surface-variant">{refresh().detail}</p>
                    </div>
                    <button
                      type="button"
                      disabled={refresh().disabled}
                      onClick={() => props.onRefreshWorkspace?.()}
                      class="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
                    >
                      {refresh().tone === "loading" ? "Refreshing..." : "Refresh documents"}
                    </button>
                  </div>
                )}
              </Show>

              <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                <For each={state().categoryRail}>
                  {(category) => (
                    <button
                      type="button"
                      onClick={() => props.onQueryChange?.(category.label)}
                      class={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition sm:py-1.5 ${
                        category.active
                          ? "border-rose-300 bg-rose-50 text-rose-900"
                          : "border-slate-200 bg-white/70 text-slate-700 hover:border-rose-200"
                      }`}
                    >
                      {category.label} - {category.count}
                    </button>
                  )}
                </For>
              </div>
              <div class="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                <For each={state().filterChips.slice(0, 12)}>
                  {(chip) => (
                    <button
                      type="button"
                      onClick={() => props.onFilterChip?.(chip)}
                      class="shrink-0 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 sm:py-1"
                    >
                      {chipLabel(chip)}
                    </button>
                  )}
                </For>
              </div>

              <aside class="mt-3 max-h-[24rem] space-y-2 overflow-auto rounded-2xl border border-slate-100 bg-slate-50/65 p-3">
                <Show when={state().workspace.results.length > 0} fallback={
                  <div class="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4">
                    <p class="text-sm font-semibold text-on-surface">{state().workspace.emptyTitle}</p>
                    <p class="mt-1 text-xs leading-5 text-on-surface-variant">{state().workspace.emptyDetail}</p>
                  </div>
                }>
                  <For each={state().workspace.results}>
                    {(artifact) => (
                      <button
                        type="button"
                        onClick={() => props.onSelectArtifact?.(artifact.id)}
                        class={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          artifact.id === activePreview()?.artifactId
                            ? "border-rose-200 bg-rose-50/90"
                            : "border-slate-200/80 bg-white/75 hover:border-sky-200 hover:bg-sky-50/70"
                        }`}
                      >
                        <p class="break-words text-sm font-semibold text-on-surface">{artifact.title}</p>
                        <p class="mt-1 break-words text-xs text-on-surface-variant">
                          {artifact.category} - {weddingApprovalStateLabel(artifact.approvalState)}
                        </p>
                      </button>
                    )}
                  </For>
                </Show>
              </aside>

              <div class="mt-4">
                <WeddingArtifactDetailPanel
                  preview={activePreview()}
                  exportNotice={exportNotice()}
                  approvalRunning={approvalRunning()}
                  approvalReceipt={approvalReceipt()}
                  approvalReceiptSaveNotice={approvalReceiptSaveNotice()}
                  approvedRequest={approvedApprovalRequest}
                  onCopy={() => void copyActiveArtifact()}
                  onExport={runExport}
                  onApprove={approveRequest}
                  onExecute={(request) => void executeRequest(request)}
                  onProviderSetup={props.onProviderSetup}
                />
              </div>
            </div>
          </Show>
        </div>

        <Show when={showTechnicalDetails() && state().projectionQueue}>
          {(queue) => (
            <WeddingProjectionQueuePanel
              state={queue()}
              save={props.saveProjection}
              storage={props.projectionStorage}
              onDispatched={props.onProjectionDispatched}
              onReviewBlocked={props.onReviewBlockedOutputs}
              onOpenSaved={props.onOpenSavedOutputs}
            />
          )}
        </Show>

      </div>

      <aside class={sidebarClass()}>
        <WeddingWorkspaceContextPanels
          state={state()}
          showTechnicalDetails={showTechnicalDetails()}
          showHomeOverview={false}
          activeMenu={activeMenu()}
          sharePlanOpen={Boolean(props.sharePlanOpen)}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          onSelectMenu={props.onSelectMenu}
          onOpenArtifact={openArtifactFromContext}
          onOpenSavedOutputs={props.onOpenSavedOutputs}
          onSidebarAction={handleSidebarAction}
        />
      </aside>
    </section>
  );
}

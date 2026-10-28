// @locs-version: 1.0
import { createMemo, For, Show, type Setter } from "solid-js";

import {
  WeddingArtifactDetailPanel,
  weddingApprovalStateLabel,
  type WeddingVendorChoiceSelectionSaveInput,
} from "@/components/WeddingArtifactDetailPanel";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { AfpAttachment, WeddingVendor } from "@/lib/api";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import type { WeddingVendorEnquiryPermissions } from "@/lib/weddingVendorEnquiryPermissionsState";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import type { WeddingBundleExportFormat } from "@/lib/weddingBrowserExportActions";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";

type WeddingWorkspaceDocumentsPanelProps = {
  state: WeddingResponseWorkspaceViewProps["state"];
  activePreview: WeddingResponseWorkspaceViewProps["state"]["activePreview"];
  cardClass: string;
  hidden: boolean;
  query: string | null | undefined;
  importRunning: boolean | null | undefined;
  showPlanningFiles: boolean;
  exportNotice: string | null;
  bundleExportFormat: WeddingBundleExportFormat;
  includeSensitiveBundle: boolean;
  approvalRunning: boolean;
  approvalReceipt: WeddingApprovalExecutionState | null;
  approvalReceiptSaveNotice: string | null;
  refreshState: WeddingResponseWorkspaceViewProps["refreshState"];
  approvedRequest: (request: WeddingApprovalRequestState) => WeddingApprovalRequestState;
  researchAction: WeddingWorkspaceSidebarAction | null;
  researchPromptAction: WeddingWorkspaceSidebarAction;
  setShowPlanningFiles: Setter<boolean>;
  setBundleExportFormat: Setter<WeddingBundleExportFormat>;
  setIncludeSensitiveBundle: Setter<boolean>;
  onQueryChange: WeddingResponseWorkspaceViewProps["onQueryChange"];
  onAdminDataConsentChange: WeddingResponseWorkspaceViewProps["onAdminDataConsentChange"];
  onImportFiles: WeddingResponseWorkspaceViewProps["onImportFiles"];
  onRefreshWorkspace: WeddingResponseWorkspaceViewProps["onRefreshWorkspace"];
  onSelectArtifact: WeddingResponseWorkspaceViewProps["onSelectArtifact"];
  onFilterChip: WeddingResponseWorkspaceViewProps["onFilterChip"];
  onProviderSetup: WeddingResponseWorkspaceViewProps["onProviderSetup"];
  onCopy: () => void;
  onExport: (entry: WeddingExportManifestEntry) => void;
  onBundleExport: () => void;
  onApprove: (request: WeddingApprovalRequestState) => void;
  onExecute: (request: WeddingApprovalRequestState) => void;
  onResearch: (action: WeddingWorkspaceSidebarAction) => void;
  onOpenFollowUpQueue: () => void;
  onOpenVendorQuoteReplySurface: () => void;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  outreachFlows?: Record<string, WeddingVendorOutreachFlowState>;
  gmailConnected?: boolean;
  onContactVendor?: (card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onOutreachRecipientChange?: (choiceId: string, email: string) => void;
  onOutreachAttachmentsChange?: (choiceId: string, attachments: AfpAttachment[]) => void;
  onOutreachPermissionsChange?: (choiceId: string, permissions: WeddingVendorEnquiryPermissions) => void;
  onRetryOutreach?: (choiceId: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onConnectGmailForOutreach?: () => void;
  weddingVendorDirectory?: readonly WeddingVendor[];
};

export function WeddingWorkspaceDocumentsPanel(props: WeddingWorkspaceDocumentsPanelProps) {
  let documentDetail: HTMLDivElement | undefined;
  const documentTitle = (artifact: WeddingWorkspaceDocumentsPanelProps["state"]["workspace"]["results"][number]) => {
    if (artifact.kind !== "vendor_table") return artifact.title;
    const vendors = artifact.vendorLabels.map((label) => label.trim()).filter(Boolean).slice(0, 3);
    if (vendors.length > 0) {
      const prefix = /comparison/i.test(artifact.title) ? "Vendor comparison" : "Vendor search";
      return `${prefix} — ${vendors.join(", ")}${artifact.vendorLabels.length > vendors.length ? ` +${artifact.vendorLabels.length - vendors.length}` : ""}`;
    }
    const category = artifact.sourceLabels.find((label) =>
      /^(?:venue|celebrant|photograph(?:er|y)|florist|cater(?:er|ing)|music|band|dj|transport|cake|styling|stationery|wedding vendor)s?$/i.test(label.trim()),
    );
    return category ? `${artifact.title} — ${category}` : artifact.title;
  };
  const visiblePreview = createMemo(() => {
    const activePreview = props.activePreview;
    const activeIsVisible = activePreview
      ? props.state.workspace.results.some((artifact) => artifact.id === activePreview.artifactId)
      : false;
    if (activePreview && activeIsVisible) return activePreview;
    const firstVisibleArtifactId = props.state.workspace.results[0]?.id ?? null;
    return firstVisibleArtifactId
      ? props.state.artifactPreviews.find((preview) => preview.artifactId === firstVisibleArtifactId) ?? null
      : null;
  });

  return (
    <div class={props.cardClass} hidden={props.hidden}>
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="text-base font-semibold text-on-surface">Documents</p>
          <p class="mt-1 text-sm leading-6 text-on-surface-variant">
            Plans, lists, drafts, and checklists for your day.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <label class="col-span-2 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 sm:col-span-1">
            {props.importRunning ? "Uploading..." : "Upload files"}
            <input
              type="file"
              class="sr-only"
              multiple
              accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf,.doc,.docx,text/csv,text/tab-separated-values,text/plain,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={!props.onImportFiles || props.importRunning === true}
              onChange={(event) => {
                if (event.currentTarget.files) props.onImportFiles?.(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" class="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50" data-magic-action="search" data-magic-icon="search" data-magic-label="Ask for research" data-magic-id="wedding:documents:research" onClick={() => props.onResearch(props.researchPromptAction)}>
            Ask for research
          </button>
          <button type="button" data-magic-action="open" data-magic-icon="documents" data-magic-label={props.showPlanningFiles ? "Hide documents" : `Show documents (${props.state.workspace.results.length})`} data-magic-id="wedding:documents:toggle" onClick={() => props.setShowPlanningFiles((current) => !current)} class="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50">
            {props.showPlanningFiles ? "Hide documents" : `Show documents (${props.state.workspace.results.length})`}
          </button>
        </div>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-xs font-medium text-on-surface-variant">
          Search documents
          <span class="relative mt-1 block">
            <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={props.query ?? props.state.workspace.query}
              onInput={(event) => props.onQueryChange?.(event.currentTarget.value)}
              placeholder="Search vendors, dates, guests..."
              class="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm text-on-surface outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            />
          </span>
        </label>
        <label class="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-medium text-on-surface-variant shadow-sm">
          <input
            type="checkbox"
            checked={props.state.adminDataConsent.enabled}
            onChange={(event) => props.onAdminDataConsentChange?.(event.currentTarget.checked)}
            class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900"
          />
          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-900">
              {props.state.adminDataConsent.toggleLabel}
              <span
                aria-label={props.state.adminDataConsent.iconLabel}
                title={props.state.adminDataConsent.hoverMessage}
                class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-xs text-slate-600"
              >
                i
              </span>
            </span>
            <span class="mt-1 block text-xs leading-5 text-slate-600">
              {props.state.adminDataConsent.statusLabel}
            </span>
          </span>
        </label>
      </div>
      <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        <p class="text-xs font-semibold text-slate-900">Export plan</p>
        <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto] sm:items-end">
          <label class="text-xs font-medium text-slate-600">
            File format
            <select
              value={props.bundleExportFormat}
              onChange={(event) => props.setBundleExportFormat(event.currentTarget.value as WeddingBundleExportFormat)}
              aria-label="Download format"
              class="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400"
            >
              <option value="markdown">Text file</option>
              <option value="html">Printable page</option>
              <option value="word_doc">Word document</option>
            </select>
          </label>
          <button
            type="button"
            disabled={props.state.bundleExportPayload.disabledReason !== null}
            title={props.state.bundleExportPayload.disabledReason ?? undefined}
            data-magic-action="open"
            data-magic-icon="download"
            data-magic-label="Download wedding plan"
            data-magic-id="wedding:documents:download-plan"
            onClick={props.onBundleExport}
            class="min-h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            Download wedding plan
          </button>
        </div>
        <label class="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={props.includeSensitiveBundle}
            onChange={(event) => props.setIncludeSensitiveBundle(event.currentTarget.checked)}
            class="h-3.5 w-3.5 rounded border-slate-300 text-slate-800"
          />
          Include private details
        </label>
      </div>
      <Show when={props.state.bundleExportPayload.disabledReason}>
        {(reason) => (
          <p class="mt-2 text-xs leading-5 text-slate-600">
            {reason()}
          </p>
        )}
      </Show>
      <Show when={props.exportNotice}>
        {(notice) => <p class="mt-2 text-xs leading-5 text-slate-600">{notice()}</p>}
      </Show>
      <Show when={props.showPlanningFiles}>
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
                  data-magic-action="open"
                  data-magic-icon="refresh"
                  data-magic-label={refresh().tone === "loading" ? "Refreshing..." : "Refresh documents"}
                  data-magic-id="wedding:documents:refresh"
                  onClick={() => props.onRefreshWorkspace?.()}
                  class="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
                >
                  {refresh().tone === "loading" ? "Refreshing..." : "Refresh documents"}
                </button>
              </div>
            )}
          </Show>

          <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <For each={props.state.categoryRail}>
              {(category) => (
                <button
                  type="button"
                  data-magic-action="open"
                  data-magic-icon="filter"
                  data-magic-label={`${category.label} - ${category.count}`}
                  data-magic-id={`wedding:documents:category:${category.id}`}
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
            <For each={props.state.filterChips.slice(0, 12)}>
              {(chip) => (
                <button
                  type="button"
                  data-magic-action="open"
                  data-magic-icon="filter"
                  data-magic-label={`${chip.label} (${chip.count})`}
                  data-magic-id={`wedding:documents:filter:${chip.id}`}
                  onClick={() => props.onFilterChip?.(chip)}
                  class="shrink-0 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 sm:py-1"
                >
                  {`${chip.label} (${chip.count})`}
                </button>
              )}
            </For>
          </div>

          <aside class="mt-3 max-h-[24rem] space-y-2 overflow-auto rounded-2xl border border-slate-100 bg-slate-50/65 p-3">
            <Show when={props.state.workspace.results.length > 0} fallback={
              <div class="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4">
                <p class="text-sm font-semibold text-on-surface">{props.state.workspace.emptyTitle}</p>
                <p class="mt-1 text-xs leading-5 text-on-surface-variant">{props.state.workspace.emptyDetail}</p>
              </div>
            }>
              <For each={props.state.workspace.results}>
                {(artifact) => (
                  <button
                    type="button"
                    data-magic-action="open"
                    data-magic-icon="document"
                    data-magic-label={`Open ${documentTitle(artifact)}`}
                    data-magic-id={`wedding:document:${artifact.id}:open`}
                    onClick={() => {
                      props.onSelectArtifact?.(artifact.id);
                      window.setTimeout(() => {
                        documentDetail?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        documentDetail?.focus({ preventScroll: true });
                      }, 0);
                    }}
                    class={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      artifact.id === visiblePreview()?.artifactId
                        ? "border-rose-200 bg-rose-50/90"
                        : "border-slate-200/80 bg-white/75 hover:border-sky-200 hover:bg-sky-50/70"
                    }`}
                  >
                    <p class="break-words text-sm font-semibold text-on-surface">{documentTitle(artifact)}</p>
                    <p class="mt-1 break-words text-xs text-on-surface-variant">
                      {artifact.category} - {weddingApprovalStateLabel(artifact.approvalState)}
                    </p>
                  </button>
                )}
              </For>
            </Show>
          </aside>

          <div ref={(element) => { documentDetail = element; }} class="mt-4" tabIndex={-1}>
            <WeddingArtifactDetailPanel
              preview={visiblePreview()}
              vendorDirectory={props.weddingVendorDirectory}
              exportNotice={props.exportNotice}
              approvalRunning={props.approvalRunning}
              approvalReceipt={props.approvalReceipt}
              approvalReceiptSaveNotice={props.approvalReceiptSaveNotice}
              approvedRequest={props.approvedRequest}
              onCopy={props.onCopy}
              onExport={props.onExport}
              onApprove={props.onApprove}
              onExecute={props.onExecute}
              onProviderSetup={props.onProviderSetup}
              onResearch={props.onResearch}
              onOpenFollowUpQueue={props.onOpenFollowUpQueue}
              onOpenVendorQuoteReplySurface={props.onOpenVendorQuoteReplySurface}
              onVendorChoiceSelected={props.onVendorChoiceSelected}
              researchAction={props.researchAction}
              outreachFlows={props.outreachFlows}
              gmailConnected={props.gmailConnected}
              onContactVendor={props.onContactVendor}
              onOutreachBodyChange={props.onOutreachBodyChange}
              onOutreachRecipientChange={props.onOutreachRecipientChange}
              onOutreachAttachmentsChange={props.onOutreachAttachmentsChange}
              onOutreachPermissionsChange={props.onOutreachPermissionsChange}
              onRetryOutreach={props.onRetryOutreach}
              onSendOutreach={props.onSendOutreach}
              onCancelOutreach={props.onCancelOutreach}
              onConnectGmailForOutreach={props.onConnectGmailForOutreach}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

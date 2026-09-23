// @locs-version: 2.0
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { WeddingApprovalPreviewPanel } from "@/components/WeddingApprovalPreviewPanel";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingArtifactPreviewState } from "@/lib/weddingArtifactPreviewState";
import type { ViewName } from "@/lib/viewNames";
import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelection,
  toggleWeddingDecisionSelection,
} from "@/lib/weddingDecisionSelectionState";

function approvalTagClass(state: string): string {
  if (/approved|ready/i.test(state)) return "border-emerald-100 bg-emerald-50 text-emerald-900";
  if (/blocked|missing|needs/i.test(state)) return "border-amber-100 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-white/80 text-slate-700";
}

export function weddingApprovalStateLabel(state: string): string {
  if (state === "approved") return "Approved";
  if (state === "pending_user_approval") return "Needs approval";
  if (state === "rejected") return "Not approved";
  if (state === "draft") return "Draft";
  return state.replace(/_/g, " ");
}

function userFacingHighlight(line: string): { heading: string; detail: string | null } {
  const trimmed = line.trim();
  const separatorIndex = trimmed.search(/[:.]\s/);
  if (separatorIndex > 0 && separatorIndex < 72) {
    return {
      heading: trimmed.slice(0, separatorIndex + 1),
      detail: trimmed.slice(separatorIndex + 1).trim() || null,
    };
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 8) return { heading: trimmed, detail: null };
  return {
    heading: words.slice(0, 6).join(" "),
    detail: words.slice(6).join(" "),
  };
}

function ArtifactPreviewCard(props: {
  artifact: WeddingWorkspaceArtifactPreview;
  preview: WeddingArtifactPreviewState;
}) {
  const preview = props.preview;
  const [selectedOptionId, setSelectedOptionId] = createSignal<string | null>(null);

  createEffect(() => {
    setSelectedOptionId(loadWeddingDecisionSelection(props.artifact.artifactId));
  });

  const decisionState = createMemo(() => buildWeddingDecisionSelectionState({
    artifactId: props.artifact.artifactId,
    artifactKind: props.artifact.kind,
    table: preview.kind === "table" ? preview : null,
    selectedOptionId: selectedOptionId(),
    preferenceText: props.artifact.bodyText,
  }));

  function toggleOption(optionId: string): void {
    setSelectedOptionId(toggleWeddingDecisionSelection(props.artifact.artifactId, optionId));
  }

  if (preview.kind === "email") {
    return (
      <div class="min-w-0 rounded-2xl border border-amber-100 bg-amber-50/75 p-4">
        <p class="text-xs font-semibold text-amber-950">Email draft to review</p>
        <dl class="mt-2 grid gap-2 text-xs text-amber-900/80">
          <div><dt class="font-semibold">Recipient</dt><dd class="break-words">{preview.recipient}</dd></div>
          <div><dt class="font-semibold">Subject</dt><dd class="break-words">{preview.subject}</dd></div>
          <div><dt class="font-semibold">Disclosure</dt><dd class="break-words">{preview.disclosureSummary}</dd></div>
        </dl>
        <p class="mt-3 whitespace-pre-wrap break-words rounded-xl border border-amber-100 bg-white/75 p-3 text-xs leading-5 text-amber-950">
          {preview.body}
        </p>
      </div>
    );
  }

  if (preview.kind === "table") {
    return (
      <div class="min-w-0 rounded-2xl border border-teal-100 bg-teal-50/75 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-semibold text-teal-950">Comparison table</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-teal-900">
            {preview.rowCountLabel}
          </span>
        </div>
        <Show when={decisionState().eligible && decisionState().options.length > 1}>
          <div class="mt-3 rounded-xl border border-teal-100 bg-white/75 p-3">
            <p class="text-sm font-semibold text-teal-950">What needs your yes/no</p>
            <p class="mt-1 text-sm leading-6 text-teal-900/75">{decisionState().instructionLabel}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={decisionState().scopeLabels}>
                {(label) => (
                  <span class="max-w-full break-words rounded-full border border-teal-100 bg-teal-50/70 px-2 py-1 text-xs text-teal-900/80">
                    {label}
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
        <Show when={preview.budgetSummary}>
          {(summary) => (
            <div class="mt-3 rounded-xl border border-amber-100 bg-amber-50/80 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold text-amber-950">Budget check</p>
                <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-amber-900">
                  {summary().summaryLabel}
                </span>
              </div>
              <p class="mt-1 text-sm leading-6 text-amber-900/75">
                Counts come from the table only. Confirm quotes, deposits, payment status, and final totals before booking.
              </p>
              <Show when={summary().warningLabels.length > 0}>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <For each={summary().warningLabels}>
                    {(label) => (
                      <span class="max-w-full break-words rounded-full border border-amber-200 bg-white/80 px-2 py-1 text-xs text-amber-900">
                        {label}
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </Show>
        <Show when={preview.rows.length > 0}>
          <div class="mt-3 overflow-x-auto rounded-xl border border-teal-100 bg-white/75">
            <table class="min-w-[38rem] text-left text-xs sm:min-w-full">
              <thead class="bg-teal-50 text-teal-950">
                <tr>
                  <Show when={decisionState().eligible && decisionState().options.length > 1}>
                    <th class="px-3 py-2 font-semibold">Pick</th>
                  </Show>
                  <For each={preview.headers}>
                    {(header) => <th class="px-3 py-2 font-semibold">{header}</th>}
                  </For>
                  <Show when={decisionState().eligible && decisionState().options.some((option) => option.preferenceFitLabels.length + option.tradeoffLabels.length > 0)}>
                    <th class="px-3 py-2 font-semibold">Preference fit</th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={decisionState().eligible ? decisionState().visibleOptions : preview.rows.slice(0, 8).map((row, rowIndex) => ({
                  id: String(rowIndex),
                  rowIndex,
                  label: row[0] ?? `Row ${rowIndex + 1}`,
                  detail: "",
                  cells: row,
                  selected: false,
                  preferenceFitLabels: [],
                  missingPreferenceLabels: [],
                  tradeoffLabels: [],
                  preferenceSummaryLabel: "",
                }))}>
                  {(option) => (
                    <tr class={`border-t border-teal-100 ${option.selected ? "bg-teal-100/60" : ""}`}>
                      <Show when={decisionState().eligible && decisionState().options.length > 1}>
                        <td class="px-3 py-2 align-top">
                          <label class="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-950">
                            <input
                              type="checkbox"
                              checked={option.selected}
                              onChange={() => toggleOption(option.id)}
                              aria-label={`Select ${option.label} for follow-up reports`}
                              class="h-3.5 w-3.5 rounded border-teal-300 text-teal-700"
                            />
                            {option.selected ? "Selected" : "Choose"}
                          </label>
                        </td>
                      </Show>
                      <For each={option.cells}>
                        {(cell) => <td class="max-w-[12rem] break-words px-3 py-2 align-top text-teal-950/80">{cell}</td>}
                      </For>
                      <Show when={decisionState().eligible && option.preferenceFitLabels.length + option.tradeoffLabels.length > 0}>
                        <td class="max-w-[14rem] break-words px-3 py-2 align-top">
                          <p class="text-xs font-semibold text-teal-900/70">
                            {option.preferenceSummaryLabel}
                          </p>
                          <div class="mt-1 flex flex-wrap gap-1">
                            <For each={option.preferenceFitLabels}>
                              {(label) => <span class="max-w-full break-words rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">Fits {label}</span>}
                            </For>
                            <For each={option.tradeoffLabels}>
                              {(label) => <span class="max-w-full break-words rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">Check {label}</span>}
                            </For>
                          </div>
                        </td>
                      </Show>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={decisionState().collapsedOptionCount > 0}>
          <p class="mt-2 text-xs leading-5 text-teal-900/70">
            {decisionState().collapsedOptionCount} alternate option{decisionState().collapsedOptionCount === 1 ? "" : "s"} collapsed while this decision scope is active. Untick the selected row to compare them again.
          </p>
        </Show>
      </div>
    );
  }

  if (preview.kind === "guest") {
    return (
      <div class="min-w-0 rounded-2xl border border-teal-100 bg-teal-50/75 p-4">
        <p class="text-xs font-semibold text-teal-950">Guest list preview</p>
        <p class="mt-1 text-sm leading-6 text-teal-900/75">{preview.privacyLabel}</p>
        <Show when={preview.rows.length > 0}>
          <div class="mt-3 overflow-x-auto rounded-xl border border-teal-100 bg-white/80">
            <table class="min-w-[34rem] text-left text-xs sm:min-w-full">
              <thead class="bg-teal-50 text-teal-900">
                <tr>
                  <For each={preview.headers}>
                    {(header) => <th class="min-w-[7rem] px-3 py-2 font-semibold">{header}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={preview.rows}>
                  {(row) => (
                    <tr class="border-t border-teal-100">
                      <For each={row}>
                        {(cell) => <td class="max-w-[12rem] break-words px-3 py-2 align-top text-teal-950/80">{cell}</td>}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    );
  }

  if (preview.kind === "map") {
    return (
      <div class="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-semibold text-emerald-950">Map notes</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-emerald-900">
            {preview.mapReadinessLabel}
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-emerald-900/75">{preview.routeLabel}</p>
        <div class="mt-3 grid gap-2">
          <For each={preview.locations}>
            {(location) => (
              <article class="rounded-xl border border-emerald-100 bg-white/80 p-3">
                <p class="break-words text-xs font-semibold text-emerald-950">{location.label}</p>
                <p class="mt-1 text-sm leading-6 text-emerald-900/75">{location.detail}</p>
                <p class="mt-2 break-words text-xs font-medium text-emerald-800/70">
                  {location.searchQuery}
                </p>
                <a class="mt-2 inline-flex w-full justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 sm:w-auto sm:py-1" href={location.mapUrl} target="_blank" rel="noreferrer">
                  Open map search
                </a>
              </article>
            )}
          </For>
        </div>
      </div>
    );
  }

  if (preview.kind === "timeline") {
    return (
      <div class="min-w-0 rounded-2xl border border-cyan-100 bg-cyan-50/75 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-semibold text-cyan-950">Timeline preview</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-cyan-900">
            {preview.readinessLabel}
          </span>
        </div>
        <div class="mt-3 grid gap-3">
          <For each={preview.stageGroups}>
            {(group) => (
              <section class="rounded-xl border border-cyan-100 bg-white/80 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-xs font-semibold text-cyan-950">{group.label}</p>
                  <span class="max-w-full break-words rounded-full bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-900">
                    {group.timingLabel}
                  </span>
                </div>
                <ol class="mt-2 space-y-2">
                  <For each={group.items}>
                    {(item) => (
                      <li class="rounded-lg border border-cyan-100/80 bg-cyan-50/60 p-2">
                        <p class="text-sm font-semibold text-cyan-950">{item.label}</p>
                        <p class="mt-1 text-sm leading-6 text-cyan-900/75">{item.detail}</p>
                      </li>
                    )}
                  </For>
                </ol>
              </section>
            )}
          </For>
        </div>
      </div>
    );
  }

  if (preview.kind === "legal") {
    return (
      <div class="min-w-0 rounded-2xl border border-rose-100 bg-rose-50/75 p-4">
        <p class="break-words text-xs font-semibold text-rose-950">Australian legal checklist</p>
        <p class="mt-1 break-words text-sm leading-6 text-rose-900/75">{preview.caveatLabel}</p>
        <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div class="rounded-xl border border-rose-100 bg-white/80 p-3">
            <p class="break-words text-sm font-semibold text-rose-950">Status</p>
            <ul class="mt-2 space-y-1">
              <For each={preview.statusLines}>
                {(line) => <li class="break-words text-sm leading-6 text-rose-900/75">{line}</li>}
              </For>
            </ul>
          </div>
          <div class="grid gap-2">
            <For each={preview.guidanceCards}>
              {(card) => (
                <article class="rounded-xl border border-rose-100 bg-white/80 p-3">
                  <p class="break-words text-sm font-semibold text-rose-950">{card.title}</p>
                  <p class="mt-1 break-words text-sm leading-6 text-rose-900/75">{card.body}</p>
                </article>
              )}
            </For>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
      <p class="text-sm font-semibold text-on-surface">Main points</p>
      <ul class="mt-3 space-y-2">
        <For each={preview.summaryLines}>
          {(line) => {
            const highlight = userFacingHighlight(line);
            return (
              <li class="rounded-xl border border-slate-100 bg-slate-50/75 px-3 py-2">
                <h5 class="break-words text-sm font-semibold text-on-surface">{highlight.heading}</h5>
                <Show when={highlight.detail}>
                  {(detail) => <p class="mt-1 break-words text-sm leading-6 text-on-surface-variant">{detail()}</p>}
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

export function WeddingArtifactDetailPanel(props: {
  preview: WeddingWorkspaceArtifactPreview | null;
  exportNotice: string | null;
  approvalRunning: boolean;
  approvalReceipt: WeddingApprovalExecutionState | null;
  approvalReceiptSaveNotice: string | null;
  approvedRequest: (request: WeddingApprovalRequestState) => WeddingApprovalRequestState;
  onCopy: () => void;
  onExport: (entry: WeddingExportManifestEntry) => void;
  onApprove: (request: WeddingApprovalRequestState) => void;
  onExecute: (request: WeddingApprovalRequestState) => void;
  onProviderSetup?: (view: ViewName) => void;
}) {
  const [showDocumentDetails, setShowDocumentDetails] = createSignal(false);
  createEffect(() => {
    props.preview?.artifactId;
    setShowDocumentDetails(false);
  });
  return (
    <article class="min-w-0 rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-5">
      <Show when={props.preview} fallback={
        <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center">
          <p class="text-sm font-semibold text-on-surface">Choose a document</p>
          <p class="mt-1 text-sm leading-6 text-on-surface-variant">Research, tables, drafts, registry notes, and timelines appear here.</p>
        </div>
      }>
        {(preview) => (
          <div class="min-w-0">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="text-xs font-semibold text-rose-700/65">
                  {preview().category}
                </p>
                <h2 class="mt-1 break-words text-lg font-semibold text-on-surface sm:text-xl">{preview().title}</h2>
              </div>
              <div class="flex shrink-0 flex-wrap items-center gap-2">
                <span class={`inline-flex max-w-full break-words rounded-full border px-2.5 py-1 text-xs font-semibold ${approvalTagClass(preview().approvalState)}`}>
                  {weddingApprovalStateLabel(preview().approvalState)}
                </span>
                <button
                  type="button"
                  class="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setShowDocumentDetails((current) => !current)}
                  aria-expanded={showDocumentDetails()}
                >
                  {showDocumentDetails() ? "Hide details" : "Details"}
                </button>
              </div>
            </div>
            <Show when={showDocumentDetails()}>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={preview().metadataLabels}>
                  {(label) => (
                    <span class="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-700">
                      {label}
                    </span>
                  )}
                </For>
              </div>
              <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50/85 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-semibold text-slate-950">Where this came from</p>
                  <span class="rounded-full bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {preview().evidenceSummary.statusLabel}
                  </span>
                </div>
                <p class="mt-1 text-sm leading-6 text-slate-700/80">
                  {preview().evidenceSummary.sourceCountLabel}
                </p>
                <Show when={preview().evidenceSummary.warningLabel}>
                  {(warning) => (
                    <p class="mt-2 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm leading-6 text-amber-900">
                      {warning()}
                    </p>
                  )}
                </Show>
                <Show when={preview().evidenceSummary.labels.length > 0}>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={preview().evidenceSummary.labels}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-xs text-slate-700">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <Show when={preview().sourceLinks.length > 0}>
                <div class="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-3">
                  <p class="text-xs font-semibold text-emerald-950">Source links</p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <For each={preview().sourceLinks}>
                      {(source) => (
                        <a href={source.url} target="_blank" rel="noreferrer" class="rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-emerald-900 transition hover:bg-white">
                          {source.label}
                        </a>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </Show>
            <Show when={preview().bodyText} fallback={
              <p class="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-on-surface-variant">
                {preview().emptyBodyLabel}
              </p>
            }>
              {(body) => (
                <div class="mt-4 space-y-3">
                  <Show when={preview().preview}>
                    {(previewState) => <ArtifactPreviewCard artifact={preview()} preview={previewState()} />}
                  </Show>
                  <details class="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-slate-800">
                    <summary class="cursor-pointer text-sm font-semibold text-slate-950">Show full document text</summary>
                    <pre class="mt-3 max-h-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                      {body()}
                    </pre>
                  </details>
                </div>
              )}
            </Show>
            <div class="mt-4 space-y-3">
              <div class="flex flex-wrap gap-2">
                <button type="button" disabled={!preview().bodyText} onClick={props.onCopy} class="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45 sm:py-1.5">
                  Copy document text
                </button>
                <For each={preview().exportManifest.entries}>
                  {(entry) => (
                    <div class="min-w-0">
                      <button type="button" disabled={!entry.enabled || !preview().bodyText} title={entry.detail} onClick={() => props.onExport(entry)} class="w-full rounded-full border border-sky-200 bg-white/80 px-3 py-2 text-xs font-semibold text-sky-900 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5">
                        {entry.action === "print" ? `Print ${entry.label}` : `Download ${entry.label}`}
                      </button>
                      <Show when={(!entry.enabled || !preview().bodyText) && entry.detail}>
                        <p class="mt-1 max-w-xs px-2 text-xs leading-5 text-slate-600">
                          {entry.detail}
                        </p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
              <Show when={props.exportNotice}>
                {(notice) => <p class="text-xs text-sky-900/70">{notice()}</p>}
              </Show>
              <WeddingApprovalPreviewPanel
                preview={preview()}
                approvalRunning={props.approvalRunning}
                approvalReceipt={props.approvalReceipt}
                approvalReceiptSaveNotice={props.approvalReceiptSaveNotice}
                approvedRequest={props.approvedRequest}
                onApprove={props.onApprove}
                onExecute={props.onExecute}
                onProviderSetup={props.onProviderSetup}
              />
            </div>
          </div>
        )}
      </Show>
    </article>
  );
}

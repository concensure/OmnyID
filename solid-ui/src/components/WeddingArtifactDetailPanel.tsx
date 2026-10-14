// @locs-version: 2.0
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { AttachmentsRenderer } from "@/components/renderers/AttachmentsRenderer";
import { WeddingApprovalPreviewPanel } from "@/components/WeddingApprovalPreviewPanel";
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type { WeddingVendor } from "@/lib/api";
import {
  buildWeddingComparisonColumns,
  type WeddingComparisonColumnState,
} from "@/lib/weddingComparisonColumnState";
import type { WeddingExportManifestEntry } from "@/lib/weddingExportState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingArtifactPreviewState } from "@/lib/weddingArtifactPreviewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { weddingQuoteAttachmentMessageState } from "@/lib/weddingQuoteAttachmentMessageState";
import type { ViewName } from "@/lib/viewNames";
import { buildWeddingVendorComparisonUiState } from "@/lib/weddingVendorComparisonUiState";
import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelections,
  toggleWeddingDecisionSelectionValue,
} from "@/lib/weddingDecisionSelectionState";
import { WeddingVendorChoiceCard, type WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleanValue = value.trim();
    const key = cleanValue.toLowerCase();
    if (!cleanValue || seen.has(key)) continue;
    seen.add(key);
    result.push(cleanValue);
  }
  return result;
}

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

function comparisonHeaderClass(column: WeddingComparisonColumnState): string {
  if (column.tone === "money") return "px-3 py-2 font-semibold text-emerald-950";
  if (column.tone === "match") return "px-3 py-2 font-semibold text-teal-950";
  if (column.tone === "available") return "px-3 py-2 font-semibold text-sky-950";
  if (column.tone === "risk") return "px-3 py-2 font-semibold text-red-700";
  if (column.tone === "action") return "px-3 py-2 font-semibold text-indigo-950";
  return "px-3 py-2 font-semibold text-teal-950";
}

function comparisonCellClass(column: WeddingComparisonColumnState, value: string): string {
  const base = "max-w-[12rem] break-words px-3 py-2 align-top";
  if (column.tone === "money") return `${base} font-semibold text-emerald-950`;
  if (column.tone === "match") return `${base} text-teal-950`;
  if (column.tone === "available") return `${base} text-sky-950`;
  if (column.tone === "action") return `${base} font-semibold text-indigo-950`;
  if (column.tone === "risk") {
    return /\b(none|clear|low|ok|okay|no issue)\b/i.test(value)
      ? `${base} text-slate-700`
      : `${base} font-semibold text-red-700`;
  }
  return `${base} text-teal-950/80`;
}

function normalizedVendorName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function safeVendorImageUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim() ?? "";
  if (/^https:\/\/images\.unsplash\.com\//i.test(candidate)) return candidate;
  if (/^\/api\/wedding\/vendor-photos\/google\//i.test(candidate)) return candidate;
  if (/^https:\/\/omnyid\.com\/wedding\/assets\/venue-photos\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(candidate)) return candidate;
  return null;
}

export type WeddingVendorChoiceSelectionSaveInput = {
  artifact: WeddingWorkspaceArtifactPreview;
  optionId: string;
  optionLabel: string;
  contact: WeddingWorkspaceArtifactPreview["vendorComparisonCards"][number] | null;
  selected: boolean;
};

function ArtifactPreviewCard(props: {
  artifact: WeddingWorkspaceArtifactPreview;
  preview: WeddingArtifactPreviewState;
  vendorDirectory?: readonly WeddingVendor[];
  onOpenFollowUpQueue?: () => void;
  onOpenVendorQuoteReplySurface?: () => void;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  outreachFlows?: Record<string, WeddingVendorOutreachFlowState>;
  gmailConnected?: boolean;
  onContactVendor?: (card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onConnectGmailForOutreach?: () => void;
}) {
  const preview = props.preview;
  const [selectedOptionIds, setSelectedOptionIds] = createSignal<string[]>([]);
  const [comparisonExpanded, setComparisonExpanded] = createSignal(false);

  createEffect(() => {
    setSelectedOptionIds(loadWeddingDecisionSelections(props.artifact.artifactId));
    setComparisonExpanded(false);
  });

  const persistedSelectedOptionIds = createMemo(() =>
    props.artifact.persistedSelectedVendorChoices.map((choice) => choice.optionId)
  );
  const effectiveSelectedOptionIds = createMemo(() =>
    uniqueStrings([...persistedSelectedOptionIds(), ...selectedOptionIds()])
  );

  const decisionState = createMemo(() => buildWeddingDecisionSelectionState({
    artifactId: props.artifact.artifactId,
    artifactKind: props.artifact.kind,
    table: preview.kind === "table" ? preview : null,
    selectedOptionIds: effectiveSelectedOptionIds(),
    preferenceText: props.artifact.bodyText,
  }));

  function optionForId(optionId: string) {
    return decisionState().options.find((option) => option.id === optionId
      || option.alternateIds?.includes(optionId)) ?? null;
  }

  function saveVendorSelection(optionId: string, selected: boolean): void {
    const option = optionForId(optionId);
    if (!option) return;
    const optionLabel = option.label.trim().toLowerCase();
    const contact = props.artifact.vendorComparisonCards.find((card) => {
      const title = card.title.trim().toLowerCase();
      return title === optionLabel || optionLabel.includes(title) || title.includes(optionLabel);
    }) ?? null;
    props.onVendorChoiceSelected?.({
      artifact: props.artifact,
      optionId: option.id,
      optionLabel: option.label,
      contact,
      selected,
    });
  }

  function toggleOption(optionId: string): void {
    const option = optionForId(optionId);
    const wasSelected = Boolean(option?.selected);
    const next = toggleWeddingDecisionSelectionValue(props.artifact.artifactId, optionId);
    setSelectedOptionIds(next);
    saveVendorSelection(optionId, !wasSelected);
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

  if (preview.kind === "quote") {
    const attachmentMessage = createMemo(() => weddingQuoteAttachmentMessageState({
      quote: preview,
      threadId: props.artifact.artifactId,
    }));
    return (
      <div class="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold text-emerald-950">Vendor quote</p>
            <h4 class="mt-1 break-words text-lg font-semibold text-emerald-950">{preview.vendorName}</h4>
          </div>
          <span class="max-w-full break-words rounded-full bg-white/85 px-3 py-1 text-sm font-semibold text-emerald-950">
            {preview.amountLabel}
          </span>
        </div>
        <div class="mt-3 grid gap-2 text-sm text-emerald-950 sm:grid-cols-3">
          <div class="rounded-xl border border-emerald-100 bg-white/80 p-3">
            <p class="text-xs font-semibold uppercase text-emerald-800/70">Budget impact</p>
            <p class="mt-1 break-words font-semibold">{preview.budgetDeltaLabel ?? "Not measured yet"}</p>
          </div>
          <div class="rounded-xl border border-emerald-100 bg-white/80 p-3">
            <p class="text-xs font-semibold uppercase text-emerald-800/70">Valid until</p>
            <p class="mt-1 break-words font-semibold">{preview.validUntil ?? "Not stated"}</p>
          </div>
          <div class="rounded-xl border border-emerald-100 bg-white/80 p-3">
            <p class="text-xs font-semibold uppercase text-emerald-800/70">Currency</p>
            <p class="mt-1 break-words font-semibold">{preview.currency}</p>
          </div>
        </div>
        <Show when={preview.inclusions.length > 0}>
          <div class="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3">
            <p class="text-sm font-semibold text-emerald-950">Included</p>
            <ul class="mt-2 space-y-1">
              <For each={preview.inclusions}>
                {(item) => <li class="break-words text-sm leading-6 text-emerald-900/75">{item}</li>}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={attachmentMessage()}>
          {(message) => (
            <div class="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3">
              <p class="mb-2 text-sm font-semibold text-emerald-950">Original file</p>
              <AttachmentsRenderer message={message()} />
            </div>
          )}
        </Show>
        <div class="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-100 bg-white/85 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-emerald-950">Reply decision lives in one place</p>
            <p class="mt-1 text-xs leading-5 text-emerald-900/70">
              This quote is evidence. Review wording, budget impact, sending, undo, and proof from the live vendor reply card.
            </p>
          </div>
          <button
            type="button"
            onClick={() => props.onOpenVendorQuoteReplySurface?.()}
            disabled={!props.onOpenVendorQuoteReplySurface}
            class="rounded-full bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            Continue reply
          </button>
        </div>
      </div>
    );
  }

  if (preview.kind === "table") {
    const comparisonColumns = createMemo(() => preview.columns ?? buildWeddingComparisonColumns(preview.headers));
    const comparisonUi = createMemo(() => buildWeddingVendorComparisonUiState({
      decision: decisionState(),
      headers: preview.headers,
      comparisonHandoffAvailable: Boolean(props.artifact.vendorComparisonHandoff),
      expanded: comparisonExpanded(),
    }));
    const cardWithCurrentPhoto = (card: WeddingWorkspaceArtifactPreview["vendorComparisonCards"][number]) => {
      if (safeVendorImageUrl(card.imageUrl)) return card;
      const vendor = props.vendorDirectory?.find((entry) => normalizedVendorName(entry.vendorName) === normalizedVendorName(card.title));
      const photo = vendor?.photos.map((entry) => safeVendorImageUrl(entry.photoUrl)).find((entry): entry is string => Boolean(entry));
      return photo ? { ...card, imageUrl: photo, imageAlt: vendor?.photos.find((entry) => entry.photoUrl === photo)?.altText ?? `${card.title} photo` } : card;
    };
    const resolutionBanner = () => (
      <div class={`mt-3 rounded-xl border p-3 ${
        comparisonUi().resolution.resolved
          ? "border-emerald-100 bg-emerald-50/85"
          : "border-amber-100 bg-amber-50/85"
      }`}>
        <div class="flex flex-wrap items-center gap-2">
          <span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            comparisonUi().resolution.resolved
              ? "bg-emerald-100 text-emerald-950"
              : "bg-amber-100 text-amber-950"
          }`}>
            {comparisonUi().resolution.statusLabel}
          </span>
          <p class={`break-words text-xs leading-5 ${
            comparisonUi().resolution.resolved ? "text-emerald-950/80" : "text-amber-950/80"
          }`}>
            {comparisonUi().resolution.detailLabel}
          </p>
        </div>
      </div>
    );
    return (
      <div class="min-w-0 rounded-2xl border border-teal-100 bg-teal-50/75 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-semibold text-teal-950">
            {props.artifact.vendorComparisonCards.length >= 3 ? "Top three vendor choices" : "Vendor comparison"}
          </p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-teal-900">
            {preview.rowCountLabel}
          </span>
        </div>
        {resolutionBanner()}
        <Show when={props.artifact.vendorComparisonHandoff}>
          {(handoff) => (
            <div class="mt-3 rounded-xl border border-teal-100 bg-white/80 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold text-teal-950">Recommendation</p>
                <span class="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900">
                  {handoff().confidenceLabel}
                </span>
              </div>
              <p class="mt-1 break-words text-sm leading-6 text-teal-900/80">
                {handoff().recommendationLabel}
              </p>
              <div class="mt-2 rounded-lg bg-teal-50/70 p-2">
                <p class="text-xs font-semibold uppercase text-teal-800/60">Why</p>
                <ul class="mt-1 space-y-1">
                  <For each={handoff().whyLabels.slice(0, 5)}>
                    {(label) => <li class="break-words text-xs leading-5 text-teal-900/75">{label}</li>}
                  </For>
                </ul>
              </div>
              <p class="mt-2 text-xs font-semibold text-teal-950">{handoff().nextActionLabel}</p>
            </div>
          )}
        </Show>
        <Show when={props.artifact.vendorComparisonCards.length > 0}>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={comparisonUi().expansion.expanded ? props.artifact.vendorComparisonCards : props.artifact.vendorComparisonCards.slice(0, 3)}>
              {(rawCard) => {
                const card = cardWithCurrentPhoto(rawCard);
                return (
                <WeddingVendorChoiceCard
                  card={card}
                  selectedForFollowUp={Boolean(optionForId(card.choiceId)?.selected)}
                  onToggleFollowUp={() => toggleOption(card.choiceId)}
                  outreachFlow={props.outreachFlows?.[card.choiceId] ?? null}
                  gmailConnected={props.gmailConnected}
                  onContactVendor={(selectedCard, intent) => props.onContactVendor?.(selectedCard, props.artifact.artifactId, intent)}
                  onOutreachBodyChange={props.onOutreachBodyChange}
                  onSendOutreach={props.onSendOutreach}
                  onCancelOutreach={props.onCancelOutreach}
                  onConnectGmailForOutreach={props.onConnectGmailForOutreach}
                />
                );
              }}
            </For>
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
                  <For each={comparisonColumns()}>
                    {(column) => (
                      <th class={comparisonHeaderClass(column)}>
                        <span>{column.label}</span>
                        <Show when={column.label !== column.header}>
                          <span class="ml-1 font-normal text-teal-900/50">({column.header})</span>
                        </Show>
                      </th>
                    )}
                  </For>
                  <Show when={decisionState().eligible && decisionState().options.some((option) => option.preferenceFitLabels.length + option.tradeoffLabels.length > 0)}>
                    <th class="px-3 py-2 font-semibold">Preference fit</th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={decisionState().eligible ? comparisonUi().visibleOptions : preview.rows.slice(0, 8).map((row, rowIndex) => ({
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
                      <For each={option.cells}>
                        {(cell, cellIndex) => {
                          const column = () => comparisonColumns()[cellIndex()] ?? {
                            header: "",
                            kind: "text" as const,
                            label: "Detail",
                            tone: "status" as const,
                          };
                          return <td class={comparisonCellClass(column(), cell)}>{cell}</td>;
                        }}
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
        <Show when={comparisonUi().expansion.hiddenCount > 0}>
          <div class="mt-3 rounded-xl border border-teal-100 bg-white/80 p-3">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-xs leading-5 text-teal-900/75">
                {comparisonUi().expansion.summaryLabel}
              </p>
              <button
                type="button"
                class="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-950 transition hover:bg-teal-100"
                onClick={() => setComparisonExpanded(true)}
              >
                {comparisonUi().expansion.actionLabel}
              </button>
            </div>
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

function usesDedicatedVendorQuoteReplyFlow(preview: WeddingWorkspaceArtifactPreview): boolean {
  return preview.preview?.kind === "quote";
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
  onResearch?: (action: WeddingWorkspaceSidebarAction) => void;
  onOpenFollowUpQueue?: () => void;
  onOpenVendorQuoteReplySurface?: () => void;
  onVendorChoiceSelected?: (input: WeddingVendorChoiceSelectionSaveInput) => void;
  researchAction?: WeddingWorkspaceSidebarAction | null;
  outreachFlows?: Record<string, WeddingVendorOutreachFlowState>;
  gmailConnected?: boolean;
  onContactVendor?: (card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onConnectGmailForOutreach?: () => void;
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
                <Show when={props.researchAction}>
                  {(action) => (
                    <button
                      type="button"
                      disabled={!action().enabled}
                      title={action().reason ?? "Ask OmnyID to research this document further."}
                      class="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => props.onResearch?.(action())}
                    >
                      {action().label}
                    </button>
                  )}
                </Show>
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
                    {(previewState) => (
                      <ArtifactPreviewCard
                        artifact={preview()}
                        preview={previewState()}
                        onOpenFollowUpQueue={props.onOpenFollowUpQueue}
                        onOpenVendorQuoteReplySurface={props.onOpenVendorQuoteReplySurface}
                        onVendorChoiceSelected={props.onVendorChoiceSelected}
                        outreachFlows={props.outreachFlows}
                        gmailConnected={props.gmailConnected}
                        onContactVendor={props.onContactVendor}
                        onOutreachBodyChange={props.onOutreachBodyChange}
                        onSendOutreach={props.onSendOutreach}
                        onCancelOutreach={props.onCancelOutreach}
                        onConnectGmailForOutreach={props.onConnectGmailForOutreach}
                      />
                    )}
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
              <Show when={!usesDedicatedVendorQuoteReplyFlow(preview())}>
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
              </Show>
            </div>
          </div>
        )}
      </Show>
    </article>
  );
}

// @locs-version: 2.0
import { For, Show } from "solid-js";

import type {
  WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelection,
} from "@/lib/weddingDecisionSelectionState";

export type WeddingBundleExportFormat = "markdown" | "html" | "word_doc";

function actionClass(action: WeddingWorkspaceSidebarAction): string {
  return action.enabled
    ? "border-slate-200/80 bg-white/75 text-slate-800 hover:border-sky-300 hover:text-sky-900"
    : "cursor-not-allowed border-slate-200/60 bg-white/35 text-slate-400";
}

function actionWithDecisionScope(
  action: WeddingWorkspaceSidebarAction,
  state: WeddingResponseWorkspaceViewState,
): WeddingWorkspaceSidebarAction {
  const preview = state.activePreview;
  if (!preview?.preview || preview.preview.kind !== "table") return action;
  const decision = buildWeddingDecisionSelectionState({
    artifactId: preview.artifactId,
    artifactKind: preview.kind,
    table: preview.preview,
    selectedOptionId: loadWeddingDecisionSelection(preview.artifactId),
    preferenceText: preview.bodyText,
  });
  if (!decision.selectedOption) return action;
  const labels = [
    ...(action.contextLabels ?? []),
    ...decision.scopeLabels,
  ];
  return {
    ...action,
    metadata: {
      ...(action.metadata ?? {}),
      decision_scope: {
        artifact_id: preview.artifactId,
        artifact_title: preview.title,
        selected_option_id: decision.selectedOption.id,
        selected_option_label: decision.selectedOption.label,
        selected_option_detail: decision.selectedOption.detail,
      },
    },
    contextLabels: labels,
  };
}

export function WeddingWorkspaceActionsPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  bundleExportFormat: WeddingBundleExportFormat;
  includeSensitiveBundle: boolean;
  onBundleExportFormatChange: (format: WeddingBundleExportFormat) => void;
  onIncludeSensitiveBundleChange: (include: boolean) => void;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  return (
    <div class="min-w-0 rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4">
      <p class="text-sm font-semibold text-on-surface">Workspace actions</p>
      <fieldset class="mt-3 rounded-2xl border border-slate-200/80 bg-white/65 px-3 py-2">
        <legend class="px-1 text-xs font-semibold text-on-surface-variant">Download format</legend>
        <div class="mt-1 grid gap-2 sm:flex sm:flex-wrap">
          <label class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-2 text-xs font-semibold text-slate-700 sm:min-h-0 sm:py-1">
            <input
              type="radio"
              name="wedding-download-format"
              class="h-3 w-3 accent-rose-800"
              checked={props.bundleExportFormat === "markdown"}
              onChange={() => props.onBundleExportFormatChange("markdown")}
            />
            Text file
          </label>
          <label class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-2 text-xs font-semibold text-slate-700 sm:min-h-0 sm:py-1">
            <input
              type="radio"
              name="wedding-download-format"
              class="h-3 w-3 accent-rose-800"
              checked={props.bundleExportFormat === "html"}
              onChange={() => props.onBundleExportFormatChange("html")}
            />
            Printable HTML
          </label>
          <label class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-2 text-xs font-semibold text-slate-700 sm:min-h-0 sm:py-1">
            <input
              type="radio"
              name="wedding-download-format"
              class="h-3 w-3 accent-rose-800"
              checked={props.bundleExportFormat === "word_doc"}
              onChange={() => props.onBundleExportFormatChange("word_doc")}
            />
            Word document
          </label>
        </div>
        <p class="mt-2 text-xs leading-5 text-on-surface-variant">
          {props.state.packetExportCapability.readyFormats.map((format) => format.label).join(" and ")} are available now.
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={props.state.packetExportCapability.plannedConversions}>
            {(conversion) => (
              <span
                class="max-w-full break-words rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"
                title={`${conversion.filename} - ${conversion.blockedReason}`}
              >
                {conversion.label} coming soon
              </span>
            )}
          </For>
        </div>
        <p class="mt-2 text-xs leading-5 text-on-surface-variant">
          {props.state.packetExportCapability.summaryLabel}
        </p>
      </fieldset>
      <Show when={props.state.bundleExportPayload.excludedArtifactIds.length > 0}>
        <label class="mt-3 flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50/75 px-3 py-2 text-xs leading-5 text-rose-950">
          <input
            type="checkbox"
            class="mt-1 h-3.5 w-3.5 rounded border-rose-200 accent-rose-800"
            checked={props.includeSensitiveBundle}
            onChange={(event) => props.onIncludeSensitiveBundleChange(event.currentTarget.checked)}
          />
          <span>
            Include private files in the download.
            <span class="block text-rose-900/70">
              Default excludes {props.state.bundleExportPayload.excludedArtifactIds.length} sensitive file{props.state.bundleExportPayload.excludedArtifactIds.length === 1 ? "" : "s"}; opt in only after reviewing privacy and approval risk.
            </span>
          </span>
        </label>
      </Show>
      <div class="mt-3 grid gap-2">
        <For each={props.state.sidebarActions}>
          {(action) => (
            <div class="min-w-0">
              <button
                type="button"
                disabled={!action.enabled}
                title={action.reason ?? undefined}
                onClick={() => props.onSidebarAction(actionWithDecisionScope(action, props.state))}
                class={`w-full rounded-2xl border px-3 py-2.5 text-left text-xs font-semibold transition disabled:opacity-50 sm:rounded-full sm:py-2 ${actionClass(action)}`}
              >
                {action.label}
              </button>
              <Show when={!action.enabled && action.reason}>
                {(reason) => (
                  <p class="mt-1 px-2 text-xs leading-5 text-slate-600">
                    {reason()}
                  </p>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

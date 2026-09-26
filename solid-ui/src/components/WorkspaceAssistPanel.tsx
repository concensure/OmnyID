// @locs-version: 1.0
import { For, Show } from "solid-js";
import {
  workspaceAssistRefreshOriginLabel,
  type WorkspaceAssistRefreshOrigin,
  type WorkspaceAssistSuggestion,
} from "afp-ts/workspace-assistance";

function statusLabel(status: WorkspaceAssistSuggestion["status"]): string {
  if (status === "context_ready") return "Context ready";
  if (status === "draft_ready") return "Draft ready";
  return "Brief ready";
}

function statusTone(status: WorkspaceAssistSuggestion["status"]): string {
  if (status === "draft_ready") {
    return "border-emerald-200/70 bg-emerald-50/80 text-emerald-800";
  }
  if (status === "brief_ready") {
    return "border-amber-200/70 bg-amber-50/80 text-amber-800";
  }
  return "border-sky-200/70 bg-sky-50/80 text-sky-800";
}

export function WorkspaceAssistPanel(props: {
  suggestion: WorkspaceAssistSuggestion | null;
  refreshOrigin?: WorkspaceAssistRefreshOrigin | null;
  onOpen?: () => void;
}) {
  return (
    <Show when={props.suggestion}>
      {(suggestion) => (
        <div class="mt-5 rounded-[22px] border border-sky-100/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.92),rgba(255,255,255,0.94))] p-4 shadow-[0_16px_40px_-28px_rgba(14,116,144,0.28)]">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${statusTone(suggestion().status)}`}>
                  {statusLabel(suggestion().status)}
                </span>
                <span class="text-[10px] uppercase tracking-[0.16em] text-sky-800/60">
                  Topic: {suggestion().topic_label}
                </span>
              </div>
              <h4 class="mt-2 text-sm font-semibold text-on-surface">{suggestion().title}</h4>
              <p class="mt-2 text-sm text-on-surface-variant">{suggestion().summary}</p>
            </div>
            <Show when={props.onOpen}>
              <button
                type="button"
                class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-white"
                onClick={() => props.onOpen?.()}
              >
                {suggestion().destination_view === "search" ? "Research" : "Open"}
              </button>
            </Show>
          </div>
          <Show when={suggestion().detail_lines.length > 0}>
            <div class="mt-3 space-y-1.5">
              <For each={suggestion().detail_lines.slice(0, 2)}>
                {(line) => (
                  <p class="text-xs leading-6 text-on-surface-variant/75">{line}</p>
                )}
              </For>
            </div>
          </Show>
          <Show when={suggestion().topic_evidence.length > 0}>
            <p class="mt-3 text-[11px] leading-5 text-on-surface-variant/65">
              {suggestion().topic_evidence.slice(0, 2).join(" Â· ")}
            </p>
          </Show>
          <Show when={props.refreshOrigin}>
            <p class="mt-2 text-[10px] uppercase tracking-[0.14em] text-sky-900/45">
              {workspaceAssistRefreshOriginLabel(
                props.refreshOrigin ?? "cached",
                suggestion().artifact_kind ?? null,
              )}
            </p>
          </Show>
        </div>
      )}
    </Show>
  );
}

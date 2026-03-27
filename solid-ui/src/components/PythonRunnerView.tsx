import { For, Show } from "solid-js";
import { AlternateViewsInspector } from "./AlternateViewsInspector";
import { ViewDispatcher } from "./ViewDispatcher";
import type { AfpMessage, AfpView } from "@/lib/api";
import type { RuntimeWorkspaceFileEntry, RuntimeWorkspaceFileResponse, UiCommandResponse } from "@/lib/api";
import { CodeEditor } from "./CodeEditor";

export function PythonRunnerView(props: {
  files: RuntimeWorkspaceFileEntry[];
  activeFile: RuntimeWorkspaceFileResponse | null;
  editorValue: string;
  logs: string[];
  logSource: string;
  feedback: string;
  runtimeStatus: string;
  runtimeFramework: string | null;
  advanced?: boolean;
  runtimeStatusPanel?: Record<string, unknown> | null;
  runtimeStatusViews?: AfpView[] | null;
  runtimeUpdatesPanel?: Record<string, unknown> | null;
  runtimeBusy: boolean;
  hasRuntime: boolean;
  commandDraft: UiCommandResponse | null;
  signedIn: boolean;
  onSelectFile: (fileId: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onApplyDraft: () => void;
  onDeploy: () => void;
  onRefreshLogs: () => void;
  onRuntimeAction: (action: "start" | "stop" | "restart") => void;
}) {
  const runtimeViews = (): AfpView[] => {
    if (props.runtimeStatusViews?.length) return props.runtimeStatusViews;
    if (props.runtimeStatusPanel) {
      return [{ format: "a2ui.v1", priority: 100, content: props.runtimeStatusPanel }];
    }
    return [];
  };

  const runtimePanelMessage: AfpMessage = {
    id: "runtime-status-panel",
    thread_id: "runtime-status-panel",
    from: "omnyid://workspace/runtime",
    to: ["omnyid://workspace/user"],
    timestamp: new Date().toISOString(),
    type: "agent_ui",
    content: (props.runtimeStatusPanel ?? {}) as Record<string, unknown>,
    views: runtimeViews(),
    attachments: [],
    references: [],
    encryption: null,
  };
  const runtimeUpdatesMessage: AfpMessage = {
    id: "runtime-updates-panel",
    thread_id: "runtime-updates-panel",
    from: "omnyid://workspace/runtime-updates",
    to: ["omnyid://workspace/user"],
    timestamp: new Date().toISOString(),
    type: "agent_ui",
    content: (props.runtimeUpdatesPanel ?? {}) as Record<string, unknown>,
    views: props.runtimeUpdatesPanel
      ? [{ format: "a2ui.v1", priority: 100, content: props.runtimeUpdatesPanel }]
      : [],
    attachments: [],
    references: [],
    encryption: null,
  };

  return (
    <div class="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Runner files</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Editable workspace</h3>
        <div class="mt-4 space-y-2">
          <For each={props.files}>
            {(file) => (
              <button
                type="button"
                class={`w-full rounded-2xl px-4 py-3 text-left text-sm ${
                  props.activeFile?.file_id === file.file_id
                    ? "bg-primary text-white"
                    : "bg-white/55 text-on-surface hover:bg-white/75"
                }`}
                onClick={() => props.onSelectFile(file.file_id)}
              >
                <div class="font-medium">{file.label}</div>
                <div class={`mt-1 font-mono text-[11px] ${props.activeFile?.file_id === file.file_id ? "text-white/80" : "text-on-surface-variant"}`}>
                  {file.relative_path}
                </div>
              </button>
            )}
          </For>
          <Show when={!props.files.length}>
            <div class="rounded-2xl bg-white/55 px-4 py-4 text-sm text-on-surface-variant">
              Sign in and deploy a Python runner to edit files here.
            </div>
          </Show>
        </div>
      </aside>

      <section class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Python runner editor</p>
            <h3 class="mt-2 text-lg font-semibold text-on-surface">
              {props.activeFile?.label ?? "No file selected"}
            </h3>
            <p class="mt-2 text-sm text-on-surface-variant">
              {props.activeFile?.relative_path ??
                "The unified search bar can route code-intent queries here and prepare reviewable drafts before you save."}
            </p>
            <p class="mt-3 text-xs uppercase tracking-[0.18em] text-on-surface-variant">
              Runtime: {props.runtimeFramework ?? "not deployed"} · Status: {props.runtimeStatus}
            </p>
          </div>
          <div class="flex gap-3">
            <Show
              when={props.hasRuntime}
              fallback={
                <button
                  type="button"
                  disabled={!props.signedIn || props.runtimeBusy}
                  class="glass-button rounded-full bg-secondary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={props.onDeploy}
                >
                  {props.runtimeBusy ? "Deploying..." : "Deploy runner"}
                </button>
              }
            >
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={props.runtimeBusy}
                  class="glass-button rounded-full border border-white/40 bg-white/60 px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50"
                  onClick={() => props.onRuntimeAction("start")}
                >
                  Start
                </button>
                <button
                  type="button"
                  disabled={props.runtimeBusy}
                  class="glass-button rounded-full border border-white/40 bg-white/60 px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50"
                  onClick={() => props.onRuntimeAction("stop")}
                >
                  Stop
                </button>
                <button
                  type="button"
                  disabled={props.runtimeBusy}
                  class="glass-button rounded-full border border-white/40 bg-white/60 px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50"
                  onClick={() => props.onRuntimeAction("restart")}
                >
                  Restart
                </button>
                <button
                  type="button"
                  disabled={props.runtimeBusy}
                  class="glass-button rounded-full border border-white/40 bg-white/60 px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50"
                  onClick={props.onRefreshLogs}
                >
                  Refresh
                </button>
              </div>
            </Show>
            <button
              type="button"
              disabled={!props.commandDraft?.runner_draft}
              class="glass-button rounded-full border border-white/40 bg-white/60 px-4 py-3 text-sm font-semibold text-on-surface disabled:opacity-50"
              onClick={props.onApplyDraft}
            >
              Apply command draft
            </button>
            <button
              type="button"
              disabled={!props.signedIn || !props.activeFile}
              class="glass-button rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              onClick={props.onSave}
            >
              Save file
            </button>
          </div>
        </div>
        <p class="mt-4 text-sm text-on-surface-variant">{props.feedback}</p>
        <Show when={runtimePanelMessage.views.length > 0}>
          <div class="mt-5 space-y-3 rounded-[22px] border border-white/25 bg-white/25 p-4">
            <ViewDispatcher message={runtimePanelMessage} compact />
            <Show when={props.advanced}>
              <AlternateViewsInspector message={runtimePanelMessage} compact />
            </Show>
          </div>
        </Show>
        <div class="mt-5">
          <CodeEditor
            value={props.editorValue}
            language={props.activeFile?.language ?? "python"}
            onChange={props.onEditorChange}
          />
        </div>
      </section>

      <aside class="space-y-6">
        <div class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Command draft</p>
          <Show
            when={props.commandDraft?.runner_draft}
            fallback={<p class="mt-3 text-sm leading-7 text-on-surface-variant">Send a runner-edit request through the search bar and the app will prepare a reviewable draft here.</p>}
          >
            {(draft) => (
              <>
                <h4 class="mt-2 text-sm font-semibold text-on-surface">{draft().title}</h4>
                <p class="mt-3 text-sm text-on-surface-variant">
                  Target file: <span class="font-mono text-xs">{draft().target_file_id}</span>
                </p>
                <pre class="mt-4 overflow-auto rounded-2xl bg-white/60 p-4 font-mono text-xs leading-6 text-on-surface-variant">
                  {draft().content}
                </pre>
              </>
            )}
          </Show>
        </div>
        <div class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Runtime logs</p>
          <p class="mt-2 text-xs text-on-surface-variant">Source: {props.logSource || "bootstrap"}</p>
          <pre class="mt-4 max-h-[360px] overflow-auto rounded-2xl bg-white/60 p-4 font-mono text-xs leading-6 text-on-surface-variant">
            {(props.logs.length ? props.logs : ["No runtime logs loaded yet."]).join("\n")}
          </pre>
        </div>
        <Show when={runtimeUpdatesMessage.views.length > 0}>
          <div class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel space-y-3">
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Runtime updates</p>
            <ViewDispatcher message={runtimeUpdatesMessage} compact />
          </div>
        </Show>
      </aside>
    </div>
  );
}

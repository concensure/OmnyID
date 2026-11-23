// @locs-version: 1.0
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createAgentTrigger, deleteAgentTrigger, fetchAgentTriggers, updateAgentTrigger } from "@/lib/api";
import {
  type AgentTriggerRecord as Trigger,
} from "@/lib/agentTriggerResponseState";
import type { AgentTriggersFailureReceipt } from "@/lib/agentTriggersFailureState";
import { formatAgentTriggerUtc } from "@/lib/agentTriggerTime";
import {
  agentTriggerRunSparklineColor,
  agentTriggerRunSparklineWindow,
} from "@/lib/agentTriggerRunPresentation";
import {
  AGENT_TRIGGER_KINDS,
  agentTriggerKindIcon,
  agentTriggerKindLabel,
} from "@/lib/agentTriggerKindPresentation";
import { nextCronFireTimes } from "@/lib/agentTriggerSchedulePresentation";
import {
  AGENT_TRIGGER_STARTER_TEMPLATES,
  type AgentTriggerStarterTemplate,
} from "@/lib/agentTriggerTemplates";
import { EmptyState } from "@/components/EmptyState";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { groupAgentTriggersByKind } from "@/lib/agentTriggerGrouping";
import { agentTriggerCardState } from "@/lib/agentTriggerCardState";
import {
  agentTriggerDraftFromTemplate,
  agentTriggerDraftWithObjectiveSuggestion,
  agentTriggerCreateValidationError,
  cloneAgentTriggerDraft,
  createAgentTriggerViewState,
  DEFAULT_AGENT_TRIGGER_DRAFT,
  deleteAgentTriggerAndReload,
  loadAgentTriggersViewState,
  toggleExpandedAgentTriggerIds,
  toggleAgentTriggerAndReload,
} from "@/lib/agentTriggersViewState";

function RunSparkline(props: { runs: Array<{ status: string }> }) {
  const runs = () => agentTriggerRunSparklineWindow(props.runs, 14);
  return (
    <svg width="56" height="12" viewBox="0 0 56 12" style="display:inline-block;vertical-align:middle" aria-label="Last 14 runs">
      <title>Last 14 runs</title>
      {runs().map((run, index) => {
        const color = agentTriggerRunSparklineColor(run);
        return <rect x={index * 4} y="0" width="4" height="12" fill={run ? color : "transparent"} />;
      })}
    </svg>
  );
}

export function AgentTriggersView(props?: { onToggleTrigger?: (id: string, enabled: boolean) => void }) {
  const [triggers, setTriggers] = createSignal<Trigger[]>([]);
  const [disableConfirm, setDisableConfirm] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [showForm, setShowForm] = createSignal(false);
  const [deleting, setDeleting] = createSignal<string | null>(null);
  const [toggling, setToggling] = createSignal<string | null>(null);
  const [loadError, setLoadError] = createSignal<AgentTriggersFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<AgentTriggersFailureReceipt | null>(null);
  const [formError, setFormError] = createSignal("");
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);
  const [expandedIds, setExpandedIds] = createSignal(new Set<string>());
  const [tick, setTick] = createSignal(0);
  const [draft, setDraft] = createSignal(cloneAgentTriggerDraft(DEFAULT_AGENT_TRIGGER_DRAFT));

  onMount(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60000);
    onCleanup(() => clearInterval(t));
  });

  const [creating, setCreating] = createSignal(false);

  const cronPreview = () => nextCronFireTimes(draft().cron).map(formatAgentTriggerUtc);

  const triggersGrouped = createMemo(() => groupAgentTriggersByKind(triggers()));

  async function load() {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    const result = await loadAgentTriggersViewState(fetchAgentTriggers);
    setTriggers(result.triggers);
    setLoadError(result.error);
    setLoading(false);
  }

  onMount(load);

  async function createTrigger() {
    const validationError = agentTriggerCreateValidationError(draft().objective);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setCreating(true);
    setFormError("");
    setActionError(null);
    const result = await createAgentTriggerViewState(draft(), {
      createTrigger: createAgentTrigger,
      loadTriggers: fetchAgentTriggers,
    });
    setDraft(result.nextDraft);
    if (result.error) {
      setActionError(result.error);
    } else {
      setTriggers(result.triggers);
      setShowForm(!result.shouldCloseForm);
    }
    if (result.formError) setFormError(result.formError);
    setCreating(false);
  }

  async function deleteTrigger(id: string) {
    setDeleting(id);
    setConfirmDelete(null);
    setActionError(null);
    const result = await deleteAgentTriggerAndReload(id, {
      deleteTrigger: deleteAgentTrigger,
      loadTriggers: fetchAgentTriggers,
    });
    if (result.error) setActionError(result.error);
    else setTriggers(result.triggers);
    setDeleting(null);
  }

  async function toggleEnabled(trigger: Trigger) {
    setToggling(trigger.id);
    setActionError(null);
    const result = await toggleAgentTriggerAndReload(trigger, {
      updateTrigger: updateAgentTrigger,
      loadTriggers: fetchAgentTriggers,
    });
    if (result.error) setActionError(result.error);
    else setTriggers(result.triggers);
    setToggling(null);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => toggleExpandedAgentTriggerIds(prev, id));
  }

  function applyTemplate(template: AgentTriggerStarterTemplate) {
    setDraft((current) => agentTriggerDraftFromTemplate(template, current));
    setFormError("");
    setShowForm(true);
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-on-surface">Agent Triggers</h2>
          <p class="mt-0.5 text-xs text-on-surface-variant">
            Automate your master agent with scheduled, interval, webhook, or message-based triggers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError("");
            if (!showForm()) setDraft((current) => cloneAgentTriggerDraft(current));
          }}
          class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
        >
          {showForm() ? "Cancel" : "+ New Trigger"}
        </button>
      </div>

      <Show when={showForm()}>
        <div class="space-y-4 rounded-xl border border-white/20 bg-white/8 p-4">
          <p class="text-xs font-semibold text-on-surface">New Trigger</p>

          <div>
            <label class="mb-1 block text-[10px] font-mono uppercase tracking-[0.15em] text-on-surface-variant/70">Type</label>
            <div class="flex flex-wrap gap-1.5">
              <For each={AGENT_TRIGGER_KINDS}>
                {(kind) => (
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, kind }))}
                    class={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      draft().kind === kind
                        ? "border-primary bg-primary/15 text-on-surface"
                        : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                    }`}
                  >
                    <span>{agentTriggerKindIcon(kind)}</span>
                    {agentTriggerKindLabel(kind)}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-[10px] font-mono uppercase tracking-[0.15em] text-on-surface-variant/70">Objective</label>
            <TiptapEditor
              mode="compact"
              initialContent={draft().objective}
              disabled={creating()}
              placeholder="What should your agent do when this trigger fires?"
              submitLabel={creating() ? "Creating..." : "Create trigger"}
              clearOnSend={false}
              onChange={(_text, markdown) => {
                setDraft((current) => agentTriggerDraftWithObjectiveSuggestion(current, markdown));
              }}
              onSend={async (payload) => {
                const nextValue = payload.markdown || payload.text;
                setDraft((current) => agentTriggerDraftWithObjectiveSuggestion(current, nextValue));
                await createTrigger();
              }}
            />
          </div>

          <Show when={draft().kind === "scheduled"}>
            <div>
              <label class="mb-1 block text-[10px] font-mono uppercase tracking-[0.15em] text-on-surface-variant/70">Cron expression (UTC)</label>
              <input
                type="text"
                value={draft().cron}
                onInput={(e) => setDraft((current) => ({ ...current, cron: e.currentTarget.value }))}
                placeholder="0 8 * * 1-5"
                class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
              />
              <Show when={cronPreview().length > 0}>
                <div class="mt-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p class="mb-1 text-[10px] font-mono text-on-surface-variant/60">Next fires:</p>
                  <For each={cronPreview()}>{(time) => <p class="font-mono text-[11px] text-on-surface-variant">{time}</p>}</For>
                </div>
              </Show>
              <Show when={cronPreview().length === 0 && draft().cron.trim().length > 0}>
                <p class="mt-0.5 text-[10px] text-red-400">Invalid cron expression</p>
              </Show>
            </div>
          </Show>

          <Show when={draft().kind === "interval"}>
            <div>
              <label class="mb-1 block text-[10px] font-mono uppercase tracking-[0.15em] text-on-surface-variant/70">Every N minutes</label>
              <input
                type="number"
                min={5}
                value={draft().intervalMinutes}
                onInput={(e) => setDraft((current) => ({ ...current, intervalMinutes: e.currentTarget.value }))}
                class="w-40 rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary"
              />
              <p class="mt-0.5 text-[10px] text-on-surface-variant/60">
                Minimum 5 minutes | shorter intervals may impact performance and cost.
              </p>
            </div>
          </Show>

          <Show when={draft().kind === "webhook"}>
            <div>
              <label class="mb-1 block text-[10px] font-mono uppercase tracking-[0.15em] text-on-surface-variant/70">Webhook path</label>
              <input
                type="text"
                value={draft().webhookPath}
                onInput={(e) => setDraft((current) => ({ ...current, webhookPath: e.currentTarget.value }))}
                placeholder="/hook/my-trigger"
                class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
              />
              <p class="mt-0.5 text-[10px] text-on-surface-variant">POST to this path on your homeserver to fire the trigger.</p>
              <Show when={draft().webhookPath}>
                <p class="mt-1 rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-on-surface-variant">
                  Full URL: {window.location.origin}
                  {draft().webhookPath}
                </p>
              </Show>
            </div>
          </Show>

          <Show when={formError()}>
            <p class="text-xs text-red-400">{formError()}</p>
          </Show>

        </div>
      </Show>

      <Show when={loading()}>
        <div class="skeleton-crossfade space-y-2">
          <For each={[1, 2, 3]}>{() => <div class="h-[68px] w-full animate-pulse rounded-xl bg-white/15" />}</For>
        </div>
      </Show>

      <Show when={!loading()}>
        <div class="content-crossfade">
          <Show
            when={loadError()}
            fallback={
              <>
                <Show when={actionError()}>
                  <div
                    classList={{
                      "mb-3 rounded-xl border px-3 py-2 text-xs": true,
                      "border-red-400/20 bg-red-500/10 text-red-300": actionError()?.tone === "danger",
                      "border-amber-400/20 bg-amber-500/10 text-amber-200": actionError()?.tone !== "danger",
                    }}
                  >
                    <p class="font-semibold">{actionError()?.title}</p>
                    <p class="mt-1">{actionError()?.summary}</p>
                    <p class="mt-1 opacity-80">{actionError()?.nextStep}</p>
                  </div>
                </Show>

                <Show when={triggers().length === 0}>
                  <div class="rounded-xl border border-dashed border-white/15 p-6 text-center">
                    <p class="text-sm text-on-surface-variant">No triggers yet.</p>
                    <p class="mt-1 text-xs text-on-surface-variant/60">
                      Create a trigger to automate your agent on a schedule, webhook, or message event.
                    </p>
                    <div class="mt-4 flex flex-col items-center gap-2">
                      <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-on-surface-variant/50">Start with a template</p>
                    <For each={AGENT_TRIGGER_STARTER_TEMPLATES}>
                        {(template) => (
                          <button
                            type="button"
                            onClick={() => applyTemplate(template)}
                            class="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs text-on-surface-variant transition hover:bg-white/10 hover:text-on-surface"
                          >
                            {template.label}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <div class="space-y-5">
                  <For each={triggersGrouped()}>
                    {({ kind, items }) => (
                      <div>
                        <div class="mb-2 flex items-center gap-2">
                          <span class="text-base leading-none">{agentTriggerKindIcon(kind)}</span>
                          <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant/70">
                            {agentTriggerKindLabel(kind)}
                          </span>
                          <div class="h-px flex-1 bg-white/10" />
                          <span class="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-on-surface-variant/60">{items.length}</span>
                        </div>
                        <div class="space-y-2">
                          <For each={items}>
                            {(trigger) => {
                              const isExpanded = () => expandedIds().has(trigger.id);
                              const isConfirmingDelete = () => confirmDelete() === trigger.id;
                              const card = createMemo(() =>
                                agentTriggerCardState(trigger, {
                                  expanded: isExpanded(),
                                  nowMs: (tick(), Date.now()),
                                })
                              );

                              return (
                                <div
                                  class={`flex items-start gap-3 rounded-xl border px-4 py-3 transition ${
                                    card().isEnabled ? "border-white/15 bg-white/5" : "border-white/8 bg-white/3 opacity-60"
                                  }`}
                                >
                                  <span class="mt-0.5 flex-shrink-0 text-lg leading-none">{agentTriggerKindIcon(trigger.trigger_type)}</span>
                                  <div class="min-w-0 flex-1">
                                    <div class="flex flex-wrap items-center gap-2">
                                      <span class="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant">
                                        {agentTriggerKindLabel(trigger.trigger_type)}
                                      </span>
                                      <span
                                        class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${card().runCountClass}`}
                                      >
                                        {card().runCountLabel}
                                      </span>
                                      <Show when={!card().isEnabled}>
                                        <span class="text-[10px] text-on-surface-variant/60">disabled</span>
                                      </Show>
                                    </div>
                                    <p class="mt-1 text-xs text-on-surface">{card().displaySummary}</p>
                                    <Show when={card().cronSummary}>
                                      <p class="text-[11px] italic text-on-surface-variant/70">{card().cronSummary}</p>
                                    </Show>
                                    <Show when={card().expandable}>
                                      <button
                                        type="button"
                                        onClick={() => toggleExpand(trigger.id)}
                                        class="mt-0.5 text-[10px] text-primary/70 transition hover:text-primary"
                                      >
                                        {isExpanded() ? "Show less" : "Show more"}
                                      </button>
                                    </Show>
                                    <Show when={card().createdAt}>
                                      <p class="mt-0.5 text-[10px] text-on-surface-variant/50" title={card().createdAt ?? ""}>
                                        Created {card().createdRelativeLabel}
                                      </p>
                                    </Show>
                                    <Show when={card().lastRunAt || card().nextRunAt}>
                                      <div class="mt-0.5 flex flex-wrap gap-2 text-[10px] text-on-surface-variant/60">
                                        <Show when={card().lastRunAt}>
                                          <span>
                                            Last run:{" "}
                                            <span class="text-on-surface-variant" title={card().lastRunAt ?? ""}>
                                              {card().lastRunRelativeLabel}
                                            </span>
                                          </span>
                                        </Show>
                                        <Show when={card().nextRunAt}>
                                          <span>
                                            Next run:{" "}
                                            <span class="text-on-surface-variant" title={card().nextRunAt ?? ""}>
                                              {card().nextRunRelativeLabel}
                                            </span>
                                          </span>
                                        </Show>
                                      </div>
                                    </Show>
                                    <Show when={card().hasRecentRuns}>
                                      <div class="mt-1.5 flex items-center gap-2">
                                        <RunSparkline runs={card().recentRuns} />
                                        <span class="text-[10px] text-on-surface-variant/50">{card().recentRunsLabel}</span>
                                      </div>
                                    </Show>
                                    <Show when={card().nextRunCountdownLabel}>
                                      <p class="mt-0.5 text-[10px] text-on-surface-variant/60">{card().nextRunCountdownLabel}</p>
                                    </Show>
                                    <Show when={card().lastSuccessLabel}>
                                      <p class="text-[11px] text-on-surface-variant/60">Last success: {card().lastSuccessLabel}</p>
                                    </Show>
                                    <Show when={!card().isEnabled}>
                                      <span class="rounded-full border border-amber-200/60 bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">Paused</span>
                                    </Show>
                                  </div>
                                  <div class="flex flex-shrink-0 items-center gap-2">
                                    <Show
                                      when={disableConfirm() === trigger.id}
                                      fallback={
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={card().isEnabled}
                                          title={card().isEnabled ? "Pause this trigger" : "Enable this trigger"}
                                          onClick={() => {
                                            if (card().isEnabled) {
                                              setDisableConfirm(trigger.id);
                                            } else {
                                              void toggleEnabled(trigger);
                                              props?.onToggleTrigger?.(trigger.id, true);
                                            }
                                          }}
                                          disabled={toggling() === trigger.id}
                                          class={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors disabled:opacity-40 ${
                                            card().isEnabled ? "bg-primary" : "bg-white/20"
                                          }`}
                                        >
                                          <span
                                            class={`m-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                              card().isEnabled ? "translate-x-4" : "translate-x-0"
                                            }`}
                                          />
                                        </button>
                                      }
                                    >
                                      <div class="flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50/80 px-2 py-0.5">
                                        <span class="text-[10px] text-amber-900">Pause?</span>
                                        <button
                                          type="button"
                                          class="text-[10px] font-semibold text-amber-700 hover:underline"
                                          onClick={() => {
                                            void toggleEnabled(trigger);
                                            props?.onToggleTrigger?.(trigger.id, false);
                                            setDisableConfirm(null);
                                          }}
                                        >
                                          Yes
                                        </button>
                                        <button type="button" class="text-[10px] text-amber-600" onClick={() => setDisableConfirm(null)}>
                                          No
                                        </button>
                                      </div>
                                    </Show>
                                    <Show
                                      when={isConfirmingDelete()}
                                      fallback={
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDelete(trigger.id)}
                                          disabled={deleting() === trigger.id}
                                          class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
                                        >
                                          {deleting() === trigger.id ? "..." : "Delete"}
                                        </button>
                                      }
                                    >
                                      <div class="flex items-center gap-1">
                                        <span class="text-[10px] text-on-surface-variant">Sure?</span>
                                        <button
                                          type="button"
                                          onClick={() => void deleteTrigger(trigger.id)}
                                          class="rounded-md bg-red-500 px-2 py-1 text-[10px] text-white hover:bg-red-600"
                                        >
                                          Yes
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDelete(null)}
                                          class="rounded-md border border-white/15 px-2 py-1 text-[10px] text-on-surface-variant hover:bg-white/10"
                                        >
                                          No
                                        </button>
                                      </div>
                                    </Show>
                                  </div>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </>
            }
          >
            <EmptyState
              icon="TR"
              title="Could not load triggers"
              body={
                `${loadError()?.summary ?? "Trigger loading is unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()
              }
              action={
                <button
                  type="button"
                  onClick={() => void load()}
                  class="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80"
                >
                  Retry triggers
                </button>
              }
            />
          </Show>
        </div>
      </Show>
    </div>
  );
}

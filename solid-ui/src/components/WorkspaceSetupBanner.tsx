// @locs-version: 1.0
import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { fetchGmailStatus, fetchGoogleCalendarStatus, fetchLlmConfig, listCapabilities } from "@/lib/api";
import {
  isWorkspaceCalendarSetupComplete,
  isWorkspaceGmailSetupComplete,
  isWorkspaceLlmSetupComplete,
  workspaceCalendarSetupPendingReason,
  workspaceGmailSetupPendingReason,
  workspaceLlmSetupErrorPendingReason,
  workspaceLlmSetupPendingReason,
} from "@/lib/workspaceSetupState";
import {
  buildWorkspaceSetupBannerFailureReceipt,
  buildWorkspaceSetupBannerSummaryReceipt,
  type WorkspaceSetupBannerFailureReceipt,
} from "@/lib/workspaceSetupBannerFailureState";
import {
  loadWorkspaceSetupBannerDismissed,
  loadWorkspaceSetupCalendarDone,
  loadWorkspaceSetupGmailDone,
  loadWorkspaceSetupLlmOk,
  loadWorkspaceSetupSkillActivationTimes,
  saveWorkspaceSetupBannerDismissed,
  saveWorkspaceSetupCalendarDone,
  saveWorkspaceSetupGmailDone,
  saveWorkspaceSetupLlmOk,
} from "@/lib/workspaceSetupBannerLocalState";
import type { SetupItemId } from "@/lib/workspaceSetupBannerTypes";

type SetupItemDef = {
  id: SetupItemId;
  label: string;
  description: string;
  minutes: number;
  targetView: string;
};

const SETUP_ITEMS: SetupItemDef[] = [
  {
    id: "llm",
    label: "AI model",
    description: "Powers replies, summaries, and research",
    minutes: 3,
    targetView: "agent_settings",
  },
  {
    id: "gmail",
    label: "Gmail",
    description: "Email triage, smart replies, thread context",
    minutes: 2,
    targetView: "email",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Scheduling, event awareness, reminders",
    minutes: 2,
    targetView: "calendar",
  },
  {
    id: "mcp",
    label: "MCP tools",
    description: "Custom structured actions for your agent",
    minutes: 5,
    targetView: "agent_settings",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Preset workflows for common tasks",
    minutes: 1,
    targetView: "agent_settings",
  },
];

type SetupCheckErrors = Partial<
  Record<SetupItemId, WorkspaceSetupBannerFailureReceipt>
>;

export function WorkspaceSetupBanner(props: {
  signedIn?: boolean;
  onNavigate: (view: string, hint?: SetupItemId) => void;
}) {
  const [dismissed, setDismissed] = createSignal(loadWorkspaceSetupBannerDismissed());
  const [expanded, setExpanded] = createSignal(false);
  const [llmOk, setLlmOk] = createSignal(loadWorkspaceSetupLlmOk());
  const [gmailOk, setGmailOk] = createSignal(loadWorkspaceSetupGmailDone());
  const [calendarOk, setCalendarOk] = createSignal(loadWorkspaceSetupCalendarDone());
  const [capsCount, setCapsCount] = createSignal(0);
  const [skillsOk, setSkillsOk] = createSignal(false);
  const [llmPendingReason, setLlmPendingReason] = createSignal<string | null>(null);
  const [gmailPendingReason, setGmailPendingReason] = createSignal<string | null>(null);
  const [calendarPendingReason, setCalendarPendingReason] = createSignal<string | null>(null);
  const [loaded, setLoaded] = createSignal(false);
  const [checkError, setCheckError] =
    createSignal<WorkspaceSetupBannerFailureReceipt | null>(null);
  const [checkErrorsByItem, setCheckErrorsByItem] = createSignal<SetupCheckErrors>({});

  async function verifyLlm() {
    let cfg = null;
    try {
      cfg = await fetchLlmConfig();
    } catch (error) {
      const pendingReason = workspaceLlmSetupErrorPendingReason(error);
      if (!pendingReason) throw error;
      saveWorkspaceSetupLlmOk(false);
      setLlmOk(false);
      setLlmPendingReason(pendingReason);
      return;
    }
    if (isWorkspaceLlmSetupComplete(cfg)) {
      setLlmOk(true);
      setLlmPendingReason(null);
      saveWorkspaceSetupLlmOk(true);
      return;
    }
    saveWorkspaceSetupLlmOk(false);
    setLlmOk(false);
    setLlmPendingReason(workspaceLlmSetupPendingReason(cfg));
  }

  async function verifyGmail() {
    const status = await fetchGmailStatus();
    if (isWorkspaceGmailSetupComplete(status)) {
      saveWorkspaceSetupGmailDone(true);
      setGmailOk(true);
      setGmailPendingReason(null);
      return;
    }
    saveWorkspaceSetupGmailDone(false);
    setGmailOk(false);
    setGmailPendingReason(workspaceGmailSetupPendingReason(status));
  }

  async function verifyCalendar() {
    const status = await fetchGoogleCalendarStatus();
    if (isWorkspaceCalendarSetupComplete(status)) {
      saveWorkspaceSetupCalendarDone(true);
      setCalendarOk(true);
      setCalendarPendingReason(null);
      return;
    }
    saveWorkspaceSetupCalendarDone(false);
    setCalendarOk(false);
    setCalendarPendingReason(workspaceCalendarSetupPendingReason(status));
  }

  async function verifyMcp() {
    const caps = await listCapabilities();
    setCapsCount(caps.length);
  }

  async function verifySkills() {
    const times = loadWorkspaceSetupSkillActivationTimes();
    setSkillsOk(Object.keys(times).length > 0);
  }

  function updateSummaryCheckError(nextErrors: SetupCheckErrors) {
    const failedItems = SETUP_ITEMS.filter((item) => nextErrors[item.id]).map(
      (item) => item.label,
    );
    const itemReceipts = Object.values(nextErrors).filter(
      (receipt): receipt is WorkspaceSetupBannerFailureReceipt => !!receipt,
    );
    setCheckError(
      buildWorkspaceSetupBannerSummaryReceipt(failedItems, itemReceipts),
    );
  }

  async function loadSetupState(targetItem?: SetupItemId) {
    if (!targetItem) {
      setCheckError(null);
      setCheckErrorsByItem({});
    } else {
      setCheckErrorsByItem((current) => {
        const next = { ...current };
        delete next[targetItem];
        return next;
      });
    }
    if (!props.signedIn) {
      setLoaded(true);
      return;
    }
    const itemsToCheck = targetItem ? [targetItem] : (SETUP_ITEMS.map((item) => item.id));
    const nextErrors: SetupCheckErrors = targetItem ? { ...checkErrorsByItem() } : {};
    for (const itemId of itemsToCheck) {
      try {
        if (itemId === "llm") await verifyLlm();
        if (itemId === "gmail") await verifyGmail();
        if (itemId === "calendar") await verifyCalendar();
        if (itemId === "mcp") await verifyMcp();
        if (itemId === "skills") await verifySkills();
        delete nextErrors[itemId];
      } catch (error) {
        nextErrors[itemId] = buildWorkspaceSetupBannerFailureReceipt(
          "Verify workspace setup",
          error instanceof Error
            ? error.message
            : "Could not verify " + itemId + ".",
        );
      }
    }
    setCheckErrorsByItem(nextErrors);
    updateSummaryCheckError(nextErrors);
    setLoaded(true);
  }

  onMount(async () => {
    await loadSetupState();
  });

  const doneMap = createMemo<Record<SetupItemId, boolean>>(() => ({
    llm: llmOk(),
    gmail: gmailOk(),
    calendar: calendarOk(),
    mcp: capsCount() > 0,
    skills: skillsOk(),
  }));

  const pending = createMemo(() =>
    SETUP_ITEMS.filter((i) => !doneMap()[i.id])
  );
  const allDone = createMemo(() => pending().length === 0);
  const itemCheckError = (itemId: SetupItemId) => checkErrorsByItem()[itemId] ?? null;

  function dismiss() {
    saveWorkspaceSetupBannerDismissed(true);
    setDismissed(true);
  }

  return (
    <Show when={(props.signedIn ?? false) && loaded() && !dismissed() && !allDone()}>
      <div class="mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 animate-fade-in">
        {/* Header row */}
        <div class="flex items-center gap-3 px-5 py-3">
          <button
            type="button"
            class="flex flex-1 items-center gap-3 text-left"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded()}
          >
            <span class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-semibold text-primary">
              {pending().length}
            </span>
            <span class="text-sm font-medium text-on-surface">
              Finish your workspace setup
            </span>
            <span class="ml-1 text-[10px] text-on-surface-variant/60">
              {pending().length} item{pending().length === 1 ? "" : "s"} remaining
            </span>
            <svg
              class={`ml-auto h-3 w-3 flex-shrink-0 text-on-surface-variant/50 transition-transform ${expanded() ? "rotate-180" : ""}`}
              viewBox="0 0 10 6" fill="none" aria-hidden
            >
              <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss setup banner"
            class="flex-shrink-0 text-on-surface-variant/30 transition hover:text-on-surface-variant/70"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        {/* Expandable setup table */}
        <Show when={expanded()}>
          <div class="border-t border-primary/10 px-5 pb-4 pt-3">
            <Show when={checkError()}>
              <div
                class={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs ${
                  checkError()?.tone === "danger"
                    ? "border border-rose-200/70 bg-rose-50/85 text-rose-800"
                    : "border border-amber-200/70 bg-amber-50/85 text-amber-800"
                }`}
              >
                <div class="space-y-0.5">
                  <div class="font-medium">{checkError()?.title}</div>
                  <div>{checkError()?.summary}</div>
                  <div class="text-[11px] opacity-80">{checkError()?.nextStep}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSetupState()}
                  class={`rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium transition hover:bg-white ${
                    checkError()?.tone === "danger"
                      ? "border border-rose-200/70 text-rose-800"
                      : "border border-amber-200/70 text-amber-800"
                  }`}
                >
                  Retry checks
                </button>
              </div>
            </Show>
            {/* Column headers */}
            <div class="mb-2 grid grid-cols-[1fr_2fr_5rem] gap-x-4 px-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant/50">
              <span>Setup</span>
              <span>What it enables</span>
              <span class="text-right">Time</span>
            </div>

            <div class="space-y-0.5">
              <For each={SETUP_ITEMS}>
                {(item) => {
                  const done = () => doneMap()[item.id];
                  const failed = () => !!itemCheckError(item.id);
                  return (
                    <div
                      class={`grid grid-cols-[auto_1fr_2fr_5rem] items-center gap-x-4 rounded-lg px-1 py-2 ${
                        done()
                          ? "opacity-50"
                          : failed()
                            ? "bg-amber-50/65"
                            : "cursor-pointer hover:bg-primary/8"
                      }`}
                      role={!done() && !failed() ? "button" : undefined}
                      tabIndex={!done() && !failed() ? 0 : undefined}
                      onClick={() =>
                        !done() && !failed() && props.onNavigate(item.targetView, item.id)
                      }
                      onKeyDown={(e) => {
                        if (!done() && !failed() && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          props.onNavigate(item.targetView, item.id);
                        }
                      }}
                    >
                      {/* Check indicator */}
                      <span
                        class={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          done()
                            ? "bg-green-500/20 text-green-400"
                            : failed()
                              ? "bg-amber-500/15 text-amber-700"
                              : "border border-on-surface-variant/25 text-transparent"
                        }`}
                      >
                        {done() ? "OK" : failed() ? "!" : ""}
                      </span>
                      {/* Name */}
                      <span
                        class={`text-sm font-medium ${
                          done()
                            ? "text-on-surface-variant line-through"
                            : failed()
                              ? "text-amber-900"
                              : "text-on-surface"
                        }`}
                      >
                        {item.label}
                      </span>
                      {/* Description */}
                      <div class="text-xs text-on-surface-variant">
                        <span>{item.description}</span>
                        <Show when={item.id === "llm" && llmPendingReason() && !done() && !failed()}>
                          <div class="mt-1 text-amber-800">{llmPendingReason()}</div>
                        </Show>
                        <Show when={item.id === "gmail" && gmailPendingReason() && !done() && !failed()}>
                          <div class="mt-1 text-amber-800">{gmailPendingReason()}</div>
                        </Show>
                        <Show when={item.id === "calendar" && calendarPendingReason() && !done() && !failed()}>
                          <div class="mt-1 text-amber-800">{calendarPendingReason()}</div>
                        </Show>
                        <Show when={failed()}>
                          <div class="mt-1 flex items-center gap-2 text-amber-800">
                            <span>Verification failed</span>
                            <button
                              type="button"
                              class="rounded-full border border-amber-200/70 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-amber-800 transition hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                void loadSetupState(item.id);
                              }}
                            >
                              Retry
                            </button>
                          </div>
                        </Show>
                      </div>
                      {/* Time */}
                      <span class="text-right text-xs text-on-surface-variant/50">
                        {done() ? "done" : failed() ? "retry" : `~${item.minutes} min`}
                      </span>                    </div>
                  );
                }}
              </For>
            </div>

            {/* Free tier note */}
            <p class="mt-3 px-1 text-[10px] text-on-surface-variant/40">
              Weather and maps work out of the box — no API key needed.
            </p>
          </div>
        </Show>
      </div>
    </Show>
  );
}

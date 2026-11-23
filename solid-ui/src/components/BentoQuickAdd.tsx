// @locs-version: 1.0
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import {
  mergeMemoryScopeMetadata,
  sendAfpMessage,
  type DashboardBootstrap,
  type MemoryWorkspaceScopeInput,
} from "@/lib/api";
import type {
  WorkspaceAssistNavigationView,
  WorkspaceAssistDraftRefreshInput,
  WorkspaceAssistRefreshOrigin,
} from "@/lib/workspaceAssist";
import { WorkspaceAssistPanel } from "@/components/WorkspaceAssistPanel";
import {
  detectWorkspaceAssistTopic,
  selectWorkspaceAssistSuggestion,
} from "afp-ts/workspace-assistance";
import {
  buildQuickAddFailureReceipt,
  type QuickAddFailureReceipt,
} from "@/lib/quickAddFailureState";
import {
  buildDashboardWorkspaceAssistCandidates,
  buildDashboardWorkspaceAssistRecentTitles,
  workspaceAssistNavigationView,
} from "@/lib/workspaceAssist";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { sendDatabaseRecord } from "@/lib/databaseMessageCommands";

function sendAfp(
  type: string,
  to: string[],
  content: unknown,
  metadata?: Record<string, unknown> | null,
) {
  return sendAfpMessage({
    thread_id: `${type}_${Date.now()}`,
    from: "user@omnyid.local",
    to,
    type,
    content,
    metadata: metadata ?? undefined,
  });
}

function memoryScopeForQuickAddView(viewId: string): MemoryWorkspaceScopeInput | undefined {
  if (viewId === "diary") {
    return {
      memory_space: "personal",
      author_mask: "private",
      author_type: "human",
      human_only: true,
    };
  }
  if (viewId === "note") {
    return {
      memory_space: "personal",
      author_mask: "private",
      author_type: "human",
    };
  }
  return undefined;
}

function QuickAddErrorNotice(props: { receipt: QuickAddFailureReceipt | null; onDismiss: () => void }) {
  return (
    <Show when={props.receipt}>
      <div
        class={`rounded-xl border px-3 py-2 text-xs ${
          props.receipt?.tone === "danger"
            ? "border-red-400/20 bg-red-500/10 text-red-400"
            : "border-amber-300/25 bg-amber-500/10 text-amber-200"
        }`}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <p class="font-semibold">{props.receipt?.title}</p>
            <p>{props.receipt?.summary}</p>
            <p class="text-[11px] opacity-90">Next step: {props.receipt?.nextStep}</p>
          </div>
          <button
            type="button"
            onClick={props.onDismiss}
            class="rounded-full border border-current/20 bg-white/5 px-2 py-0.5 text-[11px] transition hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      </div>
    </Show>
  );
}

export function ChatQuickAdd(props: { onClose: () => void }) {
  const [to, setTo] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<QuickAddFailureReceipt | null>(null);

  async function submit() {
    if (busy()) return;
    if (!message().trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const recipient = to().trim();
      await sendAfp("chat_message", recipient ? [recipient] : ["agent://default"], { text: message() });
      props.onClose();
    } catch (error) {
      setSubmitError(
        buildQuickAddFailureReceipt(
          "Send message",
          error instanceof Error ? error.message : "Could not send this message.",
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div class="flex flex-col gap-2">
      <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">New Message</p>
      <input type="text" placeholder="To: agent ID or email (optional)"
        value={to()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTo(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <TiptapEditor
        mode="compact"
        initialContent={message()}
        disabled={busy()}
        placeholder="Message..."
        submitLabel={busy() ? "Sending..." : "Send"}
        clearOnSend={false}
        onChange={(_, markdown) => { setSubmitError(null); setMessage(markdown); }}
        onSend={submit}
      />
      <QuickAddErrorNotice receipt={submitError()} onDismiss={() => setSubmitError(null)} />
      <div class="flex gap-2">
        <button type="button" onClick={props.onClose} disabled={busy()}
          class="flex-1 rounded-xl border border-outline/20 py-1.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy()}
          class="flex-1 rounded-xl bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
          {busy() ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export function EmailQuickAdd(props: {
  bootstrap?: DashboardBootstrap | null;
  onClose: () => void;
  onRequestWorkspaceAssistDraftRefresh?: (input: WorkspaceAssistDraftRefreshInput) => void;
}) {
  const [to, setTo] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [body, setBody] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<QuickAddFailureReceipt | null>(null);
  createEffect(() => {
    props.onRequestWorkspaceAssistDraftRefresh?.({
      channelId: "quickadd:email",
      surfaceKey: "quickadd:email",
      documentTitle: subject().trim() || "Compose Email",
      text: [subject().trim(), body().trim()].filter(Boolean).join("\n\n"),
    });
  });

  async function submit() {
    if (busy()) return;
    if (!subject().trim() && !body().trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await sendAfp("email_compose", ["agent://email-gateway"], {
        kind: "email_compose", to: to().trim() || undefined, subject: subject(), body: body(),
      }, mergeMemoryScopeMetadata({}, {
        memory_space: "work",
        author_mask: "private",
        author_type: "human",
        is_human_authored: true,
      }));
      props.onClose();
    } catch (error) {
      setSubmitError(
        buildQuickAddFailureReceipt(
          "Queue email",
          error instanceof Error ? error.message : "Could not queue this email.",
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div class="flex flex-col gap-2">
      <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Compose Email</p>
      <input type="text" placeholder="To: email address or agent ID"
        value={to()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTo(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <input type="text" placeholder="Subject"
        value={subject()} disabled={busy()} onInput={(e) => { setSubmitError(null); setSubject(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <TiptapEditor
        mode="email"
        initialContent={body()}
        disabled={busy()}
        placeholder="Body..."
        submitLabel={busy() ? "Sending..." : "Compose"}
        clearOnSend={false}
        onChange={(_, markdown) => { setSubmitError(null); setBody(markdown); }}
        onSend={submit}
      />
      <QuickAddErrorNotice receipt={submitError()} onDismiss={() => setSubmitError(null)} />
      <div class="flex gap-2">
        <button type="button" onClick={props.onClose} disabled={busy()}
          class="flex-1 rounded-xl border border-outline/20 py-1.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy()}
          class="flex-1 rounded-xl bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
          {busy() ? "Sending…" : "Compose"}
        </button>
      </div>
    </div>
  );
}

export function DataQuickAdd(props: { onClose: () => void }) {
  const [table, setTable] = createSignal("");
  const [content, setContent] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<QuickAddFailureReceipt | null>(null);

  async function submit() {
    if (busy()) return;
    if (!table().trim() && !content().trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await sendDatabaseRecord(table() || "default", content(), undefined, "quickadd:data");
      props.onClose();
    } catch (error) {
      setSubmitError(
        buildQuickAddFailureReceipt(
          "Save database entry",
          error instanceof Error ? error.message : "Could not save this database entry.",
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div class="flex flex-col gap-2">
      <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">New Database Entry</p>
      <input type="text" placeholder="Table / collection name"
        value={table()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTable(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <TiptapEditor
        mode="compact"
        initialContent={content()}
        disabled={busy()}
        placeholder="Record content (JSON, markdown, or plain text)..."
        submitLabel={busy() ? "Saving..." : "Save"}
        clearOnSend={false}
        onChange={(_, markdown) => { setSubmitError(null); setContent(markdown); }}
        onSend={submit}
      />
      <QuickAddErrorNotice receipt={submitError()} onDismiss={() => setSubmitError(null)} />
      <div class="flex gap-2">
        <button type="button" onClick={props.onClose} disabled={busy()}
          class="flex-1 rounded-xl border border-outline/20 py-1.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy()}
          class="flex-1 rounded-xl bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
          {busy() ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function QuickAddPanel(props: {
  viewId: string;
  bootstrap?: DashboardBootstrap | null;
  onClose: () => void;
  onOpenWorkspaceAssist?: (view: WorkspaceAssistNavigationView, query?: string | null) => void;
  onRequestWorkspaceAssistDraftRefresh?: (input: WorkspaceAssistDraftRefreshInput) => void;
  workspaceAssistRefreshOrigin?: WorkspaceAssistRefreshOrigin | null;
}) {
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<QuickAddFailureReceipt | null>(null);

  const TO_MAP: Record<string, string> = {
    note: "agent://knowledge-curator", threads: "agent://master",
    workflows: "agent://workflow-supervisor", diary: "agent://knowledge-curator",
    discover: "agent://knowledge-curator", contacts: "agent://master",
  };
  const heading = () => `New ${props.viewId.replace(/_/g, " ")}`;

  const workspaceAssist = createMemo(() => {
    if (!title().trim() && !body().trim()) return null;

    const topic = detectWorkspaceAssistTopic({
      app_label: `${props.viewId.replace(/_/g, " ")} quick add`,
      document_title: title().trim() || heading(),
      editor_text: [title().trim(), body().trim()].filter(Boolean).join("\n\n"),
      recent_activity_titles: buildDashboardWorkspaceAssistRecentTitles(props.bootstrap ?? null),
    });

    return selectWorkspaceAssistSuggestion({
      topic,
      candidates: buildDashboardWorkspaceAssistCandidates(props.bootstrap ?? null, {
        refreshOrigin: props.workspaceAssistRefreshOrigin ?? "cached",
      }),
    });
  });
  createEffect(() => {
    props.onRequestWorkspaceAssistDraftRefresh?.({
      channelId: `quickadd:${props.viewId}`,
      surfaceKey: `quickadd:${props.viewId}`,
      documentTitle: title().trim() || heading(),
      text: [title().trim(), body().trim()].filter(Boolean).join("\n\n"),
    });
  });

  function openWorkspaceAssist() {
    const destination = workspaceAssistNavigationView(workspaceAssist()?.destination_view);
    if (destination) {
      props.onOpenWorkspaceAssist?.(destination, workspaceAssist()?.research_query ?? null);
    }
  }

  async function submit() {
    if (busy()) return;
    if (!title().trim() && !body().trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await sendAfp(props.viewId, [TO_MAP[props.viewId] ?? "agent://master"], {
        kind: props.viewId, title: title(), description: body(),
      }, mergeMemoryScopeMetadata({}, memoryScopeForQuickAddView(props.viewId)));
      props.onClose();
    } catch (error) {
      setSubmitError(
        buildQuickAddFailureReceipt(
          `Create ${props.viewId.replace(/_/g, " ")}`,
          error instanceof Error ? error.message : `Could not create this ${props.viewId.replace(/_/g, " ")} item.`,
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div class="flex flex-col gap-2">
      <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">{heading()}</p>
      <input type="text" placeholder="Title" value={title()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTitle(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <TiptapEditor
        mode="compact"
        initialContent={body()}
        disabled={busy()}
        placeholder="Description (optional)"
        submitLabel={busy() ? "Saving..." : `Create ${props.viewId.replace(/_/g, " ")}`}
        clearOnSend={false}
        onChange={(_, markdown) => { setSubmitError(null); setBody(markdown); }}
        onSend={submit}
      />
      <WorkspaceAssistPanel
        suggestion={workspaceAssist()}
        refreshOrigin={props.workspaceAssistRefreshOrigin}
        onOpen={openWorkspaceAssist}
      />
      <QuickAddErrorNotice receipt={submitError()} onDismiss={() => setSubmitError(null)} />
      <div class="flex gap-2">
        <button type="button" onClick={props.onClose} disabled={busy()}
          class="flex-1 rounded-xl border border-outline/20 py-1.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy()}
          class="flex-1 rounded-xl bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
          {busy() ? "Saving…" : "Create"}
        </button>
      </div>
    </div>
  );
}

export function TaskQuickAdd(props: { onClose: () => void }) {
  const [title, setTitle] = createSignal("");
  const [dueDate, setDueDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = createSignal("17:00");
  const [description, setDescription] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<QuickAddFailureReceipt | null>(null);

  async function create() {
    if (busy()) return;
    if (!title().trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await sendAfp("task", ["agent://calendar"], {
        kind: "task", title: title().trim(), due_date: `${dueDate()}T${dueTime()}:00`,
        description: description().trim() || undefined, status: "pending",
      }, mergeMemoryScopeMetadata({
        origin: "quickadd:task",
      }, {
        memory_space: "personal",
        author_mask: "private",
        author_type: "human",
        human_only: true,
      }));
      props.onClose();
    } catch (error) {
      setSubmitError(
        buildQuickAddFailureReceipt(
          "Create task",
          error instanceof Error ? error.message : "Could not add this task.",
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div class="flex flex-col gap-2">
      <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">New Task</p>
      <input type="text" placeholder="Task title" value={title()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTitle(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <div class="flex gap-1.5">
        <input type="date" value={dueDate()} disabled={busy()} onInput={(e) => { setSubmitError(null); setDueDate(e.currentTarget.value); }}
          class="flex-1 rounded-xl border border-white/40 bg-white/60 px-2 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
        <input type="time" value={dueTime()} disabled={busy()} onInput={(e) => { setSubmitError(null); setDueTime(e.currentTarget.value); }}
          class="w-[80px] rounded-xl border border-white/40 bg-white/60 px-2 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      </div>
      <TiptapEditor
        mode="compact"
        initialContent={description()}
        disabled={busy()}
        placeholder="Notes (optional)"
        submitLabel={busy() ? "Saving..." : "Add Task"}
        clearOnSend={false}
        onChange={(_, markdown) => { setSubmitError(null); setDescription(markdown); }}
        onSend={create}
      />
      <QuickAddErrorNotice receipt={submitError()} onDismiss={() => setSubmitError(null)} />
      <div class="flex gap-2">
        <button type="button" onClick={props.onClose} disabled={busy()}
          class="flex-1 rounded-xl border border-outline/20 py-1.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5">
          Cancel</button>
        <button type="button" onClick={create} disabled={busy()}
          class="flex-1 rounded-xl bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
          {busy() ? "Saving…" : "Add Task"}</button>
      </div>
    </div>
  );
}

export function CalendarQuickAdd(props: { onClose: () => void }) {
  const [itemType, setItemType] = createSignal<"event" | "task">("event");
  const [title, setTitle] = createSignal("");
  const [date, setDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [time, setTime] = createSignal("09:00");
  const [description, setDescription] = createSignal("");
  const [recurring, setRecurring] = createSignal("none");
  const [location, setLocation] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<QuickAddFailureReceipt | null>(null);

  async function create() {
    if (busy()) return;
    if (!title().trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const afpType = itemType() === "task" ? "task" : "calendar_event";
      const content = itemType() === "task"
        ? { kind: "task", title: title(), due_date: `${date()}T${time()}:00`, description: description() }
        : { kind: "calendar_event", title: title(), start: `${date()}T${time()}:00`,
            recurring: recurring(), location: location(), description: description() };
      await sendAfp(afpType, ["agent://calendar"], content, mergeMemoryScopeMetadata({
        origin: "quickadd:calendar",
        item_kind: itemType(),
      }, {
        memory_space: "personal",
        author_mask: "private",
        author_type: "human",
        human_only: true,
      }));
      props.onClose();
    } catch (error) {
      setSubmitError(
        buildQuickAddFailureReceipt(
          `Create ${itemType()}`,
          error instanceof Error ? error.message : `Could not create this ${itemType()}.`,
        ),
      );
    }
    setBusy(false);
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex gap-1 rounded-xl bg-gray-100 p-0.5">
        <button type="button" onClick={() => { setSubmitError(null); setItemType("event"); }} disabled={busy()}
          class={`flex-1 rounded-lg py-1 text-[10px] font-medium transition ${itemType() === "event" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant/60"}`}>
          Event</button>
        <button type="button" onClick={() => { setSubmitError(null); setItemType("task"); }} disabled={busy()}
          class={`flex-1 rounded-lg py-1 text-[10px] font-medium transition ${itemType() === "task" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant/60"}`}>
          Task</button>
      </div>
      <input type="text" placeholder="Title" value={title()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTitle(e.currentTarget.value); }}
        class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      <div class="flex gap-1.5">
        <input type="date" value={date()} disabled={busy()} onInput={(e) => { setSubmitError(null); setDate(e.currentTarget.value); }}
          class="flex-1 rounded-xl border border-white/40 bg-white/60 px-2 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
        <input type="time" value={time()} disabled={busy()} onInput={(e) => { setSubmitError(null); setTime(e.currentTarget.value); }}
          class="w-[80px] rounded-xl border border-white/40 bg-white/60 px-2 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      </div>
      <Show when={itemType() === "event"}>
        <select value={recurring()} disabled={busy()} onInput={(e) => { setSubmitError(null); setRecurring(e.currentTarget.value); }}
          class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition">
          <option value="none">No repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <input type="text" placeholder="Location (optional)" value={location()} disabled={busy()} onInput={(e) => { setSubmitError(null); setLocation(e.currentTarget.value); }}
          class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs outline-none focus:border-primary/50 transition" />
      </Show>
      <TiptapEditor
        mode="compact"
        initialContent={description()}
        disabled={busy()}
        placeholder="Description (optional)"
        submitLabel={busy() ? "Saving..." : "Create"}
        clearOnSend={false}
        onChange={(_, markdown) => { setSubmitError(null); setDescription(markdown); }}
        onSend={create}
      />
      <QuickAddErrorNotice receipt={submitError()} onDismiss={() => setSubmitError(null)} />
      <div class="flex gap-2">
        <button type="button" onClick={props.onClose} disabled={busy()}
          class="flex-1 rounded-xl border border-outline/20 py-1.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5">
          Cancel</button>
        <button type="button" onClick={create} disabled={busy()}
          class="flex-1 rounded-xl bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
          {busy() ? "Saving…" : "Create"}</button>
      </div>
    </div>
  );
}

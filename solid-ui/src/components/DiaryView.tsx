// @locs-version: 1.0
/**
 * DiaryView — Daily personal diary
 *
 * Shows a chronological timeline of the user's day, grouped by
 * Morning / Afternoon / Evening, with sections for:
 *   - Mood recordings (from DecisionOSHomeView)
 *   - Decision actions (approve, snooze, delegate, dismiss)
 *   - Manual notes
 *   - Agent-pushed A2UI entries
 *
 * Driven by localStorage "omnyid.diary-entries" + live "omnyid:diary-entry" events.
 * Date picker lets users view past days.
 */

import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  subscribeDiaryEntryEvent,
  type DiaryEntry,
} from "@/lib/diaryEvent";
import { readSession, type AfpMessage, type SendAfpMessageInput } from "@/lib/api";
import { appendDecisionOsDiaryEntry, loadDecisionOsDiaryEntriesForDate } from "@/lib/decisionOsDiaryState";
import { pendingOutcomeCheckForDecision } from "@/lib/decisionOsHomeState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { renderMarkdown } from "@/lib/markdownRenderer";

const MAX_DIARY_ENTRIES_PER_DAY = 200;
const MAX_DIARY_DAYS = 14;

type Period = "morning" | "afternoon" | "evening";

const PERIOD_META: Record<Period, { label: string; icon: string; range: string }> = {
  morning:   { label: "Morning",   icon: "🌅", range: "Before noon" },
  afternoon: { label: "Afternoon", icon: "☀️", range: "12PM – 5PM" },
  evening:   { label: "Evening",   icon: "🌇", range: "After 5PM" },
};

const ENTRY_BG: Record<DiaryEntry["type"], string> = {
  mood:      "bg-violet-50/60 border-violet-200/50",
  decision:  "bg-white/70 border-white/50",
  note:      "bg-amber-50/50 border-amber-200/40",
  calendar:  "bg-sky-50/50 border-sky-200/40",
  agent:     "bg-emerald-50/50 border-emerald-200/40",
  milestone: "bg-rose-50/50 border-rose-200/40",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPeriod(ts: string): Period {
  const h = new Date(ts).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatFullDate(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatOutcomeCheckChip(checkAt: string): string {
  const diffMs = new Date(checkAt).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return "Check in soon";
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  if (diffMs >= dayMs) return `Check in ${Math.max(1, Math.round(diffMs / dayMs))}d`;
  return `Check in ${Math.max(1, Math.round(diffMs / hourMs))}h`;
}

// ── Summary stats for the day ─────────────────────────────────────────────────

function DaySummary(props: { entries: DiaryEntry[] }) {
  const counts = createMemo(() => {
    const e = props.entries;
    return {
      decisions: e.filter(x => x.type === "decision").length,
      moods:     e.filter(x => x.type === "mood"),
      notes:     e.filter(x => x.type === "note").length,
    };
  });

  const lastMood = createMemo(() => {
    const moods = counts().moods;
    return moods.length > 0 ? moods[moods.length - 1] : null;
  });

  return (
    <div class="flex flex-wrap items-center gap-3">
      <Show when={lastMood()}>
        <span class="rounded-full border border-violet-200/60 bg-violet-50/60 px-3 py-1 text-[11px] text-violet-700">
          {lastMood()!.icon} {lastMood()!.title.replace("Mood: ", "")}
        </span>
      </Show>
      <Show when={counts().decisions > 0}>
        <span class="rounded-full border border-emerald-200/60 bg-emerald-50/60 px-3 py-1 text-[11px] text-emerald-700">
          ✅ {counts().decisions} decision{counts().decisions !== 1 ? "s" : ""} handled
        </span>
      </Show>
      <Show when={counts().notes > 0}>
        <span class="rounded-full border border-amber-200/60 bg-amber-50/60 px-3 py-1 text-[11px] text-amber-700">
          📝 {counts().notes} note{counts().notes !== 1 ? "s" : ""}
        </span>
      </Show>
      <Show when={props.entries.length === 0}>
        <span class="text-[11px] text-on-surface-variant/50">Nothing recorded yet.</span>
      </Show>
    </div>
  );
}

// ── Timeline entry card ───────────────────────────────────────────────────────

function EntryCard(props: { entry: DiaryEntry }) {
  const e = props.entry;
  const bg = () => ENTRY_BG[e.type] ?? "bg-white/70 border-white/50";
  const sessionUserId = readSession()?.user?.id ?? null;
  const pendingOutcomeCheck = () =>
    e.outcomeCheckAt
      ? e.outcomeCheckAt
      : e.decisionId
        ? pendingOutcomeCheckForDecision(e.decisionId, sessionUserId)?.checkAt ?? null
        : null;

  return (
    <div class={`flex items-start gap-3 rounded-2xl border p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] backdrop-blur-sm ${bg()}`}>
      <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-base leading-none">
        {e.icon}
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <p class="text-[12px] font-medium text-on-surface leading-snug">{e.title}</p>
          <span class="flex-shrink-0 font-mono text-[9px] text-on-surface-variant/40">{formatTime(e.ts)}</span>
        </div>
        <Show when={e.note || e.detail}>
          <div
            class="prose prose-sm mt-1 max-w-none text-[11px] leading-relaxed text-on-surface-variant"
            innerHTML={renderMarkdown(e.note || e.detail || "")}
          />
        </Show>
        <Show when={e.meta}>
          <span class="mt-1 inline-block rounded-full bg-black/[0.04] px-2 py-0.5 text-[9px] font-medium text-on-surface-variant/70">
            {e.meta}
          </span>
        </Show>
        <Show when={pendingOutcomeCheck()}>
          <span
            class="mt-1 ml-1 inline-block rounded-full border border-sky-200/70 bg-sky-50/80 px-2 py-0.5 text-[9px] font-medium text-sky-700"
            title={new Date(pendingOutcomeCheck()!).toLocaleString()}
          >
            ⏳ {formatOutcomeCheckChip(pendingOutcomeCheck()!)}
          </span>
        </Show>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

function diaryEntriesFromMessages(messages: readonly AfpMessage[]): DiaryEntry[] {
  return messages.flatMap((message) => {
    if (message.kind !== "diary_entry" && message.subtype !== "diary_entry") return [];
    const content = message.content ?? {};
    const markdown = typeof content.markdown === "string" ? content.markdown.trim() : "";
    const title = typeof content.title === "string" ? content.title.trim() : "";
    if (!markdown && !title) return [];
    return [{
      ts: typeof content.recorded_at === "string" ? content.recorded_at : message.timestamp,
      type: "note" as const,
      icon: "📝",
      title: title || "Diary note",
      note: markdown || title,
      meta: "Synced privately",
    }];
  });
}

export function DiaryView(props: {
  messages?: readonly AfpMessage[];
  saveProjection?: (input: SendAfpMessageInput) => Promise<unknown>;
}) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const todayKey = toDateKey(new Date());
  const [dateKey, setDateKey] = createSignal(todayKey);
  const [entries, setEntries] = createSignal<DiaryEntry[]>(loadDecisionOsDiaryEntriesForDate(todayKey, sessionUserId));
  const [newNote, setNewNote] = createSignal("");
  const [savingNote, setSavingNote] = createSignal(false);

  // Reload entries when date changes
  const loadDate = (key: string) => {
    setDateKey(key);
    setEntries(loadDecisionOsDiaryEntriesForDate(key, sessionUserId));
  };

  // Group by period
  const grouped = createMemo(() => {
    const periods: Record<Period, DiaryEntry[]> = { morning: [], afternoon: [], evening: [] };
    for (const e of entries()) periods[getPeriod(e.ts)].push(e);
    return (["morning", "afternoon", "evening"] as Period[]).map(p => ({
      period: p,
      ...PERIOD_META[p],
      items: periods[p],
    }));
  });

  // Build date picker options (last 14 days)
  const dateOptions = createMemo(() => {
    const opts: Array<{ key: string; label: string }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() - i * 86400000);
      opts.push({ key: toDateKey(d), label: formatDateLabel(toDateKey(d)) });
    }
    return opts;
  });

  async function addNote() {
    const text = newNote().trim();
    if (!text) return;
    const entry: DiaryEntry = {
      ts: new Date().toISOString(),
      type: "note",
      icon: "📝",
      title: text.replace(/[#*_>`~\[\]]/g, "").slice(0, 90) || "Diary note",
      note: text,
    };
    appendDecisionOsDiaryEntry(entry, sessionUserId, {
      maxEntriesPerDay: MAX_DIARY_ENTRIES_PER_DAY,
      maxDays: MAX_DIARY_DAYS,
    });
    if (dateKey() === todayKey) setEntries(prev => [...prev, entry]);
    setNewNote("");
    if (props.saveProjection) {
      setSavingNote(true);
      try {
        await props.saveProjection({
          thread_id: `private-diary-${sessionUserId || "local"}`,
          from: "user@omnyid.local",
          to: ["agent://diary"],
          type: "note",
          kind: "diary_entry",
          subtype: "diary_entry",
          content: {
            kind: "diary_entry",
            title: entry.title,
            markdown: text,
            recorded_at: entry.ts,
          },
          supertags: ["diary:entry", "privacy:private"],
          metadata: { surface: "diary", account_scoped: true },
          memory_scope: { memory_space: "personal", author_mask: "private", author_type: "human", human_only: true },
        });
      } catch {
        // The account-scoped local mirror remains available and will not leak
        // into another account. The next saved entry may be retried normally.
      } finally {
        setSavingNote(false);
      }
    }
  }

  createEffect(() => {
    const synced = diaryEntriesFromMessages(props.messages ?? []);
    const syncedForDay = synced.filter((entry) => entry.ts.slice(0, 10) === dateKey());
    if (!syncedForDay.length) return;
    const local = loadDecisionOsDiaryEntriesForDate(dateKey(), sessionUserId);
    const unique = new Map([...local, ...syncedForDay].map((entry) => [`${entry.ts}|${entry.title}`, entry]));
    setEntries([...unique.values()].sort((a, b) => a.ts.localeCompare(b.ts)));
  });

  // Live updates from other parts of the app
  onMount(() => {
    const unsubscribeDiaryEntry = subscribeDiaryEntryEvent((entry) => {
      if (entry.ts.slice(0, 10) === dateKey()) {
        setEntries(prev => [...prev, entry].sort((a, b) => a.ts.localeCompare(b.ts)));
      }
    });
    onCleanup(() => unsubscribeDiaryEntry());
  });

  return (
    <div class="flex flex-col gap-5 p-1">
      {/* Header */}
      <div class="rounded-2xl border border-white/50 bg-white/60 p-5 shadow-card backdrop-blur-sm">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/50">Your Diary</p>
            <h1 class="mt-0.5 text-lg font-semibold text-on-surface">{formatFullDate(dateKey())}</h1>
            <p class="mt-0.5 text-[11px] italic text-on-surface-variant/60">
              A private record of your decisions, mood, and moments.
            </p>
            <div class="mt-3 max-w-2xl rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
              Diary entries are kept private to this account and synced across signed-in devices. A local account-scoped copy keeps the diary usable during a temporary connection problem.
            </div>
          </div>
          {/* Date picker */}
          <select
            value={dateKey()}
            onChange={e => loadDate(e.currentTarget.value)}
            class="rounded-xl border border-black/[0.08] bg-white/70 px-3 py-2 text-sm text-on-surface outline-none transition hover:bg-white/90 focus:border-primary/40"
          >
            <For each={dateOptions()}>
              {(opt) => <option value={opt.key}>{opt.label}</option>}
            </For>
          </select>
        </div>

        {/* Day summary chips */}
        <div class="mt-3 border-t border-black/[0.04] pt-3">
          <DaySummary entries={entries()} />
        </div>
      </div>

      {/* Timeline */}
      <For each={grouped()}>
        {(group) => (
          <Show when={group.items.length > 0}>
            <div>
              {/* Period header */}
              <div class="mb-3 flex items-center gap-2">
                <span class="text-base">{group.icon}</span>
                <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60">{group.label}</span>
                <span class="ml-1 text-[9px] text-on-surface-variant/30">{group.range}</span>
                <div class="flex-1 h-px bg-black/[0.05]" />
                <span class="font-mono text-[9px] text-on-surface-variant/30">{group.items.length}</span>
              </div>
              <div class="flex flex-col gap-2.5">
                <For each={group.items}>
                  {(entry) => <EntryCard entry={entry} />}
                </For>
              </div>
            </div>
          </Show>
        )}
      </For>

      {/* Empty state */}
      <Show when={entries().length === 0}>
        <div class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 py-16 text-center">
          <span class="text-4xl mb-3">📖</span>
          <p class="text-sm font-semibold text-on-surface">Nothing here yet</p>
          <p class="mt-1 max-w-xs text-xs text-on-surface-variant/60">
            Decisions you approve, moods you log on the Home screen, and notes you add will appear here.
          </p>
        </div>
      </Show>

      {/* Add note (today only) */}
      <Show when={dateKey() === todayKey}>
        <div class="rounded-2xl border border-white/50 bg-white/60 p-4 shadow-card backdrop-blur-sm">
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant/50">
            Add to today's diary
          </p>
          <TiptapEditor
            mode="full"
            initialContent={newNote()}
            placeholder="Capture a thought, reflection, or moment…"
            submitLabel={savingNote() ? "Saving…" : "Save to diary"}
            disabled={savingNote()}
            clearOnSend
            onChange={(_text, markdown) => setNewNote(markdown)}
            onSend={async (payload) => {
              setNewNote(payload.markdown || payload.text);
              recordShortcutUse("form_submit");
              await addNote();
            }}
          />
        </div>
      </Show>
    </div>
  );
}

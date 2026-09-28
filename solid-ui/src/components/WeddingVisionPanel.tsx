// @locs-version: 1.0
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import { buildWeddingVisionState } from "@/lib/weddingVisionState";
import {
  weddingCustomSurfaceItemToAfpSendInput,
  type WeddingCustomSurfaceItem,
} from "@/lib/weddingCustomSurfaceState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

function Rating(props: { count: number }) {
  return <span aria-label={`${props.count} out of 5`}>{props.count}/5</span>;
}

export function WeddingVisionPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
}) {
  const vision = createMemo(() => buildWeddingVisionState(props.state));
  const [editOpen, setEditOpen] = createSignal(false);
  const [feelDraft, setFeelDraft] = createSignal("");
  const [priorityDraft, setPriorityDraft] = createSignal("");
  const [avoidDraft, setAvoidDraft] = createSignal("");
  const [rulesDraft, setRulesDraft] = createSignal("");
  const [agentNote, setAgentNote] = createSignal("");
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const [overrideRefresh, setOverrideRefresh] = createSignal(0);
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const storageKey = () => `omnyid:wedding_vision_override:${workspaceId()}`;
  const storedOverride = () => {
    overrideRefresh();
    try {
      const raw = localStorage.getItem(storageKey());
      return raw && typeof raw === "string" ? JSON.parse(raw) as Record<string, string> : {};
    } catch {
      return {};
    }
  };
  const overrides = createMemo(storedOverride);
  const feelTags = () => splitLines(overrides().feelTags) ?? vision().feelTags;
  const priorityRows = () => splitLines(overrides().priorityRows)?.map((label, index) => ({
    label,
    rating: vision().priorityRows[index]?.rating ?? 3,
    reason: "Edited by the couple.",
  })) ?? vision().priorityRows;
  const avoidLabels = () => splitLines(overrides().avoidLabels) ?? vision().avoidLabels;
  const decisionRules = () => splitLines(overrides().decisionRules) ?? vision().decisionRules;

  createEffect(() => {
    setFeelDraft(feelTags().join("\n"));
    setPriorityDraft(priorityRows().map((row) => row.label).join("\n"));
    setAvoidDraft(avoidLabels().join("\n"));
    setRulesDraft(decisionRules().join("\n"));
  });

  function splitLines(value: unknown): string[] | null {
    if (typeof value !== "string" || !value.trim()) return null;
    const lines = value.split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean);
    return lines.length > 0 ? lines : null;
  }

  async function saveVisionNote(body: string, title: string) {
    const now = new Date().toISOString();
    const item: WeddingCustomSurfaceItem = {
      id: `wedding-vision-${Date.now()}`,
      menu: "inspiration",
      kind: "text",
      title,
      body,
      imageUrl: null,
      storageRef: null,
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (!props.saveProjection) {
      setSaveNotice("Saved on this page.");
      return;
    }
    await props.saveProjection(weddingCustomSurfaceItemToAfpSendInput({
      item,
      metadata: props.state.workspace.metadata,
      action: "upsert",
    }));
    props.onRefreshWorkspace?.();
  }

  async function saveDirectEdits() {
    const payload = {
      feelTags: feelDraft(),
      priorityRows: priorityDraft(),
      avoidLabels: avoidDraft(),
      decisionRules: rulesDraft(),
    };
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    setOverrideRefresh((value) => value + 1);
    try {
      await saveVisionNote([
        "Vision corrections:",
        `How it should feel:\n${feelDraft()}`,
        `What matters most:\n${priorityDraft()}`,
        `What we do not want:\n${avoidDraft()}`,
        `How we decide:\n${rulesDraft()}`,
      ].join("\n\n"), "Wedding vision correction");
      setSaveNotice("Vision saved.");
      setEditOpen(false);
    } catch {
      setSaveNotice("Saved on this page. Wedding memory sync is not available yet.");
    }
  }

  async function sendAgentNote() {
    const note = agentNote().trim();
    if (!note) return;
    try {
      await saveVisionNote(note, "Wedding vision note");
      setAgentNote("");
      setSaveNotice("Note saved for OmnyID.");
    } catch {
      setSaveNotice("Saved on this page. Wedding memory sync is not available yet.");
    }
  }

  return (
    <section class="min-w-0 rounded-[24px] border border-rose-100/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.94))] p-4 shadow-card sm:rounded-[28px]">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-rose-900/65">Vision</p>
          <h3 class="mt-1 text-xl font-bold text-rose-950">{vision().title}</h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-rose-950/75">{vision().intro}</p>
          <p class="mt-2 text-xs font-semibold text-rose-950/70">{vision().confidenceLabel}</p>
        </div>
        <span class="w-fit rounded-full border border-rose-100 bg-white/75 px-3 py-1.5 text-xs font-semibold text-rose-950">
          Living summary
        </span>
      </div>

      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">How it should feel</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <For each={feelTags()}>
              {(tag) => <span class="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-950">{tag}</span>}
            </For>
          </div>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">What matters most</p>
          <div class="mt-2 space-y-2">
            <For each={priorityRows()}>
              {(row) => (
                <div>
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <span class="font-semibold text-rose-950">{row.label}</span>
                    <span class="text-amber-700"><Rating count={row.rating} /></span>
                  </div>
                  <p class="mt-0.5 text-xs leading-5 text-rose-950/65">{row.reason}</p>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">What we do not want</p>
          <ul class="mt-2 space-y-1">
            <For each={avoidLabels()}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">How we decide</p>
          <ul class="mt-2 space-y-1">
            <For each={decisionRules()}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Why I think this</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().evidenceLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Evidence used</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().sourceMixLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Still learning</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().learningLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>
      </div>

      <div class="mt-3 rounded-2xl border border-rose-100 bg-white/70 p-3">
        <p class="text-sm font-semibold text-rose-950">Does this sound right?</p>
        <div class="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={agentNote()}
            onInput={(event) => setAgentNote(event.currentTarget.value)}
            placeholder="Tell OmnyID what to change, for example: more relaxed, less formal, food matters most."
            class="min-h-10 rounded-full border border-rose-100 bg-white px-3 text-sm text-rose-950 outline-none focus:border-rose-300"
          />
          <button
            type="button"
            disabled={!agentNote().trim()}
            class="rounded-full bg-rose-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-45"
            data-magic-action="send"
            data-magic-icon="send"
            data-magic-label="Send note"
            data-magic-id="wedding:vision:send-note"
            onClick={() => void sendAgentNote()}
          >
            Send note
          </button>
        </div>
        <button
          type="button"
          class="mt-2 rounded-full border border-rose-100 bg-white px-3 py-1.5 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
          data-magic-action="open"
          data-magic-icon="edit"
          data-magic-label={editOpen() ? "Close editing" : "Edit summary directly"}
          data-magic-id="wedding:vision:toggle-edit"
          onClick={() => setEditOpen((current) => !current)}
        >
          {editOpen() ? "Close editing" : "Edit summary directly"}
        </button>
        <Show when={saveNotice()}>
          {(notice) => <p class="mt-2 text-xs font-semibold text-rose-950/70">{notice()}</p>}
        </Show>
      </div>

      <Show when={editOpen()}>
        <div class="mt-3 grid gap-2 md:grid-cols-2">
          {[
            ["How it should feel", feelDraft, setFeelDraft],
            ["What matters most", priorityDraft, setPriorityDraft],
            ["What we do not want", avoidDraft, setAvoidDraft],
            ["How we decide", rulesDraft, setRulesDraft],
          ].map(([label, value, setter]) => (
            <label class="text-xs font-semibold text-rose-950">
              {label as string}
              <textarea
                value={(value as typeof feelDraft)()}
                onInput={(event) => (setter as typeof setFeelDraft)(event.currentTarget.value)}
                class="mt-1 min-h-24 w-full rounded-2xl border border-rose-100 bg-white px-3 py-2 text-sm font-normal text-rose-950 outline-none focus:border-rose-300"
              />
            </label>
          ))}
          <div class="md:col-span-2">
            <button
              type="button"
              class="rounded-full bg-rose-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-800"
              data-magic-action="approve"
              data-magic-icon="save"
              data-magic-label="Save vision"
              data-magic-id="wedding:vision:save"
              onClick={() => void saveDirectEdits()}
            >
              Save vision
            </button>
          </div>
        </div>
      </Show>

      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <For each={vision().actionLabels}>
          {(action) => (
            <button
              type="button"
              disabled={!props.onSelectMenu}
              class="rounded-2xl border border-rose-100 bg-white/75 p-3 text-left transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45"
              data-magic-action="open"
              data-magic-icon="next"
              data-magic-label={action.label}
              data-magic-id={`wedding:vision:next:${action.targetMenu}`}
              onClick={() => props.onSelectMenu?.(action.targetMenu)}
            >
              <span class="text-sm font-semibold text-rose-950">{action.label}</span>
              <span class="mt-1 block text-xs leading-5 text-rose-950/65">{action.detail}</span>
            </button>
          )}
        </For>
      </div>
    </section>
  );
}

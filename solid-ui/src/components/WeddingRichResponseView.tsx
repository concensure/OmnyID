// @locs-version: 2.0
import { createSignal, For, Show } from "solid-js";

import type {
  WeddingRichResponseAction,
  WeddingRichResponseBlock,
  WeddingRichResponseRendererState,
} from "@/lib/weddingRichResponseRendererState";

function blockShellClass(block: WeddingRichResponseBlock): string {
  if (block.kind === "map") return "border-emerald-100 bg-emerald-50/80";
  if (block.kind === "timeline") return "border-cyan-100 bg-cyan-50/80";
  if (block.kind === "legal") return "border-rose-100 bg-rose-50/80";
  if (block.kind === "draft") return "border-amber-100 bg-amber-50/80";
  if (block.kind === "task") return "border-sky-100 bg-sky-50/80";
  if (block.kind === "table") return "border-slate-200 bg-white/80";
  return "border-white/70 bg-white/70";
}

function blockAccentLabel(block: WeddingRichResponseBlock): string {
  if (block.kind === "map") return "Map";
  if (block.kind === "timeline") return "Timeline";
  if (block.kind === "legal") return "Legal";
  if (block.kind === "draft") return "Message to approve";
  if (block.kind === "task") return "To-do list";
  if (block.kind === "table") return "Comparison";
  if (block.kind === "continue") return "Continue";
  return "Wedding document";
}

function sectionLayoutLabel(layoutHint: WeddingRichResponseRendererState["sections"][number]["layoutHint"]): string {
  if (layoutHint === "hero") return "Start here";
  if (layoutHint === "media") return "Map view";
  if (layoutHint === "timeline") return "Timeline";
  if (layoutHint === "actions") return "Actions";
  return "Details";
}

function actionButtonClass(primary: boolean): string {
  return primary
    ? "w-full rounded-full bg-rose-900 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-rose-800 sm:w-auto sm:py-1.5"
    : "w-full rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 sm:w-auto sm:py-1.5";
}

function RichActionButton(props: {
  action: WeddingRichResponseAction | null;
  primary?: boolean;
  onAction?: (action: WeddingRichResponseAction) => void;
}) {
  return (
    <Show when={props.action}>
      {(action) => (
        <button
          type="button"
          aria-label={action().accessibleLabel}
          class={actionButtonClass(Boolean(props.primary))}
          onClick={() => props.onAction?.(action())}
        >
          {action().label}
        </button>
      )}
    </Show>
  );
}

function RichBlock(props: {
  block: WeddingRichResponseBlock;
  onAction?: (action: WeddingRichResponseAction) => void;
}) {
  const [showDetails, setShowDetails] = createSignal(false);
  return (
    <article class={`min-w-0 rounded-[24px] border p-4 shadow-sm ${blockShellClass(props.block)} ${
      props.block.layoutHint === "wide" ? "md:col-span-2" : ""
    }`}>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-slate-500">
            {blockAccentLabel(props.block)}
          </p>
          <h3 class="mt-1 break-words text-sm font-semibold text-on-surface">{props.block.title}</h3>
        </div>
        <button
          type="button"
          class="rounded-full border border-white/70 bg-white/75 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white"
          onClick={() => setShowDetails((current) => !current)}
          aria-expanded={showDetails()}
        >
          {showDetails() ? "Hide details" : "Details"}
        </button>
      </div>
      <p class="mt-2 break-words text-sm leading-6 text-on-surface-variant">{props.block.body}</p>
      <Show when={showDetails()}>
        <div class="mt-3 rounded-2xl border border-white/70 bg-white/60 p-3">
          <p class="break-words text-xs font-semibold text-slate-700">{props.block.evidenceLabel}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <For each={props.block.badges.slice(0, 5)}>
              {(badge) => (
                <span class="max-w-full break-words rounded-full border border-white/70 bg-white/70 px-2 py-1 text-xs font-medium text-slate-600">
                  {badge}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        <RichActionButton action={props.block.primaryAction} primary onAction={props.onAction} />
        <RichActionButton action={props.block.secondaryAction} onAction={props.onAction} />
      </div>
    </article>
  );
}

export function WeddingRichResponseView(props: {
  state: WeddingRichResponseRendererState;
  onAction?: (action: WeddingRichResponseAction) => void;
}) {
  return (
    <section class="min-w-0 overflow-hidden rounded-[28px] border border-rose-100/80 bg-[radial-gradient(circle_at_top_left,rgba(255,228,230,0.9),transparent_34%),linear-gradient(135deg,rgba(255,251,235,0.96),rgba(255,255,255,0.94))] p-3 shadow-[0_22px_70px_-36px_rgba(190,18,60,0.35)] sm:rounded-[32px] sm:p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-rose-700/70">
            {props.state.heroLabel}
          </p>
          <h2 class="mt-1 break-words text-xl font-semibold text-on-surface sm:text-2xl">{props.state.title}</h2>
          <p class="mt-2 max-w-3xl break-words text-sm leading-6 text-on-surface-variant">{props.state.subtitle}</p>
          <p class="mt-2 text-xs leading-5 text-rose-950/70">{props.state.accessibilityFallbackLabel}</p>
        </div>
        <div class="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <RichActionButton action={props.state.primaryAction} primary onAction={props.onAction} />
          <RichActionButton action={props.state.continueChatAction} onAction={props.onAction} />
        </div>
      </div>

      <div class="mt-5 space-y-4">
        <For each={props.state.sections}>
          {(section) => (
            <section class="min-w-0 rounded-[24px] border border-white/65 bg-white/45 p-3 backdrop-blur sm:rounded-[28px]">
              <div class="flex flex-wrap items-center justify-between gap-2 px-1">
                <div class="min-w-0">
                  <h3 class="break-words text-sm font-semibold text-on-surface">{section.title}</h3>
                  <p class="mt-0.5 break-words text-sm leading-6 text-on-surface-variant">{section.description}</p>
                </div>
                <span class="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {sectionLayoutLabel(section.layoutHint)}
                </span>
              </div>
              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <For each={section.blocks}>
                  {(block) => <RichBlock block={block} onAction={props.onAction} />}
                </For>
              </div>
            </section>
          )}
        </For>
      </div>
    </section>
  );
}

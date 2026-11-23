// @locs-version: 1.0
import { For, Show, type JSX } from "solid-js";
import type { DecisionCardAction, DecisionCardMode, DecisionCardModel } from "@/lib/decisionCardState";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";

function patternLabel(pattern: DecisionCardModel["pattern"]): string {
  return ({
    choose: "Choose", approve_act: "Approve / act", compare: "Compare", notice_decide: "Notice / decide",
    clarify: "Clarify", coordinate: "Coordinate", review: "Review", record: "Record",
  })[pattern];
}

export function DecisionCard(props: {
  card: DecisionCardModel;
  mode?: DecisionCardMode;
  selected?: boolean;
  onSelect?: () => void;
  onAction?: (action: DecisionCardAction) => void;
  hero?: JSX.Element;
  showActions?: boolean;
  showWhyItMatters?: boolean;
  onRecommendationSelect?: () => void;
  class?: string;
}) {
  const card = () => props.card;
  const mode = () => props.mode ?? "standard";
  const wedding = () => card().domain === "wedding";
  const palette = () => wedding()
    ? `${card().recommendation || props.selected ? "border-l-4 border-l-wedding-primary" : ""} rounded-xl border-wedding-border bg-wedding-card text-wedding-ink`
    : "rounded-2xl border-black/10 bg-white/85 text-on-surface";
  const accent = () => wedding()
    ? "bg-wedding-primary font-semibold text-wedding-page hover:bg-wedding-primary/90"
    : "bg-primary text-white";
  const muted = () => wedding() ? "text-wedding-ink/70" : "text-on-surface-variant";
  const text = (value: string | null | undefined, fallback: string) => wedding() ? safeWeddingUiText(value, fallback) : value ?? fallback;
  const regularActions = () => card().actions.filter((action) => action.id !== "why");
  const whyAction = () => card().actions.find((action) => action.id === "why") ?? null;
  const support = () => wedding() ? card().decisionSupport : null;
  const checkableSource = (value: string) => /^https?:\/\//i.test(value);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!props.onSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    props.onSelect();
  };
  const runAction = (event: MouseEvent, action: DecisionCardAction) => {
    event.stopPropagation();
    if (!action.disabledReason) props.onAction?.(action);
  };
  return (
    <article
      class={`min-w-0 border p-3 shadow-card transition duration-200 sm:p-4 ${palette()} ${props.selected ? `ring-2 ${wedding() ? "ring-wedding-primary/30" : "ring-primary/30"}` : ""} ${props.class ?? ""}`}
      role={props.onSelect ? "button" : undefined}
      tabIndex={props.onSelect ? 0 : undefined}
      onClick={() => props.onSelect?.()}
      onKeyDown={handleKeyDown}
      data-decision-card-pattern={card().pattern}
      data-decision-card-domain={card().domain}
      data-decision-card-mode={mode()}
      data-wedding-brand={wedding() ? "v2" : undefined}
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class={`rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${wedding() ? "bg-wedding-primary text-wedding-page" : "bg-primary/10 text-primary"}`}>
          {support()?.statusLabel ?? (wedding() && card().recommendation ? "Best fit" : patternLabel(card().pattern))}
        </span>
        <Show when={card().timeSensitivity}>
          {(time) => <span class={`text-xs font-medium ${muted()}`}>{time().label}</span>}
        </Show>
      </div>
      <h3 class={`${mode() === "glance" || mode() === "compact" ? "mt-2 text-sm" : "mt-3 text-lg"} break-words font-semibold leading-snug`}>{text(card().title, "A wedding decision to review")}</h3>
      <Show when={mode() !== "glance" && props.showWhyItMatters !== false}>
        <p class={`mt-2 break-words text-sm leading-5 ${muted()}`}>{text(card().whyItMatters, "Review the details before you decide.")}</p>
      </Show>
      <Show when={props.hero}>
        {(hero) => <div class="mt-3">{hero()}</div>}
      </Show>
      <Show when={mode() !== "glance" && support()}>
        {(decision) => (
          <div class="mt-3 grid gap-2">
            <Show when={decision().knownFacts.length > 0}>
              <div class="rounded-lg border border-wedding-border bg-white/70 px-3 py-2">
                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-wedding-muted">What we know</p>
                <ul class="mt-1 grid gap-1 text-xs leading-5 text-wedding-ink">
                  <For each={decision().knownFacts}>{(fact) => <li class="break-words [overflow-wrap:anywhere]">• {fact}</li>}</For>
                </ul>
              </div>
            </Show>
            <Show when={decision().oneThingToConfirm}>
              {(missing) => <p class="rounded-lg bg-wedding-status-progress-bg px-3 py-2 text-xs leading-5 text-wedding-status-progress-ink"><strong>Confirm next:</strong> {missing()}</p>}
            </Show>
            <p class="text-xs leading-5 text-wedding-ink"><strong>What this does:</strong> {decision().primaryOutcome}</p>
          </div>
        )}
      </Show>
      <Show when={!props.hero && card().patternSlots.options && card().patternSlots.options!.length > 0 && mode() !== "glance"}>
        <div class="mt-3 grid gap-2">
          <For each={mode() === "compact" ? card().patternSlots.options!.slice(0, 2) : card().patternSlots.options!}>
            {(option) => (
              <div class="min-w-0 rounded-lg border border-current/10 bg-white/65 px-3 py-2">
                <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <span class="min-w-0 break-words text-xs font-semibold [overflow-wrap:anywhere]">{option.name}</span>
                  <Show when={option.recommended}><span class={`shrink-0 text-[10px] font-semibold ${wedding() ? "text-wedding-primary" : "text-primary"}`}>Recommended</span></Show>
                </div>
                <Show when={option.summary}>{(summary) => <p class={`mt-1 break-words text-[11px] leading-4 [overflow-wrap:anywhere] ${muted()}`}>{text(summary(), "Open this option to review the details.")}</p>}</Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={mode() !== "glance" && !support() ? card().recommendation : null}>
        {(recommendation) => (
          <div class={`mt-3 rounded-lg px-3 py-3 ${wedding() ? "bg-wedding-slate" : "bg-primary/5"}`}>
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Recommendation</p>
            <Show when={props.onRecommendationSelect} fallback={<p class="mt-1 break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{text(recommendation().summary, "Review the best-fit option before choosing.")}</p>}>
              <button type="button" class="mt-1 block w-full break-words text-left text-sm font-semibold leading-5 underline decoration-current/35 underline-offset-4 [overflow-wrap:anywhere] hover:decoration-current" onClick={(event) => { event.stopPropagation(); props.onRecommendationSelect?.(); }}>
                {text(recommendation().summary, "Review the best-fit option before choosing.")}
              </button>
            </Show>
            <ul class={`mt-2 grid gap-1 text-xs leading-5 ${muted()}`}>
              <For each={recommendation().reasons.slice(0, 3).filter((reason) => reason.trim().toLowerCase() !== card().whyItMatters.trim().toLowerCase())}>
                {(reason) => <li class="break-words [overflow-wrap:anywhere]">• {text(reason, "Current evidence supports this recommendation.")}</li>}
              </For>
            </ul>
          </div>
        )}
      </Show>
      <Show when={mode() !== "glance" && support() && (card().recommendation || support()?.compromise || support()?.alternative || support()?.unconfirmed || card().evidence.length > 0)}>
        <details class="mt-3 rounded-lg bg-wedding-slate px-3 py-2" data-deck-interactive>
          <summary class="min-h-8 cursor-pointer text-xs font-semibold text-wedding-ink">Recommendation and trade-offs</summary>
          <div class="grid gap-2 pb-1 pt-2 text-xs leading-5 text-wedding-ink/75">
            <Show when={card().recommendation}>{(recommendation) => <p><strong class="text-wedding-ink">Current recommendation:</strong> {recommendation().summary}</p>}</Show>
            <Show when={support()?.compromise}>{(value) => <p><strong class="text-wedding-ink">Compromise:</strong> {value()}</p>}</Show>
            <Show when={support()?.alternative}>{(value) => <p><strong class="text-wedding-ink">Alternative:</strong> {value()}</p>}</Show>
            <Show when={support()?.unconfirmed}>{(value) => <p><strong class="text-wedding-ink">Not confirmed:</strong> {value()}</p>}</Show>
            <Show when={card().evidence.length > 0}>
              <div>
                <p class="font-semibold text-wedding-ink">Evidence to check</p>
                <ul class="mt-1 grid gap-1">
                  <For each={card().evidence.slice(0, 4)}>{(evidence) => (
                    <li class="break-words [overflow-wrap:anywhere]">
                      <Show when={checkableSource(evidence.ref)} fallback={<span>{evidence.label}</span>}>
                        <a class="font-semibold underline decoration-wedding-secondary/40 underline-offset-2" href={evidence.ref} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{evidence.label}</a>
                      </Show>
                    </li>
                  )}</For>
                </ul>
              </div>
            </Show>
          </div>
        </details>
      </Show>
      <Show when={(mode() === "standard" || mode() === "full") && !support()}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={card().evidence.slice(0, 4)}>{(item) => <span class="max-w-full break-words rounded-lg border border-current/10 bg-white/70 px-2 py-1 text-[10px] opacity-75">{text(item.label, "Checked detail")}</span>}</For>
          <span class="rounded-lg border border-current/10 px-2 py-1 text-[10px] opacity-75">{text(card().verification.label, "Details checked")}</span>
        </div>
        <Show when={card().unknowns.length > 0}>
          <p class={`mt-2 break-words rounded-lg px-3 py-2 text-[11px] leading-4 [overflow-wrap:anywhere] ${wedding() ? "bg-wedding-status-progress-bg text-wedding-status-progress-ink" : muted()}`}><strong>Still to confirm:</strong> {text(card().unknowns.join(" "), "A few details")}</p>
        </Show>
        <Show when={(card().patternSlots.reviewItems?.length ?? 0) > 0}>
          <div class="mt-2 flex min-w-0 flex-wrap gap-1.5">
            <For each={card().patternSlots.reviewItems}>{(item) => <span class="max-w-full break-words rounded-lg border border-current/10 px-2 py-1 text-[10px] [overflow-wrap:anywhere]">{text(item, "Detail to review")}</span>}</For>
          </div>
        </Show>
      </Show>
      <Show when={props.showActions !== false}>
      <div class="mt-3 flex items-end justify-between gap-2">
        <div class="flex min-w-0 flex-wrap gap-2"><For each={regularActions()}>
          {(action) => (
            <button
              type="button"
              disabled={Boolean(action.disabledReason)}
              title={action.disabledReason ?? action.effect}
              class={`min-h-11 max-w-full break-words rounded-lg px-4 py-2 text-sm font-semibold [overflow-wrap:anywhere] transition disabled:cursor-not-allowed disabled:opacity-45 ${action.role === "primary" ? accent() : wedding() ? "border border-wedding-secondary bg-white text-wedding-secondary hover:bg-wedding-slate" : "border border-current/15 bg-white/75"}`}
              onClick={(event) => runAction(event, action)}
            >
              {action.label}
            </button>
          )}
        </For></div>
        <Show when={whyAction()}>{(action) => (
          <button
            type="button"
            disabled={Boolean(action().disabledReason)}
            title={action().disabledReason ?? "Show Me Why"}
            aria-label="Show Me Why"
            class={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${wedding() ? "border-wedding-secondary bg-white text-wedding-secondary hover:bg-wedding-slate" : "border-current/15 bg-white/75"}`}
            onClick={(event) => runAction(event, action())}
          >
            ?
          </button>
      )}</Show>
      </div>
      </Show>
    </article>
  );
}

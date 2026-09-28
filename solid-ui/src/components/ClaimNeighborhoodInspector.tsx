// @locs-version: 1.0
import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import type { JSX } from "solid-js";
import { fetchClaimNeighborhood, type AfpMessage, type AfpView, type ClaimNeighborhoodResponse } from "@/lib/api";
import { A2UIRenderer } from "@/components/renderers/A2UIRenderer";
import {
  buildClaimNeighborhoodFailureReceipt,
  type ClaimNeighborhoodFailureReceipt,
} from "@/lib/claimNeighborhoodFailureState";
import {
  CLAIM_NEIGHBORHOOD_STANCES,
  claimNeighborhoodDebugContext,
  readClaimNeighborhoodSelection,
  saveClaimNeighborhoodSelection,
  type ClaimNeighborhoodSelection,
  type ClaimNeighborhoodStance,
} from "@/lib/claimNeighborhoodPreferenceState";
export {
  claimNeighborhoodDebugContext,
  readClaimNeighborhoodPreferences,
  readClaimNeighborhoodSelection,
} from "@/lib/claimNeighborhoodPreferenceState";
export type {
  ClaimNeighborhoodSelection,
  ClaimNeighborhoodStance,
} from "@/lib/claimNeighborhoodPreferenceState";

type ClaimNeighborhoodInspectorProps = {
  messageId: string;
  threadId?: string;
  preferenceScope?: string;
  title?: string;
  description?: string;
  badgeText?: string;
  limitPerGroup?: number;
  containerClass?: string;
  containerStyle?: JSX.CSSProperties;
  headerClass?: string;
  headerStyle?: JSX.CSSProperties;
  titleClass?: string;
  titleStyle?: JSX.CSSProperties;
  badgeClass?: string;
  badgeStyle?: JSX.CSSProperties;
  controlsClass?: string;
  controlsStyle?: JSX.CSSProperties;
  descriptionClass?: string;
  descriptionStyle?: JSX.CSSProperties;
  stanceButtonClass?: (active: boolean) => string;
  stanceButtonStyle?: (active: boolean) => JSX.CSSProperties | undefined;
  selectClass?: string;
  selectStyle?: JSX.CSSProperties;
  loadingClass?: string;
  loadingStyle?: JSX.CSSProperties;
  errorClass?: string;
  errorStyle?: JSX.CSSProperties;
  rendererWrapClass?: string;
  rendererWrapStyle?: JSX.CSSProperties;
};

export function ClaimNeighborhoodInspector(props: ClaimNeighborhoodInspectorProps) {
  const [response, setResponse] = createSignal<ClaimNeighborhoodResponse | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<ClaimNeighborhoodFailureReceipt | null>(null);
  const [stance, setStance] = createSignal<ClaimNeighborhoodStance>("all");
  const [depth, setDepth] = createSignal<1 | 2 | 3>(1);
  const [preferencesLoaded, setPreferencesLoaded] = createSignal(false);
  const [reloadTick, setReloadTick] = createSignal(0);
  let requestId = 0;

  const preferenceScope = createMemo(() => props.preferenceScope ?? "global");
  const selection = createMemo<ClaimNeighborhoodSelection>(() => ({
    stance: stance(),
    depth: depth(),
    preferenceScope: preferenceScope(),
  }));

  createEffect(
    on(
      preferenceScope,
      (scope) => {
        if (typeof localStorage === "undefined") {
          setPreferencesLoaded(true);
          return;
        }
        try {
          const saved = readClaimNeighborhoodSelection(scope);
          setStance(saved.stance);
          setDepth(saved.depth);
        } finally {
          setPreferencesLoaded(true);
        }
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => [preferenceScope(), stance(), depth(), preferencesLoaded()] as const,
      ([scope, currentStance, currentDepth, loaded]) => {
        if (!loaded || typeof localStorage === "undefined") return;
        saveClaimNeighborhoodSelection({
          preferenceScope: scope,
          stance: currentStance,
          depth: currentDepth,
        });
      },
      { defer: true },
    ),
  );

  const message = createMemo<AfpMessage | null>(() => {
    const current = response();
    if (!current?.a2ui) return null;
    const view: AfpView = {
      format: "a2ui.v1",
      content: current.a2ui,
    };
    return {
      id: `claim-neighborhood:${props.messageId}:${stance()}:${depth()}`,
      thread_id: props.threadId ?? props.messageId,
      from: "omnyid://knowledge-curator",
      to: [],
      timestamp: new Date().toISOString(),
      type: "knowledge_claim_neighborhood",
      subtype: "claim_neighborhood",
      content: current.a2ui,
      metadata: {
        source_message_id: props.messageId,
        filters: current.filters,
      },
      views: [view],
      attachments: [],
      references: [],
    };
  });

  const emptyStateText = createMemo(() =>
    response() && !message() ? "No typed claim context is available for this selection yet." : "",
  );

  function retryLoad() {
    setReloadTick((value) => value + 1);
  }

  createEffect(
    on(
      () => [props.messageId, stance(), depth(), reloadTick()] as const,
      async ([messageId, currentStance, currentDepth]) => {
        if (!messageId) {
          setResponse(null);
          setError(null);
          setLoading(false);
          return;
        }
        const activeRequestId = ++requestId;
        setLoading(true);
        setError(null);
        try {
          const next = await fetchClaimNeighborhood(messageId, {
            stance: currentStance,
            depth: currentDepth,
            limit_per_group: props.limitPerGroup ?? 6,
          });
          if (activeRequestId !== requestId) return;
          setResponse(next);
        } catch (fetchError) {
          if (activeRequestId !== requestId) return;
          setResponse(null);
          setError(
            buildClaimNeighborhoodFailureReceipt(
              "Load claim neighborhood",
              fetchError instanceof Error && fetchError.message.trim()
                ? fetchError.message
                : "Claim neighborhood is not indexed yet.",
            ),
          );
        } finally {
          if (activeRequestId !== requestId) return;
          setLoading(false);
        }
      },
    ),
  );

  return (
    <div class={props.containerClass} style={props.containerStyle}>
      <div class={props.headerClass} style={props.headerStyle}>
        <p class={props.titleClass} style={props.titleStyle}>{props.title ?? "Claim neighborhood"}</p>
        <Show when={props.badgeText}>
          <span class={props.badgeClass} style={props.badgeStyle}>{props.badgeText}</span>
        </Show>
      </div>
      <div class={props.controlsClass} style={props.controlsStyle}>
        <For each={CLAIM_NEIGHBORHOOD_STANCES}>
          {(option) => {
            const active = () => stance() === option;
            return (
              <button
                type="button"
                onClick={() => setStance(option)}
                class={props.stanceButtonClass?.(active())}
                style={props.stanceButtonStyle?.(active())}
              >
                {option}
              </button>
            );
          }}
        </For>
        <select
          value={String(depth())}
          onChange={(e) => setDepth(Number(e.currentTarget.value) as 1 | 2 | 3)}
          class={props.selectClass}
          style={props.selectStyle}
        >
          <option value="1">1 hop</option>
          <option value="2">2 hops</option>
          <option value="3">3 hops</option>
        </select>
      </div>
      <Show when={props.description}>
        <p class={props.descriptionClass} style={props.descriptionStyle}>{props.description}</p>
      </Show>
      <Show when={loading()}>
        <p class={props.loadingClass} style={props.loadingStyle}>Loading typed support and refute context...</p>
      </Show>
      <Show when={!loading() && message()}>
        {(resolved) => (
          <div class={props.rendererWrapClass} style={props.rendererWrapStyle}>
            <A2UIRenderer message={resolved()} view={resolved().views[0]} />
          </div>
        )}
      </Show>
      <Show when={!loading() && !message() && error()}>
        <div class={props.errorClass} style={props.errorStyle}>
          <p>{error()?.title}</p>
          <p>{error()?.summary}</p>
          <p>{error()?.nextStep}</p>
          <button
            type="button"
            onClick={retryLoad}
            style={{
              margin: "0.75em 0 0",
              padding: "0.45em 0.85em",
              border: "1px solid currentColor",
              "border-radius": "9999px",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              "font-size": "0.85em",
              "font-weight": "600",
            }}
          >
            Retry neighborhood
          </button>
        </div>
      </Show>
      <Show when={!loading() && !message() && !error() && emptyStateText()}>
        <p class={props.errorClass} style={props.errorStyle}>{emptyStateText()}</p>
      </Show>
    </div>
  );
}

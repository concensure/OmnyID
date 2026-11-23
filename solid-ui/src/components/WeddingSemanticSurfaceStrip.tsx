// @locs-version: 1.0
import { For, Show } from "solid-js";

import type {
  WeddingSemanticSurfacePrimitive,
  WeddingSemanticSurfacePrimitiveKind,
  WeddingSemanticSurfaceState,
} from "@/lib/weddingSemanticUiState";

function primitiveClass(kind: WeddingSemanticSurfacePrimitiveKind): string {
  if (kind === "waiting_dependency") return "border-rose-200 bg-rose-50 text-rose-950";
  if (kind === "decision_comparison") return "border-teal-200 bg-teal-50 text-teal-950";
  if (kind === "approval_surface") return "border-indigo-200 bg-indigo-950 text-white";
  if (kind === "budget_delta") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (kind === "conflict_resolution") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-white/75 text-slate-900";
}

function summaryText(item: WeddingSemanticSurfacePrimitive): string {
  return item.stateLabel || item.summary;
}

export function WeddingSemanticSurfaceStrip(props: {
  state: WeddingSemanticSurfaceState | null | undefined;
  limit?: number;
  label?: string;
  canUsePrimaryAction?: (item: WeddingSemanticSurfacePrimitive) => boolean;
  onPrimaryAction?: (item: WeddingSemanticSurfacePrimitive) => void;
}) {
  const limit = () => props.limit ?? 4;
  const items = () => props.state?.primitives.slice(0, limit()) ?? [];
  const canAct = (item: WeddingSemanticSurfacePrimitive) => {
    return Boolean(
      props.onPrimaryAction
      && item.primaryAction?.enabled
      && (props.canUsePrimaryAction?.(item) ?? true),
    );
  };
  return (
    <Show when={items().length > 0}>
      <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-label={props.label ?? "Wedding planning meaning"}>
        <For each={items()}>
          {(item) => (
            <article class={`min-w-0 rounded-2xl border px-3 py-3 ${primitiveClass(item.primitiveKind)}`}>
              <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <p class="break-words text-[11px] font-semibold uppercase tracking-[0.12em] text-current/65">
                  {item.label}
                </p>
                <Show when={item.requiresApproval}>
                  <span class="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-semibold text-current/70">
                    Approval
                  </span>
                </Show>
              </div>
              <p class="mt-1 break-words text-xs font-semibold text-current">{item.title}</p>
              <p class="mt-1 line-clamp-2 break-words text-[11px] leading-5 text-current/70">
                {summaryText(item)}
              </p>
              <Show when={canAct(item) && item.primaryAction}>
                {(action) => (
                  <button
                    type="button"
                    class="mt-2 rounded-full border border-current/20 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-current transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/25"
                    onClick={() => props.onPrimaryAction?.(item)}
                  >
                    {action().label}
                  </button>
                )}
              </Show>
            </article>
          )}
        </For>
      </div>
    </Show>
  );
}

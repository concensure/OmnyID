// @locs-version: 1.0
import { For, Show } from "solid-js";
import {
  PRIMARY_USE_CASE_OPTIONS,
  primaryUseCaseLabel,
  type PrimaryUseCaseOption,
} from "@/lib/primaryUseCaseProfileState";
import type { PrimaryUseCaseKind, PrimaryUseCaseProfile } from "@/lib/profileLedger";

type Props = {
  current: PrimaryUseCaseProfile | null;
  needsPrompt: boolean;
  saving: boolean;
  error?: string | null;
  onSelect: (kind: PrimaryUseCaseKind) => void;
  onComplete: () => void;
  onDismiss: () => void;
};

function PrimaryUseCaseOptionButton(props: {
  option: PrimaryUseCaseOption;
  disabled: boolean;
  onSelect: (kind: PrimaryUseCaseKind) => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onSelect(props.option.kind)}
      class="rounded-2xl border border-white/45 bg-white/55 px-4 py-3 text-left shadow-[0_10px_28px_rgba(30,41,59,0.08)] transition hover:-translate-y-0.5 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span class="block text-sm font-semibold text-on-surface">{props.option.label}</span>
      <span class="mt-1 block text-xs leading-5 text-on-surface-variant">{props.option.description}</span>
    </button>
  );
}

export function PrimaryUseCasePrompt(props: Props) {
  const currentLabel = () => primaryUseCaseLabel(props.current?.kind);

  return (
    <Show when={props.needsPrompt || props.current}>
      <section class="fixed bottom-5 left-1/2 z-[8500] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.75rem] border border-white/45 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-2xl">
        <Show
          when={props.needsPrompt}
          fallback={
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Primary use case</p>
                <p class="mt-1 text-sm font-semibold text-on-surface">{currentLabel()} is shaping the workspace theme.</p>
                <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                  Mark it complete when this use case is done, and OmnyID will return to the general theme.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={props.saving}
                  onClick={props.onComplete}
                  class="rounded-full bg-on-surface px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-on-surface/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Mark use case complete
                </button>
                <button
                  type="button"
                  onClick={props.onDismiss}
                  class="rounded-full border border-outline-variant/40 bg-white/60 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                >
                  Hide
                </button>
              </div>
            </div>
          }
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Profile setup</p>
              <h2 class="mt-1 text-lg font-semibold text-on-surface">What is OmnyID mainly helping with right now?</h2>
              <p class="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
                This saves to your profile and slightly tunes surfaces, shortcuts, and theme. You can change it later or mark it complete.
              </p>
            </div>
            <button
              type="button"
              onClick={props.onDismiss}
              class="rounded-full border border-outline-variant/35 bg-white/55 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
            >
              Later
            </button>
          </div>

          <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <For each={PRIMARY_USE_CASE_OPTIONS}>
              {(option) => (
                <PrimaryUseCaseOptionButton
                  option={option}
                  disabled={props.saving}
                  onSelect={props.onSelect}
                />
              )}
            </For>
          </div>

          <Show when={props.error}>
            {(error) => (
              <p class="mt-3 rounded-xl border border-red-300/40 bg-red-50/70 px-3 py-2 text-xs text-red-700">
                {error()}
              </p>
            )}
          </Show>
        </Show>
      </section>
    </Show>
  );
}

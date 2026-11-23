// @locs-version: 1.0
import { Show, type JSX } from "solid-js";

export function EmptyState(props: {
  icon?: string;
  title: string;
  body: string;
  action?: JSX.Element;
  class?: string;
}) {
  return (
    <div class={`rounded-2xl border border-white/35 bg-white/30 px-5 py-5 text-center shadow-sm backdrop-blur-sm ${props.class ?? ""}`}>
      <Show when={props.icon}>
        <div class="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/45 bg-white/55 text-xl text-on-surface-variant" aria-hidden="true">
          {props.icon}
        </div>
      </Show>
      <p class="text-sm font-semibold text-on-surface">{props.title}</p>
      <p class="mt-1 text-sm leading-6 text-on-surface-variant">{props.body}</p>
      <Show when={props.action}>
        <div class="mt-3 flex justify-center">{props.action}</div>
      </Show>
    </div>
  );
}

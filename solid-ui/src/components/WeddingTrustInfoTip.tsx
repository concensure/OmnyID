import { For } from "solid-js";

export type WeddingTrustInfoItem = {
  question: string;
  answer: string;
};

/** Contextual, keyboard-native trust disclosure for consequential wedding moments. */
export function WeddingTrustInfoTip(props: {
  label: string;
  items: readonly WeddingTrustInfoItem[];
  class?: string;
}) {
  return (
    <details class={`rounded-lg border border-wedding-border bg-white text-wedding-ink ${props.class ?? ""}`}>
      <summary class="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-xs font-bold">
        <span aria-hidden="true" class="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-wedding-primary text-[11px] text-wedding-primary">i</span>
        <span>{props.label}</span>
      </summary>
      <dl class="space-y-3 border-t border-wedding-border px-3 py-3">
        <For each={props.items}>{(item) => (
          <div>
            <dt class="text-xs font-bold text-wedding-ink">{item.question}</dt>
            <dd class="mt-1 text-xs leading-5 text-wedding-ink/75">{item.answer}</dd>
          </div>
        )}</For>
      </dl>
    </details>
  );
}

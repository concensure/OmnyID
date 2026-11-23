// @locs-version: 1.0
import type { JSX } from "solid-js";

export function WeddingInlineHelpNote(props: { children: JSX.Element; class?: string }) {
  return (
    <aside class={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950 ${props.class ?? ""}`}>
      <span aria-hidden="true">💡 </span>{props.children}
    </aside>
  );
}

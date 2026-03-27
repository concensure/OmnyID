import type { JSX } from "solid-js";

export function GlassPanel(props: { children: JSX.Element; class?: string }) {
  return (
    <section
      class={`glass-surface rounded-2xl border border-white/45 shadow-panel ${props.class ?? ""}`}
    >
      {props.children}
    </section>
  );
}

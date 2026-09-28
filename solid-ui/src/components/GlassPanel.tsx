import type { JSX } from "solid-js";

export function GlassPanel(props: JSX.HTMLAttributes<HTMLElement> & { children: JSX.Element }) {
  return (
    <section
      {...props}
      class={`glass-surface rounded-2xl border border-white/45 shadow-panel ${props.class ?? ""}`}
    >
      {props.children}
    </section>
  );
}

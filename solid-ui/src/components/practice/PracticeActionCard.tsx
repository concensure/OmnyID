import { A2UIRenderer } from "@/components/renderers/A2UIRenderer";
import { ViewportProvider } from "@/context/ViewportContext";
import type { AfpMessage } from "@/lib/api";
import { practiceActionLabels, type PracticeBootstrap } from "@/lib/weddingPracticeState";

/** Presentation adapter only; this synthetic view is never appended as an AFP event. */
export function PracticeActionCard(props: { card: NonNullable<PracticeBootstrap["next_action"]>; generatedAt: string; href: string; open: (event: MouseEvent) => void }) {
  const message = (): AfpMessage => ({
    id: "practice-home-projection", thread_id: props.card.plan.thread_id, from: "practice-projection",
    timestamp: props.generatedAt, type: "ui_projection", views: [], attachments: [],
    content: { schema_version: "a2ui.v1", title: props.card.client_label,
      nodes: [{ id: "next-action", type: "text", props: { label: "Next action", value: practiceActionLabels[props.card.action] } }] },
  });
  return <section class="practice-card practice-priority" aria-label="Highest priority">
    <p class="practice-eyebrow">Needs your attention</p>
    <ViewportProvider><A2UIRenderer message={message()} /></ViewportProvider>
    <p>{props.card.due_at ? `Due ${new Date(props.card.due_at).toLocaleString()}` : "No deadline set"}</p>
    <a class="practice-primary" href={props.href} onClick={props.open}>View client summary</a>
  </section>;
}

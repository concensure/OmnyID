// @locs-version: 1.0
import { createEffect, createSignal, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { weddingGeneratedArtifactToAfpSendInput } from "@/lib/weddingArtifactAfpProjectionState";
import type { WeddingDecisionResearchState } from "@/lib/weddingDecisionResearchState";

const savedResearchArtifactIds = new Set<string>();

export function WeddingDecisionResearchDetail(props: {
  research: WeddingDecisionResearchState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  onOpenDocuments: (artifactId: string) => void;
  onClose: () => void;
}) {
  const [saveStarted, setSaveStarted] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);

  createEffect(() => {
    const generated = props.research.generatedArtifact;
    if (!generated || !props.saveProjection || saveStarted() || savedResearchArtifactIds.has(generated.summary.id)) return;
    setSaveStarted(true);
    savedResearchArtifactIds.add(generated.summary.id);
    void props.saveProjection(weddingGeneratedArtifactToAfpSendInput(generated))
      .then(() => {
        setNotice("Research brief saved to Documents.");
        props.onRefreshWorkspace?.();
      })
      .catch(() => {
        savedResearchArtifactIds.delete(generated.summary.id);
        setNotice("The brief is available here, but could not be saved to Documents yet.");
      });
  });

  const artifactId = () => props.research.existingArtifactId ?? props.research.generatedArtifact?.summary.id ?? null;

  return <section class="rounded-xl border border-pink-200 bg-white p-3 text-pink-950" aria-label="Decision research detail">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-pink-900/70">Research detail</p>
        <p class="mt-1 text-xs leading-5 text-pink-950/70">Readable planning evidence is shown here and kept in Documents when generated.</p>
      </div>
      <button type="button" class="min-h-9 rounded-full border border-pink-200 bg-pink-50 px-3 text-xs font-semibold" onClick={props.onClose}>Close</button>
    </div>
    <div class="md-prose mt-3 max-w-none break-words text-sm leading-6" innerHTML={renderMarkdown(props.research.detailMarkdown)} />
    <Show when={notice()}>{(message) => <p role="status" class="mt-3 text-xs font-semibold text-pink-800">{message()}</p>}</Show>
    <Show when={artifactId()}>{(id) => <button type="button" class="mt-3 min-h-10 rounded-lg border border-pink-300 bg-white px-3 text-xs font-semibold text-pink-900" onClick={() => props.onOpenDocuments(id())}>Open in Documents</button>}</Show>
  </section>;
}

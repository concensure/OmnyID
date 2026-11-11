// @locs-version: 1.0
import { createEffect, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import { WeddingVendorInlineMap } from "@/components/WeddingVendorInlineMap";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { weddingGeneratedArtifactToAfpSendInput } from "@/lib/weddingArtifactAfpProjectionState";
import type { WeddingDecisionResearchState } from "@/lib/weddingDecisionResearchState";
import { phoneTelHref } from "@/lib/phoneTelHref";

const savedResearchArtifactIds = new Set<string>();

export function WeddingDecisionResearchDetail(props: {
  research: WeddingDecisionResearchState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  onOpenDocuments: (artifactId: string) => void;
  vendors?: readonly WeddingVendorChoiceCardData[];
  onEmailVendor?: (vendor: WeddingVendorChoiceCardData) => void;
  onClose: () => void;
}) {
  const [saveStarted, setSaveStarted] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [mapVendorId, setMapVendorId] = createSignal<string | null>(null);

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
    <Show when={(props.vendors?.length ?? 0) > 0}>
      <div class="mt-3 grid gap-2" aria-label="Vendor contact details">
        <For each={props.vendors?.slice(0, 3) ?? []}>{(vendor) => <section class="rounded-lg border border-pink-100 bg-pink-50/40 p-3">
          <p class="text-sm font-semibold text-pink-950">{vendor.title}</p>
          <div class="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <Show when={vendor.websiteUrl}>{(url) => <a href={url()} target="_blank" rel="noreferrer" class="min-h-9 rounded-lg border border-pink-200 bg-white px-3 py-2 text-pink-900 underline">Website</a>}</Show>
            <Show when={Boolean(vendor.email)}><button type="button" class="min-h-9 rounded-lg border border-pink-200 bg-white px-3 text-pink-900 underline" onClick={() => props.onEmailVendor?.(vendor)}>Email</button></Show>
            <Show when={phoneTelHref(vendor.phone)}>{(href) => <a href={href()} class="min-h-9 rounded-lg border border-pink-200 bg-white px-3 py-2 text-pink-900 underline">Phone</a>}</Show>
            <Show when={Boolean(vendor.address)}><button type="button" class="min-h-9 rounded-lg border border-pink-200 bg-white px-3 text-pink-900 underline" onClick={() => setMapVendorId((current) => current === vendor.choiceId ? null : vendor.choiceId)}>Address</button></Show>
          </div>
          <Show when={mapVendorId() === vendor.choiceId && vendor.address}>{(address) => <WeddingVendorInlineMap address={address()} externalMapUrl={vendor.mapUrl} />}</Show>
        </section>}</For>
      </div>
    </Show>
    <Show when={notice()}>{(message) => <p role="status" class="mt-3 text-xs font-semibold text-pink-800">{message()}</p>}</Show>
    <Show when={artifactId()}>{(id) => <button type="button" class="mt-3 min-h-10 rounded-lg border border-pink-300 bg-white px-3 text-xs font-semibold text-pink-900" onClick={() => props.onOpenDocuments(id())}>Open in Documents</button>}</Show>
  </section>;
}

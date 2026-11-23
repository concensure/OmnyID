import { For, Show } from "solid-js";

import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import { buildWeddingNormalizedQuoteState } from "@/lib/weddingNormalizedQuoteState";

type QuoteArtifact = WeddingWorkspaceArtifactPreview & { preview: Extract<NonNullable<WeddingWorkspaceArtifactPreview["preview"]>, { kind: "quote" }> };

function quoteArtifact(value: WeddingWorkspaceArtifactPreview): value is QuoteArtifact {
  return value.preview?.kind === "quote";
}

function distinct(values: readonly string[]): boolean {
  return new Set(values.map((value) => value.trim().toLowerCase())).size > 1;
}

export function WeddingQuoteEvidenceComparison(props: {
  artifacts: readonly WeddingWorkspaceArtifactPreview[];
  onOpenArtifact: (artifactId: string) => void;
}) {
  const quotes = () => props.artifacts.filter(quoteArtifact).slice(0, 3);
  const value = (artifact: QuoteArtifact, row: "availability" | "cost" | "inclusions" | "adjustments" | "outstanding") => {
    const state = buildWeddingNormalizedQuoteState(artifact.preview);
    if (row === "availability") return state.eventBasis.find((item) => item.label === "Availability")?.value || "Unknown";
    if (row === "cost") return state.comparableTotalLabel || "Unknown";
    if (row === "inclusions") return state.inclusions.join(", ") || "Unknown";
    if (row === "adjustments") return state.adjustments.join(", ") || "None identified";
    return state.questions.join("; ") || "None identified";
  };
  const rows = [
    { id: "availability", label: "Date availability" },
    { id: "cost", label: "Cost for the agreed brief" },
    { id: "inclusions", label: "Included services" },
    { id: "adjustments", label: "Required adjustments" },
    { id: "outstanding", label: "Outstanding issue" },
  ] as const;

  return <Show when={quotes().length > 1}>
    <section class="mt-4 rounded-xl border border-wedding-border bg-white p-3" aria-label="Evidence-backed quote comparison">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div><p class="text-sm font-bold text-wedding-ink">Compare like with like</p><p class="mt-1 text-xs leading-5 text-wedding-ink/65">Differences are highlighted. A lower estimate with exclusions is not treated as equivalent to a comprehensive quote.</p></div>
        <span class="rounded-full bg-wedding-slate px-2.5 py-1 text-xs font-semibold text-wedding-ink/70">{quotes().length} quotes</span>
      </div>
      <div class="mt-3 overflow-x-auto">
        <table class="min-w-[44rem] border-collapse text-left text-sm">
          <thead><tr><th class="border-b border-wedding-border p-2">Decision factor</th><For each={quotes()}>{(artifact) => <th class="border-b border-wedding-border p-2">{artifact.preview.vendorName}</th>}</For></tr></thead>
          <tbody><For each={rows}>{(row) => {
            const values = () => quotes().map((artifact) => value(artifact, row.id));
            return <tr>
              <th class="border-b border-wedding-border p-2 align-top text-xs font-bold uppercase tracking-wide text-wedding-ink/60">{row.label}</th>
              <For each={quotes()}>{(artifact) => <td class={`border-b border-wedding-border p-2 align-top leading-5 ${distinct(values()) ? "bg-amber-50/70" : ""}`}>
                <span class={value(artifact, row.id) === "Unknown" ? "font-semibold text-slate-600" : "text-wedding-ink"}>{value(artifact, row.id)}</span>
                <Show when={row.id === "cost" || row.id === "inclusions"}><button type="button" class="mt-2 block min-h-9 text-xs font-bold text-wedding-secondary underline" onClick={() => props.onOpenArtifact(artifact.artifactId)}>View source or correct</button></Show>
              </td>}</For>
            </tr>;
          }}</For></tbody>
        </table>
      </div>
      <p class="mt-3 text-xs leading-5 text-wedding-ink/65">Unknown means the source does not establish the fact. It is not scored as a failed requirement.</p>
    </section>
  </Show>;
}

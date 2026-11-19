import { For, Show, createMemo, createSignal } from "solid-js";

import type { WeddingArtifactQuotePreview, WeddingArtifactQuoteScenarioItem } from "@/lib/weddingArtifactPreviewState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import {
  calculateWeddingQuoteScenario,
  weddingQuoteScenarioDecision,
  type WeddingQuoteScenarioItemEdit,
} from "@/lib/weddingQuoteScenarioState";
import type { WeddingQuoteScenarioChoice } from "@/lib/weddingQuoteScenarioChoiceState";

type QuoteArtifact = WeddingWorkspaceArtifactPreview & { preview: WeddingArtifactQuotePreview };

function money(value: number | null, currency = "AUD"): string {
  return value === null ? "Not established" : new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
}

function itemBasis(item: WeddingArtifactQuoteScenarioItem): string {
  if (item.priceBasis === "per_person") return "per guest";
  if (item.priceBasis === "per_hour") return "per hour";
  if (item.priceBasis === "per_item") return "per item";
  if (item.priceBasis === "minimum_spend") return "minimum spend";
  return item.priceBasis.replace("_", " ");
}

export function WeddingQuoteScenarioComparison(props: {
  artifacts: readonly QuoteArtifact[];
  defaultEventDate?: string | null;
  defaultGuestCount?: number | null;
  defaultDurationHours?: number | null;
  defaultWeddingBudget?: number | null;
  onOpenArtifact?: (artifactId: string) => void;
  onSaveChoice?: (input: {
    choice: WeddingQuoteScenarioChoice;
    preferredVendorName: string | null;
    quoteArtifactIds: string[];
    eventDate: string;
    guestCount: number;
    durationHours: number;
    weddingBudget: number | null;
    tradeoff: string;
    recommendation: string;
    missingFact: string | null;
  }) => Promise<void>;
}) {
  const firstQuote = () => props.artifacts[0]?.preview;
  const [eventDate, setEventDate] = createSignal(props.defaultEventDate || firstQuote()?.eventDate || "");
  const [guestCount, setGuestCount] = createSignal(props.defaultGuestCount || firstQuote()?.guestCount || 100);
  const [durationHours, setDurationHours] = createSignal(props.defaultDurationHours || firstQuote()?.quotedDurationHours || 6);
  const [weddingBudget, setWeddingBudget] = createSignal<number | null>(props.defaultWeddingBudget ?? null);
  const [edits, setEdits] = createSignal<Record<string, Record<string, WeddingQuoteScenarioItemEdit>>>({});
  const [extras, setExtras] = createSignal<Record<string, WeddingArtifactQuoteScenarioItem[]>>({});
  const [extraDraft, setExtraDraft] = createSignal<Record<string, { label: string; amount: string; quantity: string; basis: WeddingArtifactQuoteScenarioItem["priceBasis"] }>>({});
  const [choice, setChoice] = createSignal("Keep open");
  const [savingChoice, setSavingChoice] = createSignal(false);
  const [choiceNotice, setChoiceNotice] = createSignal<string | null>(null);

  const context = createMemo(() => ({ eventDate: eventDate(), guestCount: guestCount(), durationHours: durationHours(), weddingBudget: weddingBudget() }));
  const results = createMemo(() => props.artifacts.map((artifact) => ({
    artifact,
    result: calculateWeddingQuoteScenario({ quote: artifact.preview, context: context(), edits: edits()[artifact.artifactId], extraItems: extras()[artifact.artifactId] }),
  })));
  const decision = createMemo(() => weddingQuoteScenarioDecision(results().map((entry) => ({ vendorName: entry.artifact.preview.vendorName, result: entry.result }))));

  function updateItem(artifactId: string, item: WeddingArtifactQuoteScenarioItem, change: Partial<WeddingQuoteScenarioItemEdit>): void {
    setEdits((current) => ({
      ...current,
      [artifactId]: {
        ...(current[artifactId] ?? {}),
        [item.id]: {
          included: current[artifactId]?.[item.id]?.included ?? item.includedInQuotedTotal,
          quantity: current[artifactId]?.[item.id]?.quantity ?? item.quantity,
          ...change,
        },
      },
    }));
  }

  function addExtra(artifactId: string): void {
    const draft = extraDraft()[artifactId];
    const amount = Number(draft?.amount);
    const quantity = Number(draft?.quantity || "1");
    if (!draft?.label.trim() || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(quantity) || quantity < 0) return;
    const item: WeddingArtifactQuoteScenarioItem = {
      id: `scenario-extra:${artifactId}:${Date.now()}`,
      label: draft.label.trim(),
      inclusion: "optional",
      priceBasis: draft.basis,
      unitAmount: amount,
      quantity,
      includedInQuotedTotal: false,
      minimumSpendEligible: false,
      sourceSnippet: "Couple-added scenario item; not part of the original vendor quote.",
    };
    setExtras((current) => ({ ...current, [artifactId]: [...(current[artifactId] ?? []), item] }));
    setExtraDraft((current) => ({ ...current, [artifactId]: { label: "", amount: "", quantity: "1", basis: "fixed" } }));
  }

  async function saveChoice(label: string): Promise<void> {
    const currentPreferredVendorName = choice().startsWith("Prefer ")
      ? choice().slice("Prefer ".length)
      : null;
    const preferredVendorName = label.startsWith("Prefer ")
      ? label.slice("Prefer ".length)
      : label === "Confirm choice"
        ? currentPreferredVendorName
        : null;
    if (label === "Confirm choice" && !preferredVendorName) {
      setChoiceNotice("Choose a preferred quote before confirming it.");
      return;
    }
    const choiceKind: WeddingQuoteScenarioChoice = label === "Confirm choice" ? "confirmed" : preferredVendorName ? "prefer" : "open";
    setChoice(label);
    setChoiceNotice(null);
    if (!props.onSaveChoice) {
      setChoiceNotice("This choice is held in the comparison until wedding sync is available.");
      return;
    }
    setSavingChoice(true);
    try {
      await props.onSaveChoice({
        choice: choiceKind,
        preferredVendorName,
        quoteArtifactIds: props.artifacts.map((artifact) => artifact.artifactId),
        eventDate: context().eventDate,
        guestCount: context().guestCount,
        durationHours: context().durationHours,
        weddingBudget: context().weddingBudget,
        tradeoff: decision().tradeoff,
        recommendation: decision().recommendation,
        missingFact: decision().missingFact,
      });
      setChoiceNotice(choiceKind === "open" ? "The quote decision remains open in this wedding." : "The quote preference was saved to this wedding.");
    } catch {
      setChoiceNotice("The choice could not be saved. The original quotes and scenario remain unchanged.");
    } finally {
      setSavingChoice(false);
    }
  }

  return (
    <section class="rounded-xl border border-wedding-border bg-wedding-page p-3 sm:p-4" aria-label="Wedding quote scenario comparison">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.12em] text-wedding-primary">Common comparison basis</p>
        <h4 class="mt-1 font-display text-lg font-semibold text-wedding-ink">Compare the same wedding</h4>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/65">The original vendor quotes remain unchanged. Edits below are labelled Scenario estimate until the vendor confirms them.</p>
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="text-sm font-semibold text-wedding-ink">Wedding date<input type="date" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" value={eventDate()} onInput={(event) => setEventDate(event.currentTarget.value)} /></label>
        <label class="text-sm font-semibold text-wedding-ink">Guests<input type="number" min="1" step="1" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" value={guestCount()} onInput={(event) => setGuestCount(Math.max(1, Number(event.currentTarget.value) || 1))} /></label>
        <label class="text-sm font-semibold text-wedding-ink">Event hours<input type="number" min="1" step="1" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" value={durationHours()} onInput={(event) => setDurationHours(Math.max(1, Number(event.currentTarget.value) || 1))} /></label>
        <label class="text-sm font-semibold text-wedding-ink">Wedding budget (AUD)<input type="number" min="0" step="1" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" value={weddingBudget() ?? ""} placeholder="Optional" onInput={(event) => setWeddingBudget(event.currentTarget.value ? Math.max(0, Number(event.currentTarget.value)) : null)} /></label>
      </div>

      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <For each={results()}>{({ artifact, result }) => {
          const allItems = () => [...(artifact.preview.scenarioItems ?? []), ...(extras()[artifact.artifactId] ?? [])];
          const draft = () => extraDraft()[artifact.artifactId] ?? { label: "", amount: "", quantity: "1", basis: "fixed" as const };
          return <article class="rounded-xl border border-wedding-border bg-white p-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div><h5 class="font-semibold text-wedding-ink">{artifact.preview.vendorName}</h5><p class="mt-1 text-xs text-wedding-ink/60">Original: {money(result.originalTotal, artifact.preview.currency)}</p></div>
              <span class={`rounded-full px-2.5 py-1 text-xs font-bold ${result.label === "Scenario estimate" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{result.label}</span>
            </div>
            <p class="mt-3 text-2xl font-bold text-wedding-primary">{money(result.scenarioTotal, artifact.preview.currency)}</p>
            <Show when={result.remainingBudget !== null}><p class={`mt-1 text-sm font-semibold ${result.remainingBudget! < 0 ? "text-red-700" : "text-emerald-800"}`}>{result.remainingBudget! < 0 ? `${money(Math.abs(result.remainingBudget!))} over the wedding budget` : `${money(result.remainingBudget)} remains in the wedding budget`}</p></Show>

            <Show when={allItems().length > 0} fallback={<p class="mt-3 rounded-lg bg-wedding-slate p-3 text-sm leading-6 text-wedding-ink/65">No priced optional rows were extracted. Add a scenario item below or open the source to correct the normalized quote.</p>}>
              <div class="mt-3 space-y-2"><For each={allItems()}>{(item) => {
                const edit = () => edits()[artifact.artifactId]?.[item.id];
                const removable = item.inclusion === "optional" || item.inclusion === "conditional" || item.inclusion === "excluded";
                return <div class="grid gap-2 rounded-lg border border-wedding-border p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div class="min-w-0"><p class="break-words text-sm font-semibold">{item.label}</p><p class="mt-0.5 text-xs text-wedding-ink/60">{item.unitAmount === null ? "Amount unknown" : `${money(item.unitAmount, artifact.preview.currency)} ${itemBasis(item)}`} · {item.inclusion}<br /><span class="break-words">Source: {item.sourceSnippet}</span></p></div>
                  <label class="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" disabled={!removable && item.includedInQuotedTotal} checked={edit()?.included ?? item.includedInQuotedTotal} onChange={(event) => updateItem(artifact.artifactId, item, { included: event.currentTarget.checked })} />Include</label>
                  <label class="text-xs font-semibold">Qty<input type="number" min="0" step="1" class="ml-2 h-10 w-20 rounded-lg border border-wedding-border px-2" value={edit()?.quantity ?? item.quantity} onInput={(event) => updateItem(artifact.artifactId, item, { quantity: Math.max(0, Number(event.currentTarget.value) || 0) })} /></label>
                </div>;
              }}</For></div>
            </Show>

            <details class="mt-3 rounded-lg border border-wedding-border p-3">
              <summary class="cursor-pointer text-sm font-semibold text-wedding-primary">Add an optional scenario item</summary>
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                <label class="text-xs font-semibold">Item<input class="mt-1 min-h-10 w-full rounded-lg border border-wedding-border px-2" value={draft().label} onInput={(event) => setExtraDraft((current) => ({ ...current, [artifact.artifactId]: { ...draft(), label: event.currentTarget.value } }))} /></label>
                <label class="text-xs font-semibold">Amount<input type="number" min="0" step="1" class="mt-1 min-h-10 w-full rounded-lg border border-wedding-border px-2" value={draft().amount} onInput={(event) => setExtraDraft((current) => ({ ...current, [artifact.artifactId]: { ...draft(), amount: event.currentTarget.value } }))} /></label>
                <label class="text-xs font-semibold">Basis<select class="mt-1 min-h-10 w-full rounded-lg border border-wedding-border px-2" value={draft().basis} onChange={(event) => setExtraDraft((current) => ({ ...current, [artifact.artifactId]: { ...draft(), basis: event.currentTarget.value as WeddingArtifactQuoteScenarioItem["priceBasis"] } }))}><option value="fixed">Fixed</option><option value="per_person">Per guest</option><option value="per_item">Per item</option><option value="per_hour">Per hour</option></select></label>
                <label class="text-xs font-semibold">Quantity<input type="number" min="0" step="1" class="mt-1 min-h-10 w-full rounded-lg border border-wedding-border px-2" value={draft().quantity} onInput={(event) => setExtraDraft((current) => ({ ...current, [artifact.artifactId]: { ...draft(), quantity: event.currentTarget.value } }))} /></label>
              </div>
              <button type="button" class="mt-2 min-h-10 rounded-lg border border-wedding-primary px-3 text-sm font-semibold text-wedding-primary" onClick={() => addExtra(artifact.artifactId)}>Add to scenario</button>
            </details>

            <Show when={result.calculationLines.length > 0}><div class="mt-3 rounded-lg bg-wedding-slate p-3"><p class="text-xs font-bold uppercase tracking-wide text-wedding-ink/60">Calculation</p><ul class="mt-1 space-y-1 text-xs"><For each={result.calculationLines}>{(line) => <li>{line}</li>}</For></ul></div></Show>
            <Show when={result.confirmationReasons.length > 0}><div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3"><p class="text-sm font-bold text-amber-950">Vendor confirmation needed</p><ul class="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-950"><For each={result.confirmationReasons}>{(reason) => <li>{reason}</li>}</For></ul></div></Show>
            <button type="button" class="mt-3 min-h-10 text-sm font-bold text-wedding-secondary underline" onClick={() => props.onOpenArtifact?.(artifact.artifactId)}>View original source or correct extraction</button>
          </article>;
        }}</For>
      </div>

      <section class="mt-4 rounded-xl border border-wedding-primary/30 bg-white p-4" aria-label="Quote decision support">
        <p class="text-xs font-bold uppercase tracking-[0.12em] text-wedding-primary">Decision support</p>
        <p class="mt-2 text-sm leading-6"><strong>Trade-off:</strong> {decision().tradeoff}</p>
        <p class="mt-1 text-sm leading-6"><strong>Conditional recommendation:</strong> {decision().recommendation}</p>
        <Show when={decision().missingFact}><p class="mt-1 text-sm leading-6"><strong>Most material missing fact:</strong> {decision().missingFact}</p></Show>
        <div class="mt-3 flex flex-wrap gap-2"><For each={[...props.artifacts.map((artifact) => `Prefer ${artifact.preview.vendorName}`), "Confirm choice", "Keep open"]}>{(label) => <button type="button" disabled={savingChoice()} aria-pressed={choice() === label} class={`min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50 ${choice() === label ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border"}`} onClick={() => void saveChoice(label)}>{label}</button>}</For></div>
        <p class="mt-2 text-xs text-wedding-ink/60">Current comparison choice: {choice()}. Confirming here does not book, pay, or contact a vendor.</p>
        <Show when={choiceNotice()}>{(message) => <p class="mt-2 text-sm text-wedding-ink/70" role="status">{message()}</p>}</Show>
      </section>
    </section>
  );
}

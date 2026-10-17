// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import { WeddingVendorChoiceCard } from "@/components/WeddingVendorChoiceCard";
import { WeddingVendorOutreachComposer } from "@/components/WeddingVendorOutreachComposer";
import type { FocusDeckItem } from "@/lib/mobileFocusHomeState";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";

export function WeddingVendorDeckCard(props: {
  item: FocusDeckItem;
  gmailConnected?: boolean;
  onContactVendor: (card: NonNullable<FocusDeckItem["vendorComparison"]>["cards"][number], artifactId: string, intent: WeddingVendorChoiceIntent) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onRetryOutreach?: (choiceId: string) => void;
  onConnectGmail?: () => void;
  onDone: () => void;
}) {
  const [index, setIndex] = createSignal(0);
  const [dismissedChoiceIds, setDismissedChoiceIds] = createSignal<Set<string>>(new Set());
  const cards = () => (props.item.vendorComparison?.cards ?? []).filter((card) => !dismissedChoiceIds().has(card.choiceId));
  const selected = () => cards()[Math.min(index(), Math.max(0, cards().length - 1))] ?? null;
  const move = (delta: number) => {
    if (cards().length === 0) return;
    setIndex((current) => (current + delta + cards().length) % cards().length);
  };
  return (
    <section class="flex min-h-0 flex-1 flex-col" aria-label={props.item.title}>
      <Show when={props.item.kind === "vendor_comparison"} fallback={(
        <div class="rounded-2xl border border-wedding-muted bg-white p-4 shadow-card">
          <p class="text-xs font-bold uppercase tracking-wide text-wedding-accent">{props.item.kind.replace("vendor_", "vendor ")}</p>
          <h3 class="mt-2 text-lg font-bold text-wedding-text">{props.item.title}</h3>
          <p class="mt-2 text-sm leading-6 text-wedding-muted">{props.item.whyNowLabel}</p>
          <Show when={props.item.kind === "vendor_draft" && props.item.vendorOutreachFlow} fallback={(
            <button type="button" class="mt-4 min-h-12 w-full rounded-xl border-2 border-wedding-cta bg-white px-4 text-sm font-bold text-wedding-text" onClick={props.onDone}>{props.item.recommendedActionLabel}</button>
          )}>
            {(flow) => (
              <WeddingVendorOutreachComposer
                flow={flow()}
                busy={flow().stage === "drafting" || flow().stage === "sending"}
                gmailConnected={Boolean(props.gmailConnected)}
                onBodyChange={(body) => props.onOutreachBodyChange?.(flow().choiceId, body)}
                onSend={() => props.onSendOutreach?.(flow().choiceId)}
                onCancel={() => props.onCancelOutreach?.(flow().choiceId)}
                onRetryDraft={() => props.onRetryOutreach?.(flow().choiceId)}
                onConnectGmail={() => props.onConnectGmail?.()}
              />
            )}
          </Show>
        </div>
      )}>
        <div class="min-h-0" role="region" aria-roledescription="carousel" aria-label="Ranked wedding vendors" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
          <Show when={selected()} keyed>{(card) => <WeddingVendorChoiceCard card={card} onContactVendor={(choice, intent) => props.onContactVendor(choice, props.item.vendorComparison?.artifactId ?? "", intent)} onReviewQuote={() => props.onDone()} onReviewBooking={() => props.onDone()} onViewEvidence={() => props.onDone()} onNotForUs={(choice) => { setDismissedChoiceIds((current) => new Set([...current, choice.choiceId])); return true; }} />}</Show>
          <div class="mt-2 flex items-center justify-between gap-3">
            <button type="button" class="min-h-12 min-w-12 rounded-full border border-wedding-muted bg-white text-lg font-bold text-wedding-accent" aria-label="Previous vendor" onClick={() => move(-1)}>←</button>
            <div class="flex gap-2" aria-live="polite">
              <For each={cards()}>{(_card, cardIndex) => <span role="img" class={`h-2.5 w-2.5 rounded-full ${cardIndex() === index() ? "bg-wedding-accent" : "bg-wedding-muted"}`} aria-label={`Vendor ${cardIndex() + 1} of ${cards().length}`} />}</For>
            </div>
            <button type="button" class="min-h-12 min-w-12 rounded-full border border-wedding-muted bg-white text-lg font-bold text-wedding-accent" aria-label="Next vendor" onClick={() => move(1)}>→</button>
          </div>
        </div>
      </Show>
    </section>
  );
}

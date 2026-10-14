// @locs-version: 1.0
// @module-id: ui.a2ui-card
// @primary-capability: user-composable-agent-card
import { createSignal, Show } from "solid-js";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { dispatchA2uiCardRequestEvent } from "@/lib/a2uiEvents";
import type { OverlayCardGeneratedContent, OverlayCardType } from "@/lib/viewCustomizerLocalState";

const CARD_TYPES = [
  { id: "text", label: "Text", icon: "P", hint: "Paragraph or notes" },
  { id: "callout", label: "Callout", icon: "!", hint: "Highlighted insight" },
  { id: "stats", label: "Stats", icon: "#", hint: "Key metrics grid" },
  { id: "table", label: "Table", icon: "[]", hint: "Rows and columns" },
  { id: "custom", label: "Ask Agent", icon: "*", hint: "Describe anything" },
] as const;

type CardType = OverlayCardType;
type GeneratedContent = OverlayCardGeneratedContent;

export type A2UICardProps = {
  personaTone?: string;
  onDismiss?: () => void;
  initialCardType?: CardType;
  initialContent?: GeneratedContent;
  onContentChange?: (content: GeneratedContent, cardType: CardType) => void;
};

export function A2UICard(props: A2UICardProps) {
  const [cardType, setCardType] = createSignal<CardType | null>(props.initialCardType ?? props.initialContent?.type ?? null);
  const [chatInput, setChatInput] = createSignal(props.initialContent?.body ?? "");
  const [generated, setGenerated] = createSignal<GeneratedContent | null>(props.initialContent ?? null);
  const [busy, setBusy] = createSignal(false);
  const [attached, setAttached] = createSignal<{ name: string; url: string; isImage: boolean } | null>(null);
  const [confirmed, setConfirmed] = createSignal(false);

  let fileRef: HTMLInputElement | undefined;

  function commit(content: GeneratedContent) {
    setGenerated(content);
    setCardType(content.type);
    props.onContentChange?.(content, content.type);
  }

  function statPairs(prompt: string): Array<{ label: string; value: string }> {
    const invitation = prompt.match(/(?:invitations?\s*(?:sent)?|sent\s+invitations?)\D{0,8}(\d+)/i)?.[1];
    const rsvps = prompt.match(/(?:rsvps?\s*(?:received)?|responses?\s*(?:received)?)\D{0,8}(\d+)/i)?.[1];
    if (/invitation|rsvp/i.test(prompt)) {
      return [
        { label: "Invitations sent", value: invitation ?? "—" },
        { label: "RSVPs received", value: rsvps ?? "—" },
      ];
    }
    const named = Array.from(prompt.matchAll(/([A-Za-z][A-Za-z ]{1,28})\s*[:=]\s*(\d+(?:\.\d+)?%?)/g)).slice(0, 4)
      .map((match) => ({ label: match[1]!.trim(), value: match[2]! }));
    return named.length > 0 ? named : [{ label: "Measure", value: "—" }];
  }

  function generatedFor(type: CardType, prompt: string): GeneratedContent {
    if (type === "stats") {
      const metrics = statPairs(prompt);
      const hasValues = metrics.some((metric) => metric.value !== "—");
      return {
        type,
        title: /invitation|rsvp/i.test(prompt) ? "Invitation & RSVP status" : "Key stats",
        body: hasValues ? "Calculated from the values in your request." : "Add counts in this card request, or update Guests, to show verified figures.",
        metrics,
      };
    }
    if (type === "table") {
      const tableRows = Array.from(prompt.split(/\n|;/)).map((line) => line.trim()).filter(Boolean).slice(0, 6)
        .map((line, index) => {
          const [label, ...rest] = line.split(/:|—|-/);
          return { label: label.trim() || `Item ${index + 1}`, value: rest.join(" ").trim() || "Review" };
        });
      return { type, title: "Planning table", body: prompt || "Add rows to structure this card.", tableRows: tableRows.length > 0 ? tableRows : [{ label: "Item", value: "Add a row" }] };
    }
    if (type === "callout") return { type, title: "Planning highlight", body: prompt || "Add the key point you want to keep visible." };
    if (type === "text") return { type, title: "Notes", body: prompt || "Add your note." };
    return { type, title: "Custom response", body: prompt || `Content from ${attached()?.name ?? "your request"}.` };
  }

  const confirmMsg = () => {
    const tone = props.personaTone;
    if (tone === "friendly") return "Love it! Is that everything, or shall we add more?";
    if (tone === "professional") return "Content generated. Would you like to add anything further?";
    return "Done! Is that all for this card, or would you like to add more?";
  };

  function handleFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result;
      if (typeof result !== "string") return;
      const isImage = file.type.startsWith("image/");
      setAttached({ name: file.name, url: result, isImage });
      commit({
        type: cardType() ?? "custom",
        title: file.name,
        body: `Attached: ${file.name}`,
        imageUrl: isImage ? result : undefined,
      });
    };
    reader.readAsDataURL(file);
  }

  async function generate(promptOverride?: string) {
    const prompt = (promptOverride ?? chatInput()).trim();
    if (!prompt && !attached()) return;
    setBusy(true);
    dispatchA2uiCardRequestEvent({
      type: cardType(),
      prompt,
      attachedFileName: attached()?.name,
    });
    const type = cardType() ?? "custom";
    commit(generatedFor(type, prompt));
    setChatInput(prompt);
    setBusy(false);
  }

  const step = () => {
    if (!cardType()) return "pick";
    if (!generated()) return "chat";
    if (!confirmed()) return "confirm";
    return "done";
  };

  return (
    <div class="flex flex-col gap-3" style={{ "min-width": "240px", "max-width": "340px" }}>
      <Show when={step() === "pick"}>
        <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/60">Choose card type</p>
        <div class="grid grid-cols-2 gap-1.5">
          {CARD_TYPES.map((type) => (
            <button
              type="button"
              onClick={() => setCardType(type.id)}
              class="flex flex-col gap-0.5 rounded-xl border border-black/10 bg-white/60 px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-white/90"
            >
              <span class="text-sm">{type.icon}</span>
              <span class="text-[11px] font-medium text-on-surface">{type.label}</span>
              <span class="text-[9px] text-on-surface-variant/50">{type.hint}</span>
            </button>
          ))}
        </div>
      </Show>

      <Show when={generated()}>
        {(content) => (
          <div class="rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2.5">
            <Show when={content().title}>
              <p class="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] text-primary/60">{content().title}</p>
            </Show>
            <Show when={content().imageUrl}>
              <img
                src={content().imageUrl}
                alt={content().title ?? "attachment"}
                class="mb-2 w-full rounded-lg object-cover"
                style={{ "max-height": "120px" }}
              />
            </Show>
            <Show when={content().type === "stats" && content().metrics}>
              <div class="mb-2 grid grid-cols-2 gap-1.5">
                {content().metrics!.map((metric) => <div class="rounded-lg bg-white/80 px-2 py-1.5"><p class="text-[9px] text-on-surface-variant">{metric.label}</p><p class="text-base font-semibold text-on-surface">{metric.value}</p></div>)}
              </div>
            </Show>
            <Show when={content().type === "table" && content().tableRows}>
              <div class="mb-2 overflow-hidden rounded-lg border border-primary/10 bg-white/80">
                {content().tableRows!.map((row) => <div class="grid grid-cols-2 gap-2 border-b border-primary/10 px-2 py-1.5 text-[10px] last:border-b-0"><span class="font-medium text-on-surface">{row.label}</span><span class="text-on-surface-variant">{row.value}</span></div>)}
              </div>
            </Show>
            <p class={`text-[11px] leading-relaxed text-on-surface ${content().type === "callout" ? "border-l-2 border-primary pl-2 font-medium" : ""}`}>{content().body}</p>
          </div>
        )}
      </Show>

      <Show when={step() === "chat" || step() === "confirm"}>
        <div class="flex flex-col gap-2">
          <Show when={step() === "confirm"}>
            <p class="text-[11px] leading-relaxed text-on-surface-variant">{confirmMsg()}</p>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmed(true)}
                class="flex-1 rounded-xl border border-black/10 bg-white/70 py-2 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
              >
                That's all
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenerated(null);
                  setChatInput("");
                }}
                class="flex-1 rounded-xl bg-primary py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
              >
                Add more
              </button>
            </div>
          </Show>

          <Show when={step() === "chat"}>
            <div class="flex flex-col gap-2">
              <TiptapEditor
                mode="compact"
                initialContent={chatInput()}
                disabled={busy()}
                placeholder={
                  cardType() === "custom"
                    ? "Describe what to generate..."
                    : `Ask agent to generate ${cardType()}...`
                }
                submitLabel={busy() ? "Generating..." : "Generate"}
                clearOnSend={false}
                onChange={(text) => setChatInput(text)}
                onSend={async (payload) => {
                  await generate(payload.text);
                }}
              />
              <div class="flex items-center justify-between gap-2">
                <button
                  type="button"
                  title="Attach file"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => fileRef?.click()}
                  class="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-black/5 px-3 text-[11px] font-medium text-on-surface-variant transition hover:bg-primary/10 hover:text-primary"
                >
                  Attach
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,audio/*,.pdf,.txt,.csv,.json"
                  class="hidden"
                  onChange={handleFile}
                />
                <Show when={attached()}>
                  <p class="min-w-0 flex-1 truncate text-right text-[10px] text-on-surface-variant/60">
                    Attached: {attached()!.name}
                  </p>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={step() === "done"}>
        <div class="flex items-center justify-between gap-2">
          <p class="text-[9px] text-on-surface-variant/40">Card ready</p>
          <Show when={props.onDismiss}>
            <button
              type="button"
              class="text-[9px] text-on-surface-variant/40 underline underline-offset-2 transition hover:text-on-surface-variant"
              onClick={props.onDismiss}
            >
              Remove
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

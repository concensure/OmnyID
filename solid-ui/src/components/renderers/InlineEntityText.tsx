// @locs-version: 1.0
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { subscribeInlineEntityPreferenceChangedEvent } from "@/lib/inlineEntityPreferenceEvent";
import { dispatchOpenInlineEntityEvent } from "@/lib/inlineEntityEvent";
import {
  splitTextIntoInlineEntitySegments,
  type InlineEntityDescriptor,
  type InlineEntityMatch,
} from "@/lib/inlineEntitySegmentation";
import { inlineEntityChipClass, INLINE_ENTITY_ICONS } from "@/lib/inlineEntityPresentation";
import { loadInlineEntityIconsEnabled } from "@/lib/inlineEntityLocalState";

type InlineEntitySegmentView =
  | { kind: "text"; text: string }
  | {
      kind: "entity";
      match: InlineEntityMatch;
      text: string;
      title: string;
      buttonClass: string;
      iconText: string;
    };

export function InlineEntityText(props: {
  text: string;
  entities?: InlineEntityDescriptor[];
  class?: string;
}) {
  const [showIcons, setShowIcons] = createSignal(loadInlineEntityIconsEnabled());

  const textState = createMemo(() => {
    const segments = splitTextIntoInlineEntitySegments(props.text, props.entities);
    const items: InlineEntitySegmentView[] = segments.map((segment) => {
      if (segment.type === "text") {
        return {
          kind: "text",
          text: segment.value,
        };
      }

      const match = segment.match;
      return {
        kind: "entity",
        match,
        text: match.text,
        title: `Open ${match.kind} details`,
        buttonClass:
          `group relative mx-[1px] inline-flex items-center rounded-md border px-1.5 py-[1px] text-left align-baseline text-[0.95em] underline decoration-current/35 underline-offset-2 transition ${inlineEntityChipClass(match.kind)}`,
        iconText: INLINE_ENTITY_ICONS[match.kind],
      };
    });

    return {
      items,
      showIcons: showIcons(),
    };
  });

  onMount(() => {
    const unsubscribeInlineEntityPreference = subscribeInlineEntityPreferenceChangedEvent(() => {
      setShowIcons(loadInlineEntityIconsEnabled());
    });
    onCleanup(() => unsubscribeInlineEntityPreference());
  });

  function openEntity(match: InlineEntityMatch) {
    dispatchOpenInlineEntityEvent({
      kind: match.kind,
      text: match.text,
      value: match.value,
      metadata: match.metadata ?? {},
    });
  }

  return (
    <span class={props.class}>
      <For each={textState().items}>
        {(item) => (
          <Show
            when={item.kind === "entity"}
            fallback={<span class="whitespace-pre-wrap">{(item as { kind: "text"; text: string }).text}</span>}
          >
            <button
              type="button"
              onClick={() => openEntity((item as { kind: "entity"; match: InlineEntityMatch }).match)}
              class={(item as { kind: "entity"; buttonClass: string }).buttonClass}
              title={(item as { kind: "entity"; title: string }).title}
            >
              <span class="whitespace-pre-wrap">{(item as { kind: "entity"; text: string }).text}</span>
              <Show when={textState().showIcons}>
                <span class="pointer-events-none absolute -right-1 -top-1 rounded-full border border-white/70 bg-white/95 px-1 text-[8px] leading-3 text-slate-700 shadow-sm">
                  {(item as { kind: "entity"; iconText: string }).iconText}
                </span>
              </Show>
            </button>
          </Show>
        )}
      </For>
    </span>
  );
}

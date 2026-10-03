// @locs-version: 2.0
import { createSignal, For, Show } from "solid-js";

import { WeddingVendorOutreachComposer } from "@/components/WeddingVendorOutreachComposer";
import { recordWeddingVendorAvailability } from "@/lib/api";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import {
  weddingVendorAvailabilityLabel,
  type WeddingVendorAvailabilityState,
} from "@/lib/weddingVendorRankingState";
import { weddingVendorPhotoPlaceholder } from "@/lib/weddingVendorPhotoPlaceholderState";
import {
  weddingVendorOutreachSentLabel,
  type WeddingVendorOutreachFlowState,
} from "@/lib/weddingVendorOutreachFlowState";

export type WeddingVendorChoiceCardData = WeddingWorkspaceArtifactPreview["vendorComparisonCards"][number];

const AVAILABILITY_OPTIONS: ReadonlyArray<{ state: WeddingVendorAvailabilityState; label: string }> = [
  { state: "confirmed_available", label: "Available" },
  { state: "temporary_hold", label: "On hold" },
  { state: "confirmed_unavailable", label: "Unavailable" },
  { state: "booked", label: "Booked" },
];

function availabilityChipClass(state: WeddingVendorAvailabilityState): string {
  if (["confirmed_available", "likely_available", "temporary_hold", "booked"].includes(state)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (state === "unknown" || state === "confirmed_unavailable") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function WeddingVendorChoiceCard(props: {
  card: WeddingVendorChoiceCardData;
  outreachFlow?: WeddingVendorOutreachFlowState | null;
  gmailConnected?: boolean;
  onContactVendor?: (card: WeddingVendorChoiceCardData) => void;
  onUpdateAvailability?: (card: WeddingVendorChoiceCardData, state: WeddingVendorAvailabilityState) => Promise<void>;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onConnectGmailForOutreach?: () => void;
}) {
  const card = props.card;
  const [contactOpen, setContactOpen] = createSignal(false);
  const contactRows = () => [
    card.websiteUrl ? { label: "Website", value: card.websiteUrl, href: card.websiteUrl } : null,
    card.instagramUrl ? { label: "Instagram", value: card.instagramUrl, href: card.instagramUrl } : null,
    card.email ? { label: "Email", value: card.email, href: `mailto:${card.email}` } : null,
    card.phone ? { label: "Phone", value: card.phone, href: `tel:${card.phone.replace(/\s+/g, "")}` } : null,
    card.address ? { label: "Address", value: card.address, href: null } : null,
    card.mapUrl ? { label: "Map", value: card.mapUrl, href: card.mapUrl } : null,
    card.sourceUrl ? { label: "Source", value: card.sourceUrl, href: card.sourceUrl } : null,
  ].filter((item): item is { label: string; value: string; href: string | null } => item !== null);
  const [imageFailed, setImageFailed] = createSignal(false);
  // Optimistic: the saved state shows on the next search, so the card reflects the couple's update now.
  const [availabilityOverride, setAvailabilityOverride] = createSignal<WeddingVendorAvailabilityState | null>(null);
  const [availabilityError, setAvailabilityError] = createSignal<string | null>(null);
  const availabilityState = () => availabilityOverride() ?? card.availabilityState;
  const needsAvailabilityCheck = () =>
    ["unknown", "enquiry_sent", "awaiting_response"].includes(availabilityState());
  const canUpdateAvailability = () => Boolean(card.vendorId && (card.weddingPlanId || props.onUpdateAvailability));
  async function updateAvailability(state: WeddingVendorAvailabilityState) {
    if (!card.vendorId) return;
    const previous = availabilityOverride();
    setAvailabilityOverride(state);
    setAvailabilityError(null);
    try {
      if (props.onUpdateAvailability) {
        await props.onUpdateAvailability(card, state);
      } else if (card.weddingPlanId) {
        await recordWeddingVendorAvailability(card.vendorId, { wedding_plan_id: card.weddingPlanId, state });
      }
    } catch (error) {
      setAvailabilityOverride(previous);
      setAvailabilityError(error instanceof Error ? error.message : "Could not save availability. Check your connection and try again.");
    }
  }
  const placeholder = () => weddingVendorPhotoPlaceholder({ vendorName: card.title, category: null });
  return (
    <article class="min-w-0 overflow-hidden rounded-xl border border-teal-100 bg-white/85">
      <Show
        when={card.imageUrl && !imageFailed()}
        fallback={
          <div class={`flex aspect-[4/3] flex-col items-center justify-center gap-1 px-3 text-center ${placeholder().toneClass}`}>
            <span class="text-lg font-semibold">{placeholder().initials}</span>
            <span class="text-xs font-medium">{placeholder().label}</span>
          </div>
        }
      >
        {(_shown) => (
          <img
            src={card.imageUrl as string}
            alt={card.imageAlt ?? `${card.title} venue image`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            class="aspect-[4/3] w-full object-cover"
          />
        )}
      </Show>
      <div class="space-y-2 p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase text-teal-700/70">#{card.rank} recommendation</p>
            <h4 class="mt-0.5 break-words text-sm font-semibold text-teal-950">{card.title}</h4>
          </div>
          <span class="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-900">
            {card.scoreLabel}
          </span>
        </div>
        <span
          class={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${availabilityChipClass(availabilityState())}`}
          data-testid="vendor-availability-chip"
        >
          {availabilityOverride() ? weddingVendorAvailabilityLabel(availabilityState()) : card.availabilityLabel}
        </span>
        <p class="break-words text-xs leading-5 text-teal-900/75">{card.situationFit}</p>
        <div class="flex flex-wrap gap-1">
          <For each={card.rationaleLabels.slice(0, 3)}>
            {(label) => (
              <span class="max-w-full break-words rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-900">
                {label}
              </span>
            )}
          </For>
        </div>
        <p class="break-words text-[11px] leading-4 text-teal-900/65">
          {card.verificationLabel}
        </p>
        <Show when={card.unknownConstraints.length > 0}>
          <p class="break-words text-[11px] leading-4 text-slate-600">
            Unconfirmed: {card.unknownConstraints.join(", ")}
          </p>
        </Show>
        <Show when={contactRows().length > 0}>
          <div class="rounded-lg border border-teal-100 bg-teal-50/60 p-2">
            <button
              type="button"
              class="text-xs font-semibold text-teal-950 underline decoration-teal-300 underline-offset-2"
              onClick={() => setContactOpen((current) => !current)}
              aria-expanded={contactOpen()}
            >
              {contactOpen() ? "Hide contact details" : "Show contact details"}
            </button>
            <Show when={contactOpen()}>
              <dl class="mt-2 space-y-1">
                <For each={contactRows()}>
                  {(row) => (
                    <div class="grid gap-1 text-[11px] sm:grid-cols-[4.5rem_1fr]">
                      <dt class="font-semibold text-teal-900/70">{row.label}</dt>
                      <dd class="min-w-0 break-words text-teal-950">
                        <Show when={row.href} fallback={row.value}>
                          {(href) => (
                            <a href={href()} target={row.label === "Email" || row.label === "Phone" ? undefined : "_blank"} rel="noreferrer" class="underline decoration-teal-300 underline-offset-2">
                              {row.value}
                            </a>
                          )}
                        </Show>
                      </dd>
                    </div>
                  )}
                </For>
              </dl>
            </Show>
          </div>
        </Show>
        <div class="flex flex-wrap gap-1.5">
          <Show when={card.websiteUrl ?? card.sourceUrl}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                class="rounded-full border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal-950 transition hover:bg-teal-50"
              >
                Open website
              </a>
            )}
          </Show>
          <Show when={card.mapUrl}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                class="rounded-full border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal-950 transition hover:bg-teal-50"
              >
                Open map
              </a>
            )}
          </Show>
          <Show
            when={props.outreachFlow?.stage === "sent"}
            fallback={
              <button
                type="button"
                onClick={() => props.onContactVendor?.(card)}
                data-magic-action="contact"
                data-magic-icon="send"
                data-magic-id={`wedding:vendor-choice:${card.choiceId}:contact`}
                class="rounded-full bg-wedding-accent px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-wedding-accent-hover"
              >
                {needsAvailabilityCheck() ? "Check availability" : "Contact"}
              </button>
            }
          >
            <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900">
              {"✓ "}
              {weddingVendorOutreachSentLabel({ sentAtIso: props.outreachFlow?.sentAtIso ?? null })}
            </span>
          </Show>
        </div>
        <Show when={canUpdateAvailability()}>
          <label class="flex items-center gap-2 text-[11px] font-semibold text-teal-900/70">
            Update availability
            <select
              class="min-w-0 rounded-lg border border-teal-200 bg-white px-1.5 py-1 text-[11px] text-teal-950"
              value=""
              onChange={(event) => {
                const state = event.currentTarget.value as WeddingVendorAvailabilityState;
                event.currentTarget.value = "";
                if (state) void updateAvailability(state);
              }}
            >
              <option value="">Choose…</option>
              <For each={AVAILABILITY_OPTIONS}>{(option) => <option value={option.state}>{option.label}</option>}</For>
            </select>
          </label>
          <Show when={availabilityError()}>
            {(message) => <p class="text-[11px] leading-4 text-rose-700" role="alert">{message()}</p>}
          </Show>
        </Show>
        <Show when={props.outreachFlow}>
          {(flow) => (
            <WeddingVendorOutreachComposer
              flow={flow()}
              busy={flow().stage === "drafting" || flow().stage === "sending"}
              gmailConnected={Boolean(props.gmailConnected)}
              onBodyChange={(bodyMarkdown) => props.onOutreachBodyChange?.(card.choiceId, bodyMarkdown)}
              onSend={() => props.onSendOutreach?.(card.choiceId)}
              onCancel={() => props.onCancelOutreach?.(card.choiceId)}
              onConnectGmail={() => props.onConnectGmailForOutreach?.()}
            />
          )}
        </Show>
      </div>
    </article>
  );
}

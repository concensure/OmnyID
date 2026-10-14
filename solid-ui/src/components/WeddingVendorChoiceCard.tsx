// @locs-version: 2.0
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import { WeddingVendorOutreachComposer } from "@/components/WeddingVendorOutreachComposer";
import {
  API_BASE,
  fetchGoogleWeddingVendorPhoto,
  isGoogleWeddingVendorPhotoPath,
} from "@/lib/api";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorAvailabilityState } from "@/lib/weddingVendorRankingState";
import { weddingVendorPhotoPlaceholder } from "@/lib/weddingVendorPhotoPlaceholderState";
import { weddingVendorRoomPhotoSrc } from "@/lib/weddingVendorRoomState";
import { weddingVendorChoiceActionState, type WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import {
  weddingVendorOutreachSentLabel,
  type WeddingVendorOutreachFlowState,
} from "@/lib/weddingVendorOutreachFlowState";

export type WeddingVendorChoiceCardData = WeddingWorkspaceArtifactPreview["vendorComparisonCards"][number];

function availabilityChipClass(state: WeddingVendorAvailabilityState): string {
  if (["confirmed_available", "likely_available", "temporary_hold", "booked"].includes(state)) {
    return "border-wedding-muted bg-wedding-surface-blush text-wedding-accent";
  }
  if (state === "unknown" || state === "confirmed_unavailable") return "border-wedding-muted bg-wedding-surface-blush text-wedding-muted";
  return "border-wedding-muted bg-wedding-surface-blush text-wedding-accent";
}

export function WeddingVendorChoiceCard(props: {
  card: WeddingVendorChoiceCardData;
  outreachFlow?: WeddingVendorOutreachFlowState | null;
  gmailConnected?: boolean;
  quoteExists?: boolean;
  bookingContractExists?: boolean;
  onContactVendor?: (card: WeddingVendorChoiceCardData, intent: WeddingVendorChoiceIntent) => void;
  onReviewQuote?: (card: WeddingVendorChoiceCardData) => void;
  onReviewBooking?: (card: WeddingVendorChoiceCardData) => void;
  onViewEvidence?: (card: WeddingVendorChoiceCardData) => void;
  onOutreachBodyChange?: (choiceId: string, bodyMarkdown: string) => void;
  onSendOutreach?: (choiceId: string) => void;
  onCancelOutreach?: (choiceId: string) => void;
  onRetryOutreach?: (choiceId: string) => void;
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
  ].filter((item): item is { label: string; value: string; href: string | null } => item !== null);
  const [imageFailed, setImageFailed] = createSignal(false);
  const [resolvedImageUrl, setResolvedImageUrl] = createSignal<string | null>(card.imageUrl);
  createEffect(() => {
    const sourceUrl = card.imageUrl;
    if (!isGoogleWeddingVendorPhotoPath(sourceUrl)) {
      setResolvedImageUrl(sourceUrl ?? null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let disposed = false;
    setResolvedImageUrl(null);
    setImageFailed(false);
    void fetchGoogleWeddingVendorPhoto(sourceUrl, controller.signal)
      .then((photo) => {
        if (disposed || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
        objectUrl = URL.createObjectURL(photo);
        setResolvedImageUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!disposed && !(error instanceof Error && error.name === "AbortError")) {
          setImageFailed(true);
        }
      });
    onCleanup(() => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
  });
  const availabilityState = () => card.availabilityState;
  const hasConfirmedAvailability = () => ["confirmed_available", "confirmed_unavailable", "temporary_hold", "booked"].includes(availabilityState());
  const confirmedRationaleLabels = () => card.rationaleLabels.filter((label) => !/^source provider:/i.test(label));
  const confirmedScoreLabels = () => [card.qualityScoreLabel, card.sentimentScoreLabel, card.valueScoreLabel]
    .filter((label): label is string => Boolean(label?.trim()));
  const primaryAction = () => weddingVendorChoiceActionState({
    availabilityState: availabilityState(),
    outreachStage: props.outreachFlow?.stage,
    quoteExists: props.quoteExists,
    bookingContractExists: props.bookingContractExists,
  });
  const placeholder = () => weddingVendorPhotoPlaceholder({ vendorName: card.title, category: null });
  return (
    <article class="min-w-0 overflow-hidden rounded-xl border border-wedding-muted bg-white/85">
      <Show
        when={resolvedImageUrl() && !imageFailed()}
        fallback={
          <div class={`flex aspect-[4/3] flex-col items-center justify-center gap-1 px-3 text-center ${placeholder().toneClass}`}>
            <span class="text-lg font-semibold">{placeholder().initials}</span>
            <span class="text-xs font-medium">{placeholder().label}</span>
          </div>
        }
      >
        {(_shown) => (
          <img
            src={resolvedImageUrl() as string}
            alt={card.imageAlt ?? `${card.title} vendor photo`}
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
            <p class="text-[11px] font-semibold uppercase text-wedding-text">#{card.rank} recommendation</p>
            <h4 class="mt-0.5 break-words text-sm font-semibold text-wedding-text">{card.title}</h4>
          </div>
          <span class="shrink-0 rounded-full bg-wedding-surface-blush px-2 py-1 text-[11px] font-semibold text-wedding-accent">
            {card.scoreLabel}
          </span>
        </div>
        <Show when={hasConfirmedAvailability()}>
        <span
          class={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${availabilityChipClass(availabilityState())}`}
          data-testid="vendor-availability-chip"
        >
          {card.availabilityLabel}
        </span>
        </Show>
        <Show when={card.situationFit && !/requires source-page review/i.test(card.situationFit)}>
          <p class="break-words text-xs leading-5 text-wedding-muted">{card.situationFit}</p>
        </Show>
        <div class="flex flex-wrap gap-1">
          <For each={confirmedRationaleLabels().slice(0, 3)}>
            {(label) => (
              <span class="max-w-full break-words rounded-full bg-wedding-surface-blush px-2 py-1 text-[11px] font-medium text-wedding-accent">
                {label}
              </span>
            )}
          </For>
        </div>
        <Show when={confirmedScoreLabels().length > 0}>
          <div class="grid grid-cols-3 gap-1" aria-label="Vendor score summary">
            <For each={confirmedScoreLabels()}>{(label) => <span class="rounded-lg border border-wedding-muted bg-wedding-surface-blush px-2 py-1 text-[10px] font-semibold text-wedding-accent">{label}</span>}</For>
          </div>
        </Show>
        <Show when={card.rooms.length > 0}>
          <div class="rounded-lg border border-wedding-muted bg-wedding-surface-blush p-2" data-testid="vendor-rooms">
            <p class="text-[11px] font-semibold uppercase text-wedding-muted">Rooms and pricing</p>
            <ul class="mt-1 space-y-1.5">
              <For each={card.rooms}>
                {(room) => (
                  <li class="flex gap-2 text-[11px] leading-4">
                    <Show when={weddingVendorRoomPhotoSrc(room.imageUrl, API_BASE)}>
                      {(src) => (
                        <img
                          src={src()}
                          alt={`${room.name} at ${card.title}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          class="h-12 w-12 shrink-0 rounded-md object-cover"
                        />
                      )}
                    </Show>
                    <div class="min-w-0">
                      <p class="break-words font-semibold text-wedding-text">{room.name}</p>
                      <p class="break-words text-wedding-muted">{room.summary}</p>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={contactRows().length > 0}>
          <div class="rounded-lg border border-wedding-muted bg-wedding-surface-blush p-2">
            <button
              type="button"
              class="min-h-11 text-xs font-semibold text-wedding-text underline decoration-wedding-muted underline-offset-2"
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
                      <dt class="font-semibold text-wedding-muted">{row.label}</dt>
                      <dd class="min-w-0 break-words text-wedding-text">
                        <Show when={row.href} fallback={row.value}>
                          {(href) => (
                            <a href={href()} target={row.label === "Email" || row.label === "Phone" ? undefined : "_blank"} rel="noreferrer" class="underline decoration-wedding-muted underline-offset-2">
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
                class="inline-flex min-h-11 items-center rounded-full border border-wedding-muted bg-white px-2.5 py-1.5 text-xs font-semibold text-wedding-text transition hover:bg-wedding-surface-blush"
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
                class="inline-flex min-h-11 items-center rounded-full border border-wedding-muted bg-white px-2.5 py-1.5 text-xs font-semibold text-wedding-text transition hover:bg-wedding-surface-blush"
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
                onClick={() => {
                  const action = primaryAction();
                  if (action.intent === "REVIEW_QUOTE") props.onReviewQuote?.(card);
                  else if (action.intent === "START_PURCHASE_OR_BOOKING") props.onReviewBooking?.(card);
                  else if (action.intent === "VIEW_EVIDENCE") props.onViewEvidence?.(card);
                  else props.onContactVendor?.(card, action.intent);
                }}
                data-wedding-vendor-intent={primaryAction().intent}
                data-magic-action="contact"
                data-magic-icon="send"
                data-magic-id={`wedding:vendor-choice:${card.choiceId}:contact`}
                class="min-h-11 rounded-full border border-wedding-muted bg-white px-2.5 py-1.5 text-xs font-bold text-wedding-text transition hover:bg-wedding-surface-blush"
              >
                <span aria-hidden="true">→ </span>
                {primaryAction().label}
              </button>
            }
          >
            <span class="rounded-full border border-wedding-muted bg-wedding-surface-blush px-2.5 py-1.5 text-xs font-semibold text-wedding-accent">
              {"✓ "}
              {weddingVendorOutreachSentLabel({ sentAtIso: props.outreachFlow?.sentAtIso ?? null })}
            </span>
          </Show>
        </div>
        <Show when={props.outreachFlow}>
          {(flow) => (
            <WeddingVendorOutreachComposer
              flow={flow()}
              busy={flow().stage === "drafting" || flow().stage === "sending"}
              gmailConnected={Boolean(props.gmailConnected)}
              onBodyChange={(bodyMarkdown) => props.onOutreachBodyChange?.(card.choiceId, bodyMarkdown)}
              onSend={() => props.onSendOutreach?.(card.choiceId)}
              onCancel={() => props.onCancelOutreach?.(card.choiceId)}
              onRetryDraft={() => props.onRetryOutreach?.(card.choiceId)}
              onConnectGmail={() => props.onConnectGmailForOutreach?.()}
            />
          )}
        </Show>
      </div>
    </article>
  );
}

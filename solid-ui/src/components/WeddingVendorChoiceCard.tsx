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
import type { WeddingPreferenceSignalReason } from "@/lib/weddingPreferenceSignalState";
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

function vendorEmailHref(title: string, email: string): string {
  // ACO supplied a venue-hire subject line, which makes the hand-off useful
  // without changing the generic email behaviour for every other vendor.
  if (/^bianca\.astwood@aco\.com\.au$/i.test(email.trim()) || /aco\s+on\s+the\s+pier/i.test(title)) {
    return "mailto:Bianca.Astwood@aco.com.au?subject=Pier%202F3%20Venue%20Hire";
  }
  return `mailto:${email}`;
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
  selectedForFollowUp?: boolean;
  onToggleFollowUp?: (card: WeddingVendorChoiceCardData) => void;
  onNotForUs?: (card: WeddingVendorChoiceCardData, reason: WeddingPreferenceSignalReason) => Promise<boolean> | boolean;
}) {
  const card = props.card;
  const [contactOpen, setContactOpen] = createSignal(false);
  const [feedbackOpen, setFeedbackOpen] = createSignal(false);
  const [feedbackSaving, setFeedbackSaving] = createSignal(false);
  const [feedbackError, setFeedbackError] = createSignal<string | null>(null);
  const submitFeedback = async (reason: WeddingPreferenceSignalReason) => {
    if (!props.onNotForUs || feedbackSaving()) return;
    setFeedbackSaving(true);
    setFeedbackError(null);
    try {
      const saved = await props.onNotForUs(card, reason);
      if (saved === false) setFeedbackError("We couldn't save that yet. Check your connection and try again.");
      else setFeedbackOpen(false);
    } catch {
      setFeedbackError("We couldn't save that yet. Check your connection and try again.");
    } finally {
      setFeedbackSaving(false);
    }
  };
  const contactRows = () => [
    card.websiteUrl ? { label: "Website", value: card.websiteUrl, href: card.websiteUrl } : null,
    card.instagramUrl ? { label: "Instagram", value: card.instagramUrl, href: card.instagramUrl } : null,
    card.email ? { label: "Email", value: card.email, href: vendorEmailHref(card.title, card.email) } : null,
    card.phone ? { label: "Phone", value: card.phone, href: `tel:${card.phone.replace(/\s+/g, "")}` } : null,
    card.address ? { label: "Address", value: card.address, href: null } : null,
    card.mapUrl ? { label: "Map", value: card.mapUrl, href: card.mapUrl } : null,
  ].filter((item): item is { label: string; value: string; href: string | null } => item !== null);
  const [imageFailed, setImageFailed] = createSignal(false);
  const [resolvedImageUrl, setResolvedImageUrl] = createSignal<string | null>(card.imageUrl);
  createEffect(() => {
    const sourceUrl = card.imageUrl;
    if (!isGoogleWeddingVendorPhotoPath(sourceUrl)) {
      setImageFailed(false);
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
  const confirmedScoreLabels = () => [card.qualityScoreLabel, card.sentimentScoreLabel, card.valueScoreLabel]
    .filter((label): label is string => Boolean(label?.trim()));
  const primaryAction = () => weddingVendorChoiceActionState({
    availabilityState: availabilityState(),
    outreachStage: props.outreachFlow?.stage,
    quoteExists: props.quoteExists,
    bookingContractExists: props.bookingContractExists,
  });
  const placeholder = () => weddingVendorPhotoPlaceholder({ vendorName: card.title, category: null });
  const anchorIcon = (status: WeddingVendorChoiceCardData["anchorRows"][number]["status"]) => status === "met" ? "✓" : status === "not_met" ? "×" : "?";
  const anchorStatusLabel = (status: WeddingVendorChoiceCardData["anchorRows"][number]["status"]) => status === "met" ? "Matches" : status === "not_met" ? "Does not match" : "To confirm";
  const factSummary = () => `Based on ${card.checkedFactsCount} checked fact${card.checkedFactsCount === 1 ? "" : "s"} · ${card.anchorRows.filter((row) => row.status === "unknown").length} to confirm`;
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
        <div class="grid min-w-0 gap-2">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase text-wedding-text">{card.comparisonCount === 1 ? "Only venue that fits so far" : card.rank === 1 ? "Your best match" : `Best of ${card.comparisonCount} matches`}</p>
            <h4 class="mt-0.5 break-words text-sm font-semibold text-wedding-text">{card.title}</h4>
          </div>
          <span class="w-fit max-w-full rounded-full bg-wedding-surface-blush px-2 py-1 text-[11px] font-semibold text-wedding-accent">
            {factSummary()}
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
        <Show when={card.anchorRows.length > 0}>
          <section aria-label="For what you asked">
            <p class="text-[11px] font-semibold uppercase text-wedding-muted">For what you asked</p>
            <ul class="mt-1 space-y-1.5">
              <For each={card.anchorRows}>{(row) => (
                <li class="flex gap-2 text-xs leading-5 text-wedding-text">
                  <span aria-label={anchorStatusLabel(row.status)} class="font-bold text-wedding-accent">{anchorIcon(row.status)}</span>
                  <span><strong>{row.anchor}</strong> — {row.detail}</span>
                </li>
              )}</For>
            </ul>
          </section>
        </Show>
        <Show when={card.fitWord}><p class="text-xs font-semibold text-wedding-accent">{card.fitWord}</p></Show>
        <Show when={(card.facetLabels?.length ?? 0) > 0}><p class="text-xs text-wedding-muted">{card.facetLabels?.join(" · ")}</p></Show>
        <Show when={card.verifyQuestions.length > 0}>
          <section aria-label="We'll ask them">
            <p class="text-[11px] font-semibold uppercase text-wedding-muted">We&apos;ll ask them</p>
            <ul class="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-wedding-muted"><For each={card.verifyQuestions}>{(question) => <li>{question}</li>}</For></ul>
          </section>
        </Show>
        <Show when={card.worthKnowing}>
          <section aria-label="Worth knowing" class="rounded-lg border border-wedding-muted bg-wedding-surface-blush p-2 text-xs leading-5 text-wedding-text">
            <p class="text-[11px] font-semibold uppercase text-wedding-muted">Worth knowing</p>
            <p>{card.worthKnowing}</p>
          </section>
        </Show>
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
        <details class="text-xs text-wedding-muted">
          <summary class="min-h-11 cursor-pointer py-2 font-semibold text-wedding-text">Why this ranking</summary>
          <p class="pb-2">{card.scoreLabel}</p>
        </details>
        <div class="flex flex-wrap gap-1.5">
          <Show when={props.onToggleFollowUp}>
            <button
              type="button"
              onClick={() => props.onToggleFollowUp?.(card)}
              aria-pressed={Boolean(props.selectedForFollowUp)}
              class={`hidden min-h-11 rounded-xl px-3 py-2 text-xs font-bold transition sm:inline-flex sm:w-auto sm:rounded-full sm:px-2.5 sm:py-1.5 ${
                props.selectedForFollowUp
                  ? "bg-wedding-accent text-white hover:bg-wedding-accent/90"
                  : "border border-wedding-muted bg-white text-wedding-text hover:bg-wedding-surface-blush"
              }`}
            >
              {props.selectedForFollowUp ? "Selected for follow-up" : "Select for follow-up"}
            </button>
          </Show>
          <Show
            when={props.outreachFlow?.stage === "sent"}
            fallback={
              <button
                type="button"
                onClick={() => {
                  const action = primaryAction();
                  props.onToggleFollowUp?.(card);
                  if (action.intent === "REVIEW_QUOTE") props.onReviewQuote?.(card);
                  else if (action.intent === "START_PURCHASE_OR_BOOKING") props.onReviewBooking?.(card);
                  else if (action.intent === "VIEW_EVIDENCE") props.onViewEvidence?.(card);
                  else props.onContactVendor?.(card, action.intent);
                }}
                data-wedding-vendor-intent={primaryAction().intent}
                data-magic-action="contact"
                data-magic-icon="send"
                data-magic-id={`wedding:vendor-choice:${card.choiceId}:contact`}
                class="min-h-12 w-full rounded-xl border-2 border-wedding-cta bg-white px-3 py-2 text-sm font-bold text-wedding-text transition hover:bg-wedding-surface-blush"
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
          <Show when={props.outreachFlow?.stage === "sent"}>
            <div class="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-950" role="status" aria-live="polite">
              <p class="text-sm font-bold">Message sent!</p>
              <p class="mt-1 text-xs leading-5">You are another step closer to your wedding.</p>
            </div>
          </Show>
        </div>
        <div class="flex min-h-11 flex-wrap items-center gap-3 text-xs font-semibold text-wedding-text">
          <Show when={card.websiteUrl ?? card.sourceUrl}>{(url) => <a href={url()} target="_blank" rel="noreferrer" class="min-h-11 inline-flex items-center underline">Website</a>}</Show>
          <Show when={contactRows().length > 0}><button type="button" class="min-h-11 underline" onClick={() => setContactOpen((current) => !current)}>Contact</button></Show>
          <Show when={props.onNotForUs}><button type="button" class="min-h-11 underline" aria-expanded={feedbackOpen()} onClick={() => { setFeedbackOpen((current) => !current); setFeedbackError(null); }}>Not for us</button></Show>
        </div>
        <Show when={feedbackOpen()}>
          <section class="rounded-lg border border-wedding-muted bg-wedding-surface-blush p-2" aria-label={`Why ${card.title} is not for you`}>
            <p class="text-xs font-semibold text-wedding-text">What made this one not for you?</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={[["too_big", "Too big"], ["not_our_style", "Not our style"], ["too_far", "Too far"], ["too_expensive", "Too expensive"], ["other", "Other"]] as const}>
                {([reason, label]) => <button type="button" disabled={feedbackSaving()} class="min-h-11 rounded-lg border border-wedding-muted bg-white px-3 text-xs font-semibold text-wedding-text disabled:opacity-60" onClick={() => void submitFeedback(reason)}>{label}</button>}
              </For>
            </div>
            <Show when={feedbackError()}><p class="mt-2 text-xs text-wedding-text" role="alert">{feedbackError()}</p></Show>
          </section>
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
              onRetryDraft={() => props.onRetryOutreach?.(card.choiceId)}
              onConnectGmail={() => props.onConnectGmailForOutreach?.()}
            />
          )}
        </Show>
      </div>
    </article>
  );
}

// @locs-version: 1.0
import { For, Show, createMemo, createSignal } from "solid-js";

import { WeddingRsvpPublishingPanel } from "@/components/WeddingRsvpPublishingPanel";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import { ensureWeddingRsvpCoupleKey } from "@/lib/weddingRsvpCoupleKeys";
import {
  buildWeddingRsvpInvitationPreviews,
  buildWeddingRsvpSetupDraft,
  weddingRsvpQuestionLibrary,
  weddingRsvpSetupEventOptions,
  type WeddingRsvpQuestionId,
  type WeddingRsvpSetupState,
} from "@/lib/weddingRsvpSetupState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import { friendlyErrorText } from "@/lib/visibleErrorText";

function dateAfterToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function WeddingRsvpSetupPanel(props: {
  current: WeddingRsvpSetupState | null;
  guestTracking: WeddingGuestTrackingState;
  metadata?: unknown;
  onSave?: (setup: WeddingRsvpSetupState) => Promise<string>;
}) {
  const metadata = normalizeWeddingPlanningMetadata(props.metadata);
  const eventOptions = createMemo(() => {
    const options = weddingRsvpSetupEventOptions(props.guestTracking);
    if (!props.current || options.some((event) => event.id === props.current?.eventId)) return options;
    return [{
      id: props.current.eventId,
      label: props.current.eventLabel,
      invitationCount: 0,
    }, ...options];
  });
  const currentQuestionIds = props.current?.questions.filter((question) => question.enabled).map((question) => question.id) ?? ["attendance"];
  const currentRequiredIds = props.current?.questions.filter((question) => question.required).map((question) => question.id) ?? ["attendance"];
  const [eventChoice, setEventChoice] = createSignal(props.current?.eventId ?? eventOptions()[0]?.id ?? "new_event");
  const [newEventLabel, setNewEventLabel] = createSignal("Wedding day");
  const [deadline, setDeadline] = createSignal(props.current?.responseDeadline ?? dateAfterToday(28));
  const [hostLabel, setHostLabel] = createSignal(props.current?.hostLabel ?? "The couple");
  const [enabledQuestions, setEnabledQuestions] = createSignal<WeddingRsvpQuestionId[]>(currentQuestionIds);
  const [requiredQuestions, setRequiredQuestions] = createSignal<WeddingRsvpQuestionId[]>(currentRequiredIds);
  const [customPrompt, setCustomPrompt] = createSignal(
    props.current?.questions.find((question) => question.id === "custom_text")?.prompt ?? "",
  );
  const [mealOptions, setMealOptions] = createSignal(
    props.current?.questions.find((question) => question.id === "meal_choice")?.options.join(", ")
      || "Chicken, Fish, Vegetarian",
  );
  const [showPreview, setShowPreview] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [localSetup, setLocalSetup] = createSignal<WeddingRsvpSetupState | null>(props.current);

  const chosenEvent = createMemo(() => eventOptions().find((event) => event.id === eventChoice()));
  const eventLabel = () => eventChoice() === "new_event"
    ? newEventLabel().trim()
    : chosenEvent()?.label ?? props.current?.eventLabel ?? "Wedding event";
  const eventId = () => eventChoice() === "new_event"
    ? `wedding_event:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(eventLabel()) || "event"}`
    : eventChoice();
  const draft = createMemo(() => buildWeddingRsvpSetupDraft({
    eventId: eventId(),
    eventLabel: eventLabel(),
    hostLabel: hostLabel(),
    responseDeadline: deadline(),
    enabledQuestionIds: enabledQuestions(),
    requiredQuestionIds: requiredQuestions(),
    customPrompt: customPrompt(),
    mealOptions: mealOptions().split(","),
  }, metadata, localSetup()?.revision ?? 0));
  const previews = createMemo(() => draft().setup
    ? buildWeddingRsvpInvitationPreviews(draft().setup!, props.guestTracking)
    : []);

  const toggleEnabled = (id: WeddingRsvpQuestionId, enabled: boolean) => {
    if (id === "attendance") return;
    setEnabledQuestions((current) => enabled
      ? Array.from(new Set([...current, id]))
      : current.filter((questionId) => questionId !== id));
    if (!enabled) setRequiredQuestions((current) => current.filter((questionId) => questionId !== id));
    setNotice(null);
  };
  const toggleRequired = (id: WeddingRsvpQuestionId, required: boolean) => {
    if (id === "attendance") return;
    setRequiredQuestions((current) => required
      ? Array.from(new Set([...current, id]))
      : current.filter((questionId) => questionId !== id));
  };
  const preview = () => {
    if (draft().errorLabels.length > 0) {
      setNotice(draft().errorLabels.join(" "));
      return;
    }
    setNotice(null);
    setShowPreview((value) => !value);
  };
  const save = async () => {
    const result = draft();
    if (!result.setup || result.errorLabels.length > 0) {
      setNotice(result.errorLabels.join(" "));
      return;
    }
    if (!props.onSave || saving()) return;
    setSaving(true);
    setNotice(null);
    try {
      const key = await ensureWeddingRsvpCoupleKey(metadata.responseWorkspaceId);
      const securedSetup = {
        ...result.setup,
        encryptionKeyId: key.keyId,
        encryptionPublicKeyHex: key.publicKeyHex,
      };
      const savedNotice = await props.onSave(securedSetup);
      setLocalSetup(securedSetup);
      setNotice(savedNotice);
    } catch (error) {
      setNotice(friendlyErrorText(error, "RSVP setup could not be saved. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="mt-3 min-w-0 rounded-[24px] border border-teal-100 bg-teal-50/70 p-3 shadow-card phone:rounded-none phone:border-x-0 phone:bg-transparent phone:px-0 phone:shadow-none sm:rounded-[28px] sm:p-4" aria-labelledby="wedding-rsvp-setup-title">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 id="wedding-rsvp-setup-title" class="text-base font-semibold text-teal-950">RSVP setup</h3>
          <p class="mt-1 text-sm leading-6 text-teal-950/70">Choose what each invited household can answer. Saving this setup does not send an invitation or create a link.</p>
        </div>
        <span class="rounded-full border border-teal-100 bg-white px-2.5 py-1 text-xs font-semibold text-teal-900">
          {localSetup() ? `Draft v${localSetup()?.revision}` : "Not saved"}
        </span>
      </div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="min-w-0 text-xs font-semibold text-teal-950/75">
          Event
          <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-teal-950 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={eventChoice()} onChange={(event) => setEventChoice(event.currentTarget.value)}>
            <For each={eventOptions()}>{(event) => <option value={event.id}>{event.label} ({event.invitationCount})</option>}</For>
            <option value="new_event">Add another event</option>
          </select>
        </label>
        <label class="min-w-0 text-xs font-semibold text-teal-950/75">
          RSVP deadline
          <input type="date" min={new Date().toISOString().slice(0, 10)} class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-teal-950 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={deadline()} onInput={(event) => setDeadline(event.currentTarget.value)} />
        </label>
      </div>
      <label class="mt-3 block min-w-0 text-xs font-semibold text-teal-950/75">
        Names shown to guests
        <input maxlength="120" class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-teal-950 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={hostLabel()} onInput={(event) => setHostLabel(event.currentTarget.value)} placeholder="Priya and Daniel" />
      </label>
      <Show when={eventChoice() === "new_event"}>
        <label class="mt-3 block min-w-0 text-xs font-semibold text-teal-950/75">
          Event name
          <input maxlength="120" class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-teal-950 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={newEventLabel()} onInput={(event) => setNewEventLabel(event.currentTarget.value)} placeholder="Recovery brunch" />
        </label>
      </Show>

      <fieldset class="mt-4">
        <legend class="text-sm font-semibold text-teal-950">Questions guests will see</legend>
        <p class="mt-1 text-xs leading-5 text-teal-950/65">Attendance is always required. Sensitive answers remain couple-only unless you later approve a minimum-necessary vendor brief.</p>
        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <For each={weddingRsvpQuestionLibrary}>
            {(question) => {
              const enabled = () => question.id === "attendance" || enabledQuestions().includes(question.id);
              const required = () => question.id === "attendance" || requiredQuestions().includes(question.id);
              return (
                <div class="rounded-xl border border-teal-100 bg-white p-2.5">
                  <label class="flex min-h-8 items-start gap-2 text-sm font-semibold text-teal-950">
                    <input type="checkbox" class="mt-0.5 h-5 w-5 accent-teal-700" checked={enabled()} disabled={question.id === "attendance"} onChange={(event) => toggleEnabled(question.id, event.currentTarget.checked)} />
                    <span>{question.label}{question.sensitive ? <span class="ml-1 text-xs font-medium text-teal-700">Private</span> : null}</span>
                  </label>
                  <Show when={enabled() && question.id !== "attendance"}>
                    <label class="mt-2 flex min-h-8 items-center gap-2 text-xs font-semibold text-teal-950/70">
                      <input type="checkbox" class="h-4 w-4 accent-teal-700" checked={required()} onChange={(event) => toggleRequired(question.id, event.currentTarget.checked)} />
                      Required to complete RSVP
                    </label>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </fieldset>

      <Show when={enabledQuestions().includes("meal_choice")}>
        <label class="mt-3 block text-xs font-semibold text-teal-950/75">Meal choices, separated by commas
          <input class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-teal-950 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={mealOptions()} onInput={(event) => setMealOptions(event.currentTarget.value)} />
        </label>
      </Show>
      <Show when={enabledQuestions().includes("custom_text")}>
        <label class="mt-3 block text-xs font-semibold text-teal-950/75">Custom question
          <input maxlength="160" class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-teal-950 focus:border-teal-500 focus:ring-2 focus:ring-teal-100" value={customPrompt()} onInput={(event) => setCustomPrompt(event.currentTarget.value)} placeholder="Is there anything else we should know?" />
        </label>
      </Show>

      <Show when={notice()}>{(message) => <p role="status" class="mt-3 rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs leading-5 text-teal-950/75">{message()}</p>}</Show>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" class="min-h-11 rounded-lg border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-950 hover:bg-teal-50" data-magic-action="preview" data-magic-icon="preview" data-magic-label="Preview RSVP invitations" data-magic-id="wedding:rsvp:preview" onClick={preview}>
          {showPreview() ? "Hide preview" : "Preview invitations"}
        </button>
        <button type="button" disabled={saving() || !props.onSave} class="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-teal-300" data-magic-action="save" data-magic-icon="save" data-magic-label="Save RSVP setup" data-magic-id="wedding:rsvp:save-setup" onClick={() => void save()}>
          {saving() ? "Saving…" : "Save RSVP setup"}
        </button>
      </div>

      <Show when={showPreview() && draft().setup}>
        <div class="mt-4" aria-live="polite">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-teal-950">Household preview</p>
            <span class="text-xs font-semibold text-teal-900">{previews().length} household{previews().length === 1 ? "" : "s"}</span>
          </div>
          <Show when={previews().length > 0} fallback={<p class="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">No saved invitations use this event yet. Add or update guests before creating protected links.</p>}>
            <div class="mt-2 grid gap-2 lg:grid-cols-2">
              <For each={previews()}>{(preview) => (
                <article class="min-w-0 rounded-xl border border-teal-100 bg-white p-3">
                  <p class="break-words text-sm font-semibold text-teal-950">{preview.householdLabel}</p>
                  <ul class="mt-2 space-y-1 text-xs text-teal-950/75">
                    <For each={preview.recipients}>{(recipient) => <li class="break-words"><span class="font-semibold">{recipient.displayName}</span> · {recipient.responseStatus}{recipient.plusOneAllowed ? " · plus-one included" : ""}{recipient.childrenInvited ? " · children included" : ""}</li>}</For>
                  </ul>
                  <p class="mt-2 text-xs font-semibold text-teal-950/70">Questions</p>
                  <p class="mt-1 break-words text-xs leading-5 text-teal-950/65">{preview.questionLabels.join(" · ")}</p>
                  <p class="mt-2 break-words text-xs leading-5 text-teal-800">{preview.privacyLabel}</p>
                </article>
              )}</For>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={localSetup()}>{(setup) => <WeddingRsvpPublishingPanel setup={setup()} guestTracking={props.guestTracking} metadata={metadata} />}</Show>
    </section>
  );
}

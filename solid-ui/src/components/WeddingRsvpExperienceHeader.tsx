// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";

import {
  weddingRsvpCalendarUrl,
  weddingRsvpDirectionsUrl,
  type WeddingRsvpHouseholdExperience,
} from "@/lib/weddingRsvpHouseholdExperienceState";

export function WeddingRsvpExperienceHeader(props: {
  experience: WeddingRsvpHouseholdExperience;
  showRsvpAction?: boolean;
  onRsvp?: () => void;
}) {
  const directions = createMemo(() => weddingRsvpDirectionsUrl(props.experience.venueAddress));
  const calendar = createMemo(() => weddingRsvpCalendarUrl(props.experience));
  const modeLabel = () => props.experience.mode === "test" ? "Test RSVP — nothing can be submitted" : props.experience.mode === "preview" ? "Preview — nothing can be submitted" : null;
  return <header class="mt-3 min-w-0 overflow-hidden rounded-2xl border border-teal-100 bg-white p-5 shadow-sm sm:p-7">
    <Show when={modeLabel()}>{(label) => <p class="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-sky-900">{label()}</p>}</Show>
    <p class="break-words text-sm font-semibold text-teal-700">{props.experience.hostLabel}</p>
    <h1 class="mt-1 break-words text-2xl font-bold sm:text-3xl">RSVP for {props.experience.eventLabel}</h1>
    <p class="mt-2 text-sm text-teal-800">For <For each={props.experience.recipientLabels}>{(name, index) => <>{index() > 0 ? " · " : ""}{name}</>}</For></p>
    <Show when={props.experience.eventDate}><p class="mt-2 text-sm text-teal-800"><strong>Date:</strong> {props.experience.eventDate}<Show when={props.experience.eventLocalTime}> at {props.experience.eventLocalTime}</Show><Show when={props.experience.eventTimeZone}> ({props.experience.eventTimeZone})</Show></p></Show>
    <Show when={props.experience.venueName || props.experience.venueAddress}><p class="mt-1 break-words text-sm text-teal-800"><strong>Place:</strong> {[props.experience.venueName, props.experience.venueAddress].filter(Boolean).join(" · ")}</p></Show>
    <p class="mt-2 text-sm text-teal-800">Please respond by <time datetime={props.experience.responseDeadline}>{new Date(`${props.experience.responseDeadline}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</time>.</p>
    <nav class="mt-4 flex flex-wrap gap-2" aria-label={`${props.experience.mode === "test" ? "Test " : props.experience.mode === "preview" ? "Preview " : ""}RSVP actions`}>
      <Show when={props.showRsvpAction}><button type="button" class="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white" onClick={props.onRsvp}>RSVP</button></Show>
      <Show when={directions()}>{(url) => <a class="inline-flex min-h-11 items-center rounded-xl border border-teal-300 px-4 text-sm font-bold text-teal-900" href={url()} target="_blank" rel="noreferrer">Directions</a>}</Show>
      <Show when={calendar()}>{(url) => <a class="inline-flex min-h-11 items-center rounded-xl border border-teal-300 px-4 text-sm font-bold text-teal-900" href={url()} target="_blank" rel="noreferrer">Add to calendar</a>}</Show>
    </nav>
  </header>;
}

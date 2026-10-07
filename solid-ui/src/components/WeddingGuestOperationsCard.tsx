// @locs-version: 2.3
import { For, Show, createMemo, createSignal } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import {
  loadWeddingGuestOperationsLocalState,
  saveWeddingGuestOperationsLocalState,
  weddingGuestOperationsScopeFromMetadata,
  type WeddingGuestOperationsLocalDraftGuest,
} from "@/lib/weddingGuestOperationsLocalState";
import { weddingGuestOperationsDisplayCounts } from "@/lib/weddingGuestOperationsDisplayState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";

type GuestRsvpStatus = "Attending" | "Not attending" | "Pending";

const rsvpOptions: GuestRsvpStatus[] = ["Attending", "Not attending", "Pending"];

function rsvpToneClass(status: string): string {
  if (status === "Attending") return "border-emerald-100 bg-emerald-50 text-emerald-900";
  if (status === "Not attending") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-100 bg-amber-50 text-amber-900";
}

export function WeddingGuestOperationsCard(props: {
  state: WeddingGuestTrackingState;
  metadata?: unknown;
  onSaveGuestDraft?: (input: {
    displayName: string;
    householdLabel: string;
    rsvpStatus: string;
    plusOneAllowed: boolean;
    childrenInvited: boolean;
    contactLabel: string;
    mealPreference: string;
    dietaryNote: string;
    accessibilityNote: string;
  }) => Promise<string>;
  onSaveGuestRules?: (input: { plusOneRule: string; childrenRule: string }) => Promise<string>;
}) {
  const [activePanel, setActivePanel] = createSignal<"guest" | "rules" | null>(null);
  const [guestName, setGuestName] = createSignal("");
  const [guestGroup, setGuestGroup] = createSignal("");
  const [guestRsvp, setGuestRsvp] = createSignal("Pending");
  const [guestPlusOneAllowed, setGuestPlusOneAllowed] = createSignal(false);
  const [guestChildrenInvited, setGuestChildrenInvited] = createSignal(false);
  const [guestContact, setGuestContact] = createSignal("");
  const [guestMeal, setGuestMeal] = createSignal("");
  const [guestDietary, setGuestDietary] = createSignal("");
  const [guestAccessibility, setGuestAccessibility] = createSignal("");
  const [plusOneRule, setPlusOneRule] = createSignal("No extra plus-ones unless the couple approves them.");
  const [childrenRule, setChildrenRule] = createSignal("Children under 12 are not included unless named on the invite.");
  const localScope = weddingGuestOperationsScopeFromMetadata(props.metadata);
  const localState = loadWeddingGuestOperationsLocalState(localScope);
  const [draftGuests, setDraftGuests] = createSignal<WeddingGuestOperationsLocalDraftGuest[]>(localState.guests);
  const [savedRules, setSavedRules] = createSignal<string[]>(localState.rules);
  const [rsvpOverrides, setRsvpOverrides] = createSignal<Record<string, string>>(localState.rsvpOverrides);
  const [savingGuest, setSavingGuest] = createSignal(false);
  const [savingRules, setSavingRules] = createSignal(false);
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const displayCounts = createMemo(() => weddingGuestOperationsDisplayCounts(props.state, draftGuests()));
  const guestRows = createMemo(() => (props.state.guestRows ?? []).slice(0, 8).map((row) => ({
    ...row,
    rsvpStatus: rsvpOverrides()[row.id] ?? row.rsvpStatus,
    locallyChanged: Boolean(rsvpOverrides()[row.id]),
  })));
  const saveLocalState = (next: {
    guests?: WeddingGuestOperationsLocalDraftGuest[];
    rules?: string[];
    rsvpOverrides?: Record<string, string>;
  }) => {
    saveWeddingGuestOperationsLocalState(localScope, {
      guests: next.guests ?? draftGuests(),
      rules: next.rules ?? savedRules(),
      rsvpOverrides: next.rsvpOverrides ?? rsvpOverrides(),
    });
  };
  const setGuestRsvpOverride = (guestId: string, status: GuestRsvpStatus) => {
    const original = (props.state.guestRows ?? []).find((row) => row.id === guestId)?.rsvpStatus;
    const nextOverrides = { ...rsvpOverrides() };
    if (original === status) delete nextOverrides[guestId];
    else nextOverrides[guestId] = status;
    setRsvpOverrides(nextOverrides);
    saveLocalState({ rsvpOverrides: nextOverrides });
    setSaveNotice(`RSVP marked ${status.toLowerCase()} on this device. Save or re-import the guest list later to make it account data.`);
  };
  const saveGuestDraft = async () => {
    const name = guestName().trim();
    const group = guestGroup().trim() || "Ungrouped";
    if (!name || savingGuest()) return;
    setSaveNotice(null);
    setSavingGuest(true);
    try {
      const notice = props.onSaveGuestDraft
        ? await props.onSaveGuestDraft({
          displayName: name,
          householdLabel: group,
          rsvpStatus: guestRsvp(),
          plusOneAllowed: guestPlusOneAllowed(),
          childrenInvited: guestChildrenInvited(),
          contactLabel: guestContact(),
          mealPreference: guestMeal(),
          dietaryNote: guestDietary(),
          accessibilityNote: guestAccessibility(),
        })
        : "Guest draft saved on this device. Account saving is not connected yet.";
      const nextGuests = [
        ...draftGuests(),
        { name, group, rsvp: guestRsvp() },
      ].slice(-80);
      setDraftGuests(nextGuests);
      saveLocalState({ guests: nextGuests });
      setGuestName("");
      setGuestGroup("");
      setGuestRsvp("Pending");
      setGuestPlusOneAllowed(false);
      setGuestChildrenInvited(false);
      setGuestContact("");
      setGuestMeal("");
      setGuestDietary("");
      setGuestAccessibility("");
      setSaveNotice(notice);
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : "Guest draft could not be saved. Try again.");
    } finally {
      setSavingGuest(false);
    }
  };
  const saveRuleDraft = async () => {
    const labels = [plusOneRule().trim(), childrenRule().trim()].filter(Boolean);
    if (labels.length === 0 || savingRules()) return;
    setSaveNotice(null);
    setSavingRules(true);
    try {
      const notice = props.onSaveGuestRules
        ? await props.onSaveGuestRules({ plusOneRule: plusOneRule().trim(), childrenRule: childrenRule().trim() })
        : "Guest rules saved on this device. Account saving is not connected yet.";
      setSavedRules(labels);
      saveLocalState({ rules: labels });
      setSaveNotice(notice);
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : "Guest rules could not be saved. Try again.");
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #0F766E" aria-hidden="true">
            <WeddingDashboardIcon id="users" class="h-4 w-4" />
          </span>
          <p class="text-lg font-bold tracking-tight text-sky-950">Guests</p>
          <WeddingInfoTip title="Guest list tip" tone="sky">
            Set the RSVP cutoff before final catering numbers are due. Keep meal, access, household, and plus-one notes here so seating and vendor counts stay consistent.
          </WeddingInfoTip>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
          {displayCounts().guestRowCount} guest{displayCounts().guestRowCount === 1 ? "" : "s"}
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-sky-900/75">{props.state.summaryLabel}</p>
      <Show when={saveNotice()}>
        {(notice) => (
          <p class="mt-3 rounded-2xl border border-sky-100 bg-white/75 px-3 py-2 text-xs leading-5 text-sky-950/75">
            {notice()}
          </p>
        )}
      </Show>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-950"
          data-magic-action="open"
          data-magic-icon="guest"
          data-magic-label="Add guest"
          data-magic-id="wedding:guests:add-panel"
          onClick={() => setActivePanel(activePanel() === "guest" ? null : "guest")}
        >
          Add guest
        </button>
        <button
          type="button"
          class="rounded-full border border-sky-200 bg-white/80 px-3 py-2 text-xs font-semibold text-sky-950 transition hover:bg-white"
          data-magic-action="open"
          data-magic-icon="rules"
          data-magic-label="Set guest rules"
          data-magic-id="wedding:guests:rules-panel"
          onClick={() => setActivePanel(activePanel() === "rules" ? null : "rules")}
        >
          Set guest rules
        </button>
      </div>
      <Show when={activePanel() === "guest"}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/80 p-3">
          <p class="text-sm font-semibold text-sky-950">Add a guest draft</p>
          <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Name</span>
              <input
                class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                value={guestName()}
                onInput={(event) => setGuestName(event.currentTarget.value)}
                placeholder="Alex Lee"
              />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Household or group</span>
              <input
                class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                value={guestGroup()}
                onInput={(event) => setGuestGroup(event.currentTarget.value)}
                placeholder="Bride family"
              />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">RSVP</span>
              <select
                class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                value={guestRsvp()}
                onChange={(event) => setGuestRsvp(event.currentTarget.value)}
              >
                <option>Pending</option>
                <option>Attending</option>
                <option>Not attending</option>
              </select>
            </label>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <label class="flex min-w-0 items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-950/75">
              <input
                type="checkbox"
                class="mt-1 h-4 w-4 shrink-0 rounded border-sky-200 text-sky-800"
                checked={guestPlusOneAllowed()}
                onChange={(event) => setGuestPlusOneAllowed(event.currentTarget.checked)}
              />
              <span>
                <span class="block font-semibold text-sky-950">Plus-one included</span>
                <span class="block">Use only when this guest is allowed to bring someone.</span>
              </span>
            </label>
            <label class="flex min-w-0 items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-950/75">
              <input
                type="checkbox"
                class="mt-1 h-4 w-4 shrink-0 rounded border-sky-200 text-sky-800"
                checked={guestChildrenInvited()}
                onChange={(event) => setGuestChildrenInvited(event.currentTarget.checked)}
              />
              <span>
                <span class="block font-semibold text-sky-950">Children included</span>
                <span class="block">Use only when children are named or clearly invited.</span>
              </span>
            </label>
          </div>
          <details class="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2">
            <summary class="cursor-pointer text-xs font-semibold text-sky-950">Add contact, meal, or access notes</summary>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Contact detail</span>
                <input
                  class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                  value={guestContact()}
                  onInput={(event) => setGuestContact(event.currentTarget.value)}
                  placeholder="Email or phone"
                />
              </label>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Meal choice</span>
                <input
                  class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                  value={guestMeal()}
                  onInput={(event) => setGuestMeal(event.currentTarget.value)}
                  placeholder="Chicken, fish, vegetarian"
                />
              </label>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Dietary note</span>
                <input
                  class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                  value={guestDietary()}
                  onInput={(event) => setGuestDietary(event.currentTarget.value)}
                  placeholder="Allergy, vegan, gluten-free"
                />
              </label>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Access note</span>
                <input
                  class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                  value={guestAccessibility()}
                  onInput={(event) => setGuestAccessibility(event.currentTarget.value)}
                  placeholder="Step-free access, wheelchair space"
                />
              </label>
            </div>
          </details>
          <button
            type="button"
            class="mt-3 rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:bg-sky-300"
            disabled={!guestName().trim() || savingGuest()}
            data-magic-action="approve"
            data-magic-icon="save"
            data-magic-label={savingGuest() ? "Saving..." : "Add to guest list"}
            data-magic-id="wedding:guests:add-draft"
            onClick={() => void saveGuestDraft()}
          >
            {savingGuest() ? "Saving..." : "Add to guest list"}
          </button>
          <Show when={draftGuests().length > 0}>
            <ul class="mt-3 space-y-1">
              <For each={draftGuests()}>
                {(guest) => (
                  <li class="rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-2 text-xs text-sky-950/80">
                    <span class="font-semibold">{guest.name}</span> - {guest.group} - {guest.rsvp}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
      <Show when={activePanel() === "rules"}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/80 p-3">
          <p class="text-sm font-semibold text-sky-950">Guest rules</p>
          <div class="mt-2 grid gap-2">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Plus-one rule</span>
              <input
                class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                value={plusOneRule()}
                onInput={(event) => setPlusOneRule(event.currentTarget.value)}
              />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Children rule</span>
              <input
                class="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-400"
                value={childrenRule()}
                onInput={(event) => setChildrenRule(event.currentTarget.value)}
              />
            </label>
          </div>
          <button
            type="button"
            class="mt-3 rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-950"
            disabled={savingRules()}
            data-magic-action="approve"
            data-magic-icon="save"
            data-magic-label={savingRules() ? "Saving..." : "Save guest rules"}
            data-magic-id="wedding:guests:save-rules"
            onClick={() => void saveRuleDraft()}
          >
            {savingRules() ? "Saving..." : "Save guest rules"}
          </button>
          <Show when={savedRules().length > 0}>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <For each={savedRules()}>
                {(rule) => (
                  <span class="max-w-full break-words rounded-full border border-sky-100 bg-sky-50/80 px-2 py-1 text-xs font-semibold text-sky-950/75">
                    {rule}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={guestRows().length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-sky-950/70">Guest RSVP quick actions</p>
              <p class="mt-1 text-xs leading-5 text-sky-950/60">
                Quick changes are local until you save or re-import the guest list.
              </p>
            </div>
            <Show when={(props.state.guestRows?.length ?? 0) > guestRows().length}>
              <span class="max-w-full break-words rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900">
                Showing {guestRows().length} of {props.state.guestRows?.length}
              </span>
            </Show>
          </div>
          <div class="mt-2 space-y-2">
            <For each={guestRows()}>
              {(guest) => (
                <article class="rounded-xl border border-sky-100 bg-sky-50/60 px-2.5 py-2">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-xs font-semibold text-sky-950">{guest.displayName}</p>
                      <p class="mt-0.5 break-words text-[11px] leading-4 text-sky-950/60">
                        {guest.householdLabel} - {guest.sourceLabel}
                      </p>
                    </div>
                    <span class={`max-w-full break-words rounded-full border px-2 py-1 text-[11px] font-semibold ${rsvpToneClass(guest.rsvpStatus)}`}>
                      {guest.rsvpStatus}{guest.locallyChanged ? " (local)" : ""}
                    </span>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={rsvpOptions}>
                      {(status) => (
                        <button
                          type="button"
                          class={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${guest.rsvpStatus === status ? "border-sky-300 bg-white text-sky-950" : "border-sky-100 bg-white/70 text-sky-950/70 hover:bg-white"}`}
                          data-magic-action={status === "Attending" ? "rsvp-yes" : status === "Not attending" ? "rsvp-no" : "open"}
                          data-magic-icon={status === "Attending" ? "check" : status === "Not attending" ? "dismiss" : "clock"}
                          data-magic-label={`${guest.displayName}: ${status}`}
                          data-magic-id={`wedding:guest:${guest.id}:rsvp:${status.toLowerCase().replace(/\W+/g, "-")}`}
                          onClick={() => setGuestRsvpOverride(guest.id, status)}
                        >
                          {status}
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={[guest.mealPreference, guest.dietaryNote, guest.accessibilityNote].some(Boolean)}>
                    <p class="mt-2 break-words text-[11px] leading-4 text-sky-950/60">
                      {[guest.mealPreference, guest.dietaryNote, guest.accessibilityNote].filter(Boolean).join(" - ")}
                    </p>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Attending</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{displayCounts().attendingCount}</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Pending</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{displayCounts().pendingCount}</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Needs</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">
            {displayCounts().needsCount}
          </p>
        </div>
      </div>
      <Show
        when={props.state.warningLabels.length > 0}
        fallback={
          <p class="mt-3 rounded-2xl border border-sky-100 bg-white/70 px-2.5 py-2 text-sm leading-6 text-sky-950/75">
            No guest follow-ups needed right now.
          </p>
        }
      >
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.warningLabels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs font-semibold text-sky-950/75">
                {label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.finalCountOptions.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Final guest count options</p>
          <div class="mt-2 space-y-2">
            <For each={props.state.finalCountOptions}>
              {(option) => (
                <article class="rounded-xl border border-sky-100 bg-sky-50/60 px-2.5 py-2">
                  <div class="flex items-start justify-between gap-2">
                    <p class="min-w-0 break-words text-sm font-semibold text-sky-950">{option.label}</p>
                    <span class="shrink-0 rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
                      {option.headcount}
                    </span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-sky-950/70">{option.recommendationLabel}</p>
                  <p class="mt-1 text-xs leading-5 text-sky-950/60">{option.riskLabel}</p>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.boundaryRuleLabels.length > 0 || props.state.invitationScopeLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Guest rules in effect</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <For each={[...props.state.boundaryRuleLabels, ...props.state.invitationScopeLabels]}>
              {(label) => (
                <span class="max-w-full break-words rounded-full border border-sky-100 bg-sky-50/80 px-2 py-1 text-xs font-semibold text-sky-950/75">
                  {label}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.followUpTaskCandidates.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Guest follow-ups</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.followUpTaskCandidates}>
              {(task) => (
                <li class="text-xs leading-5 text-sky-950/70">
                  <span class="font-semibold">{task.title}</span> - {task.priorityLabel}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.state.sourceLabels.length > 0}>
        <p class="mt-3 text-xs leading-5 text-sky-950/65">
          Sources: {props.state.sourceLabels.slice(0, 3).join(", ")}
        </p>
      </Show>
    </div>
  );
}

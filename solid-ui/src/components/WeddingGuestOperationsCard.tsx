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
import { friendlyErrorText } from "@/lib/visibleErrorText";

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
  availableMealChoices?: readonly string[];
  onSaveGuestDraft?: (input: {
    displayName: string;
    householdLabel: string;
    rsvpStatus: string;
    previousRsvpStatus?: string;
    plusOneAllowed: boolean;
    plusOneMode?: "none" | "named" | "unnamed";
    plusOneName?: string;
    childrenInvited: boolean;
    childName?: string;
    childAgeBand?: "adult" | "child_under_12" | "teen" | "unknown";
    childSeatRequirement?: "standard" | "high_chair" | "booster" | "none" | "unknown";
    childMealRequirement?: "adult" | "child" | "none" | "unknown";
    contactLabel: string;
    rsvpReminderPermission?: boolean;
    mealPreference: string;
    dietaryNote: string;
    accessibilityNote: string;
    personId?: string;
    invitationId?: string;
    eventId?: string;
    responseRevision?: number;
  }) => Promise<string>;
  onSaveGuestRules?: (input: { plusOneRule: string; childrenRule: string }) => Promise<string>;
}) {
  const [activePanel, setActivePanel] = createSignal<"guest" | "rules" | null>(null);
  const [guestName, setGuestName] = createSignal("");
  const [guestGroup, setGuestGroup] = createSignal("");
  const [guestRsvp, setGuestRsvp] = createSignal("Pending");
  const [guestPlusOneAllowed, setGuestPlusOneAllowed] = createSignal(false);
  const [guestPlusOneMode, setGuestPlusOneMode] = createSignal<"named" | "unnamed">("unnamed");
  const [guestPlusOneName, setGuestPlusOneName] = createSignal("");
  const [guestChildrenInvited, setGuestChildrenInvited] = createSignal(false);
  const [guestChildName, setGuestChildName] = createSignal("");
  const [guestChildAgeBand, setGuestChildAgeBand] = createSignal<"child_under_12" | "teen" | "unknown">("unknown");
  const [guestChildSeat, setGuestChildSeat] = createSignal<"standard" | "high_chair" | "booster" | "none" | "unknown">("unknown");
  const [guestChildMeal, setGuestChildMeal] = createSignal<"adult" | "child" | "none" | "unknown">("unknown");
  const [guestContact, setGuestContact] = createSignal("");
  const [guestReminderPermission, setGuestReminderPermission] = createSignal(false);
  const [guestMeal, setGuestMeal] = createSignal("");
  const [manualMealChoice, setManualMealChoice] = createSignal(false);
  const [guestDietary, setGuestDietary] = createSignal("");
  const [guestAccessibility, setGuestAccessibility] = createSignal("");
  const [plusOneRule, setPlusOneRule] = createSignal("No extra plus-ones unless the couple approves them.");
  const [childrenRule, setChildrenRule] = createSignal("Children under 12 are not included unless named on the invite.");
  const localScope = weddingGuestOperationsScopeFromMetadata(props.metadata);
  const localState = loadWeddingGuestOperationsLocalState(localScope);
  const [draftGuests, setDraftGuests] = createSignal<WeddingGuestOperationsLocalDraftGuest[]>(localState.guests);
  const [savedRules, setSavedRules] = createSignal<string[]>(localState.rules);
  const [rsvpOverrides, setRsvpOverrides] = createSignal<Record<string, string>>(localState.rsvpOverrides);
  const [savingRsvpId, setSavingRsvpId] = createSignal<string | null>(null);
  const [savingGuest, setSavingGuest] = createSignal(false);
  const [savingRules, setSavingRules] = createSignal(false);
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const [showAddedGuests, setShowAddedGuests] = createSignal(false);
  const [editingDraftIndex, setEditingDraftIndex] = createSignal<number | null>(null);
  const [guestFilter, setGuestFilter] = createSignal<GuestRsvpStatus | "Replied" | "Needs" | null>(null);
  const displayCounts = createMemo(() => weddingGuestOperationsDisplayCounts(props.state, draftGuests()));
  const responseRowsByGuestId = createMemo(() => new Map(
    props.state.rsvpResponseSummary.rows.map((row) => [row.guestId, row]),
  ));
  const guestRows = createMemo(() => (props.state.guestRows ?? []).map((row) => ({
    ...row,
    rsvpStatus: rsvpOverrides()[row.id] ?? row.rsvpStatus,
    locallyChanged: Boolean(rsvpOverrides()[row.id]),
    responseDetail: responseRowsByGuestId().get(row.id) ?? null,
  })));
  const filteredGuestRows = createMemo(() => guestRows().filter((guest) => {
    if (guestFilter() === null) return true;
    if (guestFilter() === "Replied") return guest.rsvpStatus !== "Pending";
    if (guestFilter() === "Needs") return !guest.contactLabel || (guest.responseDetail?.missingDetailLabels.length ?? 0) > 0;
    return guest.rsvpStatus === guestFilter();
  }));
  const toggleGuestFilter = (filter: GuestRsvpStatus | "Replied" | "Needs") => setGuestFilter((current) => current === filter ? null : filter);
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
  const setGuestRsvpOverride = async (guestId: string, status: GuestRsvpStatus) => {
    const guest = (props.state.guestRows ?? []).find((row) => row.id === guestId);
    if (!guest || savingRsvpId()) return;
    const original = guest.rsvpStatus;
    const eventResponse = guest.eventResponses[0] ?? null;
    setSavingRsvpId(guestId);
    setSaveNotice(null);
    try {
      if (!props.onSaveGuestDraft) throw new Error("Saving is not connected yet.");
      await props.onSaveGuestDraft({
        displayName: guest.displayName,
        householdLabel: guest.householdLabel,
        rsvpStatus: status,
        previousRsvpStatus: original,
        plusOneAllowed: false,
        childrenInvited: false,
        contactLabel: guest.contactLabel ?? "",
        rsvpReminderPermission: guest.rsvpReminderPermission === true,
        mealPreference: guest.mealPreference ?? "",
        dietaryNote: guest.dietaryNote ?? "",
        accessibilityNote: guest.accessibilityNote ?? "",
        personId: guest.personId ?? undefined,
        invitationId: eventResponse?.invitationId,
        eventId: eventResponse?.eventId,
        responseRevision: eventResponse?.revision ?? 0,
      });
    } catch (error) {
      setSaveNotice(friendlyErrorText(error, "RSVP could not be saved. Try again."));
      setSavingRsvpId(null);
      return;
    }
    const nextOverrides = { ...rsvpOverrides() };
    if (original === status) delete nextOverrides[guestId];
    else nextOverrides[guestId] = status;
    setRsvpOverrides(nextOverrides);
    saveLocalState({ rsvpOverrides: nextOverrides });
    setSaveNotice(`${guest.displayName}'s RSVP is saved to your wedding guest list.`);
    setSavingRsvpId(null);
  };
  const saveGuestDraft = async () => {
    const name = guestName().trim();
    const group = guestGroup().trim() || "Ungrouped";
    if (!name || savingGuest()) return;
    if (guestPlusOneAllowed() && guestPlusOneMode() === "named" && !guestPlusOneName().trim()) {
      setSaveNotice("Add the named plus-one, or choose “Name can be added later”.");
      return;
    }
    if (guestChildrenInvited() && !guestChildName().trim()) {
      setSaveNotice("Add the child's name so their RSVP stays separate from the adult guest.");
      return;
    }
    setSaveNotice(null);
    setSavingGuest(true);
    try {
      const notice = props.onSaveGuestDraft
        ? await props.onSaveGuestDraft({
          displayName: name,
          householdLabel: group,
          rsvpStatus: guestRsvp(),
          plusOneAllowed: guestPlusOneAllowed(),
          plusOneMode: guestPlusOneAllowed() ? guestPlusOneMode() : "none",
          plusOneName: guestPlusOneName(),
          childrenInvited: guestChildrenInvited(),
          childName: guestChildName(),
          childAgeBand: guestChildAgeBand(),
          childSeatRequirement: guestChildSeat(),
          childMealRequirement: guestChildMeal(),
          contactLabel: guestContact(),
          rsvpReminderPermission: guestReminderPermission(),
          mealPreference: guestMeal(),
          dietaryNote: guestDietary(),
          accessibilityNote: guestAccessibility(),
        })
        : "Guest draft saved on this device. Account saving is not connected yet.";
      const draft = { name, group, rsvp: guestRsvp() };
      const existingIndex = editingDraftIndex();
      const nextGuests = existingIndex === null
        ? [...draftGuests(), draft].slice(-80)
        : draftGuests().map((guest, index) => index === existingIndex ? draft : guest);
      setDraftGuests(nextGuests);
      saveLocalState({ guests: nextGuests });
      setEditingDraftIndex(null);
      setShowAddedGuests(true);
      setGuestName("");
      setGuestGroup("");
      setGuestRsvp("Pending");
      setGuestPlusOneAllowed(false);
      setGuestPlusOneMode("unnamed");
      setGuestPlusOneName("");
      setGuestChildrenInvited(false);
      setGuestChildName("");
      setGuestChildAgeBand("unknown");
      setGuestChildSeat("unknown");
      setGuestChildMeal("unknown");
      setGuestContact("");
      setGuestReminderPermission(false);
      setGuestMeal("");
      setManualMealChoice(false);
      setGuestDietary("");
      setGuestAccessibility("");
      setSaveNotice(notice);
    } catch (error) {
      setSaveNotice(friendlyErrorText(error, "Guest draft could not be saved. Try again."));
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
      setSaveNotice(friendlyErrorText(error, "Guest rules could not be saved. Try again."));
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:rounded-[28px] sm:p-4">
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
      <div class="mt-3 grid grid-cols-3 gap-2" aria-label="RSVP response summary">
        <button type="button" aria-pressed={guestFilter() === "Replied"} onClick={() => toggleGuestFilter("Replied")} class={`min-w-0 rounded-xl border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 ${guestFilter() === "Replied" ? "border-sky-700 bg-sky-100" : "border-sky-100 bg-white/80"}`}>
          <p class="flex items-center gap-1 text-xs font-semibold text-sky-950/65"><WeddingDashboardIcon id="check-circle" class="h-4 w-4" />Replied</p>
          <p class="mt-1 text-xl font-semibold text-sky-950">{props.state.rsvpResponseSummary.repliedCount}</p>
        </button>
        <button type="button" aria-pressed={guestFilter() === "Pending"} onClick={() => toggleGuestFilter("Pending")} class={`min-w-0 rounded-xl border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 ${guestFilter() === "Pending" ? "border-amber-700 bg-amber-100" : "border-amber-100 bg-amber-50/80"}`}>
          <p class="flex items-center gap-1 text-xs font-semibold text-amber-950/70"><WeddingDashboardIcon id="clock" class="h-4 w-4" />Pending</p>
          <p class="mt-1 text-xl font-semibold text-amber-950">{props.state.rsvpResponseSummary.awaitingCount}</p>
        </button>
        <button type="button" aria-pressed={guestFilter() === "Needs"} onClick={() => toggleGuestFilter("Needs")} class={`min-w-0 rounded-xl border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 ${guestFilter() === "Needs" ? "border-rose-700 bg-rose-100" : "border-rose-100 bg-rose-50/80"}`}>
          <p class="flex items-center gap-1 text-xs font-semibold text-rose-950/70"><WeddingDashboardIcon id="alert-circle" class="h-4 w-4" />Need details</p>
          <p class="mt-1 text-xl font-semibold text-rose-950">{props.state.rsvpResponseSummary.incompleteCount}</p>
        </button>
      </div>
      <Show when={saveNotice()}>
        {(notice) => (
          <p class="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-sky-950/75">
            {notice()}
          </p>
        )}
      </Show>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 flex-1 rounded-lg bg-sky-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-950 sm:flex-none"
          data-magic-action="open"
          data-magic-icon="guest"
          data-magic-label="Add guest"
          data-magic-id="wedding:guests:add-panel"
          onClick={() => setActivePanel(activePanel() === "guest" ? null : "guest")}
        >
          Add or group guest
        </button>
        <button
          type="button"
          class="min-h-11 flex-1 rounded-lg border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-950 transition hover:bg-sky-50 sm:flex-none"
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
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p class="text-sm font-semibold text-sky-950">Add or group a guest</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/65">Use a saved guest's exact name and choose their household to move them into a family or group.</p>
          <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Name</span>
              <input
                class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={guestName()}
                onInput={(event) => setGuestName(event.currentTarget.value)}
                placeholder="Alex Lee"
              />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Household or group</span>
              <input
                class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={guestGroup()}
                onInput={(event) => setGuestGroup(event.currentTarget.value)}
                placeholder="Bride family"
              />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">RSVP</span>
              <select
                class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
            <GuestSwitchRow
              label="Plus-one included"
              hint="Only if this guest may bring someone."
              checked={guestPlusOneAllowed()}
              onChange={setGuestPlusOneAllowed}
            />
            <GuestSwitchRow
              label="Children included"
              hint="Only if children are named or clearly invited."
              checked={guestChildrenInvited()}
              onChange={setGuestChildrenInvited}
            />
          </div>
          <Show when={guestPlusOneAllowed()}>
            <div class="mt-3 grid gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 sm:grid-cols-2">
              <label class="text-xs font-semibold text-sky-950">Plus-one type
                <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={guestPlusOneMode()} onChange={(event) => setGuestPlusOneMode(event.currentTarget.value as "named" | "unnamed")}>
                  <option value="unnamed">Name can be added later</option>
                  <option value="named">Named person</option>
                </select>
              </label>
              <Show when={guestPlusOneMode() === "named"}>
                <label class="text-xs font-semibold text-sky-950">Plus-one name
                  <input maxlength="120" class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={guestPlusOneName()} onInput={(event) => setGuestPlusOneName(event.currentTarget.value)} placeholder="Taylor Lee" />
                </label>
              </Show>
              <p class="text-xs leading-5 text-sky-950/70 sm:col-span-2">A plus-one becomes a separate guest and invitation in this household, so their RSVP, meal and seat stay individually reconcilable.</p>
            </div>
          </Show>
          <Show when={guestChildrenInvited()}>
            <div class="mt-3 grid gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 sm:grid-cols-2">
              <label class="text-xs font-semibold text-sky-950">Child name
                <input maxlength="120" class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={guestChildName()} onInput={(event) => setGuestChildName(event.currentTarget.value)} placeholder="Avery Lee" />
              </label>
              <label class="text-xs font-semibold text-sky-950">Age band
                <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={guestChildAgeBand()} onChange={(event) => setGuestChildAgeBand(event.currentTarget.value as "child_under_12" | "teen" | "unknown")}><option value="unknown">Not recorded</option><option value="child_under_12">Under 12</option><option value="teen">Teen</option></select>
              </label>
              <label class="text-xs font-semibold text-sky-950">Seat requirement
                <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={guestChildSeat()} onChange={(event) => setGuestChildSeat(event.currentTarget.value as "standard" | "high_chair" | "booster" | "none" | "unknown")}><option value="unknown">Confirm later</option><option value="standard">Standard seat</option><option value="high_chair">High chair</option><option value="booster">Booster seat</option><option value="none">No seat needed</option></select>
              </label>
              <label class="text-xs font-semibold text-sky-950">Meal requirement
                <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={guestChildMeal()} onChange={(event) => setGuestChildMeal(event.currentTarget.value as "adult" | "child" | "none" | "unknown")}><option value="unknown">Confirm later</option><option value="child">Child meal</option><option value="adult">Adult meal</option><option value="none">No meal needed</option></select>
              </label>
              <p class="text-xs leading-5 text-sky-950/70 sm:col-span-2">Add one named child at a time. Use “Add or group guest” again for another child so each person keeps their own RSVP.</p>
            </div>
          </Show>
          <details class="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-sky-950">Add contact, meal, or access notes</summary>
            <div class="grid gap-2 pb-3 sm:grid-cols-2">
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Contact detail</span>
                <input
                  class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={guestContact()}
                  onInput={(event) => setGuestContact(event.currentTarget.value)}
                  placeholder="Email or phone"
                />
              </label>
              <label class="flex min-h-11 items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-sky-950 sm:col-span-2">
                <input type="checkbox" class="mt-0.5 h-5 w-5" checked={guestReminderPermission()} onChange={(event) => setGuestReminderPermission(event.currentTarget.checked)} />
                <span>Allow RSVP reminders to this contact only. Off means OmnyID will not prepare or send reminders to them.</span>
              </label>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Meal choice</span>
                <Show when={(props.availableMealChoices?.length ?? 0) > 0 && !manualMealChoice()} fallback={
                  <input
                    class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    value={guestMeal()}
                    onInput={(event) => setGuestMeal(event.currentTarget.value)}
                    placeholder="Enter a choice confirmed by the venue"
                  />
                }>
                  <select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-sky-950" value={guestMeal()} onChange={(event) => { if (event.currentTarget.value === "__manual") { setGuestMeal(""); setManualMealChoice(true); } else setGuestMeal(event.currentTarget.value); }}>
                    <option value="">Choose one</option>
                    <For each={props.availableMealChoices ?? []}>{(option) => <option value={option}>{option}</option>}</For>
                    <option value="__manual">Enter another confirmed choice</option>
                  </select>
                </Show>
                <Show when={manualMealChoice()}><button type="button" class="mt-1 text-xs font-semibold text-sky-800 underline underline-offset-2" onClick={() => { setGuestMeal(""); setManualMealChoice(false); }}>Use venue choices</button></Show>
              </label>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Dietary note</span>
                <input
                  class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={guestDietary()}
                  onInput={(event) => setGuestDietary(event.currentTarget.value)}
                  placeholder="Allergy, vegan, gluten-free"
                />
              </label>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-sky-950/70">Access note</span>
                <input
                  class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  value={guestAccessibility()}
                  onInput={(event) => setGuestAccessibility(event.currentTarget.value)}
                  placeholder="Step-free access, wheelchair space"
                />
              </label>
            </div>
          </details>
          <button
            type="button"
            class="mt-3 min-h-11 w-full rounded-lg bg-sky-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:bg-sky-300 sm:w-auto"
            disabled={!guestName().trim() || savingGuest()}
            data-magic-action="approve"
            data-magic-icon="save"
            data-magic-label={savingGuest() ? "Saving..." : "Add to guest list"}
            data-magic-id="wedding:guests:add-draft"
            onClick={() => void saveGuestDraft()}
          >
            {savingGuest() ? "Saving..." : editingDraftIndex() === null ? "Add to guest list" : "Save guest changes"}
          </button>
          <Show when={draftGuests().length > 0}>
            <div class="mt-3">
              <button type="button" class="text-xs font-semibold text-sky-800 underline underline-offset-2" onClick={() => setShowAddedGuests((value) => !value)}>
                {showAddedGuests() ? "Hide added guests" : `Show ${draftGuests().length} added guest${draftGuests().length === 1 ? "" : "s"}`}
              </button>
              <Show when={showAddedGuests()}>
                <ul class="mt-2 space-y-1"><For each={draftGuests()}>{(guest, index) => (
                  <li><button type="button" class="w-full rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-2 text-left text-xs text-sky-950/80 hover:border-sky-300" onClick={() => { setGuestName(guest.name); setGuestGroup(guest.group); setGuestRsvp(guest.rsvp); setEditingDraftIndex(index()); }}><span class="font-semibold">{guest.name}</span> - {guest.group} - {guest.rsvp}</button></li>
                )}</For></ul>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={activePanel() === "rules"}>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p class="text-sm font-semibold text-sky-950">Guest rules</p>
          <div class="mt-2 grid gap-2">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Plus-one rule</span>
              <input
                class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={plusOneRule()}
                onInput={(event) => setPlusOneRule(event.currentTarget.value)}
              />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-sky-950/70">Children rule</span>
              <input
                class="mt-1 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-sky-950 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={childrenRule()}
                onInput={(event) => setChildrenRule(event.currentTarget.value)}
              />
            </label>
          </div>
          <button
            type="button"
            class="mt-3 min-h-11 w-full rounded-lg bg-sky-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:bg-sky-300 sm:w-auto"
            disabled={savingRules()}
            data-magic-action="approve"
            data-magic-icon="save"
            data-magic-label={savingRules() ? "Saving..." : "Save guest rules"}
            data-magic-id="wedding:guests:save-rules"
            onClick={() => void saveRuleDraft()}
          >
            {savingRules() ? "Saving..." : "Save guest rules"}
          </button>
          <p class="mt-2 text-xs leading-5 text-sky-950/65">Save these rules so new invitations and guest decisions use the same plus-one and children guidance.</p>
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
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-sky-950/70">Guest RSVP quick actions</p>
              <p class="mt-1 text-xs leading-5 text-sky-950/75">Choose a status to save it to this wedding guest list.</p>
            </div>
            <Show when={guestFilter()}>
              <button type="button" class="min-h-10 rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-950" onClick={() => setGuestFilter(null)}>
                Show all guests
              </button>
            </Show>
          </div>
          <div class="mt-2 space-y-2">
            <For each={filteredGuestRows()}>
              {(guest) => (
                <article class="rounded-xl border border-sky-100 bg-sky-50/60 px-2.5 py-2 phone:rounded-none phone:border-0 phone:border-t phone:border-slate-200 phone:bg-transparent phone:px-0 phone:py-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-sm font-semibold text-sky-950">{guest.displayName}</p>
                      <p class="mt-0.5 break-words text-xs leading-4 text-sky-950/75">
                        {guest.householdLabel} - {guest.sourceLabel}
                      </p>
                      <Show when={guest.responseDetail}>
                        {(detail) => (
                          <p class="mt-1 break-words text-xs font-semibold leading-4 text-sky-950/70">
                            {detail().statusLabel} · {detail().provenanceLabel}
                            {detail().eventCount > 1 ? ` · ${detail().eventCount} events` : ""}
                          </p>
                        )}
                      </Show>
                    </div>
                    <span class={`max-w-full break-words rounded-full border px-2 py-1 text-xs font-semibold ${rsvpToneClass(guest.rsvpStatus)}`}>
                      {guest.rsvpStatus}{guest.locallyChanged ? " (local)" : ""}
                    </span>
                  </div>
                  <div class="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label={`RSVP for ${guest.displayName}`}>
                    <For each={rsvpOptions}>
                      {(status) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={guest.rsvpStatus === status}
                          disabled={savingRsvpId() === guest.id}
                          class={`min-h-11 rounded-md px-1 text-xs font-semibold transition ${guest.rsvpStatus === status ? "bg-sky-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                          data-magic-action={status === "Attending" ? "rsvp-yes" : status === "Not attending" ? "rsvp-no" : "open"}
                          data-magic-icon={status === "Attending" ? "check" : status === "Not attending" ? "dismiss" : "clock"}
                          data-magic-label={`${guest.displayName}: ${status}`}
                          data-magic-id={`wedding:guest:${guest.id}:rsvp:${status.toLowerCase().replace(/\W+/g, "-")}`}
                          onClick={() => void setGuestRsvpOverride(guest.id, status)}
                        >
                          {savingRsvpId() === guest.id ? "Saving..." : status}
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={[guest.mealPreference, guest.dietaryNote, guest.accessibilityNote].some(Boolean)}>
                    <p class="mt-2 break-words text-xs leading-4 text-sky-950/75">
                      {[guest.mealPreference, guest.dietaryNote, guest.accessibilityNote].filter(Boolean).join(" - ")}
                    </p>
                  </Show>
                  <Show when={(guest.responseDetail?.missingDetailLabels.length ?? 0) > 0}>
                    <p class="mt-2 break-words text-xs font-semibold leading-4 text-amber-900">
                      {guest.responseDetail?.missingDetailLabels.join(" · ")}
                    </p>
                  </Show>
                  <Show when={guest.responseDetail?.privacyLabel}>
                    <p class="mt-1 break-words text-xs leading-4 text-sky-950/75">
                      {guest.responseDetail?.privacyLabel}
                    </p>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
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
              <span class="max-w-full break-words rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-sky-950/75">
                {label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.finalCountOptions.length > 0}>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p class="text-xs font-semibold text-sky-950/70">Final guest count options</p>
          <Show when={props.state.approvedFinalCount}>
            {(approval) => (
              <p class="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
                Approved final count: {approval().headcount} · {approval().optionLabel}
              </p>
            )}
          </Show>
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
                  <p class="mt-1 text-xs leading-5 text-sky-950/75">{option.riskLabel}</p>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.boundaryRuleLabels.length > 0 || props.state.invitationScopeLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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

function GuestSwitchRow(props: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      class="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border-2 border-sky-800 bg-sky-50 px-3 py-2 text-left shadow-sm"
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-sky-950">{props.label}</span>
        <span class="block text-xs text-sky-950/75">{props.hint}</span>
      </span>
      <span class={`relative h-7 w-12 shrink-0 rounded-full border-2 border-sky-950 transition ${props.checked ? "bg-sky-800" : "bg-white"}`} aria-hidden="true">
        <span class={`absolute top-0.5 h-5 w-5 rounded-full border border-sky-950 bg-white shadow transition-all ${props.checked ? "left-5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

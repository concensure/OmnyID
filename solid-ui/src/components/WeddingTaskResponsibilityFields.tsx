import { createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import { loadContacts, saveContacts } from "@/lib/contactsLocalState";
import {
  loadWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  upsertWeddingHelperContact,
  weddingHelperContactToAfpSendInput,
  weddingHelperResponsibilityToAfpSendInput,
} from "@/lib/weddingHelpersPanelState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

type Task = WeddingResponseWorkspaceViewState["planningTaskItems"][number];
const ROLES = ["Partner", "Parent / guardian", "Wedding party", "Planner", "Coordinator", "Celebrant", "Family", "Friend", "Vendor", "Other"];

export function WeddingTaskResponsibilityFields(props: {
  task: Task;
  state: WeddingResponseWorkspaceViewState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  contactUserId?: string | null;
}) {
  const workspaceId = () => props.state.workspace.metadata.responseWorkspaceId;
  const initial = loadWeddingHelperLocalState(workspaceId());
  const [owner, setOwner] = createSignal(initial.taskAssignees[props.task.id] ?? props.task.assignee?.trim() ?? "You");
  const [consult, setConsult] = createSignal(initial.taskConsultedPeople[props.task.id] ?? "");
  const [lastContact, setLastContact] = createSignal(initial.taskLastContactDates[props.task.id] ?? "");
  const [addingPerson, setAddingPerson] = createSignal(false);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [role, setRole] = createSignal("Wedding party");
  const [notice, setNotice] = createSignal<string | null>(null);
  const people = createMemo(() => {
    const contacts = loadContacts(props.contactUserId).map((contact) => contact.name);
    return [...new Set(["You", ...props.state.helperContactNames, ...initial.customHelpers, ...contacts].map((item) => item.trim()).filter(Boolean))];
  });

  async function persist(next: { owner?: string; consult?: string; lastContact?: string }): Promise<void> {
    const current = loadWeddingHelperLocalState(workspaceId());
    const ownerLabel = next.owner ?? owner();
    const consultedLabel = next.consult ?? consult();
    const lastContactDate = next.lastContact ?? lastContact();
    saveWeddingHelperLocalState(workspaceId(), {
      ...current,
      taskAssignees: { ...current.taskAssignees, [props.task.id]: ownerLabel },
      taskConsultedPeople: { ...current.taskConsultedPeople, [props.task.id]: consultedLabel },
      taskLastContactDates: { ...current.taskLastContactDates, [props.task.id]: lastContactDate },
    });
    if (!props.saveProjection) return;
    const message = weddingHelperResponsibilityToAfpSendInput({
      task: props.task,
      metadata: props.state.workspace.metadata,
      ownerLabel,
      consultedLabel,
      lastContactDate,
      status: "open",
    });
    if (!message) return;
    try {
      await props.saveProjection(message);
      setNotice("Responsibility details saved.");
    } catch {
      setNotice("Saved on this device. Wedding memory will sync when available.");
    }
  }

  async function addPerson(): Promise<void> {
    const cleanName = name().trim();
    if (!cleanName) return;
    const current = loadWeddingHelperLocalState(workspaceId());
    const customHelpers = [...new Set([...current.customHelpers, cleanName])];
    saveWeddingHelperLocalState(workspaceId(), { ...current, customHelpers });
    const updated = upsertWeddingHelperContact(loadContacts(props.contactUserId), { name: cleanName, email: email(), phone: phone(), role: role() });
    if (updated) saveContacts(updated.contacts, props.contactUserId);
    setConsult(cleanName);
    setAddingPerson(false);
    await persist({ consult: cleanName });
    const message = weddingHelperContactToAfpSendInput({ name: cleanName, email: email(), phone: phone(), role: role(), metadata: props.state.workspace.metadata });
    if (message && props.saveProjection) {
      try { await props.saveProjection(message); props.onRefreshWorkspace?.(); } catch { /* local contact remains usable */ }
    }
    setName(""); setEmail(""); setPhone("");
  }

  return (
    <section class="mb-4 rounded-lg border border-wedding-border bg-wedding-slate p-3" aria-label={`Responsibility for ${props.task.title}`}>
      <p class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/65">People and contact</p>
      <div class="mt-2 grid gap-3 sm:grid-cols-3">
        <label class="text-xs font-semibold text-wedding-ink">Owner
          <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-2 text-sm font-normal" value={owner()} onChange={(event) => { setOwner(event.currentTarget.value); void persist({ owner: event.currentTarget.value }); }}>
            <For each={people()}>{(person) => <option value={person}>{person}</option>}</For>
          </select>
        </label>
        <label class="text-xs font-semibold text-wedding-ink">Consult
          <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-2 text-sm font-normal" value={consult()} onChange={(event) => { const value = event.currentTarget.value; if (value === "__add") setAddingPerson(true); else { setConsult(value); void persist({ consult: value }); } }}>
            <option value="">No one yet</option>
            <For each={people().filter((person) => person !== "You")}>{(person) => <option value={person}>{person}</option>}</For>
            <option value="__add">+ Add a person</option>
          </select>
        </label>
        <label class="text-xs font-semibold text-wedding-ink">Last contact
          <input type="date" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-2 text-sm font-normal" value={lastContact()} onInput={(event) => setLastContact(event.currentTarget.value)} onChange={(event) => void persist({ lastContact: event.currentTarget.value })} />
        </label>
      </div>
      <Show when={addingPerson()}>
        <div class="mt-3 grid gap-2 rounded-lg border border-wedding-border bg-white p-3 sm:grid-cols-2" aria-label="Add wedding contact">
          <label class="text-xs font-semibold text-wedding-ink">Name<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3 text-sm font-normal" value={name()} onInput={(event) => setName(event.currentTarget.value)} /></label>
          <label class="text-xs font-semibold text-wedding-ink">Wedding role<select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-2 text-sm font-normal" value={role()} onChange={(event) => setRole(event.currentTarget.value)}><For each={ROLES}>{(item) => <option value={item}>{item}</option>}</For></select></label>
          <label class="text-xs font-semibold text-wedding-ink">Email<input type="email" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3 text-sm font-normal" value={email()} onInput={(event) => setEmail(event.currentTarget.value)} /></label>
          <label class="text-xs font-semibold text-wedding-ink">Phone<input type="tel" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3 text-sm font-normal" value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} /></label>
          <div class="flex gap-2 sm:col-span-2"><button type="button" disabled={!name().trim()} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void addPerson()}>Add and consult</button><button type="button" class="min-h-11 rounded-lg border border-wedding-border px-4 text-sm font-semibold" onClick={() => setAddingPerson(false)}>Cancel</button></div>
        </div>
      </Show>
      <Show when={notice()}>{(message) => <p class="mt-2 text-xs text-wedding-ink/65" role="status">{message()}</p>}</Show>
    </section>
  );
}

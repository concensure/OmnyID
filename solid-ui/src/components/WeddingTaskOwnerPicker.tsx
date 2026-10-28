import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { readSession, type SendAfpMessageInput } from "@/lib/api";
import { loadContacts, saveContacts, subscribeContactsChangedEvent } from "@/lib/contactsLocalState";
import {
  loadWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  upsertWeddingHelperContact,
  weddingHelperContactToAfpSendInput,
} from "@/lib/weddingHelpersPanelState";

const ADD_CONTACT_VALUE = "__add_contact__";
const WEDDING_ROLES = ["Partner", "Parent / guardian", "Wedding party", "Planner", "Coordinator", "Celebrant", "Family", "Friend", "Vendor", "Other"];

export function WeddingTaskOwnerPicker(props: {
  value: string;
  onChange: (value: string) => void;
  people?: readonly string[] | null;
  weddingPlanId: string;
  responseWorkspaceId: string;
  contactUserId?: string | null;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown> | unknown) | null;
  compact?: boolean;
}) {
  const userId = () => props.contactUserId ?? readSession()?.user?.id ?? null;
  const [revision, setRevision] = createSignal(0);
  const [adding, setAdding] = createSignal(false);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [role, setRole] = createSignal("Wedding party");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const people = createMemo(() => {
    revision();
    const local = loadWeddingHelperLocalState(props.responseWorkspaceId);
    const contacts = loadContacts(userId()).map((contact) => contact.name);
    return [...new Set(["You", props.value, ...(props.people ?? []), ...local.customHelpers, ...contacts]
      .map((value) => value.trim()).filter(Boolean))];
  });

  onMount(() => {
    const unsubscribe = subscribeContactsChangedEvent(() => setRevision((value) => value + 1));
    onCleanup(unsubscribe);
  });

  async function addContact(): Promise<void> {
    const cleanName = name().trim();
    if (!cleanName || busy()) return;
    setBusy(true);
    setNotice(null);
    const current = loadWeddingHelperLocalState(props.responseWorkspaceId);
    saveWeddingHelperLocalState(props.responseWorkspaceId, {
      ...current,
      customHelpers: [...new Set([...current.customHelpers, cleanName])],
    });
    const updated = upsertWeddingHelperContact(loadContacts(userId()), {
      name: cleanName,
      email: email(),
      phone: phone(),
      role: role(),
    });
    if (updated) saveContacts(updated.contacts, userId());
    props.onChange(cleanName);
    setRevision((value) => value + 1);
    const message = weddingHelperContactToAfpSendInput({
      name: cleanName,
      email: email(),
      phone: phone(),
      role: role(),
      metadata: { wedding_plan_id: props.weddingPlanId, response_workspace_id: props.responseWorkspaceId },
    });
    if (message && props.saveProjection) {
      try {
        await props.saveProjection(message);
        setNotice(`${cleanName} was added to wedding contacts.`);
      } catch {
        setNotice(`${cleanName} was added on this device. Account sync will retry when available.`);
      }
    } else {
      setNotice(`${cleanName} was added to this device.`);
    }
    setName(""); setEmail(""); setPhone(""); setAdding(false); setBusy(false);
  }

  return (
    <div class="min-w-0">
      <select
        class={`${props.compact ? "min-h-10" : "min-h-11"} w-full rounded-lg border border-wedding-border bg-white px-2 text-sm font-normal text-wedding-ink`}
        value={props.value}
        onChange={(event) => {
          if (event.currentTarget.value === ADD_CONTACT_VALUE) {
            setAdding(true);
            event.currentTarget.value = props.value;
          } else {
            props.onChange(event.currentTarget.value);
          }
        }}
      >
        <For each={people()}>{(person) => <option value={person}>{person}</option>}</For>
        <option value={ADD_CONTACT_VALUE}>+ Add contact</option>
      </select>
      <Show when={adding()}>
        <div class="mt-2 grid gap-2 rounded-lg border border-wedding-border bg-wedding-page p-3 sm:grid-cols-2" aria-label="Add wedding contact">
          <label class="text-xs font-semibold text-wedding-ink">Name<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal" value={name()} onInput={(event) => setName(event.currentTarget.value)} /></label>
          <label class="text-xs font-semibold text-wedding-ink">Wedding role<select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-2 font-normal" value={role()} onChange={(event) => setRole(event.currentTarget.value)}><For each={WEDDING_ROLES}>{(item) => <option value={item}>{item}</option>}</For></select></label>
          <label class="text-xs font-semibold text-wedding-ink">Email<input type="email" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal" value={email()} onInput={(event) => setEmail(event.currentTarget.value)} /></label>
          <label class="text-xs font-semibold text-wedding-ink">Phone<input type="tel" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 font-normal" value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} /></label>
          <div class="flex gap-2 sm:col-span-2">
            <button type="button" disabled={!name().trim() || busy()} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void addContact()}>{busy() ? "Adding…" : "Add contact"}</button>
            <button type="button" class="min-h-11 rounded-lg border border-wedding-border bg-white px-4 text-sm font-semibold" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      </Show>
      <Show when={notice()}>{(message) => <p class="mt-1 text-xs text-wedding-ink/65" role="status">{message()}</p>}</Show>
    </div>
  );
}

// @locs-version: 1.0
import { createSignal } from "solid-js";
import type { Contact } from "@/lib/contactsLocalState";
import type { ResponseQueueRelationship } from "@/lib/responseQueuePolicy";

const RELATIONSHIP_OPTIONS: Array<{ value: ResponseQueueRelationship; label: string }> = [
  { value: "other", label: "Other" },
  { value: "supplier", label: "Supplier" },
  { value: "client", label: "Client" },
  { value: "team", label: "Team" },
  { value: "friend", label: "Friend" },
];

export function ContactEditControls(props: {
  contact: Contact;
  onSave: (contact: Contact) => boolean;
  onCancel: () => void;
}) {
  const [name, setName] = createSignal(props.contact.name);
  const [email, setEmail] = createSignal(props.contact.email ?? "");
  const [phone, setPhone] = createSignal(props.contact.phone ?? "");
  const [relationshipKind, setRelationshipKind] = createSignal<ResponseQueueRelationship>(props.contact.relationshipKind);
  const [responseSlaHours, setResponseSlaHours] = createSignal(String(props.contact.responseSlaHours ?? 24));

  function save() {
    const trimmedName = name().trim();
    if (!trimmedName) return;
    const hours = Number(responseSlaHours());
    const saved = props.onSave({
      ...props.contact,
      name: trimmedName,
      email: email().trim() || undefined,
      phone: phone().trim() || undefined,
      relationshipKind: relationshipKind(),
      responseSlaHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
    });
    if (saved) props.onCancel();
  }

  return (
    <div class="mt-2 space-y-2 rounded-xl border border-slate-200/70 bg-white/70 p-3">
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="space-y-1">
          <span class="text-[11px] text-on-surface-variant/70">Name</span>
          <input
            type="text"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            class="w-full rounded-lg border border-white/50 bg-white/80 px-2 py-1.5 text-[11px] outline-none transition focus:border-primary/40"
          />
        </label>
        <label class="space-y-1">
          <span class="text-[11px] text-on-surface-variant/70">Email or agent ID</span>
          <input
            type="text"
            value={email()}
            onInput={(event) => setEmail(event.currentTarget.value)}
            class="w-full rounded-lg border border-white/50 bg-white/80 px-2 py-1.5 text-[11px] outline-none transition focus:border-primary/40"
          />
        </label>
        <label class="space-y-1">
          <span class="text-[11px] text-on-surface-variant/70">Phone</span>
          <input
            type="tel"
            value={phone()}
            onInput={(event) => setPhone(event.currentTarget.value)}
            class="w-full rounded-lg border border-white/50 bg-white/80 px-2 py-1.5 text-[11px] outline-none transition focus:border-primary/40"
          />
        </label>
        <label class="space-y-1">
          <span class="text-[11px] text-on-surface-variant/70">Follow-up type</span>
          <select
            value={relationshipKind()}
            onInput={(event) => setRelationshipKind(event.currentTarget.value as ResponseQueueRelationship)}
            class="w-full rounded-lg border border-white/50 bg-white/80 px-2 py-1.5 text-[11px] outline-none transition focus:border-primary/40"
          >
            {RELATIONSHIP_OPTIONS.map((option) => <option value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label class="space-y-1 sm:col-span-2">
          <span class="text-[11px] text-on-surface-variant/70">Reply target in hours</span>
          <input
            type="number"
            min="1"
            max="336"
            value={responseSlaHours()}
            onInput={(event) => setResponseSlaHours(event.currentTarget.value)}
            class="w-full rounded-lg border border-white/50 bg-white/80 px-2 py-1.5 text-[11px] outline-none transition focus:border-primary/40"
          />
        </label>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={!name().trim()}
          class="rounded-full bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save contact
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          class="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[10px] text-slate-700 transition hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import type { Contact } from "@/lib/contactsLocalState";
import {
  addContactRole,
  buildContactRoleOptions,
  normalizeContactRoleLabel,
  removeContactRole,
} from "@/lib/contactRoleState";

export function ContactRoleChips(props: {
  roles: string[];
  onRemove: (role: string) => void;
  compact?: boolean;
}) {
  return (
    <For each={props.roles}>
      {(role) => (
        <button
          type="button"
          onClick={() => props.onRemove(role)}
          classList={{
            "max-w-full rounded-full border border-primary/15 bg-primary/10 font-semibold text-primary break-words transition hover:bg-primary/15": true,
            "px-2 py-1 text-[10px]": props.compact !== false,
            "px-2.5 py-1.5 text-[11px]": props.compact === false,
          }}
          title="Remove role"
        >
          {role} x
        </button>
      )}
    </For>
  );
}

export function ContactRoleInput(props: {
  id: string;
  contacts: Contact[];
  roles: string[];
  onChange: (roles: string[]) => void;
  placeholder: string;
  description?: string;
  compact?: boolean;
}) {
  const [draft, setDraft] = createSignal("");
  const options = () => buildContactRoleOptions({
    contacts: props.contacts,
    context: "wedding",
    query: draft(),
  });
  const addRole = () => {
    const role = normalizeContactRoleLabel(draft());
    if (!role) return;
    props.onChange(addContactRole(props.roles, role));
    setDraft("");
  };

  return (
    <div classList={{
      "rounded-2xl border border-slate-200/70 bg-white/50": true,
      "p-3": !props.compact,
      "p-2": props.compact,
    }}>
      <datalist id={props.id}>
        <For each={options()}>
          {(role) => <option value={role} />}
        </For>
      </datalist>
      <div class="flex flex-col gap-2 sm:flex-row">
        <label class="min-w-0 flex-1 space-y-1">
          <span class="text-[11px] text-on-surface-variant/70">Role labels</span>
          <input
            type="text"
            list={props.id}
            placeholder={props.placeholder}
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addRole();
              }
            }}
            class="w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
          />
        </label>
        <button
          type="button"
          onClick={addRole}
          disabled={!normalizeContactRoleLabel(draft())}
          class="rounded-xl border border-primary/20 bg-white/70 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
        >
          Add role
        </button>
      </div>
      <Show when={props.description}>
        {(description) => (
          <p class="mt-2 text-[11px] leading-4 text-on-surface-variant">{description()}</p>
        )}
      </Show>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <For each={options().slice(0, 8)}>
          {(role) => <button type="button" class="min-h-9 rounded-full border border-primary/25 bg-primary/10 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/15" onClick={() => props.onChange(addContactRole(props.roles, role))}>+ {role}</button>}
        </For>
      </div>
      <Show when={props.roles.length > 0}>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <ContactRoleChips
            roles={props.roles}
            compact={props.compact}
            onRemove={(role) => props.onChange(removeContactRole(props.roles, role))}
          />
        </div>
      </Show>
    </div>
  );
}

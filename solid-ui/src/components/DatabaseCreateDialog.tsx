// @locs-version: 1.0
import { createEffect, createSignal, For, Show } from "solid-js";

import { DialogShell } from "@/components/DialogShell";
import type { RegisteredDatabaseProfile } from "@/lib/databaseRegistryState";

export type DatabaseCreateInput = {
  name: string;
  defaultTable: string;
  profileId: string | null;
  weddingPlanId: string | null;
};

export function DatabaseCreateDialog(props: {
  open: boolean;
  profiles: RegisteredDatabaseProfile[];
  busy: boolean;
  error: string;
  onCancel: () => void;
  onCreate: (input: DatabaseCreateInput) => void;
}) {
  const [choice, setChoice] = createSignal("blank");
  const [name, setName] = createSignal("Untitled database");
  const [defaultTable, setDefaultTable] = createSignal("default");
  let lastOpen = false;
  createEffect(() => {
    if (props.open && !lastOpen) {
      setChoice("blank");
      setName("Untitled database");
      setDefaultTable("default");
    }
    lastOpen = props.open;
  });
  const selectChoice = (nextChoice: string) => {
    setChoice(nextChoice);
    const profile = props.profiles.find((item) => item.profileId === nextChoice);
    setName(profile?.defaultName ?? "Untitled database");
    setDefaultTable(profile?.defaultTable ?? "default");
  };
  const submit = () => {
    const profile = props.profiles.find((item) => item.profileId === choice());
    props.onCreate({
      name: name().trim(),
      defaultTable: defaultTable().trim(),
      profileId: profile?.profileId ?? null,
      weddingPlanId: profile?.weddingPlanId ?? null,
    });
  };
  return (
    <Show when={props.open}>
      <DialogShell
        open
        labelledBy="database-create-title"
        describedBy="database-create-detail"
        busy={props.busy}
        focusableSelector="input:not([disabled])"
        overlayClass="fixed inset-0 z-[200] flex items-end justify-center bg-on-surface/35 p-3 backdrop-blur-sm sm:items-center"
        dialogClass="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-outline/15 bg-white p-4 shadow-2xl sm:p-6"
        onClose={() => { if (!props.busy) props.onCancel(); }}
      >
        <h2 id="database-create-title" class="text-xl font-bold text-on-surface">Create a database</h2>
        <p id="database-create-detail" class="mt-1 text-sm leading-6 text-on-surface-variant">Start blank or choose a registered profile. You can still add ordinary tables and records later.</p>
        <fieldset class="mt-4 space-y-2">
          <legend class="text-xs font-semibold uppercase tracking-wide text-outline">Starting point</legend>
          <label class={`flex cursor-pointer gap-3 rounded-xl border p-3 ${choice() === "blank" ? "border-primary bg-primary/5" : "border-outline/15"}`}>
            <input type="radio" name="database-profile" value="blank" checked={choice() === "blank"} onChange={() => selectChoice("blank")} />
            <span><span class="block text-sm font-semibold text-on-surface">Blank database</span><span class="block text-xs leading-5 text-on-surface-variant">Create an unrelated database for any purpose.</span></span>
          </label>
          <For each={props.profiles}>{(profile) => (
            <label class={`flex cursor-pointer gap-3 rounded-xl border p-3 ${choice() === profile.profileId ? "border-primary bg-primary/5" : "border-outline/15"}`}>
              <input type="radio" name="database-profile" value={profile.profileId} checked={choice() === profile.profileId} onChange={() => selectChoice(profile.profileId)} />
              <span><span class="block text-sm font-semibold text-on-surface">{profile.label}</span><span class="block text-xs leading-5 text-on-surface-variant">{profile.description}</span></span>
            </label>
          )}</For>
        </fieldset>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="text-xs font-semibold text-on-surface-variant">Database name
            <input value={name()} maxlength={120} onInput={(event) => setName(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-xl border border-outline/20 px-3 text-sm text-on-surface outline-none focus:border-primary/50" />
          </label>
          <label class="text-xs font-semibold text-on-surface-variant">First table
            <input value={defaultTable()} maxlength={120} onInput={(event) => setDefaultTable(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-xl border border-outline/20 px-3 text-sm text-on-surface outline-none focus:border-primary/50" />
          </label>
        </div>
        <Show when={props.error}><p role="alert" class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p></Show>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={props.busy} onClick={props.onCancel} class="min-h-12 rounded-xl border-2 border-primary bg-white px-4 text-base font-bold text-primary disabled:opacity-55">Cancel</button>
          <button type="button" disabled={props.busy || !name().trim() || !defaultTable().trim()} onClick={submit} class="min-h-12 rounded-xl bg-primary px-4 text-base font-bold text-white disabled:opacity-55">{props.busy ? "Creating…" : "Create"}</button>
        </div>
      </DialogShell>
    </Show>
  );
}

export function DatabaseLifecycleDialog(props: {
  open: boolean;
  databaseName: string;
  restoring: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Show when={props.open}>
      <DialogShell
        open
        labelledBy="database-lifecycle-title"
        describedBy="database-lifecycle-detail"
        busy={props.busy}
        focusableSelector="button:not([disabled])"
        overlayClass="fixed inset-0 z-[200] flex items-end justify-center bg-on-surface/35 p-3 backdrop-blur-sm sm:items-center"
        dialogClass="w-full max-w-md rounded-2xl border border-outline/15 bg-white p-4 shadow-2xl sm:p-6"
        onClose={() => { if (!props.busy) props.onCancel(); }}
      >
        <h2 id="database-lifecycle-title" class="text-xl font-bold text-on-surface">{props.restoring ? "Restore this database?" : "Archive this database?"}</h2>
        <p id="database-lifecycle-detail" class="mt-2 text-sm leading-6 text-on-surface-variant">
          {props.restoring
            ? `“${props.databaseName}” will become editable and appear with active databases again.`
            : `“${props.databaseName}” will become read-only. Its rows and history stay available, and you can restore it later.`}
        </p>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={props.busy} onClick={props.onCancel} class="min-h-12 rounded-xl border-2 border-primary bg-white px-4 text-base font-bold text-primary disabled:opacity-55">Cancel</button>
          <button type="button" disabled={props.busy} onClick={props.onConfirm} class={`min-h-12 rounded-xl px-4 text-base font-bold text-white disabled:opacity-55 ${props.restoring ? "bg-primary" : "bg-red-700"}`}>{props.busy ? "Saving…" : props.restoring ? "Restore" : "Archive"}</button>
        </div>
      </DialogShell>
    </Show>
  );
}

// @locs-version: 1.0
import { For, Show } from "solid-js";
import { ContactRoleInput } from "@/components/ContactRoleControls";
import type { Contact } from "@/lib/contactsLocalState";
import type { ContactImportSource, ContactImportState } from "@/lib/contactImportState";

export function ContactImportControls(props: {
  contacts: Contact[];
  importSource: ContactImportSource;
  onImportSourceChange: (source: ContactImportSource) => void;
  importText: string;
  onImportTextChange: (text: string) => void;
  importRoles: string[];
  onImportRolesChange: (roles: string[]) => void;
  importState: ContactImportState;
  onImportContacts: () => void;
  importNotice: string | null;
  onImportNoticeChange: (notice: string | null) => void;
}) {
  async function readImportFile(file: File | null) {
    if (!file) return;
    try {
      props.onImportTextChange(await file.text());
      props.onImportNoticeChange(`Loaded ${file.name}. Review detected contacts before importing.`);
    } catch {
      props.onImportNoticeChange("Could not read this file in the browser.");
    }
  }

  return (
    <div class="min-w-0 animate-fade-in space-y-3 rounded-2xl border border-white/50 bg-white/70 p-4 shadow-card">
      <div class="grid gap-2 md:grid-cols-3">
        <label class="space-y-1">
          <span class="text-[11px] text-on-surface-variant/70">Import source</span>
          <select
            value={props.importSource}
            onInput={(event) => props.onImportSourceChange(event.currentTarget.value as ContactImportSource)}
            class="w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
          >
            <option value="gmail">Gmail / Google Contacts export</option>
            <option value="contact_file">Contact file</option>
            <option value="ai_file">Random file for AI extraction</option>
          </select>
        </label>
        <label class="space-y-1 md:col-span-2">
          <span class="text-[11px] text-on-surface-variant/70">Upload file</span>
          <input
            type="file"
            accept=".csv,.vcf,.txt,.md,.json"
            onChange={(event) => void readImportFile(event.currentTarget.files?.[0] ?? null)}
            class="w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-xs outline-none transition focus:border-primary/50"
          />
        </label>
      </div>
      <ContactRoleInput
        id="contact-role-options-import"
        compact
        contacts={props.contacts}
        roles={props.importRoles}
        onChange={props.onImportRolesChange}
        placeholder="Apply a role to this import, e.g. Guest, Vendor..."
        description="Every imported contact gets these labels. You can still edit each person later."
      />
      <textarea
        value={props.importText}
        onInput={(event) => props.onImportTextChange(event.currentTarget.value)}
        placeholder="Paste Gmail/Google Contacts CSV, vCard text, a spreadsheet export, or messy contact information here..."
        class="min-h-28 w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
      />
      <div class="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-on-surface">{props.importState.title}</p>
            <p class="mt-1 break-words text-[11px] leading-5 text-on-surface-variant">{props.importState.detail}</p>
          </div>
          <button
            type="button"
            onClick={props.onImportContacts}
            class="w-full rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 sm:w-auto sm:py-1.5"
          >
            Import {props.importState.importableContacts.length}
          </button>
        </div>
        <Show when={props.importState.blockerLabels.length > 0}>
          <ul class="mt-2 space-y-1">
            <For each={props.importState.blockerLabels}>
              {(label) => <li class="text-[10px] leading-4 text-amber-800">{label}</li>}
            </For>
          </ul>
        </Show>
        <Show when={props.importState.candidates.length > 0}>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <For each={props.importState.candidates.slice(0, 6)}>
              {(candidate) => (
                <div class="min-w-0 rounded-xl border border-white/70 bg-white/80 p-2">
                  <p class="break-words text-xs font-semibold text-on-surface">{candidate.name}</p>
                  <p class="break-words text-[11px] text-on-surface-variant">{candidate.email ?? candidate.phone}</p>
                  <p class="mt-1 break-words text-[10px] text-on-surface-variant">
                    {candidate.duplicateOfContactId ? "Duplicate skipped" : `${candidate.confidence} confidence`}
                  </p>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
      <Show when={props.importNotice}>
        {(notice) => <p class="text-xs text-emerald-900">{notice()}</p>}
      </Show>
    </div>
  );
}

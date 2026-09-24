// @locs-version: 2.0
import { createSignal, For, Show } from "solid-js";

import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import type {
  WeddingCollaborationState,
  WeddingCollaboratorRole,
} from "@/lib/weddingCollaborationState";

type DraftRoleAssignment = {
  id: string;
  name: string;
  email: string;
  role: WeddingCollaboratorRole;
  roleLabel: string;
};

export function WeddingCollaborationAccessCard(props: {
  state: WeddingCollaborationState;
}) {
  const [openRole, setOpenRole] = createSignal<string | null>(null);
  const [personName, setPersonName] = createSignal("");
  const [personEmail, setPersonEmail] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal<WeddingCollaboratorRole>("co_owner");
  const [draftAssignments, setDraftAssignments] = createSignal<DraftRoleAssignment[]>([]);

  function roleLabel(role: WeddingCollaboratorRole): string {
    return props.state.roleAssignmentOptions.find((option) => option.role === role)?.title ?? role;
  }

  function addDraftAssignment() {
    const name = personName().trim();
    const email = personEmail().trim();
    if (!name && !email) return;
    const role = selectedRole();
    setDraftAssignments((current) => [
      ...current,
      {
        id: `wedding-role-${Date.now()}-${current.length}`,
        name: name || email,
        email,
        role,
        roleLabel: roleLabel(role),
      },
    ]);
    setPersonName("");
    setPersonEmail("");
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <p class="text-base font-semibold text-sky-950">Share the plan</p>
          <WeddingInfoTip title="Sharing tip" tone="sky">
            Start with the smallest useful access. Give helpers logistics access, give family suggestion access, and keep budget notes private unless you choose to share them.
          </WeddingInfoTip>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
          {props.state.statusLabel}
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-sky-900/75">{props.state.summaryLabel}</p>
      <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
        <p class="text-sm font-semibold text-sky-950">Add someone</p>
        <p class="mt-1 text-xs leading-5 text-sky-950/70">
          Choose a contact or type a name, then pick what they can help with.
        </p>
        <div class="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <label class="text-xs font-semibold text-sky-950">
            Name or contact
            <input
              class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-medium text-sky-950 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              value={personName()}
              onInput={(event) => setPersonName(event.currentTarget.value)}
              placeholder="Alex, Sam, Mum..."
            />
          </label>
          <label class="text-xs font-semibold text-sky-950">
            Email optional
            <input
              class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-medium text-sky-950 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              value={personEmail()}
              onInput={(event) => setPersonEmail(event.currentTarget.value)}
              placeholder="name@example.com"
            />
          </label>
          <label class="text-xs font-semibold text-sky-950">
            Role
            <select
              class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-medium text-sky-950 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              value={selectedRole()}
              onChange={(event) => setSelectedRole(event.currentTarget.value as WeddingCollaboratorRole)}
            >
              <For each={props.state.roleAssignmentOptions}>
                {(role) => <option value={role.role}>{role.title}</option>}
              </For>
            </select>
          </label>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!personName().trim() && !personEmail().trim()}
            onClick={addDraftAssignment}
          >
            Add person
          </button>
          <span class="text-xs leading-5 text-sky-950/60">
            Send the invite after you review their role.
          </span>
        </div>
        <Show when={draftAssignments().length > 0}>
          <div class="mt-3 space-y-2">
            <For each={draftAssignments()}>
              {(assignment) => (
                <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2">
                  <div class="min-w-0">
                    <p class="break-words text-xs font-semibold text-sky-950">{assignment.name}</p>
                    <p class="break-words text-xs leading-5 text-sky-950/65">
                      {assignment.roleLabel}{assignment.email ? ` - ${assignment.email}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="rounded-full border border-sky-100 bg-white px-2 py-1 text-[11px] font-semibold text-sky-950"
                    onClick={() => setDraftAssignments((current) => current.filter((item) => item.id !== assignment.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <For each={props.state.roleAssignmentOptions}>
          {(role) => (
            <span
              class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs font-semibold text-sky-950/75"
              title={role.hoverHelpLabel}
            >
              {role.title}
            </span>
          )}
        </For>
      </div>
      <details class="mt-3 rounded-2xl border border-sky-100 bg-white/70 p-3">
        <summary class="cursor-pointer text-xs font-semibold text-sky-950/70 outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
          What people can do
        </summary>
        <div class="mt-2 space-y-2">
          <For each={props.state.roleAssignmentOptions}>
            {(role) => (
              <article class="rounded-2xl border border-sky-100 bg-sky-50/70 p-2" title={role.hoverHelpLabel}>
                <div class="flex items-start justify-between gap-2">
                  <p class="text-xs font-semibold text-sky-950">{role.title}</p>
                  <button
                    type="button"
                    class="rounded-full border border-sky-100 bg-white/85 px-2 py-1 text-[10px] font-semibold text-sky-950 transition hover:border-sky-200 hover:bg-white"
                    onClick={() => setOpenRole(openRole() === role.role ? null : role.role)}
                  >
                    {openRole() === role.role ? "Hide details" : "Show details"}
                  </button>
                </div>
                <p class="mt-1 text-xs leading-5 text-sky-950/70">{role.summaryLabel}</p>
                <p class="mt-1 text-xs leading-5 text-sky-950/60">{role.hoverHelpLabel}</p>
                <button
                  type="button"
                  class="mt-1 text-left text-xs font-semibold leading-5 text-sky-900 underline decoration-sky-300 underline-offset-2"
                  onClick={() => setOpenRole(openRole() === role.role ? null : role.role)}
                >
                  {role.mobileDisclosureLabel}
                </button>
                <Show when={openRole() === role.role}>
                  <div class="mt-2 rounded-2xl border border-sky-100 bg-white/80 p-2">
                    <p class="text-xs font-semibold text-sky-950/70">Can do</p>
                    <ul class="mt-1 space-y-1">
                      <For each={role.capabilityLabels}>
                        {(label) => <li class="text-xs leading-5 text-sky-950/70">{label}</li>}
                      </For>
                    </ul>
                    <Show when={role.restrictionLabels.length > 0}>
                      <p class="mt-2 text-xs font-semibold text-sky-950/70">Limits</p>
                      <ul class="mt-1 space-y-1">
                        <For each={role.restrictionLabels}>
                          {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </details>
      <div class="mt-3 space-y-2">
        <For each={props.state.editingSurfaces.slice(0, 3)}>
          {(surface) => (
            <article class="rounded-2xl border border-sky-100 bg-white/75 p-3">
              <p class="break-words text-xs font-semibold text-sky-950">{surface.title}</p>
              <p class="mt-1 text-xs leading-5 text-sky-900/70">{surface.summaryLabel}</p>
              <p class="mt-2 text-xs leading-5 text-sky-950/65">
                Can edit: {surface.editorRoleLabels.join(", ")}
              </p>
            </article>
          )}
        </For>
      </div>
      <div class="mt-3 rounded-2xl border border-sky-100 bg-white/70 p-3">
        <p class="text-xs font-semibold text-sky-950/70">Access check</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={props.state.permissionProofCards}>
            {(permission) => (
              <span class={`max-w-full break-words rounded-full border px-2 py-1 text-xs font-semibold ${
                permission.allowed
                  ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                  : "border-sky-100 bg-sky-50 text-sky-950/70"
              }`}>
                {permission.statusLabel}: {permission.requiredRoleLabels.join("/")}
              </span>
            )}
          </For>
        </div>
      </div>
      <Show when={props.state.invites.length > 0} fallback={
        <p class="mt-3 rounded-2xl border border-sky-100 bg-white/70 px-3 py-2 text-sm leading-6 text-sky-950/75">
          Invite partner as co-owner, planner with planning access, contributors for assigned tasks, or viewers for approved read-only files.
        </p>
      }>
        <div class="mt-3 space-y-2">
          <For each={props.state.invites.slice(0, 4)}>
            {(invite) => (
              <article class="rounded-2xl border border-sky-100 bg-white/75 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-xs font-semibold text-sky-950">{invite.displayName}</p>
                  <span class="max-w-full break-words rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-900">
                    {invite.readyForInvite ? "Ready" : "Add details"}
                  </span>
                </div>
                <p class="mt-1 text-xs leading-5 text-sky-900/75">
                  {invite.roleLabel} - {invite.email || "email needed"}
                </p>
                <details class="mt-2 rounded-2xl border border-sky-100 bg-sky-50/70 px-2.5 py-2">
                  <summary
                    class="cursor-pointer text-xs font-semibold text-sky-950 outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    title={`${invite.roleLabel}: ${invite.roleSummaryLabel}`}
                  >
                    What this role can do
                  </summary>
                  <p class="mt-1 text-xs leading-5 text-sky-950/70">{invite.roleSummaryLabel}</p>
                  <ul class="mt-2 space-y-1">
                    <For each={invite.roleCapabilityLabels.slice(0, 3)}>
                      {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                    </For>
                  </ul>
                  <Show when={invite.roleRestrictionLabels.length > 0}>
                    <p class="mt-2 text-xs font-semibold text-sky-950/70">Limits</p>
                    <ul class="mt-1 space-y-1">
                      <For each={invite.roleRestrictionLabels.slice(0, 2)}>
                        {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                      </For>
                    </ul>
                  </Show>
                </details>
                <p class="mt-1 text-xs leading-5 text-sky-950/65">
                  {invite.lifecycleLabel} - {invite.nextActionLabel}
                </p>
                <Show when={invite.riskLabels.length > 0}>
                  <ul class="mt-2 space-y-1">
                    <For each={invite.riskLabels}>
                      {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                    </For>
                  </ul>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.blockerLabels.length > 0}>
        <ul class="mt-3 space-y-1">
          <For each={props.state.blockerLabels.slice(0, 4)}>
            {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}

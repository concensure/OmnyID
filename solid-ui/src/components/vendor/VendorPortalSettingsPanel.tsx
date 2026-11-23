import { createResource, createSignal, For, Show } from "solid-js";
import {
  getVendorEntitlements, getVendorNotifications, getVendorTeam, inviteVendorMember,
  updateVendorMember, updateVendorNotifications, type VendorMember, type VendorNotifications,
} from "@/lib/vendorPortalApi";

const roles = [
  ["manager", "Manager"], ["profile_editor", "Profile editor"],
  ["calendar_manager", "Calendar manager"], ["enquiry_manager", "Enquiry manager"], ["viewer", "Viewer"],
] as const;
const notificationLabels: Array<[keyof Omit<VendorNotifications, "revision" | "security_notifications">, string]> = [
  ["new_enquiry", "New enquiries"], ["follow_up_reminders", "Follow-up reminders"],
  ["calendar_freshness", "Availability freshness"], ["expiring_holds", "Expiring holds"],
  ["publication_updates", "Publication review updates"], ["product_updates", "Optional product updates"],
];

export function VendorPortalSettingsPanel(props: { vendorSlug: string }) {
  const [team, { refetch: refetchTeam }] = createResource(() => props.vendorSlug, getVendorTeam);
  const [notifications, { mutate: setNotifications, refetch: refetchNotifications }] = createResource(() => props.vendorSlug, getVendorNotifications);
  const [entitlements] = createResource(() => props.vendorSlug, getVendorEntitlements);
  const [email, setEmail] = createSignal(""); const [role, setRole] = createSignal("viewer");
  const [busy, setBusy] = createSignal(false); const [notice, setNotice] = createSignal("");
  const invite = async () => { if (!email().trim() || busy()) return; setBusy(true); setNotice(""); try { await inviteVendorMember(props.vendorSlug, email(), role()); setEmail(""); await refetchTeam(); setNotice("Invitation saved. Access activates only after that verified email signs in."); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The invitation could not be saved."); } finally { setBusy(false); } };
  const changeMember = async (member: VendorMember, status: string, nextRole = member.role) => { if (busy()) return; setBusy(true); setNotice(""); try { await updateVendorMember(props.vendorSlug, member, status, nextRole); await refetchTeam(); setNotice(status === "revoked" ? "Team access revoked." : "Team role updated."); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Team access could not be updated."); } finally { setBusy(false); } };
  const toggleNotification = (field: keyof Omit<VendorNotifications, "revision" | "security_notifications">) => { const value = notifications(); if (value) setNotifications({ ...value, [field]: !value[field] }); };
  const saveNotifications = async () => { const value = notifications(); if (!value || busy()) return; setBusy(true); setNotice(""); try { await updateVendorNotifications(props.vendorSlug, value); await refetchNotifications(); setNotice("Notification preferences saved."); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Notification preferences could not be saved."); } finally { setBusy(false); } };
  return <div class="grid gap-5">
    <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-team-title"><h2 id="vendor-team-title" class="text-lg font-semibold">Team access</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Invite staff with only the access they need. Only the listing owner can manage the team.</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto]"><label class="text-sm font-medium">Work email<input type="email" class="mt-1 min-h-11 w-full rounded-lg border px-3" value={email()} onInput={(event) => setEmail(event.currentTarget.value)} /></label><label class="text-sm font-medium">Role<select class="mt-1 min-h-11 w-full rounded-lg border px-3" value={role()} onChange={(event) => setRole(event.currentTarget.value)}><For each={roles}>{([value, label]) => <option value={value}>{label}</option>}</For></select></label><button type="button" class="min-h-11 self-end rounded-lg bg-wedding-accent px-4 font-bold text-white" disabled={busy()} onClick={() => void invite()}>Invite</button></div>
      <div class="mt-4 grid gap-2"><For each={team() ?? []}>{(member) => <div class="grid gap-2 rounded-lg border border-wedding-muted p-3 sm:grid-cols-[1fr_12rem_auto]"><div><strong>{member.email}</strong><p class="text-xs text-wedding-muted">{member.status}</p></div><select aria-label={`Role for ${member.email}`} class="min-h-11 rounded-lg border px-2" value={member.role} disabled={member.status === "revoked" || busy()} onChange={(event) => void changeMember(member, "active", event.currentTarget.value)}><For each={roles}>{([value, label]) => <option value={value}>{label}</option>}</For></select><button type="button" class="min-h-11 rounded-lg border px-3 font-bold" disabled={member.status === "revoked" || busy()} onClick={() => void changeMember(member, "revoked")}>Revoke</button></div>}</For></div>
    </section>
    <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-notifications-title"><h2 id="vendor-notifications-title" class="text-lg font-semibold">Notifications</h2><p class="mt-1 text-sm text-wedding-muted">Security and account alerts are always on. Product updates start off.</p><Show when={notifications()}><fieldset class="mt-4 grid gap-2 sm:grid-cols-2"><legend class="sr-only">Vendor notifications</legend><For each={notificationLabels}>{([field, label]) => <label class="flex min-h-11 items-center gap-3 rounded-lg bg-wedding-surface px-3"><input type="checkbox" checked={Boolean(notifications()?.[field])} onChange={() => toggleNotification(field)} /><span>{label}</span></label>}</For><button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white" disabled={busy()} onClick={() => void saveNotifications()}>Save notifications</button></fieldset></Show></section>
    <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-plan-title"><h2 id="vendor-plan-title" class="text-lg font-semibold">Portal plan</h2><Show when={entitlements()}>{(value) => <><p class="mt-2"><strong class="capitalize">{value().tier}</strong> · {value().status.replaceAll("_", " ")}</p><ul class="mt-3 grid gap-2 text-sm sm:grid-cols-2"><For each={Object.entries(value().features)}>{([feature, enabled]) => <li class="rounded-lg bg-wedding-surface p-3"><span aria-hidden="true">{enabled ? "✓" : "—"}</span> {feature.replaceAll("_", " ")}</li>}</For></ul><p class="mt-3 text-xs text-wedding-muted">Downgrading never deletes your listing, enquiries, resources or calendar history.</p></>}</Show></section>
    <Show when={notice()}><p class="text-sm" role="status">{notice()}</p></Show>
  </div>;
}

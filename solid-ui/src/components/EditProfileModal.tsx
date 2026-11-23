// @locs-version: 1.0
import { createBillingCheckoutSession, readSession } from "@/lib/api";
import { For, Show, createEffect, createSignal } from "solid-js";
import { DialogShell } from "@/components/DialogShell";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { loadUserProfile, saveUserProfile } from "@/lib/profileLocalState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { loadLedger, setProfilingEnabled } from "@/lib/profileLedger";

const PRESET_WEBSITES = [
  { id: "linkedin", label: "LinkedIn", emoji: "in" },
  { id: "twitter", label: "X / Twitter", emoji: "X" },
  { id: "instagram", label: "Instagram", emoji: "IG" },
  { id: "facebook", label: "Facebook", emoji: "f" },
  { id: "github", label: "GitHub", emoji: "GH" },
  { id: "notion", label: "Notion", emoji: "N" },
  { id: "medium", label: "Medium", emoji: "M" },
  { id: "substack", label: "Substack", emoji: "S" },
  { id: "pinterest", label: "Pinterest", emoji: "P" },
  { id: "tumblr", label: "Tumblr", emoji: "T" },
  { id: "raindrop", label: "Raindrop", emoji: "R" },
  { id: "reddit", label: "Reddit", emoji: "r" },
];

export function EditProfileModal(props: { onClose: () => void; showWeddingUpgrade?: boolean }) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const initial = loadUserProfile(sessionUserId);
  const [displayName, setDisplayName] = createSignal(initial.displayName);
  const [bio, setBio] = createSignal(initial.bio);
  const [avatar, setAvatar] = createSignal(initial.avatar || ":)");
  const [websites, setWebsites] = createSignal<string[]>(initial.websites);
  const [saving, setSaving] = createSignal(false);
  const [upgrading, setUpgrading] = createSignal(false);
  const [upgradeError, setUpgradeError] = createSignal("");
  const [profilingEnabled, setProfilingEnabledState] = createSignal(false);
  const [profilingLoading, setProfilingLoading] = createSignal(true);
  const [profilingSaving, setProfilingSaving] = createSignal(false);
  const [profilingError, setProfilingError] = createSignal("");
  let displayNameRef: HTMLInputElement | undefined;

  function toggleWebsite(id: string) {
    setWebsites((previous) =>
      previous.includes(id)
        ? previous.filter((entry) => entry !== id)
        : [...previous, id],
    );
  }

  async function save() {
    if (saving()) return;
    setSaving(true);
    try {
      saveUserProfile({
        displayName: displayName(),
        bio: bio(),
        avatar: avatar(),
        websites: websites(),
      }, sessionUserId);
      props.onClose();
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (saving()) return;
    props.onClose();
  }

  async function startWeddingUpgrade() {
    if (upgrading()) return;
    setUpgradeError("");
    setUpgrading(true);
    try {
      const checkout = await createBillingCheckoutSession("pro");
      window.location.assign(checkout.url);
    } catch (error) {
      setUpgradeError(
        error instanceof Error
          ? error.message
          : "We could not start secure checkout. Please try again.",
      );
      setUpgrading(false);
    }
  }

  async function toggleProfiling() {
    if (profilingLoading() || profilingSaving()) return;
    setProfilingSaving(true);
    setProfilingError("");
    const next = !profilingEnabled();
    try {
      const status = await setProfilingEnabled(next);
      if (status !== "ok") throw new Error("Your profiling preference could not be saved on this device.");
      setProfilingEnabledState(next);
    } catch (error) {
      setProfilingError(error instanceof Error ? error.message : "Your profiling preference could not be saved.");
    } finally {
      setProfilingSaving(false);
    }
  }

  function handleFormShortcut(event: KeyboardEvent) {
    if (event.key === "Escape" && !saving()) {
      event.preventDefault();
      recordShortcutUse("form_cancel");
      requestClose();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      recordShortcutUse("form_submit");
      void save();
    }
  }

  createEffect(() => {
    queueMicrotask(() => displayNameRef?.focus());
  });

  void loadLedger()
    .then((ledger) => setProfilingEnabledState(ledger.profiling_enabled))
    .catch(() => setProfilingError("Your profiling preference could not be loaded."))
    .finally(() => setProfilingLoading(false));

  return (
    <DialogShell
      labelledBy="edit-profile-title"
      focusableSelector={'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'}
      overlayClass="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 p-4 backdrop-blur-sm"
      dialogClass="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/45 bg-white/96 p-6 shadow-panel backdrop-blur-xl"
      onClose={requestClose}
    >
      <>
        <button
          type="button"
          onClick={() => {
            recordShortcutUse("form_cancel");
            requestClose();
          }}
          disabled={saving()}
          class="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-on-surface-variant/40 transition hover:bg-white/60 hover:text-on-surface"
          aria-label="Close"
        >
          x
        </button>

        <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-outline">
          Profile
        </p>
        <h2 id="edit-profile-title" class="mb-5 text-lg font-bold text-on-surface">
          Edit Profile
        </h2>

        <div class="space-y-4" onKeyDown={handleFormShortcut}>
          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              Avatar
            </span>
            <input
              value={avatar()}
              disabled={saving()}
              onInput={(event) => setAvatar(event.currentTarget.value)}
              class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none"
            />
          </label>

          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              Display name
            </span>
            <input
              ref={displayNameRef}
              value={displayName()}
              disabled={saving()}
              onInput={(event) => setDisplayName(event.currentTarget.value)}
              class="mt-2 w-full rounded-2xl border border-white/40 bg-white/65 px-4 py-3 text-sm text-on-surface outline-none"
            />
          </label>

          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              Bio
            </span>
            <div class="mt-2">
              <TiptapEditor
                mode="compact"
                initialContent={bio()}
                disabled={saving()}
                placeholder="Tell OmnyID how to understand you."
                submitLabel={saving() ? "Saving..." : "Save profile"}
                clearOnSend={false}
                onChange={(_text, markdown) => setBio(markdown)}
                onSend={async (payload) => {
                  setBio(payload.markdown || payload.text);
                  await save();
                }}
              />
            </div>
          </label>

          <div>
            <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              Linked identities
              <span
                tabIndex={0}
                role="note"
                title="Optional social profiles to show on your OmnyID profile card, such as LinkedIn or X. This is just for display — it doesn't sign you in and isn't required."
                aria-label="What are linked identities? Optional social profiles to show on your OmnyID profile card, such as LinkedIn or X. This is just for display — it doesn't sign you in and isn't required."
                class="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full text-[10px] font-bold normal-case tracking-normal text-on-surface-variant/50 outline-none hover:text-on-surface-variant focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                ⓘ
              </span>
            </p>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <For each={PRESET_WEBSITES}>
                {(site) => {
                  const active = () => websites().includes(site.id);
                  return (
                    <button
                      type="button"
                      onClick={() => toggleWebsite(site.id)}
                      disabled={saving()}
                      class={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[10px] font-medium transition ${
                        active()
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-white/40 bg-white/50 text-on-surface-variant hover:bg-white/70"
                      }`}
                    >
                      <span class="text-base leading-none" aria-hidden="true">
                        {site.emoji}
                      </span>
                      <span>{site.label}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          <section class="rounded-2xl border border-outline/15 bg-white/55 p-4" aria-labelledby="edit-profile-profiling-title">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p id="edit-profile-profiling-title" class="text-sm font-semibold text-on-surface">Profiling ledger</p>
                <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                  Turn off preference learning without deleting your profile. This uses the same setting shown in the Profiling ledger.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profilingEnabled()}
                onClick={() => void toggleProfiling()}
                disabled={profilingLoading() || profilingSaving()}
                class={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${profilingEnabled() ? "border-primary/30 bg-primary/10 text-primary" : "border-outline/25 bg-white text-on-surface-variant"}`}
              >
                {profilingLoading() ? "Loading…" : profilingSaving() ? "Saving…" : profilingEnabled() ? "Profiling on" : "Profiling off"}
              </button>
            </div>
            <Show when={profilingError()}>
              <p class="mt-2 text-xs leading-5 text-error" role="alert">{profilingError()}</p>
            </Show>
          </section>

          <Show when={props.showWeddingUpgrade}>
          <div class="rounded-2xl border border-primary/25 bg-white p-4 shadow-sm">
            <p class="text-sm font-semibold text-on-surface">OmnyID Wedding</p>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              Upgrade once for AUD 39 to receive 100 MB of storage and fewer API throttles while you plan.
            </p>
            <button
              type="button"
              onClick={() => void startWeddingUpgrade()}
              disabled={upgrading()}
              class="mt-3 inline-flex min-h-11 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {upgrading() ? "Opening secure checkout..." : "Upgrade to OmnyID Wedding"}
            </button>
            {upgradeError() && (
              <p class="mt-2 text-xs leading-5 text-error" role="alert">
                {upgradeError()}
              </p>
            )}
          </div>
          </Show>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                recordShortcutUse("form_cancel");
                requestClose();
              }}
              disabled={saving()}
              class="rounded-full border border-white/30 bg-white/60 px-4 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-white/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving()}
              class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black transition hover:brightness-105"
            >
              {saving() ? "Saving..." : "Save profile"}
            </button>
          </div>
        </div>
      </>
    </DialogShell>
  );
}

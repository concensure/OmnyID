import { createEffect, createSignal, onMount, Show } from "solid-js";
import { type AliasRecord } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonBlock } from "@/components/Spinner";
import { toast as showToast } from "@/components/Toast";
import { InfoHint } from "@/components/InfoHint";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import {
  type AliasSettingsFailureReceipt,
} from "@/lib/aliasSettingsFailureState";
import {
  checkAliasSettingsAvailability,
  loadAliasSettingsState,
  saveAliasSettingsState,
} from "@/lib/aliasSettingsState";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AliasSettings() {
  const [current, setCurrent] = createSignal<AliasRecord | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal<AliasSettingsFailureReceipt | null>(null);
  const [editing, setEditing] = createSignal(false);
  const [input, setInput] = createSignal("");
  const [checkResult, setCheckResult] = createSignal<{ available: boolean; valid: boolean; reason: string } | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [checkError, setCheckError] = createSignal<AliasSettingsFailureReceipt | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<AliasSettingsFailureReceipt | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  async function loadAlias() {
    setLoading(true);
    setLoadError(null);
    const result = await loadAliasSettingsState();
    setCurrent(result.current);
    setLoadError(result.error);
    setLoading(false);
  }

  onMount(() => {
    void loadAlias();
  });

  createEffect(() => {
    const val = input().trim().toLowerCase();
    setCheckResult(null);
    setCheckError(null);
    clearTimeout(debounceTimer);
    if (val.length === 0) return;

    debounceTimer = setTimeout(async () => {
      setChecking(true);
      const result = await checkAliasSettingsAvailability(val);
      try {
        if (input().trim().toLowerCase() === val) {
          setCheckResult(result.result);
          setCheckError(result.error);
        }
      } finally {
        setChecking(false);
      }
    }, 300);
  });

  const canSave = () => {
    const res = checkResult();
    return res?.available && res?.valid && input().trim().length >= 7 && !saving();
  };

  async function handleSave() {
    if (saving()) return;
    const alias = input().trim().toLowerCase();
    setSaveError(null);
    setSaving(true);
    const result = await saveAliasSettingsState({
      alias,
      current: current(),
    });
    try {
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setCurrent(result.current);
      setEditing(false);
      setInput("");
      setCheckResult(null);
      showToast.success(result.didCreate ? "Alias claimed successfully!" : "Alias changed successfully!");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setInput("");
    setCheckResult(null);
    setCheckError(null);
    setSaveError(null);
  }

  const hint = () => {
    const val = input().trim();
    if (val.length === 0) return null;
    if (val.length < 7) return { text: "Alias must be at least 7 characters.", color: "text-yellow-400" };
    if (checking()) return { text: "Checking availability...", color: "text-on-surface-variant" };
    if (checkError()) return { text: checkError()!.summary, color: "text-red-400" };
    const res = checkResult();
    if (!res) return null;
    if (!res.valid) return { text: res.reason, color: "text-red-400" };
    if (!res.available) return { text: "This alias is already taken.", color: "text-red-400" };
    return { text: "Available", color: "text-green-400" };
  };

  const isCooldownActive = () => {
    const rec = current();
    if (!rec?.next_change_at) return false;
    return new Date(rec.next_change_at) > new Date();
  };

  return (
    <div class="rounded-xl border border-white/20 bg-white/10 p-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
            Agent Alias
            <InfoHint text="Your alias is the memorable public handle other people can use to recognize or address your agent identity. Alias changes are rate-limited to prevent churn." />
          </p>
          <p class="mt-0.5 text-xs text-on-surface-variant">
            A memorable public handle for your agent (e.g.{" "}
            <span class="font-mono text-primary">alicesmith@omnyid.com</span>). Minimum 7 characters, lowercase
            letters, digits and hyphens only.
          </p>
        </div>

        <Show when={!loading() && !editing()}>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setInput("");
              setSaveError(null);
            }}
            disabled={!!current()?.alias && isCooldownActive()}
            class="flex-shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={isCooldownActive() ? `Next change: ${formatDate(current()!.next_change_at!)}` : undefined}
          >
            {current()?.alias ? "Change Alias" : "Claim Alias"}
          </button>
        </Show>
      </div>

      <Show when={loading()}>
        <div class="mt-3 rounded-xl border border-white/15 bg-white/5 p-4 skeleton-crossfade">
          <SkeletonBlock lines={3} />
        </div>
      </Show>

      <Show when={!loading() && !editing() && current()?.alias}>
        <div class="content-crossfade">
          <div class="mt-3 flex items-center gap-2">
            <span class="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-sm text-primary">
              {current()!.display_address ?? current()!.alias}
            </span>
          </div>

          <Show when={isCooldownActive()}>
            <p class="mt-2 text-[11px] text-on-surface-variant">
              Next alias change available on{" "}
              <span class="font-medium text-on-surface">{formatDate(current()!.next_change_at!)}</span>.
            </p>
          </Show>
        </div>
      </Show>

      <Show when={!loading() && !editing() && !current()?.alias}>
        <div class="mt-3 content-crossfade">
          <Show
            when={!loadError()}
            fallback={
              <EmptyState
                icon="@"
                title="Could not load alias settings"
                body={`${loadError()?.summary ?? "Alias settings are unavailable right now."} ${loadError()?.nextStep ?? ""}`.trim()}
                action={
                  <button
                    type="button"
                    onClick={() => void loadAlias()}
                    class="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-on-surface transition hover:bg-white/20"
                  >
                    Retry alias
                  </button>
                }
              />
            }
          >
            <EmptyState
              icon="@"
              title="No alias claimed yet"
              body="Claim a memorable public handle so other people can recognize and reference your agent identity more easily."
            />
          </Show>
        </div>
      </Show>

      <Show when={editing()}>
        <div class="mt-3 space-y-2">
          <div class="space-y-1">
            <label class="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
              Alias handle
              <InfoHint text="This becomes the human-readable public handle for your agent identity. The homeserver validates the format and checks availability before claim or change." />
            </label>
            <div class="relative">
              <input
                type="text"
                value={input()}
                onInput={(e) => {
                  setInput(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  setSaveError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave()) {
                    e.preventDefault();
                    recordShortcutUse("form_submit");
                    void handleSave();
                  } else if (e.key === "Escape" && !saving()) {
                    e.preventDefault();
                    recordShortcutUse("form_cancel");
                    cancelEdit();
                  }
                }}
                disabled={saving()}
                placeholder="e.g. alicesmith"
                maxlength={48}
                autofocus
                class="w-full rounded-lg border border-white/20 bg-surface/80 px-3 py-2 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
              />
              <Show when={input().length > 0}>
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-on-surface-variant/60">
                  {input().length}/48
                </span>
              </Show>
            </div>
          </div>

          <Show when={hint()}>
            <p class={`text-[11px] ${hint()!.color}`}>{hint()!.text}</p>
          </Show>

          <ul class="mt-0.5 space-y-0.5 text-[11px] text-on-surface-variant opacity-60">
            <li>- Minimum 7 characters, maximum 48</li>
            <li>- Only lowercase letters (a-z), digits (0-9), and hyphens</li>
            <li>- Cannot start or end with a hyphen</li>
            <Show when={current()?.alias}>
              <li>- You can only change your alias once every 30 days</li>
            </Show>
          </ul>

          <Show when={saveError()}>
            <div
              classList={{
                "rounded-lg px-3 py-2 text-xs": true,
                "bg-red-500/10 text-red-400": saveError()?.tone === "danger",
                "bg-amber-500/10 text-amber-300": saveError()?.tone !== "danger",
              }}
            >
              <p class="font-semibold">{saveError()?.title}</p>
              <p class="mt-1">{saveError()?.summary}</p>
              <p class="mt-1 opacity-80">{saveError()?.nextStep}</p>
            </div>
          </Show>

          <div class="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave()}
              class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving() ? "Saving..." : current()?.alias ? "Change Alias" : "Claim Alias"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving()}
              class="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

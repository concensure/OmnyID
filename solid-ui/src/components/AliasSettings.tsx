import { createEffect, createSignal, onMount, Show } from "solid-js";
import { checkAlias, claimAlias, changeAlias, getMyAlias, type AliasRecord } from "@/lib/api";

// Format an ISO date string as a readable date
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export function AliasSettings() {
  const [current, setCurrent] = createSignal<AliasRecord | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [editing, setEditing] = createSignal(false);

  // Form state
  const [input, setInput] = createSignal("");
  const [checkResult, setCheckResult] = createSignal<{ available: boolean; valid: boolean; reason: string } | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal("");
  const [toast, setToast] = createSignal("");

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      const rec = await getMyAlias();
      setCurrent(rec);
    } catch {
      // No alias yet — that's fine
    }
    setLoading(false);
  });

  // Debounced availability check whenever the input changes
  createEffect(() => {
    const val = input().trim().toLowerCase();
    setCheckResult(null);
    clearTimeout(debounceTimer);
    if (val.length === 0) return;

    debounceTimer = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await checkAlias(val);
        // Don't overwrite if the user already changed the input
        if (input().trim().toLowerCase() === val) {
          setCheckResult(result);
        }
      } catch {
        // Network error — ignore silently
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
    const alias = input().trim().toLowerCase();
    setSaveError("");
    setSaving(true);
    try {
      const isNew = !current()?.alias;
      const rec = isNew ? await claimAlias(alias) : await changeAlias(alias);
      setCurrent(rec);
      setEditing(false);
      setInput("");
      setCheckResult(null);
      setToast(isNew ? "Alias claimed successfully!" : "Alias changed successfully!");
      setTimeout(() => setToast(""), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save alias. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setInput("");
    setCheckResult(null);
    setSaveError("");
  }

  // Hint text and colour for the input field feedback
  const hint = () => {
    const val = input().trim();
    if (val.length === 0) return null;
    if (val.length < 7) return { text: "Alias must be at least 7 characters.", color: "text-yellow-400" };
    if (checking()) return { text: "Checking availability…", color: "text-on-surface-variant" };
    const res = checkResult();
    if (!res) return null;
    if (!res.valid) return { text: res.reason, color: "text-red-400" };
    if (!res.available) return { text: "This alias is already taken.", color: "text-red-400" };
    return { text: "✓ Available!", color: "text-green-400" };
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
          <p class="text-sm font-semibold text-on-surface">Agent Alias</p>
          <p class="mt-0.5 text-xs text-on-surface-variant">
            A memorable public handle for your agent (e.g.{" "}
            <span class="font-mono text-primary">alicesmith@omnyid.com</span>). Minimum 7 characters,
            lowercase letters, digits and hyphens only.
          </p>
        </div>

        <Show when={!loading() && !editing()}>
          <button
            type="button"
            onClick={() => { setEditing(true); setInput(""); setSaveError(""); }}
            disabled={!!current()?.alias && isCooldownActive()}
            class="flex-shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={isCooldownActive() ? `Next change: ${formatDate(current()!.next_change_at!)}` : undefined}
          >
            {current()?.alias ? "Change Alias" : "Claim Alias"}
          </button>
        </Show>
      </div>

      {/* Loading skeleton */}
      <Show when={loading()}>
        <div class="mt-3 h-8 animate-pulse rounded-lg bg-white/10" />
      </Show>

      {/* Current alias display */}
      <Show when={!loading() && !editing() && current()?.alias}>
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
      </Show>

      {/* No alias yet */}
      <Show when={!loading() && !editing() && !current()?.alias}>
        <p class="mt-2 text-xs text-on-surface-variant opacity-70">No alias claimed yet.</p>
      </Show>

      {/* Edit form */}
      <Show when={editing()}>
        <div class="mt-3 space-y-2">
          <div class="relative">
            <input
              type="text"
              value={input()}
              onInput={(e) => {
                setInput(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSaveError("");
              }}
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

          {/* Validation hint */}
          <Show when={hint()}>
            <p class={`text-[11px] ${hint()!.color}`}>{hint()!.text}</p>
          </Show>

          {/* Format hints */}
          <ul class="mt-0.5 space-y-0.5 text-[11px] text-on-surface-variant opacity-60">
            <li>· Minimum 7 characters, maximum 48</li>
            <li>· Only lowercase letters (a–z), digits (0–9), and hyphens</li>
            <li>· Cannot start or end with a hyphen</li>
            <Show when={current()?.alias}>
              <li>· You can only change your alias once every 30 days</li>
            </Show>
          </ul>

          {/* Save error */}
          <Show when={saveError()}>
            <p class="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{saveError()}</p>
          </Show>

          {/* Actions */}
          <div class="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave()}
              class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving() ? "Saving…" : current()?.alias ? "Change Alias" : "Claim Alias"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              class="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      {/* Success toast */}
      <Show when={toast()}>
        <p class="mt-2 text-xs font-medium text-green-400">{toast()}</p>
      </Show>
    </div>
  );
}

import { createSignal, onMount } from "solid-js";
import { getAgentPreferences, setAgentPreferences, type AgentPreferences } from "@/lib/api";

/**
 * AgentPreferencesPanel — settings for agent execution optimization.
 * Embedded in AgentSettingsView.
 */
export function AgentPreferencesPanel() {
  const [prefs, setPrefs] = createSignal<AgentPreferences>({
    optimization_mode: "balanced",
    auto_confirm_threshold_cents: 5.0,
    show_cost_estimates: true,
  });
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [toast, setToast] = createSignal("");

  onMount(async () => {
    try {
      const p = await getAgentPreferences();
      setPrefs(p);
    } catch {
      // Use defaults
    }
    setLoading(false);
  });

  async function handleSave() {
    setSaving(true);
    try {
      await setAgentPreferences(prefs());
      setToast("Preferences saved");
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      setToast("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="rounded-xl border border-white/20 bg-white/10 p-4 space-y-4">
      <div>
        <p class="text-sm font-semibold text-on-surface">Agent Execution Preferences</p>
        <p class="mt-0.5 text-xs text-on-surface-variant">
          Control how the agent balances speed, cost, and autonomy.
        </p>
      </div>

      <div class="space-y-3 text-sm">
        {/* Optimization mode */}
        <div class="space-y-1">
          <label class="text-xs font-medium text-on-surface-variant">Optimization Mode</label>
          <div class="flex gap-2">
            {(["speed", "balanced", "cost"] as const).map((mode) => (
              <button
                type="button"
                onClick={() => setPrefs(p => ({ ...p, optimization_mode: mode }))}
                disabled={loading()}
                class={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  prefs().optimization_mode === mode
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-white/20 bg-white/5 text-on-surface-variant hover:bg-white/10"
                }`}
              >
                {mode === "speed" ? "Fast" : mode === "cost" ? "Cheap" : "Balanced"}
              </button>
            ))}
          </div>
          <p class="text-[11px] text-on-surface-variant/60">
            {prefs().optimization_mode === "speed" && "Prioritise execution speed. May use more tokens."}
            {prefs().optimization_mode === "cost" && "Minimise token/API cost. May take longer."}
            {prefs().optimization_mode === "balanced" && "Weigh cost and speed together. Recommended."}
          </p>
        </div>

        {/* Auto-confirm threshold */}
        <div class="space-y-1">
          <label class="text-xs font-medium text-on-surface-variant">
            Auto-confirm below ${(prefs().auto_confirm_threshold_cents / 100).toFixed(2)}
          </label>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={prefs().auto_confirm_threshold_cents}
            onInput={(e) => setPrefs(p => ({
              ...p,
              auto_confirm_threshold_cents: Number(e.currentTarget.value),
            }))}
            disabled={loading()}
            class="w-full accent-primary"
          />
          <div class="flex justify-between text-[10px] text-on-surface-variant/50 font-mono">
            <span>$0.00 (always confirm)</span>
            <span>$0.50 (auto-approve most)</span>
          </div>
        </div>

        {/* Show cost estimates */}
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-on-surface-variant">Show cost estimates</p>
            <p class="text-[11px] text-on-surface-variant/60">
              Display token cost and time before each task execution.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs().show_cost_estimates}
            onClick={() => setPrefs(p => ({ ...p, show_cost_estimates: !p.show_cost_estimates }))}
            disabled={loading()}
            class={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
              prefs().show_cost_estimates ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform m-0.5 ${
              prefs().show_cost_estimates ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving() || loading()}
          class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-40"
        >
          {saving() ? "Saving…" : "Save Preferences"}
        </button>
        {toast() && <p class="text-xs text-green-400">{toast()}</p>}
      </div>
    </div>
  );
}

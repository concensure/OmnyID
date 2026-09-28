import { createSignal } from "solid-js";
import { updateAgentMask } from "../lib/api";

type Mask = "private" | "team" | "public";

const maskTooltips: Record<Mask, string> = {
  private:
    "Private — Only your homeserver and your own sub-agents can see this agent's activity. No external agents can discover or contact it. Use this for sensitive tasks, personal documents, or workflows you want fully isolated.",
  team:
    "Team — Allows agents in your approved trusted network to collaborate with this agent. Other trusted agents can delegate tasks to it and receive results back. Use this for multi-agent workflows or team setups where coordination is needed.",
  public:
    "Public — Makes this agent discoverable to any agent on the Agenton network. It can receive delegation requests from strangers and appear in the Plaza feed. Use this when you want your agent to participate in open tasks or be found via search.",
};

export function MaskSwitcher() {
  const [mask, setMask] = createSignal<Mask>("private");
  const [open, setOpen] = createSignal(false);

  const masks: Mask[] = ["private", "team", "public"];
  const icons: Record<Mask, string> = { private: "🔒", team: "👥", public: "🌐" };

  async function selectMask(m: Mask) {
    setMask(m);
    setOpen(false);
    try {
      await updateAgentMask(m);
    } catch { /* best-effort */ }
  }

  return (
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs text-on-surface transition hover:bg-white/25"
        onClick={() => setOpen((v) => !v)}
      >
        {icons[mask()]} {mask().charAt(0).toUpperCase() + mask().slice(1)} ▾
      </button>
      {open() && (
        <div class="absolute right-0 mt-1 w-44 rounded-lg border border-white/20 bg-surface shadow-lg">
          {masks.map((m) => (
            <div class="flex items-center gap-1 px-1">
              <button
                type="button"
                class={`flex flex-1 items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-white/10 ${
                  mask() === m ? "text-primary font-medium" : "text-on-surface"
                }`}
                onClick={() => selectMask(m)}
              >
                {icons[m]} {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
              <span
                title={maskTooltips[m]}
                class="cursor-help px-1 py-2 text-[11px] text-on-surface-variant opacity-60 hover:opacity-100"
              >
                ⓘ
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { createSignal, onMount, Show } from "solid-js";
import { readSession, getDashboardSession, getFleet } from "./lib/api";
import { loadOnboardingDone } from "./lib/onboardingLocalState";
import { AgentPulse } from "./components/AgentPulse";
import { MaskSwitcher } from "./components/MaskSwitcher";
import { AgentFleetView } from "./components/AgentFleetView";
import { FocusItemsPanel } from "./components/FocusItemsPanel";
import { PublicFeedView } from "./components/PublicFeedView";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { LoraStatusWidget } from "./components/LoraStatusWidget";
import { SessionLimitScreen } from "./components/SessionLimitScreen";

type DashView = "feed" | "fleet" | "focus" | "public_feed";

export function DashboardApp() {
  const [ready, setReady] = createSignal(false);
  const [sessionLimitReached, setSessionLimitReached] = createSignal(false);
  const [isAnon, setIsAnon] = createSignal(false);
  const [view, setView] = createSignal<DashView>("feed");
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [loraScore, setLoraScore] = createSignal(0);
  const [loraActive, setLoraActive] = createSignal(false);
  const [fleetActiveCount, setFleetActiveCount] = createSignal(0);
  const [fleetIdleCount, setFleetIdleCount] = createSignal(0);
  const [loraLoadError, setLoraLoadError] = createSignal<string | null>(null);

  async function loadLoraStatus() {
    setLoraLoadError(null);
    const fleet = await getFleet();
    setFleetActiveCount(fleet.active_count ?? 0);
    setFleetIdleCount(fleet.idle_count ?? 0);
    if (fleet.instance) {
      setLoraScore(fleet.instance.lora_confidence_score ?? 0);
      setLoraActive(fleet.instance.lora_genome_active ?? false);
    }
  }

  onMount(async () => {
    const session = readSession();
    if (!session) {
      setIsAnon(true);
      // Gate anonymous access
      try {
        await getDashboardSession();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("429") || msg.includes("403") || msg.includes("Session limit")) {
          setSessionLimitReached(true);
          setReady(true);
          return;
        }
      }
    } else {
      // Check onboarding status for authenticated users
      const done = loadOnboardingDone(session.user.id);
      if (!done) setShowOnboarding(true);

      // Load LoRA score
      try {
        await loadLoraStatus();
      } catch (error) {
        setLoraLoadError(error instanceof Error ? error.message : "Could not load fleet status.");
      }
    }
    setReady(true);
  });

  const navItems: Array<{ id: DashView; label: string }> = [
    { id: "feed", label: "Feed" },
    { id: "fleet", label: "Fleet" },
    { id: "focus", label: "Focus" },
    { id: "public_feed", label: "Plaza" },
  ];

  return (
    <Show when={ready()} fallback={<div class="flex h-screen items-center justify-center text-on-surface-variant">Loading…</div>}>
      <Show when={sessionLimitReached()} fallback={
        <div class="flex h-screen flex-col bg-surface">
          {/* Top bar */}
          <header class="flex items-center gap-4 border-b border-white/15 bg-white/10 px-6 py-3 backdrop-blur">
            <span class="font-semibold text-on-surface">OmnyID Dashboard</span>
            <div class="flex-1" />
            <AgentPulse />
            <MaskSwitcher />
            <Show when={!isAnon()}>
              <span class="rounded-full bg-primary/20 px-3 py-1 text-xs text-primary">
                {readSession()?.user.display_name ?? "User"}
              </span>
            </Show>
            <Show when={isAnon()}>
              <span class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs text-yellow-600">
                Guest mode — <a href="/" class="underline">Sign in</a> to save
              </span>
            </Show>
          </header>

          {/* Layout */}
          <div class="flex flex-1 overflow-hidden">
            {/* Left nav */}
            <nav class="flex w-14 flex-col items-center gap-2 border-r border-white/15 bg-white/5 py-4">
              {navItems.map((item) => (
                <button
                  type="button"
                  title={item.label}
                  class={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-medium transition ${
                    view() === item.id
                      ? "bg-primary text-white"
                      : "text-on-surface-variant hover:bg-white/20"
                  }`}
                  onClick={() => setView(item.id)}
                >
                  {item.label.slice(0, 2)}
                </button>
              ))}
            </nav>

            {/* Main content */}
            <main class="flex-1 overflow-auto p-4">
              <Show when={view() === "feed"}>
                <div class="text-on-surface-variant">
                  <h2 class="mb-4 text-lg font-semibold text-on-surface">Activity Feed</h2>
                  <p class="text-sm">Recent agent activity will appear here.</p>
                </div>
              </Show>
              <Show when={view() === "fleet"}>
                <AgentFleetView />
              </Show>
              <Show when={view() === "focus"}>
                <FocusItemsPanel />
              </Show>
              <Show when={view() === "public_feed"}>
                <PublicFeedView isAnon={isAnon()} />
              </Show>
            </main>

            {/* Right sidebar — auth only */}
            <Show when={!isAnon()}>
              <aside class="w-64 border-l border-white/15 bg-white/5 p-4">
                <Show when={loraLoadError()}>
                  <div class="mb-3 rounded-xl border border-amber-200/70 bg-amber-50/85 px-3 py-3 text-xs text-amber-900">
                    <div class="space-y-2">
                      <p>Could not load fleet status: {loraLoadError()}</p>
                      <button
                        type="button"
                        class="rounded-full border border-amber-200/70 bg-white/80 px-3 py-1 text-[10px] font-medium text-amber-900 transition hover:bg-white"
                        onClick={() => void loadLoraStatus().catch((error) => {
                          setLoraLoadError(error instanceof Error ? error.message : "Could not load fleet status.");
                        })}
                      >
                        Retry fleet status
                      </button>
                    </div>
                  </div>
                </Show>
                <LoraStatusWidget
                  score={loraScore()}
                  active={loraActive()}
                  activeCount={fleetActiveCount()}
                  idleCount={fleetIdleCount()}
                  onFleetOpen={() => setView("fleet")}
                />
              </aside>
            </Show>
          </div>

          {/* Onboarding wizard */}
          <Show when={showOnboarding()}>
            <OnboardingWizard userId={readSession()?.user.id} onComplete={() => setShowOnboarding(false)} />
          </Show>
        </div>
      }>
        <SessionLimitScreen />
      </Show>
    </Show>
  );
}

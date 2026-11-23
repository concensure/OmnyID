// @locs-version: 1.0
// @module-id: ui.connected-apps-view
// @primary-capability: user-scoped-connected-apps
// @stability: beta
import { createEffect, createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import {
  beginComposioLink,
  type ComposioStatusResponse,
  completeComposioLink,
  connectTool,
  disconnectTool,
  disconnectGmail,
  fetchComposioStatus,
  fetchGmailOAuthUrl,
  fetchGmailStatus,
  fetchToolConnections,
  readSession,
  type McpToolConnection,
} from "@/lib/api";
import {
  loadConnectedAppIds,
  saveConnectedAppIds,
  clearConnectedAppIds,
} from "@/lib/connectedAppsStorage";
import { AVAILABLE_CONNECTED_APPS } from "@/lib/connectedAppsCatalog";
import { EmptyState } from "./EmptyState";
import {
  connectedAppEnableBlockedReason,
  type ConnectedAppDef,
} from "@/lib/connectedAppsViewModel";
import {
  composioStatusDetailText,
  finalizeConnectedAppsCallbackState,
  loadConnectedAppsBootstrapState,
  toggleConnectedAppState,
} from "@/lib/connectedAppsState";
import {
  readComposioCallbackState,
  stripComposioCallbackParams,
} from "@/lib/composioCallbackState";
import { signedInLocalRegistryBanner } from "@/lib/toolConnectionRegistry";

const AVAILABLE_APPS: ConnectedAppDef[] = AVAILABLE_CONNECTED_APPS;

export function ConnectedAppsView(props: { initialFilter?: string } = {}) {
  const validConnectedAppIds = new Set(AVAILABLE_APPS.map((app) => app.id));
  const sessionUserId = () => readSession()?.user?.id ?? null;
  const signedIn = () => Boolean(sessionUserId());

  const [connections, setConnections] = createSignal<McpToolConnection[]>([]);
  const [legacyConnectedIds, setLegacyConnectedIds] = createSignal<string[]>(
    loadConnectedAppIds(sessionUserId(), validConnectedAppIds),
  );
  const [filter, setFilter] = createSignal(props.initialFilter ?? "");
  const [loading, setLoading] = createSignal(false);
  const [localOnlyMode, setLocalOnlyMode] = createSignal(false);
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [composioConfigured, setComposioConfigured] = createSignal(false);
  const [composioUsable, setComposioUsable] = createSignal(false);
  const [composioStatusDetail, setComposioStatusDetail] = createSignal<ComposioStatusResponse | null>(null);
  const [gmailConfigured, setGmailConfigured] = createSignal(false);

  createEffect(() => {
    if (props.initialFilter) setFilter(props.initialFilter);
  });

  function clearComposioCallbackParams() {
    if (typeof window === "undefined") return;
    window.history.replaceState({}, "", stripComposioCallbackParams(window.location.href));
  }

  async function finalizeComposioCallback() {
    if (typeof window === "undefined") return;
    const callbackState = readComposioCallbackState(window.location.search, AVAILABLE_APPS);
    if (callbackState.mode === "none") return;
    clearComposioCallbackParams();
    if (callbackState.mode === "error") {
      setError(callbackState.message);
      return;
    }
    const result = await finalizeConnectedAppsCallbackState({
      app: callbackState.app,
      composioConnectedAccountId: callbackState.composio_connected_account_id,
      composioState: callbackState.composio_state,
      composioStatus: callbackState.composio_status,
      completeLink: completeComposioLink,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.connection) {
      const nextConnection = result.connection;
      setConnections((current) => {
        const filtered = current.filter((connection) => connection.tool_slug !== nextConnection.tool_slug);
        return [...filtered, nextConnection];
      });
    }
    setNotice(result.notice);
  }

  const connectedIds = createMemo(() => {
    if (localOnlyMode()) return new Set(legacyConnectedIds());
    return new Set(connections().map((connection) => connection.tool_slug));
  });

  onMount(async () => {
    setLoading(true);
    setError(null);
    const result = await loadConnectedAppsBootstrapState({
      signedIn: signedIn(),
      loadConnections: fetchToolConnections,
      loadComposioStatus: fetchComposioStatus,
      loadGmailStatus: fetchGmailStatus,
    });
    setConnections(result.connections);
    setLocalOnlyMode(result.localOnlyMode);
    setError(result.error);
    setNotice(result.notice);
    setComposioConfigured(result.composioConfigured);
    setComposioUsable(result.composioUsable);
    setComposioStatusDetail(result.composioStatusDetail);
    setGmailConfigured(result.gmailConfigured);
    if (!result.error && !result.localOnlyMode && signedIn()) {
      await finalizeComposioCallback();
    }
    setLoading(false);
  });

  async function toggle(app: ConnectedAppDef) {
    setError(null);
    setNotice(null);
    setBusyId(app.id);
    const result = await toggleConnectedAppState({
      app,
      signedIn: signedIn(),
      localOnlyMode: localOnlyMode(),
      connectedIds: connectedIds(),
      legacyConnectedIds: legacyConnectedIds(),
      sessionUserId: sessionUserId(),
      validConnectedAppIds,
      composioUsable: composioUsable(),
      gmailConfigured: gmailConfigured(),
      connections: connections(),
      saveConnectedIds: saveConnectedAppIds,
      clearConnectedIds: clearConnectedAppIds,
      disconnectGmail,
      disconnectTool,
      fetchGmailOAuthUrl,
      beginComposioLink,
      connectTool,
    });
    if (result.connections) {
      setConnections(result.connections);
    }
    if (result.legacyConnectedIds) {
      setLegacyConnectedIds(result.legacyConnectedIds);
    }
    if (result.localOnlyMode !== null) {
      setLocalOnlyMode(result.localOnlyMode);
    }
    setError(result.error);
    setNotice(result.notice);
    if (result.redirectUrl) {
      window.location.assign(result.redirectUrl);
    }
    setBusyId(null);
  }

  const categories = createMemo(() => {
    const q = filter().trim().toLowerCase();
    const apps = q
      ? AVAILABLE_APPS.filter((app) =>
          app.name.toLowerCase().includes(q)
          || app.category.toLowerCase().includes(q)
          || app.description.toLowerCase().includes(q),
        )
      : AVAILABLE_APPS;
    const map = new Map<string, ConnectedAppDef[]>();
    for (const app of apps) {
      const list = map.get(app.category) ?? [];
      list.push(app);
      map.set(app.category, list);
    }
    return Array.from(map.entries());
  });

  return (
    <div class="animate-fade-in space-y-6">
      <div>
        <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Tools</p>
        <h2 class="mt-1 text-xl font-bold text-on-surface">Connected Apps</h2>
        <p class="mt-0.5 text-sm text-on-surface-variant">
          Track which integrations are enabled for this workspace. Real OAuth and provider-side grants still depend on each integration&apos;s auth flow.
        </p>
      </div>

      <Switch>
        <Match when={error()}>
          <div class="rounded-2xl border border-red-200/60 bg-red-50/80 px-4 py-3 text-sm text-red-800 shadow-sm">
            {error()}
          </div>
        </Match>
        <Match when={localOnlyMode()}>
          <div class="rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
            {signedInLocalRegistryBanner()}
          </div>
        </Match>
        <Match when={signedIn()}>
          <div class="rounded-2xl border border-emerald-200/60 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 shadow-sm">
            Enabled apps are currently backed by the authenticated user&apos;s server-side connection records and OAuth grants.
          </div>
        </Match>
      </Switch>

      <Show when={notice()}>
        <div class="rounded-2xl border border-sky-200/60 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 shadow-sm">
          {notice()}
        </div>
      </Show>

      <Show when={signedIn() && !localOnlyMode()}>
        <div class="rounded-2xl border border-white/45 bg-white/35 px-4 py-3 text-sm text-on-surface shadow-card">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-on-surface">Composio project key</span>
            <span
              class={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                composioUsable()
                  ? "bg-emerald-100 text-emerald-700"
                  : composioConfigured()
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-700"
              }`}
            >
              {composioUsable() ? "usable" : composioConfigured() ? "configured but failing" : "not configured"}
            </span>
          </div>
          <p class="mt-2 text-xs leading-5 text-on-surface-variant">
            A failing Composio key does not block per-user registry isolation, but it does block live provider-backed connections for apps that depend on that upstream project key.
          </p>
          <Show when={composioStatusDetailText(composioStatusDetail())}>
            {(detail) => (
              <p class="mt-2 text-xs leading-5 text-amber-700">
                {detail()}
              </p>
            )}
          </Show>
        </div>
      </Show>

      <input
        type="text"
        placeholder="Filter apps..."
        value={filter()}
        onInput={(e) => setFilter(e.currentTarget.value)}
        class="w-full rounded-xl border border-white/35 bg-white/30 px-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition focus:border-primary/40 focus:bg-white/50"
      />

      <Show
        when={categories().length > 0}
        fallback={
          <EmptyState
            icon="AP"
            title="No apps match this filter"
            body="Try a broader name, category, or integration keyword to find the app you want to connect."
          />
        }
      >
        <For each={categories()}>
          {([category, apps]) => (
            <div>
              <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline/60">{category}</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <For each={apps}>
                  {(app) => {
                    const isOn = () => connectedIds().has(app.id);
                    const isBusy = () => busyId() === app.id;
                    const blockedReason = () =>
                      isOn()
                        ? null
                        : connectedAppEnableBlockedReason(app, {
                            signedIn: signedIn(),
                            localOnlyMode: localOnlyMode(),
                            composioUsable: composioUsable(),
                            gmailConfigured: gmailConfigured(),
                          });
                    return (
                      <div
                        class={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                          isOn() ? "border-primary/30 bg-primary/5" : "border-white/50 bg-white/40"
                        } shadow-card`}
                      >
                        <span
                          class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/35 bg-white/55 text-[11px] font-semibold tracking-[0.16em] text-on-surface-variant"
                          aria-hidden="true"
                        >
                          {app.icon}
                        </span>
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-sm font-semibold text-on-surface">{app.name}</p>
                            <span class="rounded-full border border-white/45 bg-white/50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
                              {app.connectionProvider}
                            </span>
                          </div>
                          <p class="truncate text-[10px] text-on-surface-variant/70">{app.description}</p>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy() || blockedReason() !== null}
                          title={blockedReason() ?? undefined}
                          onClick={() => void toggle(app)}
                          class={`flex-shrink-0 rounded-full px-3 py-1 text-[10px] font-medium transition disabled:cursor-wait disabled:opacity-70 ${
                            isOn()
                              ? "bg-primary/15 text-primary hover:bg-red-50 hover:text-red-500"
                              : "border border-outline/20 bg-white/60 text-on-surface-variant hover:bg-primary/10 hover:text-primary"
                          }`}
                        >
                          {isBusy()
                            ? "Working..."
                            : isOn()
                              ? (localOnlyMode() ? "Enabled locally" : "Enabled")
                              : blockedReason()
                                ? "Setup required"
                                : (localOnlyMode() ? "Enable locally" : "Enable")}
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

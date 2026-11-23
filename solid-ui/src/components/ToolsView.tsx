// @locs-version: 1.0
// @module-id: ui.tools-view
// @primary-capability: user-scoped-tool-connections
// @stability: beta
/**
 * ToolsView — MCP Tool Connections
 *
 * Displays a curated catalog of MCP-compatible tools with connection management.
 * Authenticated users can connect tools by providing an MCP server URL and API key.
 * Connected tools are passed as context to the master agent via AFP tool_call metadata.
 */
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import {
  fetchToolConnections,
  connectTool,
  disconnectTool,
  fetchSkillCapsuleCatalog,
  saveWorkspaceSkillSelection,
  readSession,
  type McpToolConnection,
  type SkillCapsuleCatalogEntry,
} from "@/lib/api";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { AVAILABLE_CONNECTED_APPS } from "@/lib/connectedAppsCatalog";
import { CATALOG, type CatalogTool } from "@/lib/toolCatalog";
import {
  buildToolsFailureReceipt,
  type ToolsFailureReceipt,
} from "@/lib/toolsFailureState";
import {
  clearLocalToolConnections,
  loadLocalToolConnections,
  loadRecentlyUsedToolSlugs,
  loadToolUseCount,
  recordRecentlyUsedToolSlug,
  saveLocalToolConnections,
} from "@/lib/toolsLocalState";
import {
  connectToolBlockedInLocalRegistryReason,
  isMissingToolConnectionsBackend,
  signedInLocalRegistryBanner,
  signedInLocalRegistryNotice,
} from "@/lib/toolConnectionRegistry";
import { recordShortcutUse } from "@/lib/shortcutRecency";

const connectedAppNameById = new Map(AVAILABLE_CONNECTED_APPS.map((app) => [app.id, app.name]));

function credentialLabel(tool: CatalogTool): string {
  if (tool.auth_type === "oauth2") return "OAuth credential";
  if (tool.auth_type === "none") return "access token";
  return "API key";
}

function credentialPluralLabel(tool: CatalogTool): string {
  if (tool.auth_type === "oauth2") return "OAuth credentials";
  if (tool.auth_type === "none") return "access token";
  return "API key";
}

function directCredentialRequired(tool: CatalogTool): boolean {
  return tool.auth_type !== "none";
}

function toolSetupSummary(tool: CatalogTool, connectedAppName?: string): string {
  if (connectedAppName) {
    return `${tool.name} can be enabled through the Connected Apps flow for ${connectedAppName}, or connected as a direct MCP server when you run your own endpoint.`;
  }
  if (tool.mcpDocsUrl) {
    return `${tool.name} has MCP documentation linked from this card. Use that server URL with a scoped credential from the provider.`;
  }
  return `Use a provider-issued credential and the MCP-compatible endpoint that exposes ${tool.name} actions to OmnyID.`;
}

function toolSecuritySummary(tool: CatalogTool): string {
  const credential = credentialLabel(tool).toLowerCase();
  return `Connections are saved per signed-in user. Use a least-privilege ${credential}, rotate it from the provider console when needed, and disconnect here to remove OmnyID runtime access.`;
}

// ── Tool logo with clearbit CDN + letter fallback ────────────────────────────

function ToolLogo(props: { tool: CatalogTool; size?: "sm" | "lg" }) {
  const [imgError, setImgError] = createSignal(false);
  const size = props.size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const textSize = props.size === "lg" ? "text-lg" : "text-sm";

  const initials = () => {
    const words = props.tool.name.split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : props.tool.name.slice(0, 2).toUpperCase();
  };

  const bgColor = () => {
    // Deterministic hue from slug
    let hash = 0;
    for (const ch of props.tool.slug) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue},55%,50%)`;
  };

  return (
    <div
      class={`${size} flex-shrink-0 overflow-hidden rounded-xl`}
      style={imgError() ? `background:${bgColor()}` : undefined}
    >
      <Show
        when={!imgError()}
        fallback={
          <span class={`flex h-full w-full items-center justify-center font-bold text-white ${textSize}`}>
            {initials()}
          </span>
        }
      >
        <img
          src={`https://logo.clearbit.com/${props.tool.domain}`}
          alt={props.tool.name}
          class="h-full w-full object-contain"
          onError={() => setImgError(true)}
        />
      </Show>
    </div>
  );
}

// ── Connect / disconnect modal ────────────────────────────────────────────────

function ToolInfoModal(props: {
  tool: CatalogTool;
  signedIn: boolean;
  connected: boolean;
  connectedAppName?: string;
  onClose: () => void;
  onConnectDirect: () => void;
  onOpenConnectedApp?: () => void;
}) {
  const credential = () => credentialLabel(props.tool);
  const credentialPlural = () => credentialPluralLabel(props.tool);

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        role="button"
        tabindex={-1}
        onClick={props.onClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      />
      <div class="relative z-10 w-full max-w-2xl rounded-3xl border border-white/50 bg-white/95 p-6 shadow-xl backdrop-blur-md">
        <div class="flex items-start gap-3">
          <ToolLogo tool={props.tool} size="lg" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-on-surface">{props.tool.name}</h2>
              <span class="rounded-full border border-white/50 bg-white/60 px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                {props.tool.category}
              </span>
              <span class="rounded-full border border-white/50 bg-white/60 px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                {props.tool.auth_type.replaceAll("_", " ")}
              </span>
            </div>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">{props.tool.description}</p>
          </div>
          <button
            type="button"
            class="rounded-full border border-white/50 bg-white/60 px-2.5 py-1 text-xs text-on-surface-variant transition hover:bg-white"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>

        <div class="mt-5 grid gap-3 md:grid-cols-2">
          <div class="rounded-2xl border border-white/55 bg-white/55 px-4 py-3">
            <p class="text-xs font-semibold text-on-surface">Setup path</p>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              {toolSetupSummary(props.tool, props.connectedAppName)}
            </p>
            <Show when={props.connectedAppName}>
              {(name) => (
                <p class="mt-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] leading-5 text-primary">
                  Use Connected Apps to enable the managed {name()} flow without manually entering an MCP URL.
                </p>
              )}
            </Show>
          </div>

          <div class="rounded-2xl border border-white/55 bg-white/55 px-4 py-3">
            <p class="text-xs font-semibold text-on-surface">Security</p>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">{toolSecuritySummary(props.tool)}</p>
          </div>

          <div class="rounded-2xl border border-white/55 bg-white/55 px-4 py-3">
            <p class="text-xs font-semibold text-on-surface">What agents can request</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={props.tool.capabilities.slice(0, 8)}>
                {(capability) => (
                  <span class="rounded-full border border-white/45 bg-white/70 px-2 py-0.5 text-[10px] text-on-surface-variant">
                    {capability.replaceAll("_", " ")}
                  </span>
                )}
              </For>
            </div>
          </div>

          <div class="rounded-2xl border border-white/55 bg-white/55 px-4 py-3">
            <p class="text-xs font-semibold text-on-surface">Credential guidance</p>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              {directCredentialRequired(props.tool)
                ? `Direct MCP setup requires a non-empty ${credential().toLowerCase()}. Create a scoped credential in ${props.tool.name}, then paste it only into this user-scoped connection form.`
                : `This provider normally does not need a provider API key, but your MCP server may still require an access token depending on how it is deployed.`}
            </p>
          </div>
        </div>

        <Show when={props.tool.billing}>
          {(billing) => (
            <div class="mt-3 rounded-2xl border border-sky-200/60 bg-sky-50/80 px-4 py-3 text-xs text-sky-900">
              <p class="font-semibold">Billing model: {billing().billing_model.replaceAll("_", " ")}</p>
              <p class="mt-1 leading-5">{billing().pricing_summary}</p>
            </div>
          )}
        </Show>

        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <Show when={props.tool.apiKeyUrl}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                class="rounded-xl border border-white/50 bg-white/60 px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white"
              >
                Open {credentialPlural()} page
              </a>
            )}
          </Show>
          <Show when={props.tool.mcpDocsUrl}>
            {(url) => (
              <a
                href={url()}
                target="_blank"
                rel="noreferrer"
                class="rounded-xl border border-white/50 bg-white/60 px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white"
              >
                MCP docs
              </a>
            )}
          </Show>
          <Show when={props.connectedAppName && props.onOpenConnectedApp}>
            <button
              type="button"
              class="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/18"
              onClick={props.onOpenConnectedApp}
            >
              Use Connected Apps
            </button>
          </Show>
          <button
            type="button"
            disabled={props.connected}
            class="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:bg-emerald-100 disabled:text-emerald-700"
            onClick={props.onConnectDirect}
          >
            {props.connected ? "Connected" : props.signedIn ? "Connect direct MCP" : "Sign in to connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectModal(props: {
  tool: CatalogTool;
  onClose: () => void;
  onConnected: (connection: McpToolConnection) => void;
}) {
  const [serverUrl, setServerUrl] = createSignal("");
  const [apiKey, setApiKey] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [validationError, setValidationError] = createSignal<string | null>(null);
  const [submitError, setSubmitError] = createSignal<ToolsFailureReceipt | null>(null);
  const credentialNoun = () => credentialLabel(props.tool);
  const credentialNounPlural = () => credentialPluralLabel(props.tool);

  const requestClose = () => {
    if (busy()) return;
    props.onClose();
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const url = serverUrl().trim();
    if (!url) {
      setValidationError("MCP server URL is required.");
      return;
    }
    if (directCredentialRequired(props.tool) && !apiKey().trim()) {
      setValidationError(`${credentialNoun()} is required for direct ${props.tool.name} connections.`);
      return;
    }
    setBusy(true);
    setValidationError(null);
    setSubmitError(null);
    try {
      const { connection } = await connectTool({
        tool_slug: props.tool.slug,
        tool_name: props.tool.name,
        mcp_server_url: url,
        api_key: apiKey().trim() || undefined,
        tool_descriptor: {
          tool_id: props.tool.slug,
          name: props.tool.name,
          description: props.tool.description,
          capabilities: props.tool.capabilities,
          auth_type: props.tool.auth_type,
          mcp_server_url: url,
          api_key_url: props.tool.apiKeyUrl,
          billing: props.tool.billing,
        },
      });
      props.onConnected(connection);
    } catch (err) {
      setSubmitError(
        buildToolsFailureReceipt(
          `Connect ${props.tool.name}`,
          err instanceof Error ? err.message : "Connection failed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleFormShortcut = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !busy()) {
      event.preventDefault();
      recordShortcutUse("form_cancel");
      requestClose();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      recordShortcutUse("form_submit");
      void handleSubmit(event);
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={requestClose}
        role="button"
        tabindex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy()) {
            recordShortcutUse("form_cancel");
            requestClose();
          }
        }}
      />
      {/* Modal card */}
      <div class="relative z-10 w-full max-w-md animate-fade-in rounded-3xl border border-white/50 bg-white/90 p-6 shadow-xl backdrop-blur-md">
        <div class="mb-5 flex items-center gap-3">
          <ToolLogo tool={props.tool} size="lg" />
          <div>
            <h2 class="text-base font-semibold text-on-surface">Connect {props.tool.name}</h2>
            <p class="text-xs text-on-surface-variant">{props.tool.description}</p>
            <Show when={props.tool.apiKeyUrl}>
              {(url) => (
                <a
                  href={url()}
                  target="_blank"
                  rel="noreferrer"
                  class="mt-1 inline-flex text-[11px] font-medium text-primary underline underline-offset-2 hover:text-primary/70"
                >
                  Open {props.tool.name} {credentialNoun()} page
                </a>
              )}
            </Show>
          </div>
        </div>

        <form class="space-y-4" onSubmit={handleSubmit} onKeyDown={handleFormShortcut}>
          <Show when={props.tool.billing}>
            {(billing) => (
              <div class="rounded-2xl border border-sky-200/60 bg-sky-50/75 px-4 py-3 text-xs text-sky-900">
                <p class="font-semibold">Billing model: {billing().billing_model.replaceAll("_", " ")}</p>
                <p class="mt-1 leading-5">{billing().pricing_summary}</p>
                <Show when={billing().free_tier_summary}>
                  <p class="mt-1 leading-5 text-sky-800/90">Free tier: {billing().free_tier_summary}</p>
                </Show>
                <Show when={billing().production_caveat}>
                  <p class="mt-1 leading-5 text-amber-800">{billing().production_caveat}</p>
                </Show>
                <Show when={billing().pricing_source_url}>
                  <a
                    class="mt-2 inline-flex text-[11px] font-medium text-sky-700 underline hover:text-sky-900"
                    href={billing().pricing_source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pricing source
                  </a>
                </Show>
              </div>
            )}
          </Show>

          <div>
            <label class="mb-1 block text-xs font-medium text-on-surface-variant">MCP Server URL</label>
            <input
              type="url"
              placeholder="https://mcp.example.com"
              class="w-full rounded-xl border border-white/50 bg-white/60 px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              value={serverUrl()}
              onInput={(e) => {
                setServerUrl(e.currentTarget.value);
                if (validationError()) setValidationError(null);
                if (submitError()) setSubmitError(null);
              }}
              required
            />
            <p class="mt-1 text-[10px] text-on-surface-variant/60">
              The MCP-compatible endpoint URL for {props.tool.name}.
            </p>
          </div>

          <div>
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label class="block text-xs font-medium text-on-surface-variant">
                {credentialNoun()} {directCredentialRequired(props.tool) ? "" : "(optional)"}
              </label>
              <Show when={props.tool.apiKeyUrl}>
                {(url) => (
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="text-[11px] font-medium text-primary underline underline-offset-2 hover:text-primary/70"
                  >
                    Get {credentialNounPlural()}
                  </a>
                )}
              </Show>
            </div>
            <input
              type="password"
              placeholder={props.tool.auth_type === "oauth2" ? "OAuth access token..." : props.tool.auth_type === "none" ? "Optional server token..." : "API key..."}
              class="w-full rounded-xl border border-white/50 bg-white/60 px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              value={apiKey()}
              onInput={(e) => {
                setApiKey(e.currentTarget.value);
                if (validationError()) setValidationError(null);
                if (submitError()) setSubmitError(null);
              }}
              required={directCredentialRequired(props.tool)}
            />
          </div>

          <p class="rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-[11px] leading-5 text-on-surface-variant">
            This connection is saved for your signed-in account only; other users cannot use your API key.
          </p>

          <Show when={validationError()}>
            <p class="rounded-xl border border-red-400/30 bg-red-50/80 px-4 py-2 text-xs text-red-600">
              {validationError()}
            </p>
          </Show>

          <Show when={submitError()}>
            <div
              classList={{
                "rounded-xl border px-4 py-3 text-xs": true,
                "border-red-400/30 bg-red-50/80 text-red-600": submitError()?.tone === "danger",
                "border-amber-300/40 bg-amber-50/80 text-amber-700": submitError()?.tone !== "danger",
              }}
            >
              <p class="font-semibold">{submitError()?.title}</p>
              <p class="mt-1">{submitError()?.summary}</p>
              <p class="mt-1 opacity-90">{submitError()?.nextStep}</p>
            </div>
          </Show>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-xl border border-white/40 bg-white/40 px-4 py-2.5 text-sm text-on-surface-variant transition hover:bg-white/60"
              onClick={() => {
                recordShortcutUse("form_cancel");
                requestClose();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy()}
              class="glass-button rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition"
            >
              {busy() ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Connected tool row ────────────────────────────────────────────────────────

function ConnectedToolRow(props: {
  connection: McpToolConnection;
  tool?: CatalogTool;
  onDisconnect: () => void;
}) {
  const [confirming, setConfirming] = createSignal(false);

  return (
    <div class="flex items-center gap-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-3">
      <Show when={props.tool} fallback={
        <div class="h-9 w-9 flex-shrink-0 rounded-xl bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
          {props.connection.tool_name.slice(0, 2).toUpperCase()}
        </div>
      }>
        {(tool) => <ToolLogo tool={tool()} />}
      </Show>

      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-on-surface">{props.connection.tool_name}</p>
        <p class="truncate text-[11px] text-on-surface-variant">{props.connection.mcp_server_url}</p>
        <Show when={props.tool?.billing?.pricing_summary}>
          <p class="mt-1 text-[11px] text-emerald-800/80">{props.tool?.billing?.pricing_summary}</p>
        </Show>
      </div>

      <span class="flex-shrink-0 rounded-full border border-emerald-300/60 bg-emerald-100/80 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700">
        Connected
      </span>

      <Show
        when={confirming()}
        fallback={
          <button
            type="button"
            class="flex-shrink-0 rounded-xl border border-white/40 bg-white/40 px-3 py-1.5 text-xs text-on-surface-variant transition hover:border-red-300/60 hover:bg-red-50/60 hover:text-red-600"
            onClick={() => setConfirming(true)}
          >
            Disconnect
          </button>
        }
      >
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-on-surface-variant">Remove?</span>
          <button
            type="button"
            class="rounded-lg border border-red-300/60 bg-red-50/80 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-100"
            onClick={props.onDisconnect}
          >
            Yes
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/40 bg-white/40 px-2.5 py-1 text-[11px] text-on-surface-variant transition hover:bg-white/60"
            onClick={() => setConfirming(false)}
          >
            No
          </button>
        </div>
      </Show>
    </div>
  );
}

// ── Tool catalog card ─────────────────────────────────────────────────────────

function ToolCard(props: {
  tool: CatalogTool;
  connected: boolean;
  signedIn: boolean;
  onConnect: () => void;
  onOpenConnectedApp?: () => void;
  onInfo: () => void;
  selectMode?: boolean;
  selected?: boolean;
  connectBlockedReason?: string | null;
}) {
  const connectBlocked = () => !props.selectMode && Boolean(props.connectBlockedReason);
  const credentialPageLabel = () => props.tool.auth_type === "oauth2" ? "Credential page" : "API key page";
  const connectedAppName = () => props.tool.connectedAppId ? connectedAppNameById.get(props.tool.connectedAppId) : undefined;
  const primaryAction = () => {
    if (props.tool.connectedAppId && props.onOpenConnectedApp) {
      props.onOpenConnectedApp();
      return;
    }
    props.onConnect();
  };

  return (
    <div
      class={`card-hover flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
        props.selected
          ? "border-primary/40 bg-primary/5"
          : props.connected
            ? "border-emerald-200/60 bg-emerald-50/40"
            : "border-white/40 bg-white/25 hover:bg-white/40"
      }`}
      onClick={props.selectMode ? props.onConnect : undefined}
      style={props.selectMode ? "cursor:pointer" : undefined}
    >
      {/* 8q — checkbox in select mode */}
      <Show when={props.selectMode}>
        <span class={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] ${
          props.selected ? "border-primary bg-primary text-white" : "border-white/50 bg-white/30"
        }`}>
          {props.selected ? "✓" : ""}
        </span>
      </Show>

      <button
        type="button"
        class="rounded-xl outline-none focus:ring-2 focus:ring-primary/25"
        onClick={(event) => {
          event.stopPropagation();
          props.onInfo();
        }}
        title={`More about ${props.tool.name}`}
      >
        <ToolLogo tool={props.tool} />
      </button>

      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-on-surface">{props.tool.name}</p>
        <p class="mt-0.5 truncate text-[11px] text-on-surface-variant">{props.tool.description}</p>
        <Show when={props.tool.apiKeyUrl}>
          {(url) => (
            <a
              href={url()}
              target="_blank"
              rel="noreferrer"
              class="mt-1 inline-flex text-[11px] font-medium text-primary/80 underline underline-offset-2 hover:text-primary"
              onClick={(event) => event.stopPropagation()}
            >
              {credentialPageLabel()}
            </a>
          )}
        </Show>
        <Show when={connectedAppName()}>
          {(name) => (
            <button
              type="button"
              class="mt-1 inline-flex text-[11px] font-medium text-primary/80 underline underline-offset-2 hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                props.onOpenConnectedApp?.();
              }}
            >
              Enable via {name()}
            </button>
          )}
        </Show>
        <Show when={props.tool.billing}>
          {(billing) => (
            <p class="mt-1 text-[11px] text-on-surface-variant/80">{billing().pricing_summary}</p>
          )}
        </Show>
        {/* ITEM 12 — usage badge */}
        {(() => {
          const count = getToolUseCount(props.tool.slug ?? props.tool.name ?? "");
          return (
            <span class={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${count > 0 ? "bg-primary/10 text-primary" : "bg-white/10 text-on-surface-variant/50"}`}>
              {count > 0 ? `${count}× this week` : "Unused this week"}
            </span>
          );
        })()}
      </div>

      <Show when={!props.selectMode}>
        <button
          type="button"
          class="flex-shrink-0 rounded-full border border-white/50 bg-white/45 px-2 py-1 text-[11px] font-semibold text-on-surface-variant transition hover:bg-white hover:text-on-surface"
          onClick={(event) => {
            event.stopPropagation();
            props.onInfo();
          }}
          title={`More setup information for ${props.tool.name}`}
        >
          Info
        </button>
        <Show
          when={!props.connected}
          fallback={
            <span class="flex-shrink-0 rounded-full border border-emerald-300/60 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Connected
            </span>
          }
        >
          <button
            type="button"
            disabled={connectBlocked()}
            title={props.connectBlockedReason ?? undefined}
            class={`glass-button flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              connectBlocked()
                ? "cursor-not-allowed border border-slate-300/40 bg-slate-100/70 text-slate-500"
                : props.signedIn
                ? "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                : "border border-amber-300/50 bg-amber-50/80 text-amber-700 hover:bg-amber-100/80"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              primaryAction();
            }}
          >
            {connectBlocked()
              ? "Registry unavailable"
              : props.signedIn
                ? props.tool.connectedAppId && props.onOpenConnectedApp
                  ? "Enable app"
                  : "Connect"
                : "Sign in"}
          </button>
        </Show>
      </Show>
    </div>
  );
}

function SkillCard(props: {
  skill: SkillCapsuleCatalogEntry;
  selected: boolean;
  signedIn: boolean;
  onToggle: () => void;
  onRequireSignIn: () => void;
}) {
  return (
    <div class={`rounded-2xl border px-4 py-4 transition ${
      props.selected
        ? "border-primary/40 bg-primary/8"
        : "border-white/40 bg-white/25 hover:bg-white/35"
    }`}>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold text-on-surface">{props.skill.title}</p>
            <span class="rounded-full border border-white/35 bg-white/35 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
              {props.skill.category}
            </span>
            <span class="rounded-full border border-sky-200/60 bg-sky-50/80 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              {props.skill.integration_mode.replaceAll("_", " ")}
            </span>
          </div>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">{props.skill.description}</p>
        </div>
        <button
          type="button"
          onClick={props.signedIn ? props.onToggle : props.onRequireSignIn}
          class={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
            props.selected
              ? "border-primary/35 bg-primary/12 text-primary hover:bg-primary/18"
              : props.signedIn
                ? "border-white/40 bg-white/40 text-on-surface-variant hover:bg-white/60 hover:text-on-surface"
                : "border-amber-300/50 bg-amber-50/80 text-amber-700 hover:bg-amber-100/80"
          }`}
        >
          {props.selected ? "Added" : props.signedIn ? "Add to workspace" : "Sign in"}
        </button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <For each={props.skill.surfaces}>
          {(surface) => (
            <span class="rounded-full border border-white/35 bg-white/30 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant">
              {surface}
            </span>
          )}
        </For>
      </div>

      <p class="mt-3 text-[11px] leading-5 text-on-surface-variant/80">
        {props.skill.existing_runtime_fit}
      </p>
    </div>
  );
}

// ITEM 12 — usage badge helper
function getToolUseCount(toolId: string): number {
  const sessionUserId = readSession()?.user?.id ?? null;
  return loadToolUseCount(toolId, new Date(), sessionUserId);
}

function recordToolUsed(slug: string) {
  const sessionUserId = readSession()?.user?.id ?? null;
  recordRecentlyUsedToolSlug(slug, sessionUserId);
}

// ── ToolsView ─────────────────────────────────────────────────────────────────

export function ToolsView(props: {
  signedIn: boolean;
  onOpenConnectedApp?: (appId: string, label: string) => void;
}) {
  const sessionUserId = () => readSession()?.user?.id ?? null;
  const [activeTab, setActiveTab] = createSignal<"connections" | "skills">("connections");
  const [connections, setConnections] = createSignal<McpToolConnection[]>([]);
  const [connectingTool, setConnectingTool] = createSignal<CatalogTool | null>(null);
  const [infoTool, setInfoTool] = createSignal<CatalogTool | null>(null);
  const [connectQueue, setConnectQueue] = createSignal<CatalogTool[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal<ToolsFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<ToolsFailureReceipt | null>(null);
  const [localConnectionMode, setLocalConnectionMode] = createSignal(false);
  const [skillsLoading, setSkillsLoading] = createSignal(false);
  const [skillsSaving, setSkillsSaving] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [showAllTools, setShowAllTools] = createSignal(false);
  const [recentSlugs, setRecentSlugs] = createSignal<string[]>(loadRecentlyUsedToolSlugs(sessionUserId()));
  const [connectNotice, setConnectNotice] = createSignal<string | null>(null);
  const [skillCatalog, setSkillCatalog] = createSignal<SkillCapsuleCatalogEntry[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = createSignal<string[]>([]);
  const [skillWarnings, setSkillWarnings] = createSignal<string[]>([]);
  const [skillRuntimeAvailable, setSkillRuntimeAvailable] = createSignal(false);
  const [skillFeedback, setSkillFeedback] = createSignal<string | null>(null);
  const [skillError, setSkillError] = createSignal<ToolsFailureReceipt | null>(null);
  // 8q — multi-select
  const [selectMode, setSelectMode] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const INITIAL_CATEGORY_LIMIT = 3;

  const connectedSlugs = () => new Set(connections().map((c) => c.tool_slug));

  const recentTools = () =>
    recentSlugs()
      .map((slug) => CATALOG.find((t) => t.slug === slug))
      .filter((tool): tool is CatalogTool => Boolean(tool));

  const selectedSkillSet = createMemo(() => new Set(selectedSkillIds()));
  const groupedSkills = createMemo(() => {
    const result = new Map<string, SkillCapsuleCatalogEntry[]>();
    for (const skill of skillCatalog()) {
      const list = result.get(skill.category) ?? [];
      list.push(skill);
      result.set(skill.category, list);
    }
    return [...result.entries()];
  });

  onMount(async () => {
    if (!props.signedIn) return;
    setLoading(true);
    setSkillsLoading(true);
    setLoadError(null);
    try {
      const skillPromise = fetchSkillCapsuleCatalog();
      let connectionList: McpToolConnection[] = [];
      try {
        const { connections: list } = await fetchToolConnections();
        connectionList = list;
        setLocalConnectionMode(false);
      } catch (error) {
        if (isMissingToolConnectionsBackend(error)) {
          connectionList = loadLocalToolConnections(sessionUserId());
          setLocalConnectionMode(true);
          setConnectNotice(signedInLocalRegistryNotice());
        } else {
          throw error;
        }
      }
      const skillData = await skillPromise;
      setConnections(connectionList);
      setSkillCatalog(skillData.catalog ?? []);
      setSelectedSkillIds(skillData.workspace?.selected_skill_ids ?? []);
      setSkillWarnings(skillData.warnings ?? []);
      setSkillRuntimeAvailable(Boolean(skillData.available));
    } catch (err) {
      setLoadError(
        buildToolsFailureReceipt(
          "Load tools and skill catalog",
          err instanceof Error ? err.message : "Failed to load tools and skill catalog.",
        ),
      );
    }
    finally {
      setLoading(false);
      setSkillsLoading(false);
    }
  });
  const handleDisconnect = async (slug: string) => {
    setActionError(null);
    if (localConnectionMode()) {
      const next = connections().filter((c) => c.tool_slug !== slug);
      setConnections(next);
      saveLocalToolConnections(sessionUserId(), next);
      return;
    }
    try {
      const receipt = await disconnectTool(slug);
      if (receipt.invalidate_local_cache_keys.includes("tools_local_connections")) {
        clearLocalToolConnections(sessionUserId());
      }
      setConnections((cs) => cs.filter((c) => c.tool_slug !== slug));
    } catch (err) {
      setActionError(
        buildToolsFailureReceipt(
          "Disconnect tool",
          err instanceof Error ? err.message : "Failed to disconnect tool.",
        ),
      );
    }
  };

  const handleConnected = (conn: McpToolConnection) => {
    const next = ((cs: McpToolConnection[]) => {
      const filtered = cs.filter((c) => c.tool_slug !== conn.tool_slug);
      return [...filtered, conn];
    })(connections());
    setConnections(next);
    if (localConnectionMode()) saveLocalToolConnections(sessionUserId(), next);
    setActionError(null);
    setConnectingTool(null);
    const [queuedTool, ...remainingQueue] = connectQueue();
    setConnectQueue(remainingQueue);
    if (queuedTool) setTimeout(() => openConnect(queuedTool), 80);
  };

  const openConnect = (tool: CatalogTool) => {
    if (!props.signedIn) {
      setConnectNotice(`Sign in to connect ${tool.name}. Tool connection is only available for logged-in users.`);
      return;
    }
    if (selectMode()) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(tool.slug)) next.delete(tool.slug); else next.add(tool.slug);
        return next;
      });
      return;
    }
    recordToolUsed(tool.slug);
    setRecentSlugs(loadRecentlyUsedToolSlugs(sessionUserId()));
    if (localConnectionMode()) {
      setConnectNotice(connectToolBlockedInLocalRegistryReason(tool.name));
      return;
    }
    setConnectingTool(tool);
  };

  const openConnectedApp = (tool: CatalogTool) => {
    if (!props.signedIn) {
      setConnectNotice(`Sign in to enable ${tool.name}. App connections are only available for logged-in users.`);
      return;
    }
    const appId = tool.connectedAppId;
    if (!appId) {
      openConnect(tool);
      return;
    }
    const label = connectedAppNameById.get(appId) ?? tool.name;
    if (!props.onOpenConnectedApp) {
      setConnectNotice(`Open Connected Apps and filter for ${label} to enable this provider.`);
      return;
    }
    props.onOpenConnectedApp(appId, label);
  };

  const startQueuedDirectConnect = (tools: CatalogTool[]) => {
    const [nextTool, ...remainingTools] = tools;
    setConnectQueue(remainingTools);
    if (nextTool) openConnect(nextTool);
  };

  const toggleWorkspaceSkill = async (skillId: string) => {
    if (!props.signedIn || skillsSaving()) return;
    const next = selectedSkillSet().has(skillId)
      ? selectedSkillIds().filter((id) => id !== skillId)
      : [...selectedSkillIds(), skillId];
    setSkillsSaving(true);
    setSkillFeedback(null);
    setSkillError(null);
    try {
      const saved = await saveWorkspaceSkillSelection(next);
      setSelectedSkillIds(saved.selected_skill_ids ?? []);
      setSkillFeedback("Workspace skills updated.");
    } catch (err) {
      setSkillError(
        buildToolsFailureReceipt(
          "Update workspace skills",
          err instanceof Error ? err.message : "Failed to update workspace skills.",
        ),
      );
    } finally {
      setSkillsSaving(false);
    }
  };

  const bulkConnect = async () => {
    const targets = [...selected()]
      .map((slug) => CATALOG.find((tool) => tool.slug === slug))
      .filter((tool): tool is CatalogTool => tool !== undefined && !connectedSlugs().has(tool.slug));
    const managedTargets = targets.filter((tool) => Boolean(tool.connectedAppId));
    const directTargets = targets.filter((tool) => !tool.connectedAppId);
    if (managedTargets.length === 1 && directTargets.length === 0) {
      openConnectedApp(managedTargets[0]!);
    } else if (managedTargets.length > 0) {
      setConnectNotice(
        `Selected ${managedTargets.length} managed app ${managedTargets.length === 1 ? "connection" : "connections"}. Open each managed app from its card so OmnyID can send you to the correct provider auth flow.`,
      );
    }
    if (directTargets.length > 0) {
      startQueuedDirectConnect(directTargets);
    }
    setSelectMode(false);
    setSelected(new Set<string>());
  };

  const bulkDisconnect = async () => {
    for (const slug of selected()) {
      if (connectedSlugs().has(slug)) await handleDisconnect(slug);
    }
    setSelectMode(false);
    setSelected(new Set<string>());
  };

  // ITEM 19 — category filter
  const [activeCategory, setActiveCategory] = createSignal<string | null>(null);

  const filteredCatalog = () => {
    const q = search().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  };

  // ITEM 19 — derive unique sorted categories from search-filtered tools
  const categories = createMemo(() => {
    const cats = new Set(filteredCatalog().map((t) => t.category));
    return Array.from(cats).sort();
  });

  // ITEM 19 — further filter by active category chip
  const toolsForDisplay = createMemo(() => {
    const cat = activeCategory();
    if (!cat) return filteredCatalog();
    return filteredCatalog().filter((t) => t.category === cat);
  });

  const groupedCatalog = () => {
    const result = new Map<string, CatalogTool[]>();
    for (const tool of toolsForDisplay()) {
      const list = result.get(tool.category) ?? [];
      list.push(tool);
      result.set(tool.category, list);
    }
    return [...result.entries()];
  };

  const myConnections = () => connections();

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold text-on-surface">Tools & Connections</h2>
        </div>
        <div class="flex items-center gap-2 mt-0.5">
          <Show when={loading()}>
            <span class="h-2 w-2 animate-ping rounded-full bg-primary" />
          </Show>
          {/* 8q — multi-select toggle */}
          <Show when={props.signedIn && activeTab() === "connections"}>
            <button
              type="button"
              class={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                selectMode()
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/40 bg-white/30 text-on-surface-variant hover:bg-white/50"
              }`}
              onClick={() => { setSelectMode(v => !v); setSelected(new Set<string>()); }}
            >
              {selectMode() ? "Cancel" : "Select"}
            </button>
          </Show>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("connections")}
          class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            activeTab() === "connections"
              ? "border-primary/45 bg-primary/12 text-primary"
              : "border-white/40 bg-white/30 text-on-surface-variant hover:bg-white/50"
          }`}
        >
          Connections
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("skills")}
          class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            activeTab() === "skills"
              ? "border-primary/45 bg-primary/12 text-primary"
              : "border-white/40 bg-white/30 text-on-surface-variant hover:bg-white/50"
          }`}
        >
          Skills
        </button>
      </div>

      <Show when={activeTab() === "connections"}>
        <>
      <Show when={loadError()}>
        <div
          classList={{
            "rounded-2xl border px-5 py-4 text-sm": true,
            "border-red-300/50 bg-red-50/70 text-red-700": loadError()?.tone === "danger",
            "border-amber-300/50 bg-amber-50/70 text-amber-800": loadError()?.tone !== "danger",
          }}
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold">{loadError()?.title}</p>
              <p class="mt-1 leading-6">{loadError()?.summary}</p>
              <p class="mt-1 text-xs opacity-90">{loadError()?.nextStep}</p>
            </div>
            <button
              type="button"
              class="rounded-full border border-white/70 bg-white/90 px-3 py-1.5 text-xs font-medium transition hover:bg-white"
              onClick={() => window.location.reload()}
            >
              Retry load
            </button>
          </div>
        </div>
      </Show>
      {/* 8q — bulk action bar */}
      <Show when={selectMode() && selected().size > 0}>
        <div class="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span class="flex-1 text-xs text-on-surface-variant">{selected().size} selected</span>
          <button
            type="button"
            class="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
            onClick={bulkConnect}
          >
            Connect selected
          </button>
          <button
            type="button"
            class="rounded-xl border border-red-300/40 bg-red-50/60 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100/60"
            onClick={bulkDisconnect}
          >
            Disconnect selected
          </button>
        </div>
      </Show>

      {/* Guest gate */}
      <Show when={!props.signedIn}>
        <div class="rounded-2xl border border-amber-200/60 bg-amber-50/70 px-5 py-4 text-sm text-on-surface-variant">
          <span class="font-medium text-amber-700">Sign in required</span> — connecting tools is only available for signed-in users.
          <a href="/?open_auth=1" class="ml-2 underline text-primary hover:text-primary/80">Sign in →</a>
        </div>
      </Show>

      {/* 7i — Recently viewed/used tools */}
      <Show when={connectNotice()}>
        <div class="rounded-2xl border border-sky-200/60 bg-sky-50/75 px-5 py-4 text-sm text-sky-900">
          <div class="flex items-start justify-between gap-3">
            <p class="leading-6">{connectNotice()}</p>
            <button
              type="button"
              class="rounded-full border border-sky-200/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-white"
              onClick={() => setConnectNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={localConnectionMode()}>
        <div class="rounded-2xl border border-amber-200/60 bg-amber-50/75 px-5 py-4 text-sm text-amber-900">
          <p class="leading-6">
            {signedInLocalRegistryBanner()}
          </p>
        </div>
      </Show>

      <Show when={actionError()}>
        <div
          classList={{
            "rounded-2xl border px-5 py-4 text-sm": true,
            "border-red-300/50 bg-red-50/70 text-red-700": actionError()?.tone === "danger",
            "border-amber-300/50 bg-amber-50/70 text-amber-800": actionError()?.tone !== "danger",
          }}
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold">{actionError()?.title}</p>
              <p class="mt-1 leading-6">{actionError()?.summary}</p>
              <p class="mt-1 text-xs opacity-90">{actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              class="rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-medium transition hover:bg-white"
              onClick={() => setActionError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={recentTools().length > 0}>
        <div>
          <p class="label-caps mb-2.5">Recently used</p>
          <div class="flex flex-wrap gap-2">
            <For each={recentTools().slice(0, 3)}>
              {(tool) => (
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-2xl border border-white/40 bg-white/30 px-3 py-2 text-xs text-on-surface-variant transition hover:bg-white/50 hover:text-on-surface"
                  onClick={() => openConnect(tool)}
                >
                  <ToolLogo tool={tool} size="sm" />
                  <span class="font-medium">{tool.name}</span>
                  {connectedSlugs().has(tool.slug) && (
                    <span class="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">Connected</span>
                  )}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Connected tools section */}
      <Show when={props.signedIn && myConnections().length > 0}>
        <div>
          <p class="label-caps mb-3">Connected</p>
          <div class="space-y-2">
            <For each={myConnections()}>
              {(conn) => (
                <ConnectedToolRow
                  connection={conn}
                  tool={CATALOG.find((t) => t.slug === conn.tool_slug)}
                  onDisconnect={() => void handleDisconnect(conn.tool_slug)}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Search */}
      <div class="relative">
        <input
          type="text"
          placeholder="Search tools…"
          class="w-full rounded-2xl border border-white/70 bg-white/45 px-5 py-3 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 backdrop-blur-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <Show when={search()}>
          <button
            type="button"
            class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant hover:text-on-surface"
            onClick={() => setSearch("")}
          >
            x
          </button>
        </Show>
      </div>

      <div class="rounded-2xl border border-sky-200/50 bg-sky-50/60 px-4 py-3 text-xs text-sky-800">
        <span class="font-semibold">How it works:</span> Once connected, tell your agent to use a tool in the chat bar - e.g. "send a Slack update to the launch channel".
      </div>

      <Show when={categories().length > 1}>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            class={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activeCategory() === null
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-white/35 bg-white/25 text-on-surface-variant hover:bg-white/40"
            }`}
          >
            All
          </button>
          <For each={categories()}>
            {(cat) => (
              <button
                type="button"
                onClick={() => setActiveCategory((prev) => (prev === cat ? null : cat))}
                class={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activeCategory() === cat
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-white/35 bg-white/25 text-on-surface-variant hover:bg-white/40"
                }`}
              >
                {cat}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Tool catalog by category — limited initially */}
      <For each={search() ? groupedCatalog() : groupedCatalog().slice(0, showAllTools() ? undefined : INITIAL_CATEGORY_LIMIT)}>
        {([category, tools]) => (
          <div>
            <p class="label-caps mb-2.5">{category}</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <For each={tools}>
                {(tool) => (
                  <ToolCard
                    tool={tool}
                    connected={connectedSlugs().has(tool.slug)}
                    signedIn={props.signedIn}
                    onConnect={() => openConnect(tool)}
                    onOpenConnectedApp={tool.connectedAppId ? () => openConnectedApp(tool) : undefined}
                    onInfo={() => setInfoTool(tool)}
                    selectMode={selectMode()}
                    selected={selected().has(tool.slug)}
                    connectBlockedReason={
                      props.signedIn && localConnectionMode()
                        ? connectToolBlockedInLocalRegistryReason(tool.name)
                        : null
                    }
                  />
                )}
              </For>
            </div>
          </div>
        )}
      </For>

      <Show when={toolsForDisplay().length === 0}>
        <p class="py-8 text-center text-sm text-on-surface-variant">No tools match your search.</p>
      </Show>

      {/* More / collapse toggle — only when not searching */}
      <Show when={!search() && groupedCatalog().length > INITIAL_CATEGORY_LIMIT}>
        <div class="flex justify-center pt-1">
          <button
            type="button"
            class="text-sm font-medium text-primary transition hover:text-primary/70"
            onClick={() => setShowAllTools((v) => !v)}
          >
            {showAllTools()
              ? `▲ Show less`
              : `▼ More (${groupedCatalog().length - INITIAL_CATEGORY_LIMIT} more ${groupedCatalog().length - INITIAL_CATEGORY_LIMIT === 1 ? "category" : "categories"})`}
          </button>
        </div>
      </Show>
        </>
      </Show>

      <Show when={activeTab() === "skills"}>
        <div class="space-y-4 rounded-3xl border border-white/45 bg-white/28 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-on-surface">Workspace Skill Capsules</h3>
              <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                These capsules augment the current master agent loop and compose surfaces. They do not create a second orchestration loop.
              </p>
            </div>
            <span class={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
              skillRuntimeAvailable()
                ? "border-emerald-300/60 bg-emerald-50/80 text-emerald-700"
                : "border-amber-300/60 bg-amber-50/80 text-amber-700"
            }`}>
              {skillRuntimeAvailable() ? "Runtime ready" : "Catalog only"}
            </span>
          </div>

          <Show when={skillFeedback()}>
            <p class="text-xs text-primary">{skillFeedback()}</p>
          </Show>

          <Show when={skillError()}>
            <div
              classList={{
                "rounded-2xl border px-4 py-3 text-xs": true,
                "border-red-300/50 bg-red-50/70 text-red-700": skillError()?.tone === "danger",
                "border-amber-300/50 bg-amber-50/70 text-amber-800": skillError()?.tone !== "danger",
              }}
            >
              <p class="font-semibold">{skillError()?.title}</p>
              <p class="mt-1">{skillError()?.summary}</p>
              <p class="mt-1 opacity-90">{skillError()?.nextStep}</p>
            </div>
          </Show>

          <Show when={skillWarnings().length > 0}>
            <div class="rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-xs text-amber-800">
              <For each={skillWarnings()}>{(warning) => <p>{warning}</p>}</For>
            </div>
          </Show>

          <Show when={skillsLoading()}>
            <p class="rounded-2xl border border-white/40 bg-white/35 px-4 py-4 text-sm text-on-surface-variant">
              Loading workspace skill catalog…
            </p>
          </Show>

          <Show when={!skillsLoading()}>
            <For each={groupedSkills()}>
              {([category, skills]) => (
                <div>
                  <p class="label-caps mb-2.5">{category}</p>
                  <div class="grid gap-3 lg:grid-cols-2">
                    <For each={skills}>
                      {(skill) => (
                        <SkillCard
                          skill={skill}
                          selected={selectedSkillSet().has(skill.id)}
                          signedIn={props.signedIn}
                          onToggle={() => void toggleWorkspaceSkill(skill.id)}
                          onRequireSignIn={() => setSkillFeedback(`Sign in to add ${skill.title} to this workspace.`)}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>

      {/* Tool info modal */}
      <Show when={infoTool()}>
        {(tool) => (
          <ToolInfoModal
            tool={tool()}
            signedIn={props.signedIn}
            connected={connectedSlugs().has(tool().slug)}
            connectedAppName={tool().connectedAppId ? connectedAppNameById.get(tool().connectedAppId!) : undefined}
            onClose={() => setInfoTool(null)}
            onOpenConnectedApp={tool().connectedAppId ? () => {
              setInfoTool(null);
              openConnectedApp(tool());
            } : undefined}
            onConnectDirect={() => {
              setInfoTool(null);
              openConnect(tool());
            }}
          />
        )}
      </Show>

      {/* Connect modal */}
      <Show when={connectingTool()}>
        {(tool) => (
          <ConnectModal
            tool={tool()}
            onClose={() => {
              setConnectQueue([]);
              setConnectingTool(null);
            }}
            onConnected={handleConnected}
          />
        )}
      </Show>
    </div>
  );
}

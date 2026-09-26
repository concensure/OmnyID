// @locs-version: 1.0
import type { ConnectedAppDef } from "./connectedAppsViewModel";

export type ComposioCallbackState =
  | { mode: "none" }
  | { mode: "error"; message: string }
  | {
      mode: "complete";
      app: ConnectedAppDef;
      composio_state: string;
      composio_connected_account_id: string;
      composio_status: "success";
    };

function isComposioApp(app: ConnectedAppDef | undefined): app is ConnectedAppDef {
  return Boolean(app && app.connectionProvider === "composio");
}

export function readComposioCallbackState(
  search: string,
  apps: ConnectedAppDef[],
): ComposioCallbackState {
  const params = new URLSearchParams(search);
  if (params.get("composio") !== "return") {
    return { mode: "none" };
  }

  const toolId = (params.get("tool") ?? "").trim();
  const composioState = (params.get("state") ?? "").trim();
  const connectedAccountId = (params.get("connected_account_id") ?? "").trim();
  const rawStatus = (params.get("status") ?? "success").trim().toLowerCase();
  const app = apps.find((candidate) => candidate.id === toolId);

  if (!isComposioApp(app)) {
    return {
      mode: "error",
      message: "Composio returned to the workspace without a recognized app mapping.",
    };
  }
  if (!composioState || !connectedAccountId) {
    return {
      mode: "error",
      message: `Composio did not return the required auth details for ${app.name}.`,
    };
  }
  if (rawStatus !== "success") {
    return {
      mode: "error",
      message: `Composio reported that ${app.name} was not connected successfully.`,
    };
  }

  return {
    mode: "complete",
    app,
    composio_state: composioState,
    composio_connected_account_id: connectedAccountId,
    composio_status: "success",
  };
}

export function stripComposioCallbackParams(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("composio");
  url.searchParams.delete("tool");
  url.searchParams.delete("state");
  url.searchParams.delete("status");
  url.searchParams.delete("connected_account_id");
  return `${url.pathname}${url.search}${url.hash}`;
}

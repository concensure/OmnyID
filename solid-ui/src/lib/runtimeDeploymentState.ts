// @locs-version: 1.0
import type { DashboardBootstrap, RuntimeRecoveryPacketResponse, RuntimeUpdatesResponse } from "./api";
import { dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";
import { runtimeStatusPanelLines } from "./agentSettingsRuntimeSummaryFormat";

type RuntimeDeploymentWithDashboardFields = NonNullable<DashboardBootstrap["runtime_deployment"]>;
type RuntimeDeploymentWithRecoveryFields = NonNullable<RuntimeRecoveryPacketResponse["runtime_deployment"]>;

export type RuntimeDeploymentState =
  | RuntimeDeploymentWithDashboardFields
  | RuntimeDeploymentWithRecoveryFields;

type RuntimeDeploymentCarrier = RuntimeDeploymentState | null | undefined;

export type RuntimeDeploymentMonitorCard = {
  statusLine: string;
  updatedLine: string;
  relativeLine: string;
  lines: string[];
};

export type RuntimeDeploymentHostedCard = {
  workspacePath: string | null;
  gui: string | null;
  monitorCard: RuntimeDeploymentMonitorCard | null;
  statusPanelLines: string[];
  statusViewLabels: string[];
};

export function runtimeDeploymentStatus(
  deployment?: RuntimeDeploymentCarrier,
  runtimeUpdates?: RuntimeUpdatesResponse | null,
): string {
  return deployment?.status ?? runtimeUpdates?.runtime_status ?? "unknown";
}

export function runtimeDeploymentFramework(
  deployment?: RuntimeDeploymentCarrier,
  runtimeUpdates?: RuntimeUpdatesResponse | null,
): string | null {
  return deployment?.framework ?? runtimeUpdates?.framework ?? null;
}

export function runtimeDeploymentWorkspacePath(
  deployment?: RuntimeDeploymentCarrier,
): string | null {
  return deployment?.workspace_path ?? null;
}

export function runtimeDeploymentGui(
  deployment?: RuntimeDeploymentCarrier,
): RuntimeDeploymentWithDashboardFields["gui"] | null {
  if (!deployment || !("gui" in deployment)) return null;
  return deployment.gui ?? null;
}

export function runtimeDeploymentMonitor(
  deployment?: RuntimeDeploymentCarrier,
): RuntimeDeploymentWithDashboardFields["runtime_monitor"] | null {
  if (!deployment || !("runtime_monitor" in deployment)) return null;
  return deployment.runtime_monitor ?? null;
}

export function runtimeDeploymentMonitorLines(
  deployment?: RuntimeDeploymentCarrier,
): string[] {
  return runtimeDeploymentMonitor(deployment)?.lines ?? [];
}

export function runtimeDeploymentMonitorSource(
  deployment?: RuntimeDeploymentCarrier,
  fallback = "bootstrap",
): string {
  return runtimeDeploymentMonitor(deployment)?.source || fallback;
}

export function runtimeDeploymentMonitorUpdatedAt(
  deployment?: RuntimeDeploymentCarrier,
): string | null {
  return runtimeDeploymentMonitor(deployment)?.updated_at ?? null;
}

export function runtimeDeploymentMonitorFeedback(
  deployment?: RuntimeDeploymentCarrier,
  runtimeUpdates?: RuntimeUpdatesResponse | null,
): string | null {
  const monitor = runtimeDeploymentMonitor(deployment);
  if (!monitor) return null;
  return `Runtime ${runtimeDeploymentStatus(deployment, runtimeUpdates)} via ${runtimeDeploymentMonitorSource(deployment)} at ${monitor.updated_at}.`;
}

export function runtimeDeploymentStatusPanel(
  deployment?: RuntimeDeploymentCarrier,
): RuntimeDeploymentWithDashboardFields["runtime_status_panel"] | null {
  if (!deployment || !("runtime_status_panel" in deployment)) return null;
  return deployment.runtime_status_panel ?? null;
}

export function runtimeDeploymentStatusViews(
  deployment?: RuntimeDeploymentCarrier,
): RuntimeDeploymentWithDashboardFields["runtime_status_views"] | null {
  if (!deployment || !("runtime_status_views" in deployment)) return null;
  return deployment.runtime_status_views ?? null;
}

export function runtimeDeploymentStatusViewLabels(
  deployment?: RuntimeDeploymentCarrier,
): string[] {
  return (runtimeDeploymentStatusViews(deployment) ?? [])
    .slice(0, 4)
    .map((view) => {
      const viewRecord = view as Record<string, unknown>;
      const content = view.content;
      const directTitle = typeof viewRecord.title === "string" ? viewRecord.title : null;
      const title =
        content && typeof content === "object" && typeof content["title"] === "string"
          ? content["title"]
          : null;
      const viewId =
        content && typeof content === "object" && typeof content["id"] === "string"
          ? content["id"]
          : null;
      return directTitle ?? title ?? view.format ?? viewId ?? "runtime-view";
    });
}

export function runtimeDeploymentMonitorCard(
  deployment?: RuntimeDeploymentCarrier,
): RuntimeDeploymentMonitorCard | null {
  const monitor = runtimeDeploymentMonitor(deployment);
  if (!monitor) return null;
  const lines = runtimeDeploymentMonitorLines(deployment).slice(0, 4);
  return {
    statusLine: `${monitor.status} | ${monitor.source}`,
    updatedLine: `updated ${dateTimeLabel(monitor.updated_at)}`,
    relativeLine: `${relativeTimeLabel(monitor.updated_at)} | ${lines.length} monitor line${lines.length === 1 ? "" : "s"}`,
    lines,
  };
}

export function runtimeDeploymentHostedCard(
  deployment?: RuntimeDeploymentCarrier,
): RuntimeDeploymentHostedCard {
  return {
    workspacePath: runtimeDeploymentWorkspacePath(deployment),
    gui: runtimeDeploymentGui(deployment) ?? null,
    monitorCard: runtimeDeploymentMonitorCard(deployment),
    statusPanelLines: runtimeStatusPanelLines(runtimeDeploymentStatusPanel(deployment)),
    statusViewLabels: runtimeDeploymentStatusViewLabels(deployment),
  };
}

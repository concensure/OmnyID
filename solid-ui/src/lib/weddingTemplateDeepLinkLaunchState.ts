// @locs-version: 1.0
import { buildTemplateCatalogState } from "@/lib/templateCatalogState";
import {
  dispatchWeddingNavigationIntent,
  type WeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import type { ViewName } from "@/lib/viewNames";

export type WeddingTemplateDeepLinkLaunchState = {
  viewTarget: ViewName;
  intent: WeddingNavigationIntent | null;
};

export function buildWeddingTemplateDeepLinkLaunch(): WeddingTemplateDeepLinkLaunchState {
  const weddingTemplate = buildTemplateCatalogState().find((item) => item.id === "wedding_planning");
  return {
    viewTarget: weddingTemplate?.viewTarget ?? "response_queue",
    intent: weddingTemplate?.launchIntent ?? null,
  };
}

export function dispatchWeddingTemplateDeepLinkLaunch(
  launch: WeddingTemplateDeepLinkLaunchState,
  target: Window = window,
): void {
  if (launch.intent) dispatchWeddingNavigationIntent(launch.intent, target);
}

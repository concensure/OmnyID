// @locs-version: 1.0
import type { ViewportClass } from "@/lib/viewportClass";

export function isWatchViewport(viewport: ViewportClass): boolean {
  return viewport === "watch";
}

export function isNanoViewport(viewport: ViewportClass): boolean {
  return viewport === "watch" || viewport === "phone";
}

export function isMobileViewport(viewport: ViewportClass): boolean {
  return viewport !== "desktop";
}

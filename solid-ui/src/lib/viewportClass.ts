// @locs-version: 1.0
export type ViewportClass = "watch" | "phone" | "tablet" | "desktop";

export function classifyViewportWidth(width: number): ViewportClass {
  if (width <= 280) return "watch";
  if (width <= 639) return "phone";
  if (width <= 1023) return "tablet";
  return "desktop";
}

// @locs-version: 1.0
export function getFocusableElements(container: ParentNode | null | undefined, selector: string): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(selector),
  ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
}

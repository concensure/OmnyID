// @locs-version: 1.0
export function handleDialogTabNavigation(
  event: KeyboardEvent,
  focusableElements: HTMLElement[],
  fallbackTarget?: HTMLElement | null,
) {
  if (focusableElements.length === 0) {
    event.preventDefault();
    fallbackTarget?.focus();
    return;
  }

  const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
  const fallbackIndex = event.shiftKey ? focusableElements.length - 1 : 0;
  const nextIndex = currentIndex === -1
    ? fallbackIndex
    : (currentIndex + (event.shiftKey ? -1 : 1) + focusableElements.length) % focusableElements.length;

  event.preventDefault();
  focusableElements[nextIndex]?.focus();
}

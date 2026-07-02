export function applyThreadSelection(
  currentSelection: ReadonlySet<string>,
  visibleIds: readonly string[],
  targetId: string,
  checked: boolean,
  anchorId?: string | null,
  shiftKey = false,
): Set<string> {
  const next = new Set(currentSelection);
  if (shiftKey && anchorId) {
    const anchorIndex = visibleIds.indexOf(anchorId);
    const targetIndex = visibleIds.indexOf(targetId);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const [start, end] = anchorIndex < targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex];
      for (const id of visibleIds.slice(start, end + 1)) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    }
  }
  if (checked) next.add(targetId);
  else next.delete(targetId);
  return next;
}

export function pruneThreadSelectionToVisible(
  currentSelection: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const visible = new Set(visibleIds);
  return new Set([...currentSelection].filter((threadId) => visible.has(threadId)));
}


// @locs-version: 1.0
type SpaceLike = {
  id: string;
};

export function resolveActiveSpaceAfterRefresh<T extends SpaceLike>(
  activeSpaceId: string | null | undefined,
  spaces: T[],
): T | null {
  if (!activeSpaceId) return null;
  return spaces.find((space) => space.id === activeSpaceId) ?? null;
}

export function resolveSpaceToOpenAfterRefresh<T extends SpaceLike>(
  requestedSpaceId: string | null | undefined,
  spaces: T[],
  fallbackSpace: T | null,
): T | null {
  if (!requestedSpaceId) return fallbackSpace;
  return spaces.find((space) => space.id === requestedSpaceId) ?? fallbackSpace;
}

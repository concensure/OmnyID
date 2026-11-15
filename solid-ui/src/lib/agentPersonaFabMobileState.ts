// @locs-version: 1.0
// Sprout is intentionally quiet on a phone until the account explicitly asks
// for the shortcut. Desktop keeps the server preference as-is.
const MOBILE_SPROUT_OPT_IN_PREFIX = "omnyid.agent-persona-fab.mobile-opt-in.";

function key(userId?: string | null): string {
  return `${MOBILE_SPROUT_OPT_IN_PREFIX}${userId?.trim() || "anonymous"}`;
}

export function isPhonePersonaFabViewport(target: Window = window): boolean {
  return target.matchMedia("(max-width: 639px)").matches;
}

export function loadMobilePersonaFabOptIn(
  userId?: string | null,
  storage: Storage = localStorage,
): boolean {
  try { return storage.getItem(key(userId)) === "true"; }
  catch { return false; }
}

export function saveMobilePersonaFabOptIn(
  visible: boolean,
  userId?: string | null,
  storage: Storage = localStorage,
): void {
  try {
    if (visible) storage.setItem(key(userId), "true");
    else storage.removeItem(key(userId));
  } catch {
    // This preference is convenience state only.
  }
}

export function shouldShowPersonaFab(input: {
  serverVisible: boolean;
  userId?: string | null;
  phoneViewport?: boolean;
  storage?: Storage;
}): boolean {
  if (!input.serverVisible) return false;
  const phoneViewport = input.phoneViewport ?? isPhonePersonaFabViewport();
  if (!phoneViewport) return true;
  return loadMobilePersonaFabOptIn(input.userId, input.storage ?? localStorage);
}

// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export const WORKSPACE_SETUP_BANNER_DISMISSED_KEY = "omnyid.setup.banner.dismissed";
export const WORKSPACE_SETUP_GMAIL_DONE_KEY = "omnyid.setup.gmail.done";
export const WORKSPACE_SETUP_CALENDAR_DONE_KEY = "omnyid.setup.calendar.done";
export const WORKSPACE_SETUP_LLM_OK_KEY = "omnyid.llm.last_ping_ok";
export const WORKSPACE_SETUP_SKILLS_TIMES_KEY = "omnyid.skill-activation-times";

function writeWorkspaceSetupStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

function removeWorkspaceSetupStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

function loadWorkspaceSetupOptionalFlag(key: string): boolean {
  const raw = localStorage.getItem(key);
  if (raw === "1") return true;
  if (raw === null) return false;
  removeWorkspaceSetupStorageValue(key);
  return false;
}

export function loadWorkspaceSetupBannerDismissed(): boolean {
  try {
    return loadWorkspaceSetupOptionalFlag(WORKSPACE_SETUP_BANNER_DISMISSED_KEY);
  } catch {
    return false;
  }
}

export function saveWorkspaceSetupBannerDismissed(dismissed: boolean) {
  if (dismissed) writeWorkspaceSetupStorageValue(WORKSPACE_SETUP_BANNER_DISMISSED_KEY, "1");
  else removeWorkspaceSetupStorageValue(WORKSPACE_SETUP_BANNER_DISMISSED_KEY);
}

export function loadWorkspaceSetupLlmOk(): boolean {
  try {
    return loadWorkspaceSetupOptionalFlag(WORKSPACE_SETUP_LLM_OK_KEY);
  } catch {
    return false;
  }
}

export function saveWorkspaceSetupLlmOk(ok: boolean) {
  if (ok) writeWorkspaceSetupStorageValue(WORKSPACE_SETUP_LLM_OK_KEY, "1");
  else removeWorkspaceSetupStorageValue(WORKSPACE_SETUP_LLM_OK_KEY);
}

export function loadWorkspaceSetupGmailDone(): boolean {
  try {
    return loadWorkspaceSetupOptionalFlag(WORKSPACE_SETUP_GMAIL_DONE_KEY);
  } catch {
    return false;
  }
}

export function saveWorkspaceSetupGmailDone(done: boolean) {
  if (done) writeWorkspaceSetupStorageValue(WORKSPACE_SETUP_GMAIL_DONE_KEY, "1");
  else removeWorkspaceSetupStorageValue(WORKSPACE_SETUP_GMAIL_DONE_KEY);
}

export function loadWorkspaceSetupCalendarDone(): boolean {
  try {
    return loadWorkspaceSetupOptionalFlag(WORKSPACE_SETUP_CALENDAR_DONE_KEY);
  } catch {
    return false;
  }
}

export function saveWorkspaceSetupCalendarDone(done: boolean) {
  if (done) writeWorkspaceSetupStorageValue(WORKSPACE_SETUP_CALENDAR_DONE_KEY, "1");
  else removeWorkspaceSetupStorageValue(WORKSPACE_SETUP_CALENDAR_DONE_KEY);
}

export function loadWorkspaceSetupSkillActivationTimes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WORKSPACE_SETUP_SKILLS_TIMES_KEY);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeWorkspaceSetupStorageValue(WORKSPACE_SETUP_SKILLS_TIMES_KEY);
      return {};
    }
    if (!isRecord(parsed.value)) return {};
    const next: Record<string, number> = {};
    for (const [skillId, activatedAt] of Object.entries(parsed.value)) {
      if (
        skillId.trim().length > 0
        && typeof activatedAt === "number"
        && Number.isFinite(activatedAt)
        && activatedAt > 0
      ) {
        next[skillId.trim()] = activatedAt;
      }
    }
    const serialized = JSON.stringify(next);
    if (serialized !== raw) writeWorkspaceSetupStorageValue(WORKSPACE_SETUP_SKILLS_TIMES_KEY, serialized);
    return next;
  } catch {
    removeWorkspaceSetupStorageValue(WORKSPACE_SETUP_SKILLS_TIMES_KEY);
    return {};
  }
}

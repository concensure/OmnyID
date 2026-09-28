// @locs-version: 1.0
export const FONT_BODY_STORAGE_KEY = "omnyid.appearance.font-body";

export const FONT_BODY_OPTIONS = ["Default", "Readable"] as const;

export type FontBodyOption = (typeof FONT_BODY_OPTIONS)[number];

const FONT_BODY_STACKS: Record<FontBodyOption, string> = {
  Default: "Inter, system-ui, sans-serif",
  Readable: "\"Atkinson Hyperlegible\", Inter, system-ui, sans-serif",
};

function isFontBodyOption(value: unknown): value is FontBodyOption {
  return typeof value === "string" && FONT_BODY_OPTIONS.includes(value as FontBodyOption);
}

export function loadFontBodyPreference(): FontBodyOption {
  try {
    const stored = localStorage.getItem(FONT_BODY_STORAGE_KEY);
    if (isFontBodyOption(stored)) return stored;
    if (stored !== null) localStorage.setItem(FONT_BODY_STORAGE_KEY, "Default");
    return "Default";
  } catch {
    return "Default";
  }
}

export function fontBodyStack(option: FontBodyOption): string {
  return FONT_BODY_STACKS[option];
}

export function applyFontBodyPreference(option: FontBodyOption) {
  if (typeof document === "undefined") return;
  const stack = fontBodyStack(option);
  document.documentElement.style.setProperty("--font-body", stack);
  document.body?.style.setProperty("--font-body", stack);
}

export function saveFontBodyPreference(option: FontBodyOption) {
  try {
    localStorage.setItem(FONT_BODY_STORAGE_KEY, option);
  } catch {
    // Ignore storage failures and still apply the current choice for this session.
  }
  applyFontBodyPreference(option);
}

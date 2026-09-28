// @locs-version: 1.0
export const FONT_SCALE_STORAGE_KEY = "omnyid.appearance.font-scale";

export const FONT_SCALE_OPTIONS = ["S", "M", "L", "XL"] as const;

export type FontScaleOption = (typeof FONT_SCALE_OPTIONS)[number];

const FONT_SCALE_PIXELS: Record<FontScaleOption, string> = {
  S: "15px",
  M: "16px",
  L: "17px",
  XL: "18px",
};

function isFontScaleOption(value: unknown): value is FontScaleOption {
  return typeof value === "string" && FONT_SCALE_OPTIONS.includes(value as FontScaleOption);
}

export function loadFontScalePreference(): FontScaleOption {
  try {
    const stored = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    if (isFontScaleOption(stored)) return stored;
    if (stored !== null) localStorage.setItem(FONT_SCALE_STORAGE_KEY, "M");
    return "M";
  } catch {
    return "M";
  }
}

export function fontScalePixels(scale: FontScaleOption): string {
  return FONT_SCALE_PIXELS[scale];
}

export function applyFontScalePreference(scale: FontScaleOption) {
  if (typeof document === "undefined") return;
  const pixels = fontScalePixels(scale);
  document.documentElement.style.setProperty("--base-font-size", pixels);
  document.body?.style.setProperty("--base-font-size", pixels);
}

export function saveFontScalePreference(scale: FontScaleOption) {
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
  } catch {
    // Ignore quota/storage failures and still apply the current choice locally.
  }
  applyFontScalePreference(scale);
}

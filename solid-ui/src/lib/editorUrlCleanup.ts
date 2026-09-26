// @locs-version: 1.0
const TRACKING_PARAM_PREFIXES = ["utm_"] as const;
const TRACKING_PARAM_NAMES = new Set(["fbclid", "gclid", "ref"]);
const URL_MATCHER = /https?:\/\/[^\s<>"']+/gi;

function splitTrailingUrlPunctuation(rawUrl: string) {
  let end = rawUrl.length;
  while (end > 0 && /[),.!?;:]/.test(rawUrl[end - 1] ?? "")) {
    end -= 1;
  }
  return {
    core: rawUrl.slice(0, end),
    trailing: rawUrl.slice(end),
  };
}

export function stripTrackingParamsFromUrl(rawUrl: string): string {
  const { core, trailing } = splitTrailingUrlPunctuation(rawUrl);
  try {
    const parsed = new URL(core);
    const keysToDelete = [...parsed.searchParams.keys()].filter((key) => {
      const normalized = key.trim().toLowerCase();
      return TRACKING_PARAM_NAMES.has(normalized)
        || TRACKING_PARAM_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    });
    for (const key of keysToDelete) parsed.searchParams.delete(key);
    return `${parsed.toString()}${trailing}`;
  } catch {
    return rawUrl;
  }
}

export function stripTrackingParamsFromText(text: string): string {
  return text.replace(URL_MATCHER, (rawUrl) => stripTrackingParamsFromUrl(rawUrl));
}


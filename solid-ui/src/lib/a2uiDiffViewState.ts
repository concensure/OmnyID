// @locs-version: 1.0
function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function firstString(
  props: Record<string, unknown>,
  keys: readonly string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

export type A2UIDiffViewState = {
  title: string;
  description: string;
  beforeLabel: string;
  afterLabel: string;
  beforeBody: string;
  afterBody: string;
  patch: string;
};

export function resolveA2UIDiffViewState(
  props: Record<string, unknown>,
): A2UIDiffViewState {
  return {
    title: firstString(props, ["title", "heading"], "Change preview"),
    description: firstString(props, ["description", "summary"]),
    beforeLabel: firstString(props, ["before_label", "left_label", "old_label"], "Before"),
    afterLabel: firstString(props, ["after_label", "right_label", "new_label"], "After"),
    beforeBody: firstString(props, ["before", "old_value", "left", "lhs"]),
    afterBody: firstString(props, ["after", "new_value", "right", "rhs"]),
    patch: firstString(props, ["patch", "diff", "unified_diff"], asString(props["code"])),
  };
}

// @locs-version: 1.0
import type { InlineEntityKind } from "@/lib/inlineEntityKinds";

export type InlineEntityActionDetail = {
  kind: InlineEntityKind;
  text: string;
  value?: string;
  metadata?: Record<string, unknown>;
};

export function inlineEntityKindLabel(kind: InlineEntityKind): string {
  return kind.replaceAll("_", " ");
}

export function buildInlineEntityObjectSearchQuery(
  kind: InlineEntityKind,
  title: string,
): string {
  const trimmed = title.trim();
  switch (kind) {
    case "hashtag":
      return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
    case "invoice":
    case "ticket":
    case "date":
      return `kind:task ${trimmed}`;
    default:
      return `kind:note ${trimmed}`;
  }
}

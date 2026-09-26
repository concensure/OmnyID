// @locs-version: 1.0
function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export type NormalizedA2UINode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: NormalizedA2UINode[];
};

export const ROOT_A2UI_NODE_KINDS = new Set([
  "rich_text_editor",
  "text",
  "note",
  "rich_text",
  "callout",
  "stats_grid",
  "table",
  "comparison_table",
  "bullet_list",
  "code",
  "link_list",
  "constraint_badges",
  "insight_line",
  "action_chips",
  "stat_row",
  "diff_view",
]);

function normalizeNodes(v: unknown): NormalizedA2UINode[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((node) => ({
      id: asString(node.id),
      type: asString(node.type),
      props: isRecord(node.props) ? node.props : {},
      children: normalizeNodes(node.children),
    }))
    .filter((node) => node.id && node.type);
}

function normalizeComponentNodes(v: unknown, prefix = "component"): NormalizedA2UINode[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((component, index) => {
      const id = asString(component.id, `${prefix}-${index}`);
      return {
        id,
        type: asString(component.type),
        props: isRecord(component.props) ? component.props : {},
        children: normalizeComponentNodes(component.children, `${id}-child`),
      };
    })
    .filter((node) => node.type);
}

export function normalizeA2UIRootNodes(
  raw: Record<string, unknown>,
): NormalizedA2UINode[] {
  const normalizedNodes = normalizeNodes(raw.nodes);
  if (normalizedNodes.length > 0) return normalizedNodes;

  const kind = asString(raw.kind) || asString(raw.format);
  if (ROOT_A2UI_NODE_KINDS.has(kind)) {
    return [{ id: "root", type: kind, props: isRecord(raw.props) ? raw.props : {}, children: [] }];
  }

  if (Array.isArray(raw.components)) {
    return normalizeComponentNodes(raw.components);
  }

  return [];
}

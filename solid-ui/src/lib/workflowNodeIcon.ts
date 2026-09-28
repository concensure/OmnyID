// @locs-version: 1.0
export function nodeKindIcon(kind: string): string {
  switch (kind) {
    case "trigger": return "⚡";
    case "agent": return "🤖";
    case "approval": return "✅";
    case "condition": return "🔀";
    case "transform": return "⚙";
    case "tool": return "🔧";
    case "delegation": return "↗";
    case "merge": return "⊕";
    case "policy": return "📋";
    case "termination": return "⛔";
    default: return "Ã¢â€”¸";
  }
}

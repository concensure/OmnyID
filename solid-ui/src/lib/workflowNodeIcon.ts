// @locs-version: 1.0
export function nodeKindIcon(kind: string): string {
  switch (kind) {
    case "trigger": return "Ã¢Å¡Â¡";
    case "agent": return "Ã°Å¸Â¤â€“";
    case "approval": return "Ã¢Å“â€¦";
    case "condition": return "Ã°Å¸â€â‚¬";
    case "transform": return "Ã¢Å¡â„¢";
    case "tool": return "Ã°Å¸â€Â§";
    case "delegation": return "Ã¢â€ â€”";
    case "merge": return "Ã¢Å â€¢";
    case "policy": return "Ã°Å¸â€œâ€¹";
    case "termination": return "Ã¢â€ºâ€";
    default: return "Ã¢â€”Â¸";
  }
}

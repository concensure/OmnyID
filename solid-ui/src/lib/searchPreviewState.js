// @locs-version: 1.0
export function searchPreviewConfidence(copy) {
  const sourceCount = copy.sourceCount;
  const bulletCount = copy.bulletCount;
  if (sourceCount >= 3) {
    return {
      tone: "success",
      title: "Higher-confidence preview",
      detail: `Grounded in ${sourceCount} sources with ${bulletCount || 1} extracted research signals.`,
    };
  }
  if (sourceCount >= 1) {
    return {
      tone: "info",
      title: "Moderate-confidence preview",
      detail: `Grounded in ${sourceCount} source${sourceCount === 1 ? "" : "s"}; refine if you want narrower or fresher evidence.`,
    };
  }
  return {
    tone: "warning",
    title: "Low-confidence preview",
    detail: "No explicit source links were attached. Narrow the request or ask for citations.",
  };
}

export function searchPreviewSourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function searchPreviewIsLikelyWorkspaceLink(link) {
  if (link.origin === "workspace") return true;
  if (link.origin === "external") return false;
  const lowerSnippet = link.snippet.toLowerCase();
  const lowerUrl = link.url.toLowerCase();
  return (
    lowerSnippet.includes("workspace")
    || lowerSnippet.includes("ledger")
    || lowerSnippet.includes("thread")
    || lowerSnippet.includes("local")
    || lowerUrl.startsWith("omnyid://")
  );
}

export function searchPreviewSourceSubtitle(link) {
  const domain = searchPreviewSourceDomain(link.url);
  const originLabel = searchPreviewIsLikelyWorkspaceLink(link) ? "Workspace" : "External";
  return domain ? `${originLabel} - ${domain} - ${link.snippet}` : `${originLabel} - ${link.snippet}`;
}

export function searchPreviewEvidenceOrigin(links) {
  if (links.length === 0) {
    return {
      tone: "warning",
      title: "No explicit evidence sources",
      detail: "This preview does not yet distinguish workspace ledger evidence from external web sources.",
    };
  }
  const workspaceCount = links.filter((link) => searchPreviewIsLikelyWorkspaceLink(link)).length;
  const externalCount = links.length - workspaceCount;
  if (workspaceCount > 0 && externalCount > 0) {
    return {
      tone: "info",
      title: "Mixed evidence",
      detail: `Grounded in ${workspaceCount} workspace source${workspaceCount === 1 ? "" : "s"} and ${externalCount} external source${externalCount === 1 ? "" : "s"}.`,
    };
  }
  if (workspaceCount > 0) {
    return {
      tone: "success",
      title: "Workspace-grounded evidence",
      detail: `Grounded in ${workspaceCount} local workspace source${workspaceCount === 1 ? "" : "s"}.`,
    };
  }
  return {
    tone: "info",
    title: "External-source evidence",
    detail: `Grounded in ${externalCount} external source${externalCount === 1 ? "" : "s"}.`,
  };
}

export function searchPreviewRefinementSuggestions(copy) {
  const suggestions = [];
  const lower = copy.query.toLowerCase();
  const domains = [...new Set(copy.links.map((link) => searchPreviewSourceDomain(link.url)).filter(Boolean))];

  if (!/\blast\s+\d+\s+days?\b|\bthis\s+(week|month)\b|\blast\s+(week|month)\b|\btoday\b|\byesterday\b/i.test(lower)) {
    suggestions.push("Limit to a recent time window");
  }
  if (!/\bcompare|comparison|versus| vs |\btradeoff|\boptions\b/i.test(lower)) {
    suggestions.push("Ask for a comparison or trade-off view");
  }
  if (domains.length > 1) {
    suggestions.push(`Focus on one source family such as ${domains[0]}`);
  }
  if (!/\bworkspace\b|\blocal\b|\bledger\b/i.test(lower)) {
    suggestions.push("Ask for only local workspace evidence if you want ledger-grounded results");
  }
  return suggestions.slice(0, 4);
}

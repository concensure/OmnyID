// @locs-version: 1.0
export function buildLocalRouterCompanionState(copy) {
  if (!copy.routerResult) {
    if (copy.capabilityBadges.length === 0) return null;
    return {
      tone: "info",
      title: "Local router available",
      detail: "A local retrieval preview path is available on this device, but this result did not run a local router pass.",
      stats: copy.capabilityBadges.map((badge) => ({ label: badge, value: "available" })),
      badges: [],
      capabilityBadges: copy.capabilityBadges,
      executionBadges: [],
      skipBadges: [],
      densityBadges: [],
      budgetBadges: [],
      confidenceLabel: "Unavailable",
      confidenceBand: "Unavailable",
      terminalLayer: "unavailable",
    };
  }

  const sourceCount = copy.routerResult.sources.length;
  const layerCount = new Set(
    copy.routerResult.candidates.flatMap((candidate) => Object.keys(candidate.scores)),
  ).size;
  const excerptCount = copy.routerResult.candidates.filter((candidate) => !!candidate.decryptedExcerpt).length;
  const tone = copy.executionState.budgetBadges.length > 0
    ? "warning"
    : sourceCount > 0
      ? "success"
      : "info";
  const detailParts = [
    `Local router ran to the ${(copy.executionState.layerLabel || copy.routerResult.terminalLayer).toLowerCase()} layer.`,
    `It surfaced ${sourceCount} local source${sourceCount === 1 ? "" : "s"} across ${layerCount || 1} evidence layer${layerCount === 1 ? "" : "s"}.`,
  ];
  if (excerptCount > 0) {
    detailParts.push(`It also recovered ${excerptCount} local excerpt${excerptCount === 1 ? "" : "s"}.`);
  }
  if (copy.executionState.budgetBadges.length > 0) {
    detailParts.push(`The pass stayed bounded: ${copy.executionState.budgetBadges.join(", ")}.`);
  }
  const stats = [
    { label: "Confidence", value: copy.routerResult.a2ui.confidenceBand },
    { label: "Layer", value: copy.executionState.layerLabel || copy.routerResult.terminalLayer },
    { label: "Elapsed", value: `${copy.routerResult.budget.elapsedMs} ms` },
    { label: "Sources", value: `${sourceCount}` },
    { label: "Evidence layers", value: `${layerCount}` },
  ];
  if (excerptCount > 0) {
    stats.push({ label: "Excerpts", value: `${excerptCount}` });
  }
  if (copy.routerResult.budget.embeddings > 0) {
    stats.push({ label: "Embeddings", value: `${copy.routerResult.budget.embeddings}` });
  }
  if (copy.routerResult.budget.decryptions > 0) {
    stats.push({ label: "Decryptions", value: `${copy.routerResult.budget.decryptions}` });
  }
  if (copy.routerResult.budget.tokens > 0) {
    stats.push({ label: "Tokens", value: `${copy.routerResult.budget.tokens}` });
  }
  if (typeof copy.indexedRowCount === "number") {
    stats.push({
      label: "Indexed rows",
      value: `${copy.indexedRowCount}`,
    });
  }

  return {
    tone,
    title: "Local retrieval preview",
    detail: detailParts.join(" "),
    stats,
    badges: [
      ...copy.capabilityBadges,
      ...copy.executionState.executionBadges,
      ...copy.executionState.skipBadges,
      ...copy.executionState.budgetBadges,
      ...copy.projectionBadgeLabels,
    ],
    capabilityBadges: copy.capabilityBadges,
    executionBadges: copy.executionState.executionBadges,
    skipBadges: copy.executionState.skipBadges,
    densityBadges: copy.executionState.densityBadges,
    budgetBadges: copy.executionState.budgetBadges,
    confidenceLabel: copy.routerResult.a2ui.confidenceLabel,
    confidenceBand: copy.routerResult.a2ui.confidenceBand,
    terminalLayer: copy.routerResult.terminalLayer,
  };
}

export function buildLocalRouterPreviewPayload(companion) {
  if (!companion || companion.terminalLayer === "unavailable") return null;
  return {
    title: companion.title,
    tone: companion.tone,
    detail: companion.detail,
    confidence_label: companion.confidenceLabel,
    confidence_band: companion.confidenceBand,
    terminal_layer: companion.terminalLayer,
    capability_badges: companion.capabilityBadges,
    execution_badges: companion.executionBadges,
    skip_badges: companion.skipBadges,
    density_badges: companion.densityBadges,
    budget_badges: companion.budgetBadges,
    stats: companion.stats.map((item) => ({ label: item.label, value: item.value })),
  };
}

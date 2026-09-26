// @locs-version: 1.0
export function commandPreviewSurfaceKind(copy) {
  const intent = normalizeCommandPreviewRouteToken(copy.intent);
  const preferredView = normalizeCommandPreviewRouteToken(copy.preferredView);

  if (preferredView === "search_result" || intent === "web_research") {
    return "search";
  }

  if (intent === "task" || preferredView === "task_board") {
    return "task";
  }

  if (intent === "note" || preferredView === "ledger_canvas") {
    return "note";
  }

  if (intent === "social" || preferredView === "social_composer") {
    return "social";
  }

  if (intent === "spaces" || preferredView === "spaces") {
    return "spaces";
  }

  if (
    intent === "travel"
    || preferredView === "route_card"
    || preferredView === "comparison_table"
  ) {
    if (preferredView === "comparison_table") {
      return "travel_comparison";
    }
    if (preferredView === "route_card") {
      return "travel_card";
    }
    return copy.travelPrefersComparison ? "travel_comparison" : "travel_card";
  }

  if (intent === "schedule" || preferredView === "draggable_calendar") {
    return "schedule";
  }

  if (
    intent === "trip_planner"
    || preferredView === "trip_planner"
    || preferredView === "ui_presentation"
  ) {
    return "presentation";
  }

  if (intent === "orchestrate" || preferredView === "orchestrate_progress") {
    return "orchestrate";
  }

  if (intent === "dashboard_focus") {
    return "dashboard_panel";
  }

  if (intent === "runner_edit") {
    return "runner_panel";
  }

  return "generic_panel";
}

export function commandPreviewWorkflowPendingIntentSeed(args) {
  const query = (args.query ?? "").trim();
  const summary = (args.summary ?? "").trim();
  const intentKind = normalizeCommandPreviewRouteToken(args.intent) || "command";
  const preferredView = normalizeCommandPreviewRouteToken(args.preferredView);
  const intent = query || summary;
  if (!intent) return null;
  const explicitId = (args.id ?? "").trim();
  const detailForIdentity = query ? "" : summary;
  const id =
    explicitId
    || `command-preview:${stableCommandPreviewSeedHash([
      intentKind,
      preferredView,
      intent,
      detailForIdentity,
    ].join("\u001f"))}`;
  return {
    id,
    intent,
    source: "master_agent",
    summary: summary || null,
  };
}

export function commandPreviewShowsWorkflowHandoff(copy) {
  const surfaceKind = commandPreviewSurfaceKind(copy);
  return surfaceKind === "orchestrate" || surfaceKind === "presentation";
}

export function commandPreviewPendingIntentAfterConsumed(currentSeed, consumedSeedId) {
  if (!currentSeed) return null;
  if (!consumedSeedId || currentSeed.id !== consumedSeedId) return currentSeed;
  return null;
}

export function commandPreviewSuggestedWorkflowPendingIntentSeed(args) {
  if (normalizeCommandPreviewRouteToken(args.suggestedView) !== "workflows") return null;
  if (!commandPreviewShowsWorkflowHandoff(args)) return null;
  return commandPreviewWorkflowPendingIntentSeed(args);
}

export function commandPreviewSelectableSuggestedView(args) {
  const suggestedView = normalizeCommandPreviewRouteToken(args.suggestedView);
  if (!suggestedView) return null;
  const viewNames = Array.isArray(args.viewNames) ? args.viewNames : [];
  if (!viewNames.includes(suggestedView)) return null;
  const blockedViewNames = Array.isArray(args.blockedViewNames) ? args.blockedViewNames : [];
  if (blockedViewNames.includes(suggestedView)) return null;
  return suggestedView;
}

function stableCommandPreviewSeedHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeCommandPreviewRouteToken(value) {
  return (value ?? "").trim().toLowerCase();
}

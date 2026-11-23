// @locs-version: 1.0
export function buildSearchResultPanelState(copy) {
  const nodes = [
    {
      id: "search-summary",
      type: "callout",
      props: {
        tone: "info",
        title: copy.query ? "Research summary" : "Research result",
        body: copy.summary,
      },
    },
    {
      id: "search-evidence-origin",
      type: "callout",
      props: {
        tone: copy.evidenceOrigin.tone,
        title: copy.evidenceOrigin.title,
        body: copy.evidenceOrigin.detail,
      },
    },
    {
      id: "search-confidence",
      type: "callout",
      props: {
        tone: copy.searchConfidence.tone,
        title: copy.searchConfidence.title,
        body: copy.searchConfidence.detail,
      },
    },
  ];

  if (copy.localRouterCompanion) {
    nodes.push({
      id: "search-local-router",
      type: "callout",
      props: {
        tone: copy.localRouterCompanion.tone,
        title: copy.localRouterCompanion.title,
        body: copy.localRouterCompanion.detail,
      },
    });
    if (copy.localRouterCompanion.stats.length > 0) {
      nodes.push({
        id: "search-local-router-stats",
        type: "stats_grid",
        props: {
          items: copy.localRouterCompanion.stats.map((item) => ({
            label: item.label,
            value: item.value,
          })),
        },
      });
    }
    if (copy.localRouterCompanion.badges.length > 0) {
      nodes.push({
        id: "search-local-router-badges",
        type: "table",
        props: {
          columns: ["Local retrieval cues"],
          rows: copy.localRouterCompanion.badges.map((badge) => [badge]),
          caption: "Local router preview",
        },
      });
    }
  }

  if (copy.bullets.length > 0) {
    nodes.push({
      id: "search-bullets",
      type: "table",
      props: {
        columns: ["Key points"],
        rows: copy.bullets.map((item) => [item]),
        caption: "Research highlights",
      },
    });
  }

  if (copy.refinementSuggestions.length > 0) {
    nodes.push({
      id: "search-refinements",
      type: "table",
      props: {
        columns: ["Suggested refinement"],
        rows: copy.refinementSuggestions.map((item) => [item]),
        caption: "Ways to narrow or deepen this result",
      },
    });
  }

  if (copy.sourceItems.length > 0) {
    nodes.push({
      id: "search-sources",
      type: "link_list",
      props: {
        title: "Sources",
        items: copy.sourceItems.map((item) => ({
          title: item.title,
          url: item.url,
          subtitle: item.subtitle,
        })),
      },
    });
  }

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: copy.query ? `Search result for "${copy.query}"` : "Search result",
    description: "Structured research view companion for the current search result.",
    layout: { type: "stack", gap: "md" },
    nodes,
  };
}

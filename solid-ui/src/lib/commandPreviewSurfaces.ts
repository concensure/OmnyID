// @locs-version: 1.0
import type { AfpMessage, UiCommandResponse } from "@/lib/api";

function socialPlatforms(query: string): string[] {
  const lower = query.toLowerCase();
  const platforms: string[] = [];
  if (lower.includes("linkedin")) platforms.push("LinkedIn");
  if (lower.includes("bluesky")) platforms.push("Bluesky");
  if (lower.includes("twitter") || lower.includes(" x ")) platforms.push("X");
  return platforms.length > 0 ? platforms : ["LinkedIn", "X", "Bluesky"];
}

function spaceMessages(command: UiCommandResponse): Array<Record<string, unknown>> {
  const bullets = command.bullets ?? [];
  return bullets.slice(0, 4).map((bullet, index) => ({
    author: index === 0 ? "Master Agent" : "Space member",
    body: bullet,
    type: "update",
    timestamp: new Date(Date.now() - index * 3_600_000).toISOString(),
  }));
}

export function travelPreviewPrefersComparison(
  query: string,
  preferredView: string | null | undefined,
  bullets: string[],
): boolean {
  if (preferredView === "comparison_table") {
    return true;
  }
  const lower = query.toLowerCase();
  const comparisonTerms = [
    "compare",
    "comparison",
    "best",
    "better",
    "options",
    "alternatives",
    "cheapest",
    "fastest",
    "versus",
    "vs",
  ];
  if (comparisonTerms.some((term) => lower.includes(term))) {
    return true;
  }
  return bullets.length >= 4;
}

export function buildSocialComposerPreviewMessage(
  base: AfpMessage,
  command: UiCommandResponse,
  query: string,
): AfpMessage {
  const draftText = command.bullets?.[0] ?? command.summary;
  const content = {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query || "Social post draft",
    description: command.summary,
    components: [
      {
        type: "social_composer",
        props: {
          title: query || "Social post draft",
          description: command.summary,
          draft_text: draftText,
          selected_platform: socialPlatforms(query)[0]?.toLowerCase(),
          platforms: socialPlatforms(query),
          suggestions: (command.bullets ?? []).slice(1),
          preview: socialPlatforms(query).map((platform) => ({
            platform,
            body: draftText,
            status: "Preview",
          })),
        },
      },
    ],
  };

  return {
    ...base,
    type: "agent",
    subtype: "a2ui_render",
    content,
    metadata: { ...(base.metadata ?? {}), intent: command.intent, origin: "workspace_command_preview" },
    views: [{ format: "a2ui.v1", priority: 100, content }],
  };
}

export function buildSpaceFeedPreviewMessage(
  base: AfpMessage,
  command: UiCommandResponse,
  query: string,
): AfpMessage {
  const title = query || "Space overview";
  const content = {
    schema_version: "a2ui.v1",
    kind: "panel",
    title,
    description: command.summary,
    components: [
      {
        type: "space_feed",
        props: {
          title,
          space_name: title,
          space_description: command.summary,
          composer_placeholder: "Write an update to this space...",
          can_post: true,
          members: [
            { name: "Master Agent", role: "host" },
            { name: "You", role: "member" },
          ],
          messages: spaceMessages(command),
        },
      },
    ],
  };

  return {
    ...base,
    type: "agent",
    subtype: "a2ui_render",
    content,
    metadata: { ...(base.metadata ?? {}), intent: command.intent, origin: "workspace_command_preview" },
    views: [{ format: "a2ui.v1", priority: 100, content }],
  };
}

export function buildRouteCardPreviewMessage(
  base: AfpMessage,
  command: UiCommandResponse,
  query: string,
): AfpMessage {
  const bullets = command.bullets ?? [];
  const content = {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query || "Suggested route",
    description: command.summary,
    components: [
      {
        type: "route_card",
        props: {
          route_id: `preview:${command.intent}`,
          title: query || "Suggested route",
          summary: command.summary,
          metrics: [
            { label: "Duration", value: bullets[0] ?? "18 mins" },
            { label: "Distance", value: bullets[1] ?? "6.2 km" },
            { label: "Transfers", value: bullets[2] ?? "Direct" },
          ],
          tradeoffs: bullets.slice(3, 5).map((item) => ({ title: "Trade-off", body: item })),
          assumptions: ["Live traffic may change."],
          dependency_notes: ["Preview generated from command intent."],
          actions: ["copy", "share"],
          confidence: 0.74,
          copy_text: `${query || "Suggested route"}: ${command.summary}`,
        },
      },
    ],
  };

  return {
    ...base,
    type: "agent",
    subtype: "a2ui_render",
    content,
    metadata: { ...(base.metadata ?? {}), intent: command.intent, origin: "workspace_command_preview" },
    views: [{ format: "a2ui.v1", priority: 100, content }],
  };
}

export function buildRouteComparisonPreviewMessage(
  base: AfpMessage,
  command: UiCommandResponse,
  query: string,
): AfpMessage {
  const bullets = command.bullets ?? [];
  const content = {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query || "Route comparison",
    description: command.summary,
    components: [
      {
        type: "comparison_table",
        props: {
          title: query || "Route comparison",
          description: command.summary,
          columns: ["Primary", "Option A", "Option B"],
          rows: bullets.length > 0
            ? bullets.map((item, index) => ({
                label: `Signal ${index + 1}`,
                values: [item, "Alternative A", "Alternative B"],
                winner: false,
              }))
            : [
                { label: "Duration", values: ["18 mins", "26 mins", "41 mins"], winner: false, note: "Lower is better" },
                { label: "Cost", values: ["$12", "$4", "$0"], winner: false },
                { label: "Reliability", values: ["Medium", "High", "High"], winner: false },
              ],
        },
      },
    ],
  };

  return {
    ...base,
    type: "agent",
    subtype: "a2ui_render",
    content,
    metadata: { ...(base.metadata ?? {}), intent: command.intent, origin: "workspace_command_preview" },
    views: [{ format: "a2ui.v1", priority: 100, content }],
  };
}

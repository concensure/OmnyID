// @locs-version: 1.0
export function buildGenericCommandPanelState(copy) {
  const nodes = [
    {
      id: "command-summary",
      type: "callout",
      props: {
        tone: copy.intent === "runner_edit" ? "strategy" : "info",
        title: copy.query ? `Command result for "${copy.query}"` : "Command result",
        body: copy.summary,
      },
    },
  ];

  if (copy.bullets.length > 0) {
    nodes.push({
      id: "command-next-steps",
      type: "table",
      props: {
        columns: ["Checklist"],
        rows: copy.bullets.map((item) => [item]),
        caption: "Next steps",
      },
    });
  }

  if (copy.runnerDraft) {
    nodes.push({
      id: "runner-draft-stats",
      type: "stats_grid",
      props: {
        items: [
          { label: "Target file", value: copy.runnerDraft.target_file_id },
          { label: "Review", value: copy.runnerDraft.requires_confirmation ? "Required" : "Optional" },
          { label: "Workspace", value: "Python runner" },
        ],
      },
    });
    nodes.push({
      id: "runner-draft-code",
      type: "code",
      props: {
        title: copy.runnerDraft.target_file_id.endsWith("_json")
          ? "Draft code (json)"
          : copy.runnerDraft.target_file_id.endsWith("_txt")
            ? "Draft code (text)"
            : "Draft code (python)",
        language: copy.runnerDraft.target_file_id.endsWith("_json")
          ? "json"
          : copy.runnerDraft.target_file_id.endsWith("_txt")
            ? "text"
            : "python",
        code: copy.runnerDraft.content,
      },
    });
  }

  if (copy.sourceItems.length > 0) {
    nodes.push({
      id: "command-sources",
      type: "link_list",
      props: {
        title: "Sources",
        items: copy.sourceItems.map((link) => ({
          title: link.title,
          url: link.url,
          subtitle: link.subtitle,
        })),
      },
    });
  }

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: copy.query ? `Command result for "${copy.query}"` : "Command result",
    description: copy.intent === "runner_edit"
      ? "The agent prepared a safe, review-first runner draft."
      : "The agent routed your request into the workspace.",
    layout: { type: "stack", gap: "md" },
    nodes,
  };
}

export function buildRunnerEditPanelState(copy) {
  const targetFile = copy.runnerDraft?.target_file_id || "runner_chat_py";
  const rows = copy.bullets.length > 0
    ? copy.bullets.map((item) => [item])
    : [
        ["Review the generated patch before applying it"],
        ["Confirm tool and policy changes before redeploying"],
        ["Run a test or dry-run after saving the draft"],
      ];

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: copy.query ? `Runner draft for "${copy.query}"` : "Runner draft",
    description: "The agent prepared a safe, review-first Python runner draft with clear next steps before execution.",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "runner-edit-summary",
        type: "callout",
        props: {
          tone: "strategy",
          title: "Runner draft ready for review",
          body: copy.summary,
        },
      },
      {
        id: "runner-edit-stats",
        type: "stats_grid",
        props: {
          items: [
            { label: "Target file", value: targetFile },
            { label: "Review", value: copy.runnerDraft?.requires_confirmation ? "Required" : "Optional" },
            { label: "Workspace", value: "Python runner" },
          ],
        },
      },
      {
        id: "runner-edit-workflow",
        type: "section",
        props: {
          title: "Suggested workflow",
          layout: { type: "stack", gap: "sm" },
        },
        children: [
          {
            id: "runner-edit-checklist",
            type: "table",
            props: {
              columns: ["Review checklist"],
              rows,
              caption: "Safe editing flow",
            },
          },
          {
            id: "runner-edit-tip",
            type: "text",
            props: {
              label: "Tip",
              value: "Keep the command bar open while reviewing the draft so the agent can revise the code in place before you save it.",
            },
          },
        ],
      },
      {
        id: "runner-edit-code",
        type: "code",
        props: {
          title: targetFile.endsWith("_json")
            ? "Draft code (json)"
            : targetFile.endsWith("_txt")
              ? "Draft code (text)"
              : "Draft code (python)",
          language: targetFile.endsWith("_json")
            ? "json"
            : targetFile.endsWith("_txt")
              ? "text"
              : "python",
          code: copy.runnerDraft?.content || "",
        },
      },
    ],
  };
}

export function buildDashboardFocusPanelState(copy) {
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: copy.query ? `Workspace focus for "${copy.query}"` : "Workspace focus",
    description: "Pivot the workspace toward recent agent output, runtime health, and the next useful control surface.",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "dashboard-focus-summary",
        type: "callout",
        props: {
          tone: "info",
          title: "Dashboard focus ready",
          body: copy.summary,
        },
      },
      {
        id: "dashboard-focus-stats",
        type: "stats_grid",
        props: {
          items: [
            { label: "Primary view", value: "Dashboard" },
            { label: "Status panel", value: "Agent fleet" },
            { label: "Detail view", value: "Threads and runtime" },
          ],
        },
      },
      {
        id: "dashboard-focus-guidance",
        type: "section",
        props: {
          title: "Suggested pivots",
          layout: { type: "stack", gap: "sm" },
        },
        children: [
          {
            id: "dashboard-focus-table",
            type: "table",
            props: {
              columns: ["Focus area", "What happens"],
              rows: copy.bullets.length > 0
                ? copy.bullets.map((item) => [item, "Suggested workspace focus"])
                : [
                    ["Recent messages", "See the latest agent output and thread activity."],
                    ["Agent status", "Check running, idle, and blocked agents at a glance."],
                    ["Runtime health", "Inspect runner state, logs, and recent changes."],
                  ],
              caption: "High-value next views",
            },
          },
          {
            id: "dashboard-focus-tip",
            type: "text",
            props: {
              label: "Tip",
              value: "Use the agent status panel to jump from green completed tasks to orange in-progress work before opening the full thread view.",
            },
          },
        ],
      },
    ],
  };
}

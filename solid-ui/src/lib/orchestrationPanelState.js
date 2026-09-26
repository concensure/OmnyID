// @locs-version: 1.0
const APPROVAL_TOKENS = [
  "send",
  "email",
  "book",
  "purchase",
  "buy",
  "pay",
  "delete",
  "cancel",
  "message someone",
  "contact",
  "submit",
  "apply",
  "transfer",
];

const AMBIGUITY_TOKENS = [
  "this",
  "that",
  "something",
  "someone",
  "somebody",
  "it",
  "things",
  "stuff",
  "sort it out",
  "handle it",
];

const BROAD_ACTION_TOKENS = ["organise", "organize", "manage", "plan", "handle", "set up"];

export function orchestrationGateState(query) {
  const lowered = query.toLowerCase();
  const isApproval = APPROVAL_TOKENS.some((token) => lowered.includes(token));
  const isClarification = !isApproval && (
    AMBIGUITY_TOKENS.some((token) => lowered.includes(token))
    || (lowered.split(/\s+/).filter(Boolean).length <= 4 && BROAD_ACTION_TOKENS.some((token) => lowered.includes(token)))
  );
  const gate = isApproval ? "Approval" : isClarification ? "Clarification" : "None";
  const gateExplainer = isApproval
    ? "The orchestrator detected a higher-risk action boundary and will wait for approval."
    : isClarification
      ? "The orchestrator needs one planning preference before it commits to the next path."
      : "The orchestrator can begin immediately with the current objective.";
  const tone = isApproval ? "warning" : isClarification ? "strategy" : "info";
  const nextSteps = isApproval
    ? [
        ["Wait for approval", "Do not cross the action boundary prematurely."],
        ["Resume only if approved", "Continue in the same card after confirmation."],
      ]
    : isClarification
      ? [
          ["Ask for a preference", "Resolve ambiguity before execution starts."],
          ["Lock the strategy", "Resume with the selected planning mode."],
        ]
      : [
          ["Plan the run", "Break the objective into structured tasks."],
          ["Start execution", "Begin the first safe step immediately."],
        ];

  return {
    gate,
    gateExplainer,
    tone,
    nextSteps,
  };
}

export function buildOrchestrationCompanionPanelState(copy) {
  const gateState = orchestrationGateState(copy.query);
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: copy.query ? `Orchestration preview for "${copy.query}"` : "Orchestration preview",
    description: "Structured companion view for the orchestration card, useful for inspectors and alternate renderers.",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "orchestrate-summary",
        type: "callout",
        props: {
          tone: gateState.tone,
          title: "Orchestration ready",
          body: copy.summary,
        },
      },
      {
        id: "orchestrate-stats",
        type: "stats_grid",
        props: {
          items: [
            { label: "Card", value: copy.cardId || "card.preview.local" },
            { label: "Gate", value: gateState.gate },
            { label: "Status", value: "streaming" },
          ],
        },
      },
      {
        id: "orchestrate-guidance",
        type: "section",
        props: {
          title: "Execution posture",
          layout: { type: "stack", gap: "sm" },
        },
        children: [
          {
            id: "orchestrate-gate-note",
            type: "text",
            props: {
              label: "Gate behavior",
              value: gateState.gateExplainer,
            },
          },
          {
            id: "orchestrate-next-steps",
            type: "table",
            props: {
              columns: ["Next step", "Purpose"],
              rows: gateState.nextSteps,
              caption: "Expected flow",
            },
          },
        ],
      },
    ],
  };
}

// Shared graph types, execution-state types, and constants used across
// WorkflowsView and its extracted utility modules.

import type { WorkflowConnectorOverrideFields } from "@/lib/api";

// ---------------------------------------------------------------------------
// Core graph structure
// ---------------------------------------------------------------------------

export type WorkflowNodeDraft = {
  id: string;
  kind: string;
  label: string;
  description?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  policy: Record<string, unknown>;
  prompt?: {
    system_prompt?: string;
    instruction_prompt?: string;
    user_editable?: boolean;
  };
  hidden_runtime_nodes: string[];
  metadata: Record<string, unknown>;
};

export type WorkflowEdgeDraft = {
  id: string;
  source: string;
  target: string;
  condition_label?: string;
  metadata: Record<string, unknown>;
};

export type WorkflowGraphDraft = {
  version: string;
  workflow_id: string;
  title: string;
  description?: string;
  status: string;
  environment: string;
  owner_user_id: string;
  root_node_ids: string[];
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
  presets: Array<Record<string, unknown>>;
  template_id?: string;
  template_version?: string;
  template_bindings: Array<{
    template_id: string;
    slot_name: string;
    node_ids: string[];
    metadata: Record<string, unknown>;
  }>;
  optimization_mode: string;
  metadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Node kind and preset registries
// ---------------------------------------------------------------------------

export const PRIMITIVES = [
  "trigger", "condition", "transform", "tool", "agent",
  "delegation", "policy", "approval", "merge", "termination",
  // Phase 11: background daemon node kinds
  "daemon",         // persistent background sub-agent (spawned by Master Agent)
  "subscription",   // ElectricSQL / AFP change-stream trigger for daemons
] as const;

export const PRESETS = [
  "email_guardian",
  "calendar_coordinator",
  "receipt_tracker",
  "study_planner",
  "research_assistant",
  "finance_guardian",
  "travel_booker",
  "content_publisher",
  // Phase 11: background daemon presets
  "knowledge_curator",
  "email_gateway",
  "relational_sync",
  "archive_cold_storage",
  "health_maintenance",
  // Phase 12: one-click launchpad templates
  "ai_cofounder_launchpad",
  // Phase 13: new agentic node presets
  "travel_planner",
  "social_poster",
  "expense_tracker",
] as const;

// ---------------------------------------------------------------------------
// Daemon presets: the set of presets that use the daemon_loop template.
// Used by the canvas to visually distinguish daemon workflows.
// ---------------------------------------------------------------------------
export const DAEMON_PRESETS = [
  "knowledge_curator",
  "email_gateway",
  "relational_sync",
  "archive_cold_storage",
  "health_maintenance",
] as const;

export type DaemonPreset = typeof DAEMON_PRESETS[number];

export const BRANCH_PRESETS: Record<string, string[][]> = {
  condition: [
    ["success", "fallback"],
    ["true", "false"],
    ["primary", "secondary"],
  ],
  approval: [
    ["approve", "reject"],
    ["approve", "cancel"],
  ],
  policy: [
    ["allow", "block"],
    ["pass", "escalate"],
  ],
};

// ---------------------------------------------------------------------------
// Edge execution state
// ---------------------------------------------------------------------------

export type EdgeExecutionState =
  | "completed"
  | "simulated"
  | "waiting_for_approval"
  | "waiting_for_resume"
  | "queued"
  | "blocked"
  | "failed"
  | "skipped";

// ---------------------------------------------------------------------------
// Timeline filter mode
// ---------------------------------------------------------------------------

export type RunTimelineFilterMode = "all" | "deployment_context" | "replay_drift";

// ---------------------------------------------------------------------------
// Deployment override types
// ---------------------------------------------------------------------------

export type DeploymentOverrideDraft = {
  delivery_tier: string;
  auth_mode: string;
  side_effects: string;
  provider_route: string;
};

export type TargetedDeploymentOverrideDraft = {
  delivery_tier?: string;
  auth_mode?: string;
  side_effects?: string;
  provider_route?: string;
};

export const DEFAULT_DEPLOYMENT_OVERRIDE_DRAFT: DeploymentOverrideDraft = {
  delivery_tier: "staging",
  auth_mode: "sandbox_credentials",
  side_effects: "preview_only",
  provider_route: "sandbox",
};

// ---------------------------------------------------------------------------
// Node deployment policy types
// ---------------------------------------------------------------------------

export type NodeDeploymentPolicy = {
  deploymentId: string;
  environment: string;
  family: string | null;
  provider: string | null;
  service: string | null;
  source: string;
  fields: WorkflowConnectorOverrideFields;
};

export type PendingNodeDeploymentPolicy = {
  environment: string;
  family: string | null;
  source: string;
  fields: WorkflowConnectorOverrideFields;
};

export type NodeDeploymentPolicyChange = {
  field: keyof WorkflowConnectorOverrideFields;
  current: string | null;
  next: string | null;
};

export type DeploymentPolicyDiffEntry = {
  nodeId: string;
  previous: WorkflowConnectorOverrideFields | null;
  current: WorkflowConnectorOverrideFields | null;
  changes: NodeDeploymentPolicyChange[];
};

// ---------------------------------------------------------------------------
// AFP contract analysis types
// ---------------------------------------------------------------------------

export type CompiledAfpGapFilter =
  | "generic_boundary"
  | "missing_memory_scope"
  | "missing_trace_source"
  | "orchestration_scaffold";

export type CompiledAfpReadinessFocus =
  | "ready_manifests"
  | "needs_contract_work"
  | "ready_handoffs";

export type CompiledOrchestrationRole =
  | "supervisor_orchestration"
  | "delegated_capability"
  | "delegated_decision"
  | "workflow_summary";

// ---------------------------------------------------------------------------
// Node visual registry (Phase 11)
// Maps every node kind to its Tailwind colour tokens, glyph, and whether it
// represents a persistent daemon (renders with an animated pulse ring).
// ---------------------------------------------------------------------------

export type NodeVisual = {
  /** Tailwind border colour class (e.g. "border-teal-300/70"). */
  borderClass: string;
  /** Tailwind background colour class for the node card. */
  bgClass: string;
  /** Tailwind text colour for the kind label. */
  labelClass: string;
  /** Single unicode glyph shown in the top-left of the node card. */
  glyph: string;
  /** If true the canvas renders an animated pulse ring around this node. */
  isPersistentDaemon: boolean;
};

export const NODE_VISUAL_REGISTRY: Record<string, NodeVisual> = {
  trigger:      { borderClass: "border-teal-300/70",   bgClass: "bg-teal-50/90",   labelClass: "text-teal-700",   glyph: "▶",  isPersistentDaemon: false },
  agent:        { borderClass: "border-indigo-300/70", bgClass: "bg-indigo-50/90", labelClass: "text-indigo-700", glyph: "✦",  isPersistentDaemon: false },
  daemon:       { borderClass: "border-violet-400/80", bgClass: "bg-violet-50/90", labelClass: "text-violet-700", glyph: "∞",  isPersistentDaemon: true  },
  subscription: { borderClass: "border-sky-300/70",    bgClass: "bg-sky-50/90",    labelClass: "text-sky-700",    glyph: "⚡", isPersistentDaemon: false },
  condition:    { borderClass: "border-amber-300/70",  bgClass: "bg-amber-50/90",  labelClass: "text-amber-700",  glyph: "⟨⟩", isPersistentDaemon: false },
  transform:    { borderClass: "border-slate-300/70",  bgClass: "bg-slate-50/90",  labelClass: "text-slate-700",  glyph: "⇄",  isPersistentDaemon: false },
  tool:         { borderClass: "border-emerald-300/70",bgClass: "bg-emerald-50/90",labelClass: "text-emerald-700",glyph: "⚙",  isPersistentDaemon: false },
  delegation:   { borderClass: "border-cyan-300/70",   bgClass: "bg-cyan-50/90",   labelClass: "text-cyan-700",   glyph: "↗",  isPersistentDaemon: false },
  policy:       { borderClass: "border-rose-300/70",   bgClass: "bg-rose-50/90",   labelClass: "text-rose-700",   glyph: "🛡", isPersistentDaemon: false },
  approval:     { borderClass: "border-amber-400/70",  bgClass: "bg-amber-50/90",  labelClass: "text-amber-800",  glyph: "✓",  isPersistentDaemon: false },
  merge:        { borderClass: "border-purple-300/70", bgClass: "bg-purple-50/90", labelClass: "text-purple-700", glyph: "⊕",  isPersistentDaemon: false },
  termination:  { borderClass: "border-gray-400/70",   bgClass: "bg-gray-100/90",  labelClass: "text-gray-700",   glyph: "■",  isPersistentDaemon: false },
};

/** Returns the visual spec for a node kind, falling back to a neutral default. */
export function nodeVisualForKind(kind: string): NodeVisual {
  return NODE_VISUAL_REGISTRY[kind] ?? {
    borderClass: "border-slate-200/70",
    bgClass: "bg-white/90",
    labelClass: "text-slate-600",
    glyph: "○",
    isPersistentDaemon: false,
  };
}

// ---------------------------------------------------------------------------
// Daemon palette entry (Phase 11)
// Describes one entry in the daemon palette sidebar section.
// ---------------------------------------------------------------------------

export type DaemonPaletteEntry = {
  presetKind: DaemonPreset;
  displayName: string;
  description: string;
  glyph: string;
  scopeSummary: string;
};

export const DAEMON_PALETTE_ENTRIES: DaemonPaletteEntry[] = [
  {
    presetKind: "knowledge_curator",
    displayName: "Knowledge Curator",
    description: "Continuously curates backlinks, summaries, and supertags from every new AFP message.",
    glyph: "∞",
    scopeSummary: "Writes: backlink_update, knowledge_card, insight, merge_suggestion",
  },
  {
    presetKind: "email_gateway",
    displayName: "Email Gateway",
    description: "Persistent IMAP/SMTP daemon: converts inbound email to AFP and delivers outbound AFP as email.",
    glyph: "✉",
    scopeSummary: "Writes: email_incoming · dispatches: email_outgoing",
  },
  {
    presetKind: "relational_sync",
    displayName: "Relational Sync",
    description: "Syncs AFP messages flagged store_in_relational to Postgres for SQL access.",
    glyph: "⟺",
    scopeSummary: "Writes: sync_error on failure · reads AFP only",
  },
  {
    presetKind: "archive_cold_storage",
    displayName: "Archive & Cold Storage",
    description: "Moves aged messages to MinIO cold storage preserving E2EE. Never deletes without user approval.",
    glyph: "🗄",
    scopeSummary: "Writes: archived_notice · uploads to MinIO (encrypted blobs only)",
  },
  {
    presetKind: "health_maintenance",
    displayName: "Health & Maintenance",
    description: "Runs during idle windows: re-indexes embeddings, detects duplicates, cleans the knowledge graph.",
    glyph: "⟳",
    scopeSummary: "Writes: merge_suggestion, insight, system_health",
  },
];

// ---------------------------------------------------------------------------
// Minimap types (Phase 11)
// Used by the canvas minimap panel to track viewport position.
// ---------------------------------------------------------------------------

export type MinimapViewport = {
  /** Canvas scroll position in pixels. */
  scrollX: number;
  scrollY: number;
  /** Canvas element dimensions in pixels. */
  canvasWidth: number;
  canvasHeight: number;
  /** Minimap panel dimensions. */
  minimapWidth: number;
  minimapHeight: number;
};

/** Compute the scale factor from canvas coordinates to minimap coordinates. */
export function minimapScale(viewport: MinimapViewport): number {
  const xScale = viewport.minimapWidth / Math.max(viewport.canvasWidth, 1);
  const yScale = viewport.minimapHeight / Math.max(viewport.canvasHeight, 1);
  return Math.min(xScale, yScale, 1);
}

/** Compute the minimap viewport rectangle (the visible area indicator). */
export function minimapViewportRect(
  viewport: MinimapViewport,
  windowWidth: number,
  windowHeight: number,
): { x: number; y: number; w: number; h: number } {
  const scale = minimapScale(viewport);
  return {
    x: viewport.scrollX * scale,
    y: viewport.scrollY * scale,
    w: Math.min(windowWidth * scale, viewport.minimapWidth),
    h: Math.min(windowHeight * scale, viewport.minimapHeight),
  };
}

// ---------------------------------------------------------------------------
// Daemon compile validation (Phase 11)
// ---------------------------------------------------------------------------

/** Validate that a daemon node in a graph has the required policy node connected. */
export type DaemonValidationIssue = {
  nodeId: string;
  nodeLabel: string;
  issue: "missing_policy_node" | "empty_allowed_message_types" | "missing_heartbeat_slot";
};

/** Check every daemon node in the graph and return any validation issues. */
export function validateDaemonNodes(
  nodes: WorkflowNodeDraft[],
  edges: WorkflowEdgeDraft[],
): DaemonValidationIssue[] {
  const issues: DaemonValidationIssue[] = [];
  const daemonNodes = nodes.filter((n) => n.kind === "daemon");
  for (const daemon of daemonNodes) {
    // Check for a connected policy node (upstream or downstream via any edge).
    const connectedNodeIds = new Set<string>(
      edges
        .filter((e) => e.source === daemon.id || e.target === daemon.id)
        .flatMap((e) => [e.source, e.target])
        .filter((id) => id !== daemon.id),
    );
    const hasPolicyNode = nodes.some(
      (n) => connectedNodeIds.has(n.id) && n.kind === "policy",
    );
    if (!hasPolicyNode) {
      issues.push({ nodeId: daemon.id, nodeLabel: daemon.label, issue: "missing_policy_node" });
    }
    // Check that allowed_message_types is non-empty.
    const allowedTypes = daemon.config["allowed_message_types"];
    if (!Array.isArray(allowedTypes) || allowedTypes.length === 0) {
      issues.push({ nodeId: daemon.id, nodeLabel: daemon.label, issue: "empty_allowed_message_types" });
    }
  }
  return issues;
}

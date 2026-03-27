import { z } from 'zod';

export const WorkflowSchemaVersionSchema = z.literal('omnyid-workflow.v1');
export const WorkflowIrVersionSchema = z.literal('omnyid-workflow-ir.v1');

export const DataMaskSchema = z.enum(['private', 'team', 'public']);
export const ApprovalModeSchema = z.enum([
  'none',
  'suggest_only',
  'human_approval_required',
]);
export const OptimizationModeSchema = z.enum(['speed', 'cost', 'balanced']);

export const PrimitiveNodeKindSchema = z.enum([
  'trigger',
  'condition',
  'transform',
  'tool',
  'agent',
  'delegation',
  'policy',
  'approval',
  'merge',
  'termination',
]);

export const HiddenRuntimeNodeKindSchema = z.enum([
  'goal_intake',
  'context',
  'ambiguity',
  'plan',
  'policy_runtime',
  'model_broker',
  'capability_router',
  'executor',
  'reflection',
  'approval_runtime',
  'merge_runtime',
  'termination_runtime',
]);

export const PresetNodeKindSchema = z.enum([
  'email_guardian',
  'calendar_coordinator',
  'receipt_tracker',
  'study_planner',
  'research_assistant',
  'finance_guardian',
  'travel_booker',
  'content_publisher',
]);

export const WorkflowStatusSchema = z.enum([
  'draft',
  'validated',
  'deployed',
  'paused',
  'archived',
]);

export const DeployEnvironmentSchema = z.enum(['dev', 'prod']);

export const NodePortSchema = z.object({
  id: z.string(),
  label: z.string(),
  schema_ref: z.string().optional(),
  required: z.boolean().default(false),
});

export const CanvasPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const WorkflowNodePolicySchema = z.object({
  mask: DataMaskSchema.default('private'),
  approval_mode: ApprovalModeSchema.default('none'),
  allowed_tools: z.array(z.string()).default([]),
  allowed_capabilities: z.array(z.string()).default([]),
  max_steps: z.number().int().positive().default(1),
  max_cost_cents: z.number().nonnegative().default(0),
  outbound_allowlist: z.array(z.string()).default([]),
});

export const WorkflowNodePromptSchema = z.object({
  system_prompt: z.string().optional(),
  instruction_prompt: z.string().optional(),
  user_editable: z.boolean().default(true),
});

const TriggerConfigSchema = z.object({
  trigger_kind: z.enum([
    'manual',
    'schedule',
    'email',
    'webhook',
    'file_drop',
    'watcher',
  ]),
  schedule: z.string().optional(),
  event_filter: z.record(z.any()).default({}),
});

const ConditionConfigSchema = z.object({
  expression: z.string(),
  fail_target_node_id: z.string().optional(),
});

const TransformConfigSchema = z.object({
  transform_kind: z.enum([
    'template',
    'mapper',
    'extractor',
    'classifier',
    'summariser',
  ]),
  output_contract: z.record(z.any()).default({}),
});

const ToolConfigSchema = z.object({
  capability_id: z.string(),
  operation: z.string(),
  provider: z.string().optional(),
  timeout_seconds: z.number().positive().default(60),
});

const AgentConfigSchema = z.object({
  objective: z.string(),
  preset_kind: PresetNodeKindSchema.optional(),
  runtime_kind: HiddenRuntimeNodeKindSchema.optional(),
  memory_scope: z.enum([
    'none',
    'thread_summary',
    'workflow_summary',
    'workspace_slice',
  ]).default('thread_summary'),
});

const DelegationConfigSchema = z.object({
  target_agent_id: z.string().optional(),
  target_role: z.string().optional(),
  handoff_contract: z.record(z.any()).default({}),
});

const PolicyConfigSchema = z.object({
  policy_template_id: z.string().optional(),
  enforce_before_node_ids: z.array(z.string()).default([]),
});

const ApprovalConfigSchema = z.object({
  approval_reason: z.string(),
  decision_point_id: z.string(),
  options: z.array(
    z.object({
      option_id: z.string(),
      label: z.string(),
      consequence_summary: z.string(),
    }),
  ).min(1),
});

const MergeConfigSchema = z.object({
  merge_strategy: z.enum([
    'append',
    'overwrite',
    'structured_merge',
    'rank_and_select',
  ]),
});

const TerminationConfigSchema = z.object({
  output_kind: z.enum([
    'chat_reply',
    'artifact',
    'api_result',
    'saved_workflow_output',
  ]),
  final_schema: z.record(z.any()).default({}),
});

const WorkflowNodeBaseSchema = z.object({
  id: z.string(),
  kind: PrimitiveNodeKindSchema,
  label: z.string(),
  description: z.string().optional(),
  position: CanvasPositionSchema,
  inputs: z.array(NodePortSchema).default([]),
  outputs: z.array(NodePortSchema).default([]),
  policy: WorkflowNodePolicySchema.default({}),
  prompt: WorkflowNodePromptSchema.optional(),
  metadata: z.record(z.any()).default({}),
  hidden_runtime_nodes: z.array(HiddenRuntimeNodeKindSchema).default([]),
});

export const TriggerNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('trigger'),
  config: TriggerConfigSchema,
});

export const ConditionNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('condition'),
  config: ConditionConfigSchema,
});

export const TransformNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('transform'),
  config: TransformConfigSchema,
});

export const ToolNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('tool'),
  config: ToolConfigSchema,
});

export const AgentNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('agent'),
  config: AgentConfigSchema,
});

export const DelegationNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('delegation'),
  config: DelegationConfigSchema,
});

export const PolicyNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('policy'),
  config: PolicyConfigSchema,
});

export const ApprovalNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('approval'),
  config: ApprovalConfigSchema,
});

export const MergeNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('merge'),
  config: MergeConfigSchema,
});

export const TerminationNodeSchema = WorkflowNodeBaseSchema.extend({
  kind: z.literal('termination'),
  config: TerminationConfigSchema,
});

export const WorkflowNodeSchema = z.discriminatedUnion('kind', [
  TriggerNodeSchema,
  ConditionNodeSchema,
  TransformNodeSchema,
  ToolNodeSchema,
  AgentNodeSchema,
  DelegationNodeSchema,
  PolicyNodeSchema,
  ApprovalNodeSchema,
  MergeNodeSchema,
  TerminationNodeSchema,
]);

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  source_port_id: z.string().optional(),
  target_port_id: z.string().optional(),
  condition_label: z.string().optional(),
  metadata: z.record(z.any()).default({}),
});

export const PresetExpansionSchema = z.object({
  preset_id: z.string(),
  preset_kind: PresetNodeKindSchema,
  label: z.string(),
  description: z.string().optional(),
  root_node_ids: z.array(z.string()).min(1),
  favorite_eligible: z.boolean().default(true),
  parameter_schema: z.record(z.any()).default({}),
});

export const WorkflowGraphSchema = z.object({
  version: WorkflowSchemaVersionSchema,
  workflow_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: WorkflowStatusSchema.default('draft'),
  environment: DeployEnvironmentSchema.default('dev'),
  owner_user_id: z.string(),
  root_node_ids: z.array(z.string()).min(1),
  nodes: z.array(WorkflowNodeSchema).min(1),
  edges: z.array(WorkflowEdgeSchema).default([]),
  presets: z.array(PresetExpansionSchema).default([]),
  optimization_mode: OptimizationModeSchema.default('balanced'),
  metadata: z.record(z.any()).default({}),
});

export const RuntimeModelAssignmentSchema = z.object({
  strategy: z.enum(['cheap_reasoning', 'balanced_reasoning', 'high_accuracy']),
  provider: z.string(),
  model: z.string(),
  max_input_tokens: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
});

export const RuntimeRetryPolicySchema = z.object({
  max_attempts: z.number().int().positive().default(1),
  fallback_runtime_kind: HiddenRuntimeNodeKindSchema.optional(),
  on_timeout: z.enum(['retry', 'downgrade', 'escalate']).default('retry'),
  on_policy_block: z.enum(['escalate', 'stop']).default('escalate'),
});

export const RuntimeNodeManifestSchema = z.object({
  manifest_version: z.literal('omnyid-runtime-node.v1'),
  node_id: z.string(),
  runtime_kind: HiddenRuntimeNodeKindSchema,
  source_graph_node_id: z.string(),
  objective: z.string(),
  input_schema: z.record(z.any()).default({}),
  output_schema: z.record(z.any()).default({}),
  policy: WorkflowNodePolicySchema,
  memory_scope: z.enum([
    'none',
    'thread_summary',
    'workflow_summary',
    'workspace_slice',
  ]),
  model_assignment: RuntimeModelAssignmentSchema,
  retry_policy: RuntimeRetryPolicySchema,
  metadata: z.record(z.any()).default({}),
});

export const WorkflowIrEdgeSchema = z.object({
  from_manifest_node_id: z.string(),
  to_manifest_node_id: z.string(),
  route_label: z.string().optional(),
});

export const WorkflowIRSchema = z.object({
  version: WorkflowIrVersionSchema,
  workflow_id: z.string(),
  deployment_id: z.string().optional(),
  compiled_at: z.string(),
  environment: DeployEnvironmentSchema,
  entry_manifest_node_ids: z.array(z.string()).min(1),
  manifests: z.array(RuntimeNodeManifestSchema).min(1),
  edges: z.array(WorkflowIrEdgeSchema).default([]),
  policy_snapshot: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});

export const SavedWorkflowRecordSchema = z.object({
  workflow_id: z.string(),
  owner_user_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  favorite: z.boolean().default(false),
  preset_kinds: z.array(PresetNodeKindSchema).default([]),
  graph: WorkflowGraphSchema,
  latest_ir: WorkflowIRSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().optional(),
});

export const NodeMessageSubtypeSchema = z.enum([
  'workflow_manifest',
  'node_request',
  'node_result',
  'node_progress',
  'decision_request',
  'decision_result',
  'policy_block',
  'replan_request',
  'workflow_summary',
]);

export const WorkflowNodeMessageContentSchema = z.object({
  workflow_id: z.string(),
  workflow_run_id: z.string(),
  node_id: z.string(),
  runtime_kind: HiddenRuntimeNodeKindSchema.optional(),
  payload: z.record(z.any()).default({}),
});

export const WorkflowNodeMessageMetadataSchema = z.object({
  parent_node_id: z.string().optional(),
  parent_message_id: z.string().optional(),
  mask: DataMaskSchema.default('private'),
  model_profile: z.string().optional(),
  policy_checkpoint: z.string().optional(),
  replayable: z.boolean().default(true),
});

export type PrimitiveNodeKind = z.infer<typeof PrimitiveNodeKindSchema>;
export type HiddenRuntimeNodeKind = z.infer<typeof HiddenRuntimeNodeKindSchema>;
export type PresetNodeKind = z.infer<typeof PresetNodeKindSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowIR = z.infer<typeof WorkflowIRSchema>;
export type RuntimeNodeManifest = z.infer<typeof RuntimeNodeManifestSchema>;
export type SavedWorkflowRecord = z.infer<typeof SavedWorkflowRecordSchema>;
export type NodeMessageSubtype = z.infer<typeof NodeMessageSubtypeSchema>;

export function parseWorkflowGraph(input: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(input);
}

export function parseWorkflowIR(input: unknown): WorkflowIR {
  return WorkflowIRSchema.parse(input);
}

export function parseRuntimeNodeManifest(input: unknown): RuntimeNodeManifest {
  return RuntimeNodeManifestSchema.parse(input);
}

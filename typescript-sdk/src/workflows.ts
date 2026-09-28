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
  'wedding_vendor_operator',
]);
export const SubagentTemplateIdSchema = z.enum([
  'linear_worker',
  'branching_worker',
  'research_loop',
  'action_guarded',
]);
export const TemplateSlotNameSchema = z.enum([
  'intake_slot',
  'context_slot',
  'planner_slot',
  'gather_slot',
  'check_slot',
  'approval_slot',
  'merge_slot',
  'finalize_slot',
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
export const TemplateModelHintSchema = z.object({
  strategy: z.enum(['cheap_reasoning', 'balanced_reasoning', 'high_accuracy']),
  provider_hint: z.string().optional(),
  model_hint: z.string().optional(),
});
export const TemplateContextSliceSchema = z.object({
  scope: z.enum([
    'none',
    'thread_summary',
    'workflow_summary',
    'workspace_slice',
    'artifact_slice',
  ]),
  include_artifact_types: z.array(z.string()).default([]),
  max_items: z.number().int().positive().default(8),
});
export const TemplateCachePolicySchema = z.object({
  enabled: z.boolean().default(false),
  artifact_family: z.string().optional(),
  cache_key_fields: z.array(z.string()).default([]),
});
export const TemplateEfficiencyPolicySchema = z.object({
  inherit_prompt_contract: z.boolean().default(true),
  model_hint: TemplateModelHintSchema.optional(),
  context_slice: TemplateContextSliceSchema.optional(),
  cache_policy: TemplateCachePolicySchema.optional(),
  early_stop_confidence: z.number().min(0).max(1).optional(),
  deterministic_pruning: z.boolean().default(true),
  parallel_group_id: z.string().optional(),
  max_concurrency: z.number().int().positive().optional(),
});
export const TemplateSlotBindingSchema = z.object({
  slot_name: TemplateSlotNameSchema,
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(true),
  allowed_primitive_kinds: z.array(PrimitiveNodeKindSchema).min(1),
  default_primitive_kind: PrimitiveNodeKindSchema,
  default_runtime_kind: HiddenRuntimeNodeKindSchema.optional(),
  default_config: z.record(z.any()).default({}),
  default_policy: z.record(z.any()).default({}),
  default_prompt: WorkflowNodePromptSchema.optional(),
  efficiency_policy: TemplateEfficiencyPolicySchema.optional(),
});
export const SubagentTemplateSchema = z.object({
  template_id: SubagentTemplateIdSchema,
  version: z.literal('omnyid-subagent-template.v1'),
  label: z.string(),
  description: z.string(),
  category: z.enum(['general', 'research', 'action', 'branching']),
  default_optimization_mode: OptimizationModeSchema.default('balanced'),
  allowed_preset_kinds: z.array(PresetNodeKindSchema).default([]),
  slot_bindings: z.array(TemplateSlotBindingSchema).min(1),
  expansion_rules: z.object({
    root_slot_names: z.array(TemplateSlotNameSchema).min(1),
    terminal_slot_names: z.array(TemplateSlotNameSchema).min(1),
    supports_parallel_fanout: z.boolean().default(false),
    requires_merge_for_parallel: z.boolean().default(false),
  }),
  metadata: z.record(z.any()).default({}),
});
export const WorkflowTemplateBindingSchema = z.object({
  template_id: SubagentTemplateIdSchema,
  slot_name: TemplateSlotNameSchema,
  node_ids: z.array(z.string()).min(1),
  metadata: z.record(z.any()).default({}),
});
export const PresetTemplateMappingSchema = z.object({
  preset_kind: PresetNodeKindSchema,
  template_id: SubagentTemplateIdSchema,
  slot_overrides: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});

const TriggerConfigSchema = z.object({
  trigger_family: z.enum([
    'manual',
    'time',
    'event',
    'hybrid',
  ]).default('manual'),
  trigger_kind: z.enum([
    'manual',
    'schedule',
    'email',
    'webhook',
    'file_drop',
    'watcher',
  ]),
  schedule: z.string().optional(),
  time: z.object({
    schedule_kind: z.enum([
      'cron',
      'recurring',
      'one_off',
    ]),
    cron_expression: z.string().optional(),
    timezone: z.string().optional(),
    run_at: z.string().optional(),
    every: z.number().int().positive().optional(),
    interval_unit: z.enum([
      'minute',
      'hour',
      'day',
      'week',
      'month',
    ]).optional(),
    days_of_week: z.array(z.number().int().min(0).max(6)).default([]),
    at_time: z.string().optional(),
  }).optional(),
  event: z.object({
    source_kind: z.enum([
      'webhook',
      'email',
      'calendar',
      'file_upload',
      'api_callback',
      'message_bus',
      'node_finished',
      'state_changed',
      'run_completed',
      'approval_granted',
      'payload_arrived',
    ]),
    source_id: z.string().optional(),
    event_name: z.string().optional(),
    webhook_path: z.string().optional(),
    auth_policy: z.enum([
      'none',
      'shared_secret',
      'signed',
      'oauth_context',
    ]).optional(),
    dedupe_key: z.string().optional(),
  }).optional(),
  delay: z.object({
    delay_kind: z.enum([
      'fixed_duration',
      'until_datetime',
      'after_event_time',
    ]),
    duration_seconds: z.number().int().positive().optional(),
    until_datetime: z.string().optional(),
    anchor_field: z.string().optional(),
    offset_seconds: z.number().int().optional(),
  }).optional(),
  hybrid: z.object({
    condition_expression: z.string().optional(),
    state_ref: z.string().optional(),
    continuation_mode: z.enum([
      'event_then_time',
      'schedule_then_condition',
      'event_plus_condition_plus_time',
      'daily_state_audit',
    ]).optional(),
  }).optional(),
  event_filter: z.record(z.any()).default({}),
});

const TriggerDescriptorSchema = z.object({
  trigger_family: z.enum([
    'manual',
    'time',
    'event',
    'hybrid',
  ]),
  trigger_kind: z.string(),
  time: z.record(z.any()).optional(),
  event: z.record(z.any()).optional(),
  delay: z.record(z.any()).optional(),
  hybrid: z.record(z.any()).optional(),
  event_filter: z.record(z.any()).default({}),
  afp_message_type: z.literal('agent').default('agent'),
  afp_message_families: z.array(z.string()).default([]),
  afp_trigger_origin_template: z.record(z.any()).optional(),
  registration_targets: z.array(z.string()).default([]),
  runtime_requirements: z.array(z.string()).default([]),
});

const TriggerRegistrationPreviewSchema = z.object({
  status: z.enum(['not_applicable', 'compiled_preview']).default('not_applicable'),
  activation_count: z.number().int().nonnegative().default(0),
  live_registration_supported: z.boolean().default(false),
  family_counts: z.record(z.number().int().nonnegative()).default({}),
  registration_target_counts: z.record(z.number().int().nonnegative()).default({}),
  runtime_requirement_counts: z.record(z.number().int().nonnegative()).default({}),
  registration_targets: z.array(z.string()).default([]),
  runtime_requirements: z.array(z.string()).default([]),
  missing_runtime_capabilities: z.array(z.string()).default([]),
  next_dependency: z.string().optional(),
});

const WaitResumeContractSchema = z.object({
  resume_family: z.enum([
    'approval',
    'timer',
    'hybrid',
  ]),
  resume_kind: z.string(),
  trigger_family: z.enum([
    'manual',
    'time',
    'event',
    'hybrid',
  ]).optional(),
  delay: z.record(z.any()).optional(),
  event: z.record(z.any()).optional(),
  hybrid: z.record(z.any()).optional(),
  approval: z.record(z.any()).optional(),
  afp_message_type: z.literal('agent').default('agent'),
  afp_message_families: z.array(z.string()).default([]),
  registration_targets: z.array(z.string()).default([]),
  runtime_requirements: z.array(z.string()).default([]),
  resume_origin_template: z.record(z.any()).optional(),
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
  template_id: SubagentTemplateIdSchema.optional(),
  template_version: z.literal('omnyid-subagent-template.v1').optional(),
  template_bindings: z.array(WorkflowTemplateBindingSchema).default([]),
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
  trigger_descriptor: TriggerDescriptorSchema.optional(),
  wait_resume_contract: WaitResumeContractSchema.optional(),
  // Step 5: cache policy propagated from template slot efficiency policy
  cache_policy: TemplateCachePolicySchema.optional(),
  capability_bundle_id: z.string().optional(),
  // Step 6: parallel group annotation propagated from template slot efficiency policy
  parallel_group_id: z.string().optional(),
  max_concurrency: z.number().int().positive().optional(),
  metadata: z.record(z.any()).default({}),
});

export const WorkflowIrEdgeSchema = z.object({
  from_manifest_node_id: z.string(),
  to_manifest_node_id: z.string(),
  route_label: z.string().optional(),
  // Step 6: branch identity for edges within a parallel group
  branch_id: z.string().optional(),
  join_strategy: z.enum(['first_wins', 'all_required', 'any_threshold']).optional(),
});

// Step 6: parallel group descriptor emitted by the IR compiler when at least one
// template slot carries a parallel_group_id in its efficiency policy.
export const WorkflowIRParallelGroupSchema = z.object({
  parallel_group_id: z.string(),
  manifest_node_ids: z.array(z.string()).min(1),
  max_concurrency: z.number().int().positive().default(2),
  join_strategy: z.enum(['first_wins', 'all_required', 'any_threshold']).default('all_required'),
  merge_barrier_manifest_node_id: z.string().optional(),
});

// Step 5: capability bundle descriptor - groups nodes sharing a cacheable capability
// (e.g. all web-search tool nodes in a research_loop workflow).
export const WorkflowIRCapabilityBundleSchema = z.object({
  bundle_id: z.string(),
  capability_id: z.string(),
  operation: z.string().optional(),
  connector_family: z.string().optional(),
  cache_policy: TemplateCachePolicySchema.optional(),
  artifact_family: z.string().optional(),
  manifest_node_ids: z.array(z.string()).min(1),
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
  activation_descriptors: z.array(TriggerDescriptorSchema.extend({
    manifest_node_id: z.string(),
    source_graph_node_id: z.string(),
  })).default([]),
  activation_registration_preview: TriggerRegistrationPreviewSchema.default({}),
  wait_resume_descriptors: z.array(WaitResumeContractSchema.extend({
    manifest_node_id: z.string(),
    source_graph_node_id: z.string(),
  })).default([]),
  // Step 6: parallel group descriptors — one entry per unique parallel_group_id found
  // in compiled manifests. Empty for most workflows; populated for research_loop fan-out.
  parallel_groups: z.array(WorkflowIRParallelGroupSchema).default([]),
  // Step 5: capability bundle descriptors — groups cacheable tool nodes that share
  // a capability_id so the runtime can share artifact results across them.
  capability_bundles: z.array(WorkflowIRCapabilityBundleSchema).default([]),
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
export const TemplateRegistryRecordSchema = z.object({
  template: SubagentTemplateSchema,
  preset_mappings: z.array(PresetTemplateMappingSchema).default([]),
});
export const PresetStarterBlueprintSchema = z.object({
  kind: PrimitiveNodeKindSchema,
  label: z.string(),
  description: z.string(),
  slot_name: TemplateSlotNameSchema,
  config: z.record(z.any()).default({}),
  prompt: WorkflowNodePromptSchema.optional(),
  policy: WorkflowNodePolicySchema.optional(),
  metadata: z.record(z.any()).optional(),
  runtime_kind_source: PrimitiveNodeKindSchema.optional(),
});
export const PresetStarterRegistrySchema = z.record(
  PresetNodeKindSchema,
  z.array(PresetStarterBlueprintSchema).min(1),
);
export const WorkflowIntentExpansionSchema = z.object({
  preset_kind: PresetNodeKindSchema,
  requires_approval: z.boolean().default(false),
  needs_branching: z.boolean().default(false),
  needs_research_support: z.boolean().default(false),
  public_output: z.boolean().default(false),
  optimization_mode: OptimizationModeSchema.default('balanced'),
});

export const DEFAULT_SUBAGENT_TEMPLATES = [
  {
    template_id: 'linear_worker',
    version: 'omnyid-subagent-template.v1',
    label: 'Linear Worker',
    description: 'Use for straightforward intake -> gather/transform -> finalize flows with minimal branching.',
    category: 'general',
    default_optimization_mode: 'balanced',
    allowed_preset_kinds: ['receipt_tracker'],
    slot_bindings: [
      {
        slot_name: 'intake_slot',
        label: 'Intake',
        description: 'Capture the user objective and normalize the task contract.',
        allowed_primitive_kinds: ['agent'],
        default_primitive_kind: 'agent',
        default_runtime_kind: 'goal_intake',
        efficiency_policy: {
          inherit_prompt_contract: true,
          deterministic_pruning: true,
          model_hint: { strategy: 'cheap_reasoning' },
          context_slice: { scope: 'thread_summary', max_items: 4 },
        },
      },
      {
        slot_name: 'gather_slot',
        label: 'Gather',
        description: 'Collect the required artifact or tool output.',
        allowed_primitive_kinds: ['tool', 'transform'],
        default_primitive_kind: 'tool',
        default_runtime_kind: 'executor',
        efficiency_policy: {
          inherit_prompt_contract: true,
          deterministic_pruning: true,
          cache_policy: { enabled: true, artifact_family: 'gather_output', cache_key_fields: ['workflow_id', 'slot_name'] },
        },
      },
      {
        slot_name: 'merge_slot',
        label: 'Shape Result',
        description: 'Convert gathered output into the final structure.',
        allowed_primitive_kinds: ['transform', 'merge'],
        default_primitive_kind: 'transform',
        default_runtime_kind: 'merge_runtime',
        required: false,
        efficiency_policy: {
          inherit_prompt_contract: true,
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'finalize_slot',
        label: 'Finalize',
        description: 'Return the bounded result to the workflow surface.',
        allowed_primitive_kinds: ['termination'],
        default_primitive_kind: 'termination',
        default_runtime_kind: 'termination_runtime',
      },
    ],
    expansion_rules: {
      root_slot_names: ['intake_slot'],
      terminal_slot_names: ['finalize_slot'],
      supports_parallel_fanout: false,
      requires_merge_for_parallel: false,
    },
    metadata: {
      recommended_for: ['extract', 'map', 'summarize'],
    },
  },
  {
    template_id: 'branching_worker',
    version: 'omnyid-subagent-template.v1',
    label: 'Branching Worker',
    description: 'Use for workflows that split by condition or anomaly checks before converging on a result.',
    category: 'branching',
    default_optimization_mode: 'balanced',
    allowed_preset_kinds: ['study_planner', 'finance_guardian'],
    slot_bindings: [
      {
        slot_name: 'intake_slot',
        label: 'Intake',
        allowed_primitive_kinds: ['agent'],
        default_primitive_kind: 'agent',
        default_runtime_kind: 'goal_intake',
        efficiency_policy: {
          inherit_prompt_contract: true,
          model_hint: { strategy: 'cheap_reasoning' },
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'check_slot',
        label: 'Branch Check',
        description: 'Evaluate a deterministic or low-cost branching rule.',
        allowed_primitive_kinds: ['condition', 'policy'],
        default_primitive_kind: 'condition',
        default_runtime_kind: 'policy_runtime',
        efficiency_policy: {
          inherit_prompt_contract: true,
          deterministic_pruning: true,
          early_stop_confidence: 0.85,
        },
      },
      {
        slot_name: 'merge_slot',
        label: 'Merge or Shape',
        allowed_primitive_kinds: ['transform', 'merge', 'agent'],
        default_primitive_kind: 'transform',
        default_runtime_kind: 'merge_runtime',
        required: false,
        efficiency_policy: {
          inherit_prompt_contract: true,
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'finalize_slot',
        label: 'Finalize',
        allowed_primitive_kinds: ['termination'],
        default_primitive_kind: 'termination',
        default_runtime_kind: 'termination_runtime',
      },
    ],
    expansion_rules: {
      root_slot_names: ['intake_slot'],
      terminal_slot_names: ['finalize_slot'],
      supports_parallel_fanout: false,
      requires_merge_for_parallel: false,
    },
    metadata: {
      recommended_for: ['branch', 'classify', 'escalate'],
    },
  },
  {
    template_id: 'research_loop',
    version: 'omnyid-subagent-template.v1',
    label: 'Research Loop',
    description: 'Use for search/synthesis workflows that gather evidence and merge it into an answer.',
    category: 'research',
    default_optimization_mode: 'balanced',
    allowed_preset_kinds: ['research_assistant'],
    slot_bindings: [
      {
        slot_name: 'intake_slot',
        label: 'Intake',
        allowed_primitive_kinds: ['agent'],
        default_primitive_kind: 'agent',
        default_runtime_kind: 'goal_intake',
        efficiency_policy: {
          inherit_prompt_contract: true,
          model_hint: { strategy: 'balanced_reasoning' },
          context_slice: { scope: 'thread_summary', max_items: 5 },
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'gather_slot',
        label: 'Gather Evidence',
        allowed_primitive_kinds: ['tool', 'agent'],
        default_primitive_kind: 'tool',
        default_runtime_kind: 'executor',
        efficiency_policy: {
          inherit_prompt_contract: true,
          cache_policy: { enabled: true, artifact_family: 'research_sources', cache_key_fields: ['workflow_id', 'slot_name'] },
          model_hint: { strategy: 'cheap_reasoning' },
          deterministic_pruning: true,
          parallel_group_id: 'research_sources',
          max_concurrency: 2,
        },
      },
      {
        slot_name: 'merge_slot',
        label: 'Merge Evidence',
        allowed_primitive_kinds: ['merge', 'transform', 'agent'],
        default_primitive_kind: 'merge',
        default_runtime_kind: 'merge_runtime',
        efficiency_policy: {
          inherit_prompt_contract: true,
          model_hint: { strategy: 'balanced_reasoning' },
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'finalize_slot',
        label: 'Finalize',
        allowed_primitive_kinds: ['termination'],
        default_primitive_kind: 'termination',
        default_runtime_kind: 'termination_runtime',
      },
    ],
    expansion_rules: {
      root_slot_names: ['intake_slot'],
      terminal_slot_names: ['finalize_slot'],
      supports_parallel_fanout: true,
      requires_merge_for_parallel: true,
    },
    metadata: {
      recommended_for: ['research', 'source_compare', 'synthesis'],
    },
  },
  {
    template_id: 'action_guarded',
    version: 'omnyid-subagent-template.v1',
    label: 'Action Guarded',
    description: 'Use for workflows that gather context, possibly prepare an external action, and pause for approval when needed.',
    category: 'action',
    default_optimization_mode: 'balanced',
    allowed_preset_kinds: ['email_guardian', 'calendar_coordinator', 'travel_booker', 'content_publisher'],
    slot_bindings: [
      {
        slot_name: 'intake_slot',
        label: 'Intake',
        allowed_primitive_kinds: ['agent'],
        default_primitive_kind: 'agent',
        default_runtime_kind: 'goal_intake',
        efficiency_policy: {
          inherit_prompt_contract: true,
          model_hint: { strategy: 'balanced_reasoning' },
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'gather_slot',
        label: 'Gather or Prepare',
        allowed_primitive_kinds: ['tool', 'transform', 'agent'],
        default_primitive_kind: 'tool',
        default_runtime_kind: 'executor',
        required: false,
        efficiency_policy: {
          inherit_prompt_contract: true,
          cache_policy: { enabled: true, artifact_family: 'action_context', cache_key_fields: ['workflow_id', 'slot_name'] },
          deterministic_pruning: true,
        },
      },
      {
        slot_name: 'approval_slot',
        label: 'Approval',
        allowed_primitive_kinds: ['approval', 'policy'],
        default_primitive_kind: 'approval',
        default_runtime_kind: 'approval_runtime',
        required: false,
      },
      {
        slot_name: 'merge_slot',
        label: 'Shape Output',
        allowed_primitive_kinds: ['transform', 'merge'],
        default_primitive_kind: 'transform',
        default_runtime_kind: 'merge_runtime',
        required: false,
      },
      {
        slot_name: 'finalize_slot',
        label: 'Finalize',
        allowed_primitive_kinds: ['termination'],
        default_primitive_kind: 'termination',
        default_runtime_kind: 'termination_runtime',
      },
    ],
    expansion_rules: {
      root_slot_names: ['intake_slot'],
      terminal_slot_names: ['finalize_slot'],
      supports_parallel_fanout: false,
      requires_merge_for_parallel: false,
    },
    metadata: {
      recommended_for: ['approve', 'review', 'external_action'],
    },
  },
] as const satisfies readonly z.input<typeof SubagentTemplateSchema>[];

export const DEFAULT_PRESET_TEMPLATE_MAPPINGS = [
  {
    preset_kind: 'email_guardian',
    template_id: 'action_guarded',
    slot_overrides: {},
    metadata: { rationale: 'email triage and reply preparation often requires guarded external output' },
  },
  {
    preset_kind: 'calendar_coordinator',
    template_id: 'action_guarded',
    slot_overrides: {},
    metadata: { rationale: 'calendar actions often need approval before final commitment' },
  },
  {
    preset_kind: 'receipt_tracker',
    template_id: 'linear_worker',
    slot_overrides: {},
    metadata: { rationale: 'receipt extraction is mostly linear intake to extraction to ledger shaping' },
  },
  {
    preset_kind: 'study_planner',
    template_id: 'branching_worker',
    slot_overrides: {},
    metadata: { rationale: 'study planning branches on urgency and priority' },
  },
  {
    preset_kind: 'research_assistant',
    template_id: 'research_loop',
    slot_overrides: {},
    metadata: { rationale: 'research requires gather and merge phases with room for bounded fan-out later' },
  },
  {
    preset_kind: 'finance_guardian',
    template_id: 'branching_worker',
    slot_overrides: {},
    metadata: { rationale: 'anomaly detection naturally branches into normal or escalated paths' },
  },
  {
    preset_kind: 'travel_booker',
    template_id: 'action_guarded',
    slot_overrides: {},
    metadata: { rationale: 'travel booking should gather options then pause before external booking' },
  },
  {
    preset_kind: 'content_publisher',
    template_id: 'action_guarded',
    slot_overrides: {},
    metadata: { rationale: 'public publication should be guarded by policy and review' },
  },
  {
    preset_kind: 'wedding_vendor_operator',
    template_id: 'action_guarded',
    slot_overrides: {},
    metadata: {
      rationale: 'wedding vendor work combines live research, bounded outreach, quote normalization, and explicit approval gates',
      merge_policy: 'structured_merge_with_human_selected_vendor_decisions',
    },
  },
] as const satisfies readonly z.input<typeof PresetTemplateMappingSchema>[];

export const DEFAULT_TEMPLATE_REGISTRY = DEFAULT_SUBAGENT_TEMPLATES.map((template) =>
  TemplateRegistryRecordSchema.parse({
    template,
    preset_mappings: DEFAULT_PRESET_TEMPLATE_MAPPINGS.filter(
      (mapping) => mapping.template_id === template.template_id,
    ),
  }),
);

export const DEFAULT_PRESET_STARTER_BLUEPRINTS = PresetStarterRegistrySchema.parse({
  email_guardian: [
    {
      kind: 'agent',
      label: 'Email Guardian',
      description: 'Triage, summarize, and route inbox items.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Handle inbox triage and prepare safe next actions.',
        preset_kind: 'email_guardian',
        memory_scope: 'thread_summary',
      },
      prompt: {
        system_prompt: 'Triage inbound email responsibly and prepare safe next actions.',
        instruction_prompt: 'Summarize, classify, and decide whether a reply draft is needed.',
        user_editable: true,
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Mailbox Scan',
      description: 'Scan recent inbound messages for urgent or actionable items.',
      slot_name: 'gather_slot',
      config: { capability_id: 'email', operation: 'triage_inbox', timeout_seconds: 90 },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'approval',
      label: 'Reply Review',
      description: 'Review reply suggestions before any external send.',
      slot_name: 'approval_slot',
      config: {
        approval_reason: 'Outgoing email content should be reviewed before sending.',
        decision_point_id: '',
        options: [
          { option_id: 'approve_reply', label: 'Approve reply', consequence_summary: 'Continue toward response delivery.' },
          { option_id: 'hold_reply', label: 'Hold', consequence_summary: 'Stop before sending anything externally.' },
        ],
      },
      runtime_kind_source: 'approval',
    },
    {
      kind: 'termination',
      label: 'Inbox Summary',
      description: 'Deliver the reviewable reply draft and triage notes before any external send.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'email_guardian',
          summary_mode: 'reviewable_reply_draft',
          structured_output_keys: ['reply_draft', 'triage_notes'],
          external_write: false,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  calendar_coordinator: [
    {
      kind: 'agent',
      label: 'Calendar Coordinator',
      description: 'Coordinate schedule intent and draft reviewable meeting recommendations.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Coordinate scheduling intent and prepare reviewable meeting recommendations.',
        preset_kind: 'calendar_coordinator',
        memory_scope: 'thread_summary',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Conflict Scan',
      description: 'Check availability and detect scheduling collisions.',
      slot_name: 'gather_slot',
      config: { capability_id: 'calendar', operation: 'scan_availability', timeout_seconds: 60 },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'approval',
      label: 'Confirm Time',
      description: 'Review the recommended time slot before treating it as a confirmed plan.',
      slot_name: 'approval_slot',
      config: {
        approval_reason: 'A human should confirm the proposed meeting slot before it is treated as final.',
        decision_point_id: '',
        options: [
          { option_id: 'approve_slot', label: 'Confirm draft slot', consequence_summary: 'Proceed with the reviewed schedule draft.' },
          { option_id: 'reject_slot', label: 'Reject slot', consequence_summary: 'Return to planning without treating any slot as confirmed.' },
        ],
      },
      runtime_kind_source: 'approval',
    },
    {
      kind: 'termination',
      label: 'Schedule Summary',
      description: 'Return the recommended slot and any remaining scheduling notes for review.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'calendar_coordinator',
          summary_mode: 'reviewable_schedule_recommendation',
          structured_output_keys: ['recommended_slot', 'scheduling_notes', 'calendar_context'],
          external_write: false,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  receipt_tracker: [
    {
      kind: 'agent',
      label: 'Receipt Tracker',
      description: 'Interpret receipts and prepare bookkeeping updates.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Interpret receipts and prepare bookkeeping updates.',
        preset_kind: 'receipt_tracker',
        memory_scope: 'thread_summary',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Receipt Extractor',
      description: 'Extract merchant, amount, tax, and date fields.',
      slot_name: 'gather_slot',
      config: { capability_id: 'document_extract', operation: 'receipt_parse', timeout_seconds: 90 },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'transform',
      label: 'Ledger Mapping',
      description: 'Map receipt data into a ledger-friendly category structure.',
      slot_name: 'merge_slot',
      config: { transform_kind: 'template', output_contract: { category: '', merchant: '', amount: 0 } },
      runtime_kind_source: 'transform',
    },
    {
      kind: 'termination',
      label: 'Ledger Update Summary',
      description: 'Return the categorized receipt entry for review or posting.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'receipt_tracker',
          summary_mode: 'reviewable_receipt_entry',
          structured_output_keys: ['receipt_entry', 'receipt_notes'],
          external_write: false,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  study_planner: [
    {
      kind: 'agent',
      label: 'Study Planner',
      description: 'Draft study blocks from goals, deadlines, and priorities.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Draft study blocks from goals, deadlines, and priorities.',
        preset_kind: 'study_planner',
        memory_scope: 'thread_summary',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'condition',
      label: 'Urgency Split',
      description: 'Split between urgent work and routine planning.',
      slot_name: 'check_slot',
      config: { expression: 'deadline_within_72h' },
      runtime_kind_source: 'condition',
    },
    {
      kind: 'transform',
      label: 'Block Builder',
      description: 'Turn chosen priorities into a realistic block schedule.',
      slot_name: 'merge_slot',
      config: { transform_kind: 'template', output_contract: { study_blocks: [] } },
      runtime_kind_source: 'transform',
    },
    {
      kind: 'termination',
      label: 'Study Plan Summary',
      description: 'Deliver the recommended study blocks and reminders.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'study_planner',
          summary_mode: 'draft_study_plan',
          structured_output_keys: ['study_blocks', 'reminders', 'study_input_context', 'calendar_context'],
          external_write: false,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  research_assistant: [
    {
      kind: 'agent',
      label: 'Research Assistant',
      description: 'Frame the question and coordinate evidence gathering.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Frame the question and coordinate evidence gathering.',
        preset_kind: 'research_assistant',
        memory_scope: 'thread_summary',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Web Research',
      description: 'Search the web for relevant sources and findings.',
      slot_name: 'gather_slot',
      config: { capability_id: 'web_search', operation: 'search', timeout_seconds: 120 },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'merge',
      label: 'Evidence Merge',
      description: 'Combine source findings into a coherent synthesis.',
      slot_name: 'merge_slot',
      config: { merge_strategy: 'structured_merge' },
      runtime_kind_source: 'merge',
    },
    {
      kind: 'termination',
      label: 'Research Summary',
      description: 'Return a structured research brief with findings and source references.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'research_assistant',
          summary_mode: 'research_brief',
          structured_output_keys: ['research_brief', 'key_findings', 'source_refs'],
          external_write: false,
          include_sources: true,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  finance_guardian: [
    {
      kind: 'agent',
      label: 'Finance Guardian',
      description: 'Track spending and identify unusual activity.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Track spending and identify unusual activity.',
        preset_kind: 'finance_guardian',
        memory_scope: 'thread_summary',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Spend Scan',
      description: 'Analyze recent transactions and spending categories.',
      slot_name: 'gather_slot',
      config: { capability_id: 'finance', operation: 'analyze_spend', timeout_seconds: 90 },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'condition',
      label: 'Anomaly Check',
      description: 'Decide whether anomalies or alerts require escalation.',
      slot_name: 'check_slot',
      config: { expression: 'anomaly_detected' },
      runtime_kind_source: 'condition',
    },
    {
      kind: 'termination',
      label: 'Finance Digest',
      description: 'Return transaction trends, anomaly notes, and finance context from the user ledger.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'finance_guardian',
          summary_mode: 'finance_digest',
          structured_output_keys: ['finance_digest', 'anomaly_notes', 'finance_input_context'],
          external_write: false,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  travel_booker: [
    {
      kind: 'agent',
      label: 'Travel Booker',
      description: 'Coordinate travel intent, constraints, and tradeoffs.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Coordinate travel intent, constraints, and tradeoffs.',
        preset_kind: 'travel_booker',
        memory_scope: 'thread_summary',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Option Finder',
      description: 'Search flight, stay, or route options.',
      slot_name: 'gather_slot',
      config: { capability_id: 'travel', operation: 'compare_options', timeout_seconds: 120 },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'approval',
      label: 'Booking Approval',
      description: 'Require explicit approval before confirming anything externally.',
      slot_name: 'approval_slot',
      config: {
        approval_reason: 'Booking external travel should require explicit approval.',
        decision_point_id: '',
        options: [
          { option_id: 'book', label: 'Book option', consequence_summary: 'Proceed with confirmed booking.' },
          { option_id: 'decline', label: 'Do not book', consequence_summary: 'Stop before any external confirmation.' },
        ],
      },
      runtime_kind_source: 'approval',
    },
    {
      kind: 'termination',
      label: 'Travel Options Summary',
      description: 'Return the draft booking recommendation and review notes before any external confirmation.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'travel_booker',
          summary_mode: 'reviewable_booking_recommendation',
          structured_output_keys: ['booking_recommendation', 'booking_notes'],
          external_write: false,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  content_publisher: [
    {
      kind: 'agent',
      label: 'Content Publisher',
      description: 'Draft and prepare publishable public content.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Draft and prepare publishable public content.',
        preset_kind: 'content_publisher',
        memory_scope: 'thread_summary',
      },
      policy: {
        mask: 'public',
        approval_mode: 'none',
        allowed_tools: [],
        allowed_capabilities: [],
        max_steps: 1,
        max_cost_cents: 0,
        outbound_allowlist: [],
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'transform',
      label: 'Draft Formatter',
      description: 'Shape the content into the target publishing format.',
      slot_name: 'merge_slot',
      config: { transform_kind: 'template', output_contract: { title: '', body: '', tags: [] } },
      runtime_kind_source: 'transform',
    },
    {
      kind: 'approval',
      label: 'Publish Review',
      description: 'Review public-facing copy before publication.',
      slot_name: 'approval_slot',
      config: {
        approval_reason: 'Public content should be reviewed before publishing.',
        decision_point_id: '',
        options: [
          { option_id: 'publish', label: 'Publish', consequence_summary: 'Approve public release.' },
          { option_id: 'hold', label: 'Hold', consequence_summary: 'Keep the draft unpublished.' },
        ],
      },
      runtime_kind_source: 'approval',
    },
    {
      kind: 'termination',
      label: 'Publishing Summary',
      description: 'Return the reviewable publication draft and publish notes before any public release.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'content_publisher',
          summary_mode: 'reviewable_publication_draft',
          structured_output_keys: ['publication_draft', 'publication_notes'],
          external_write: false,
          visibility: 'public',
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
  wedding_vendor_operator: [
    {
      kind: 'agent',
      label: 'Wedding Vendor Operator',
      description: 'Coordinate live wedding vendor research, quote follow-up, and approval-gated outreach.',
      slot_name: 'intake_slot',
      config: {
        objective: 'Coordinate live wedding vendor research, quote follow-up, and approval-gated outreach.',
        preset_kind: 'wedding_vendor_operator',
        memory_scope: 'workspace_slice',
      },
      policy: {
        mask: 'private',
        approval_mode: 'human_approval_required',
        allowed_tools: ['wedding.vendor_search', 'wedding.live_evidence', 'gmail.send_draft'],
        allowed_capabilities: ['vendor_search', 'maps_travel', 'weather_contingency', 'email'],
        max_steps: 12,
        max_cost_cents: 150,
        outbound_allowlist: ['brave_search', 'google_places', 'google_maps', 'weatherapi', 'overpass', 'gmail'],
      },
      metadata: {
        daemon_family: 'wedding_vendor_operator',
        heartbeat_interval_minutes: 60,
        merge_policy: 'append_evidence_then_require_user_selected_vendor_decision',
        external_write_policy: 'approval_required_before_vendor_contact_or_send',
      },
      runtime_kind_source: 'agent',
    },
    {
      kind: 'tool',
      label: 'Live Vendor Discovery',
      description: 'Search live provider sources for vendors after intake basics are present.',
      slot_name: 'gather_slot',
      config: { capability_id: 'wedding.vendor_search', operation: 'search', timeout_seconds: 120 },
      policy: {
        mask: 'private',
        approval_mode: 'suggest_only',
        allowed_tools: ['wedding.vendor_search'],
        allowed_capabilities: ['vendor_search'],
        max_steps: 4,
        max_cost_cents: 80,
        outbound_allowlist: ['brave_search', 'google_places', 'overpass'],
      },
      metadata: {
        heartbeat_required: true,
        result_contract: 'source_linked_vendor_notes',
        forbidden_claims: ['booking_confirmed', 'availability_confirmed', 'price_final_without_quote'],
      },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'tool',
      label: 'Map And Weather Evidence',
      description: 'Verify planning locations and weather context with admin-connected providers.',
      slot_name: 'check_slot',
      config: { capability_id: 'wedding.live_evidence', operation: 'verify_location_weather', timeout_seconds: 90 },
      policy: {
        mask: 'private',
        approval_mode: 'suggest_only',
        allowed_tools: ['wedding.live_evidence'],
        allowed_capabilities: ['maps_travel', 'weather_contingency'],
        max_steps: 3,
        max_cost_cents: 40,
        outbound_allowlist: ['google_maps', 'weatherapi', 'overpass'],
      },
      metadata: {
        heartbeat_required: true,
        result_contract: 'map_collection_artifact',
        weather_guardrail: 'planning_evidence_not_day_of_safety_clearance',
      },
      runtime_kind_source: 'tool',
    },
    {
      kind: 'merge',
      label: 'Vendor Evidence Merge',
      description: 'Merge vendor, map, weather, quote, and user-selected decision evidence without overwriting approvals.',
      slot_name: 'merge_slot',
      config: { merge_strategy: 'structured_merge' },
      metadata: {
        merge_policy: 'append_only_evidence_preserve_user_approvals',
        conflict_resolution: 'surface_conflict_before_shortlisting_or_sending',
      },
      runtime_kind_source: 'merge',
    },
    {
      kind: 'approval',
      label: 'Vendor Outreach Review',
      description: 'Require explicit approval before contacting, following up with, or accepting a vendor quote.',
      slot_name: 'approval_slot',
      config: {
        approval_reason: 'Vendor contact, quote acceptance, deposits, and external email sends require explicit human approval.',
        decision_point_id: '',
        options: [
          { option_id: 'approve_vendor_outreach', label: 'Approve outreach', consequence_summary: 'Allow the reviewed vendor message to be sent through the connected provider.' },
          { option_id: 'hold_for_edits', label: 'Hold for edits', consequence_summary: 'Keep the vendor workflow in draft/review without contacting the vendor.' },
        ],
      },
      policy: {
        mask: 'private',
        approval_mode: 'human_approval_required',
        allowed_tools: ['gmail.send_draft'],
        allowed_capabilities: ['email'],
        max_steps: 2,
        max_cost_cents: 30,
        outbound_allowlist: ['gmail'],
      },
      metadata: {
        external_write_policy: 'require_confirmed_provider_receipt',
        undo_window_seconds: 120,
      },
      runtime_kind_source: 'approval',
    },
    {
      kind: 'termination',
      label: 'Vendor Operations Summary',
      description: 'Return source-backed vendor notes, quote actions, and blocked items before any unapproved external write.',
      slot_name: 'finalize_slot',
      config: {
        output_kind: 'chat_reply',
        final_schema: {
          workflow: 'wedding_vendor_operator',
          summary_mode: 'reviewable_vendor_operations_packet',
          structured_output_keys: ['vendor_notes', 'quote_actions', 'blocked_items', 'provider_receipts'],
          external_write: false,
          evidence_required: true,
        },
      },
      runtime_kind_source: 'termination',
    },
  ],
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
export type SubagentTemplateId = z.infer<typeof SubagentTemplateIdSchema>;
export type TemplateSlotName = z.infer<typeof TemplateSlotNameSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowIR = z.infer<typeof WorkflowIRSchema>;
export type WorkflowIrEdge = z.infer<typeof WorkflowIrEdgeSchema>;
export type WorkflowIRParallelGroup = z.infer<typeof WorkflowIRParallelGroupSchema>;
export type WorkflowIRCapabilityBundle = z.infer<typeof WorkflowIRCapabilityBundleSchema>;
export type RuntimeNodeManifest = z.infer<typeof RuntimeNodeManifestSchema>;
export type SavedWorkflowRecord = z.infer<typeof SavedWorkflowRecordSchema>;
export type SubagentTemplate = z.infer<typeof SubagentTemplateSchema>;
export type WorkflowTemplateBinding = z.infer<typeof WorkflowTemplateBindingSchema>;
export type PresetTemplateMapping = z.infer<typeof PresetTemplateMappingSchema>;
export type TemplateRegistryRecord = z.infer<typeof TemplateRegistryRecordSchema>;
export type PresetStarterBlueprint = z.infer<typeof PresetStarterBlueprintSchema>;
export type WorkflowIntentExpansion = z.infer<typeof WorkflowIntentExpansionSchema>;
export type NodeMessageSubtype = z.infer<typeof NodeMessageSubtypeSchema>;
export interface WorkflowTerminationContractDescriptor {
  output_kind: string;
  workflow?: string;
  summary_mode?: string;
  structured_output_keys: string[];
  external_write: boolean | null;
  headline: string;
  detail: string;
}

export function parseWorkflowGraph(input: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(input);
}

export function parseWorkflowIR(input: unknown): WorkflowIR {
  return WorkflowIRSchema.parse(input);
}

export function parseRuntimeNodeManifest(input: unknown): RuntimeNodeManifest {
  return RuntimeNodeManifestSchema.parse(input);
}

export function parseSubagentTemplate(input: unknown): SubagentTemplate {
  return SubagentTemplateSchema.parse(input);
}

export function parseTemplateRegistryRecord(input: unknown): TemplateRegistryRecord {
  return TemplateRegistryRecordSchema.parse(input);
}

export function presetStarterBlueprintsForPreset(
  presetKind: PresetNodeKind,
): PresetStarterBlueprint[] {
  return DEFAULT_PRESET_STARTER_BLUEPRINTS[presetKind] ?? [];
}

function recordValue(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function stringValue(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim().length > 0 ? input : undefined;
}

function stringListValue(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function humanizeIdentifier(value: string): string {
  return value
    .split(/[_\-.]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const TERMINATION_SUMMARY_MODE_HEADLINES: Record<string, string> = {
  research_brief: 'Research brief',
  finance_digest: 'Finance digest',
  reviewable_receipt_entry: 'Reviewable receipt entry',
  reviewable_reply_draft: 'Reviewable reply draft',
  reviewable_schedule_recommendation: 'Reviewable schedule recommendation',
  draft_study_plan: 'Draft study plan',
  reviewable_booking_recommendation: 'Reviewable booking recommendation',
  reviewable_publication_draft: 'Reviewable publication draft',
  reviewable_vendor_operations_packet: 'Reviewable vendor operations packet',
};

const TERMINATION_OUTPUT_KIND_HEADLINES: Record<string, string> = {
  chat_reply: 'Chat reply',
  artifact: 'Artifact output',
  api_result: 'API result',
  saved_workflow_output: 'Saved workflow output',
  spreadsheet_export: 'Spreadsheet export',
  chart_view: 'Chart view',
  content_digest: 'Content digest',
};

function describeTerminationContractDetail(
  outputKind: string,
  summaryMode: string | undefined,
  structuredOutputKeys: string[],
  externalWrite: boolean | null,
): string {
  if (summaryMode === 'research_brief') {
    return 'Returns a structured research brief with findings and source references without performing external writes.';
  }
  if (summaryMode === 'finance_digest') {
    return 'Returns transaction trends, anomaly notes, and finance context from the user ledger without performing external writes.';
  }
  if (summaryMode === 'reviewable_receipt_entry') {
    return 'Returns a categorized receipt entry and posting notes for review before any ledger write.';
  }
  if (summaryMode === 'reviewable_reply_draft') {
    return 'Returns a reply draft and triage notes for review before any external send.';
  }
  if (summaryMode === 'reviewable_schedule_recommendation') {
    return 'Returns a recommended slot and scheduling notes for review before any external write.';
  }
  if (summaryMode === 'draft_study_plan') {
    return 'Returns study blocks, reminders, and pending study-input context as a draft plan for review.';
  }
  if (summaryMode === 'reviewable_booking_recommendation') {
    return 'Returns a booking recommendation and review notes before any external confirmation.';
  }
  if (summaryMode === 'reviewable_publication_draft') {
    return 'Returns a publication draft and release notes for review before any public release.';
  }
  if (summaryMode === 'reviewable_vendor_operations_packet') {
    return 'Returns source-backed vendor notes, quote actions, blocked items, and provider receipts before any unapproved vendor contact.';
  }
  if (outputKind === 'spreadsheet_export') {
    return 'Exports structured data as spreadsheet files for human review or handoff.';
  }
  if (outputKind === 'chart_view') {
    return 'Returns chart-ready output for visual review.';
  }
  if (outputKind === 'content_digest') {
    return 'Returns a human-facing summary or digest.';
  }

  const writeSuffix =
    externalWrite === false
      ? ' No external write is implied by this contract.'
      : externalWrite === true
        ? ' This contract may perform an external write.'
        : '';

  if (structuredOutputKeys.length > 0) {
    return `Returns structured output fields: ${structuredOutputKeys.join(', ')}.${writeSuffix}`;
  }

  return `Returns a ${TERMINATION_OUTPUT_KIND_HEADLINES[outputKind] ?? humanizeIdentifier(outputKind)}.${writeSuffix}`;
}

export function describeWorkflowTerminationContract(config: {
  output_kind?: string;
  final_schema?: Record<string, unknown>;
}): WorkflowTerminationContractDescriptor {
  const finalSchema = recordValue(config.final_schema);
  const outputKind = stringValue(config.output_kind) ?? 'chat_reply';
  const workflow = stringValue(finalSchema.workflow);
  const summaryMode = stringValue(finalSchema.summary_mode);
  const structuredOutputKeys = stringListValue(finalSchema.structured_output_keys);
  const externalWrite =
    typeof finalSchema.external_write === 'boolean'
      ? finalSchema.external_write
      : null;
  const headline =
    (summaryMode && TERMINATION_SUMMARY_MODE_HEADLINES[summaryMode]) ??
    TERMINATION_OUTPUT_KIND_HEADLINES[outputKind] ??
    humanizeIdentifier(outputKind);

  return {
    output_kind: outputKind,
    workflow,
    summary_mode: summaryMode,
    structured_output_keys: structuredOutputKeys,
    external_write: externalWrite,
    headline,
    detail: describeTerminationContractDetail(
      outputKind,
      summaryMode,
      structuredOutputKeys,
      externalWrite,
    ),
  };
}

const PRESET_INTENT_KEYWORDS: Record<PresetNodeKind, string[]> = {
  email_guardian: ['email', 'inbox', 'reply', 'respond', 'triage', 'mail', 'outreach'],
  calendar_coordinator: ['calendar', 'schedule', 'meeting', 'availability', 'timeslot', 'appointment'],
  receipt_tracker: ['receipt', 'invoice', 'expense', 'ledger', 'merchant', 'bookkeeping'],
  study_planner: ['study', 'exam', 'homework', 'course', 'revision', 'deadline', 'learn'],
  research_assistant: ['research', 'search', 'sources', 'web', 'summarize', 'find information', 'investigate'],
  finance_guardian: ['finance', 'spending', 'budget', 'transaction', 'anomaly', 'expenses', 'cashflow'],
  travel_booker: ['travel', 'flight', 'hotel', 'trip', 'itinerary', 'book', 'booking'],
  content_publisher: ['publish', 'article', 'blog', 'content', 'post', 'newsletter', 'draft'],
  wedding_vendor_operator: ['wedding vendor', 'wedding vendors', 'florist', 'photographer', 'venue', 'caterer', 'celebrant', 'quote reply', 'vendor quote'],
};

export function inferPresetFromIntent(intent: string): PresetNodeKind | null {
  const normalized = intent.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  let bestPreset: PresetNodeKind | null = null;
  let bestScore = 0;
  for (const presetKind of Object.keys(PRESET_INTENT_KEYWORDS) as PresetNodeKind[]) {
    const score = PRESET_INTENT_KEYWORDS[presetKind].reduce((sum, keyword) => (
      normalized.includes(keyword) ? sum + Math.max(1, keyword.split(' ').length) : sum
    ), 0);
    if (score > bestScore) {
      bestScore = score;
      bestPreset = presetKind;
    }
  }

  if (bestPreset) {
    return bestPreset;
  }

  if (normalized.includes('public')) {
    return 'content_publisher';
  }
  if (normalized.includes('approval') || normalized.includes('review')) {
    return 'travel_booker';
  }
  return 'research_assistant';
}

export function expandWorkflowIntent(intent: string): WorkflowIntentExpansion {
  const normalized = intent.trim().toLowerCase();
  const presetKind = inferPresetFromIntent(intent) ?? 'research_assistant';

  const requiresApproval =
    /approval|approve|review|confirm|before sending|before booking|before publishing|human/.test(normalized) ||
    ['travel_booker', 'content_publisher', 'email_guardian', 'calendar_coordinator', 'wedding_vendor_operator'].includes(presetKind);
  const needsBranching =
    /compare|comparison|options|choose|branch|fallback|if |when |anomaly|route|otherwise/.test(normalized);
  const needsResearchSupport =
    /research|search|web|sources|investigate|compare|market|supplier|vendor/.test(normalized) &&
    presetKind !== 'research_assistant';
  const publicOutput =
    /public|publish|external audience|newsletter|blog|article/.test(normalized) ||
    presetKind === 'content_publisher';
  const optimizationMode =
    /cheap|budget|low cost|token|cost sensitive/.test(normalized)
      ? 'cost'
      : /fast|quick|quickly|urgent|asap/.test(normalized)
        ? 'speed'
        : 'balanced';

  return WorkflowIntentExpansionSchema.parse({
    preset_kind: presetKind,
    requires_approval: requiresApproval,
    needs_branching: needsBranching,
    needs_research_support: needsResearchSupport,
    public_output: publicOutput,
    optimization_mode: optimizationMode,
  });
}

export function suggestWorkflowTitleFromIntent(intent: string, presetKind: PresetNodeKind): string {
  const trimmed = intent.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    const starter = DEFAULT_PRESET_STARTER_BLUEPRINTS[presetKind];
    return starter?.[0]?.label ?? 'Workflow draft';
  }
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return sentence.length > 72 ? `${sentence.slice(0, 69)}...` : sentence;
}

export function templateForPreset(presetKind: PresetNodeKind): PresetTemplateMapping | undefined {
  return DEFAULT_PRESET_TEMPLATE_MAPPINGS.find((mapping) => mapping.preset_kind === presetKind);
}

export function registryRecordForTemplate(
  templateId: SubagentTemplateId,
): TemplateRegistryRecord | undefined {
  return DEFAULT_TEMPLATE_REGISTRY.find((record) => record.template.template_id === templateId);
}

/**
 * Default trigger config for each preset kind.
 * Used by the NL describe flow (server-side) and by the frontend when the
 * user drops a preset onto the canvas to pre-populate the TriggerNode config.
 *
 * Rules:
 * - reactive/inbox presets → event family (email_ingress or calendar event)
 * - time-driven presets    → schedule family (cron)
 * - ad-hoc / approval-heavy presets → manual (unchanged default)
 */
export const PRESET_DEFAULT_TRIGGER_CONFIGS: Record<
  PresetNodeKind,
  {
    trigger_family: string;
    trigger_kind: string;
    cron_expression?: string;
    schedule_description?: string;
    event_source?: string;
    event_type?: string;
    timezone?: string;
  }
> = {
  email_guardian: {
    trigger_family: "event",
    trigger_kind: "email_ingress",
    event_source: "gmail",
    event_type: "email.received",
  },
  calendar_coordinator: {
    trigger_family: "event",
    trigger_kind: "internal_event",
    event_source: "calendar",
    event_type: "appointment_approaching",
  },
  receipt_tracker: {
    trigger_family: "event",
    trigger_kind: "email_ingress",
    event_source: "email",
    event_type: "email.received",
  },
  study_planner: {
    trigger_family: "schedule",
    trigger_kind: "cron",
    cron_expression: "0 9 * * 1-5",
    schedule_description: "Every weekday at 9am",
    timezone: "UTC",
  },
  research_assistant: {
    trigger_family: "manual",
    trigger_kind: "manual",
  },
  finance_guardian: {
    trigger_family: "schedule",
    trigger_kind: "cron",
    cron_expression: "0 8 * * 1",
    schedule_description: "Every Monday at 8am",
    timezone: "UTC",
  },
  travel_booker: {
    trigger_family: "manual",
    trigger_kind: "manual",
  },
  content_publisher: {
    trigger_family: "manual",
    trigger_kind: "manual",
  },
  wedding_vendor_operator: {
    trigger_family: "manual",
    trigger_kind: "manual",
  },
};

export function presetDefaultTriggerConfig(
  presetKind: PresetNodeKind,
): (typeof PRESET_DEFAULT_TRIGGER_CONFIGS)[PresetNodeKind] {
  return PRESET_DEFAULT_TRIGGER_CONFIGS[presetKind];
}

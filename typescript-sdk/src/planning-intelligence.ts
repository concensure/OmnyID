import { z } from 'zod';

export const PLANNING_CONSTRAINT_SCHEMA_VERSION = 'planning.constraint.v1' as const;
export const PLANNING_EVALUATION_SCHEMA_VERSION = 'planning.constraint_evaluation.v1' as const;
export const PLANNING_COST_TRADEOFF_SCHEMA_VERSION = 'planning.cost_tradeoff.v1' as const;
export const PLANNING_MILESTONE_SCHEMA_VERSION = 'planning.milestone_dependency.v1' as const;
export const PLANNING_VENDOR_CHANGE_SCHEMA_VERSION = 'quotation.vendor_change.v1' as const;
export const PLANNING_INTERVENTION_SCHEMA_VERSION = 'decision.intervention.v1' as const;

const OpaqueIdSchema = z.string().trim().min(1).max(180)
  .refine((value) => !value.includes('@') && !/\s/.test(value), 'must be an opaque reference');
const CodeSchema = z.string().trim().min(1).max(100).regex(/^[a-z0-9_.-]+$/);
const TimestampSchema = z.string().datetime({ offset: true });

export const PlanningSubjectReferenceSchema = z.object({
  kind: z.enum(['plan', 'person', 'event', 'object', 'vendor_category', 'option', 'milestone']),
  id: OpaqueIdSchema,
}).strict();

export const PlanningSourceAnchorSchema = z.object({
  message_id: OpaqueIdSchema,
  source_version_id: OpaqueIdSchema.nullish(),
  locator: z.string().trim().min(1).max(500),
  exact_excerpt: z.string().trim().min(1).max(2_000),
}).strict();

export const PlanningConstraintValueSchema = z.union([
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('integer'), value: z.number().int().safe(), unit: CodeSchema.nullish() }).strict(),
  z.object({
    type: z.literal('integer_range'),
    minimum: z.number().int().safe().nullish(),
    maximum: z.number().int().safe().nullish(),
    unit: CodeSchema.nullish(),
  }).strict().superRefine((value, context) => {
    if (value.minimum == null && value.maximum == null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'integer range requires a bound' });
    }
    if (value.minimum != null && value.maximum != null && value.minimum > value.maximum) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'minimum exceeds maximum' });
    }
  }),
  z.object({ type: z.literal('enum'), value: CodeSchema, vocabulary: CodeSchema }).strict(),
  z.object({ type: z.literal('reference'), value: PlanningSubjectReferenceSchema }).strict(),
  z.object({ type: z.literal('reference_list'), values: z.array(PlanningSubjectReferenceSchema).min(1).max(50) }).strict(),
  z.object({ type: z.literal('enum_list'), values: z.array(CodeSchema).min(1).max(50), vocabulary: CodeSchema }).strict(),
]);

export const PlanningConstraintSchema = z.object({
  schema_version: z.literal(PLANNING_CONSTRAINT_SCHEMA_VERSION),
  constraint_id: OpaqueIdSchema,
  template_id: OpaqueIdSchema,
  plan_id: OpaqueIdSchema,
  subject_ref: PlanningSubjectReferenceSchema,
  kind: z.enum([
    'accessibility_requirement', 'location_requirement', 'distance_limit', 'duration_limit',
    'dimension_limit', 'dietary_requirement', 'service_requirement', 'relationship_separation',
    'attendance_requirement', 'aesthetic_preference', 'category_priority',
  ]),
  operator: z.enum(['requires', 'excludes', 'prefers', 'limits', 'separates', 'relates']),
  value: PlanningConstraintValueSchema,
  strength: z.enum(['hard', 'strong', 'nice']),
  authority: z.enum(['imported', 'deterministic', 'confirmed_interpretation', 'user']),
  privacy: z.enum(['shareable_with_approval', 'plan_private', 'couple_private']),
  source_ref: OpaqueIdSchema,
  source_anchor: PlanningSourceAnchorSchema,
  observed_at: TimestampSchema,
  effective_window: z.object({
    starts_at: TimestampSchema.nullish(),
    ends_at: TimestampSchema.nullish(),
  }).strict().superRefine((value, context) => {
    if (value.starts_at == null && value.ends_at == null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'effective window requires a boundary' });
    }
  }).nullish(),
  status: z.enum(['proposed', 'confirmed', 'superseded', 'removed']),
  supersedes: OpaqueIdSchema.nullish(),
}).strict().superRefine((value, context) => {
  if (value.status === 'proposed' && value.authority === 'user') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['authority'], message: 'user authority requires confirmation' });
  }
  if (['imported', 'deterministic'].includes(value.authority) && value.status !== 'proposed') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'non-user extraction must remain proposed' });
  }
  const terminalSuccessor = value.status === 'superseded' || value.status === 'removed';
  if (terminalSuccessor && value.supersedes == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['supersedes'], message: 'successor lineage is required' });
  }
  if (value.status === 'proposed' && value.supersedes != null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['supersedes'], message: 'proposals cannot supersede confirmed history' });
  }
  if (value.supersedes === value.constraint_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['supersedes'], message: 'cannot supersede itself' });
  }
});

export const PlanningConstraintEvaluationSchema = z.object({
  schema_version: z.literal(PLANNING_EVALUATION_SCHEMA_VERSION),
  evaluation_id: OpaqueIdSchema,
  constraint_ref: OpaqueIdSchema,
  candidate_ref: OpaqueIdSchema,
  result: z.enum(['satisfied', 'conflict', 'unknown', 'not_applicable']),
  severity: z.enum(['blocking', 'decision_relevant', 'informational']),
  constraint_evidence_ref: OpaqueIdSchema,
  candidate_evidence_ref: OpaqueIdSchema.nullish(),
  explanation_code: z.enum(['explicit_match', 'explicit_conflict', 'evidence_missing', 'scope_mismatch', 'candidate_not_applicable']),
  evaluated_at: TimestampSchema,
}).strict().superRefine((value, context) => {
  const decisive = value.result === 'satisfied' || value.result === 'conflict';
  if (decisive !== (value.candidate_evidence_ref != null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['candidate_evidence_ref'], message: 'decisive result requires candidate evidence' });
  }
  if ((value.result === 'unknown') !== (value.explanation_code === 'evidence_missing')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['explanation_code'], message: 'unknown requires evidence_missing' });
  }
});

export const PlanningMoneySchema = z.object({
  amount_minor: z.number().int().nonnegative().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();
export const PlanningKnownMoneySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('exact'), amount: PlanningMoneySchema, evidence_ref: OpaqueIdSchema }).strict(),
  z.object({ state: z.literal('unknown') }).strict(),
]);
export const PlanningMoneyRangeSchema = z.object({
  minimum_minor: z.number().int().nonnegative().safe(),
  maximum_minor: z.number().int().nonnegative().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  evidence_refs: z.array(OpaqueIdSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  if (value.minimum_minor > value.maximum_minor) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimum_minor'], message: 'minimum exceeds maximum' });
  }
});

export const PlanningCostTradeoffSchema = z.object({
  schema_version: z.literal(PLANNING_COST_TRADEOFF_SCHEMA_VERSION),
  tradeoff_id: OpaqueIdSchema,
  candidate_decision_ref: OpaqueIdSchema,
  incremental_cost: PlanningKnownMoneySchema,
  forecast_before: PlanningMoneyRangeSchema.nullish(),
  forecast_after: PlanningMoneyRangeSchema.nullish(),
  offset_options: z.array(z.object({
    option_id: OpaqueIdSchema,
    category_ref: OpaqueIdSchema,
    saving_range: PlanningMoneyRangeSchema,
    evidence_refs: z.array(OpaqueIdSchema).max(20),
  }).strict()).max(20),
  priority_impact: z.enum(['preserved', 'improved', 'reduced', 'unknown']),
  unknown_cost_drivers: z.array(OpaqueIdSchema).max(50),
  assumptions: z.array(z.enum([
    'current_quote', 'category_allowance', 'conservative_range', 'quantity_unconfirmed', 'tax_unconfirmed',
  ])).max(20),
}).strict();

export const PlanningPreparedActionSchema = z.object({
  kind: z.enum(['research', 'compare', 'draft']),
  target_ref: OpaqueIdSchema,
}).strict();

export const PlanningMilestoneDependencySchema = z.object({
  schema_version: z.literal(PLANNING_MILESTONE_SCHEMA_VERSION),
  milestone_id: OpaqueIdSchema,
  plan_id: OpaqueIdSchema,
  depends_on: z.array(OpaqueIdSchema).max(100),
  duration_or_lead_time: z.object({
    minimum_days: z.number().int().min(0).max(3_650),
    maximum_days: z.number().int().min(0).max(3_650),
    evidence_ref: OpaqueIdSchema,
  }).strict().superRefine((value, context) => {
    if (value.minimum_days > value.maximum_days) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimum_days'], message: 'minimum exceeds maximum' });
    }
  }).nullish(),
  earliest_at: TimestampSchema.nullish(),
  latest_at: TimestampSchema.nullish(),
  slack_days: z.number().int().safe().nullish(),
  state: z.enum(['not_started', 'active', 'blocked', 'complete', 'waived']),
  blocking_refs: z.array(OpaqueIdSchema).max(100),
  prepared_next_action: PlanningPreparedActionSchema.nullish(),
}).strict().superRefine((value, context) => {
  if (value.depends_on.includes(value.milestone_id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['depends_on'], message: 'self dependency' });
  }
  if (value.slack_days != null && (value.earliest_at == null || value.latest_at == null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['slack_days'], message: 'slack requires date bounds' });
  }
});

export const PlanningAnchoredTermSchema = z.object({
  value: z.string().trim().min(1).max(2_000),
  source_anchor: PlanningSourceAnchorSchema,
}).strict();

export const PlanningVendorChangeSchema = z.object({
  schema_version: z.literal(PLANNING_VENDOR_CHANGE_SCHEMA_VERSION),
  change_id: OpaqueIdSchema,
  response_ref: OpaqueIdSchema,
  affected_object_ref: OpaqueIdSchema,
  change_kind: z.enum(['unavailable', 'substituted', 'price_changed', 'timing_changed', 'scope_changed']),
  original_term: PlanningAnchoredTermSchema,
  replacement_options: z.array(PlanningAnchoredTermSchema).max(20),
  cost_delta: PlanningKnownMoneySchema,
  deadline: TimestampSchema.nullish(),
  requires_user_decision: z.boolean(),
}).strict().superRefine((value, context) => {
  if (!value.requires_user_decision && value.replacement_options.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requires_user_decision'], message: 'replacement options require a decision' });
  }
});

export const PlanningDecisionInterventionSchema = z.object({
  schema_version: z.literal(PLANNING_INTERVENTION_SCHEMA_VERSION),
  intervention_id: OpaqueIdSchema,
  decision_ref: OpaqueIdSchema,
  options: z.array(z.object({
    option_id: OpaqueIdSchema,
    label: z.string().trim().min(1).max(180),
    consequence_codes: z.array(CodeSchema).max(30),
    evidence_refs: z.array(OpaqueIdSchema).max(30),
  }).strict()).min(1).max(12),
  recommended_option_id: OpaqueIdSchema.nullish(),
  reason_codes: z.array(z.enum([
    'constraint_conflict', 'budget_tradeoff', 'critical_dependency', 'vendor_change', 'preference_conflict',
  ])).max(10),
  unknown_codes: z.array(CodeSchema).max(30),
  consequence_summary_codes: z.array(CodeSchema).max(30),
  prepared_next_action: PlanningPreparedActionSchema.nullish(),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.options.map((option) => option.option_id));
  if (ids.size !== value.options.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'option ids must be unique' });
  }
  if (value.recommended_option_id != null) {
    if (!ids.has(value.recommended_option_id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_option_id'], message: 'recommended option missing' });
    }
    if (value.reason_codes.length === 0 || value.options.every((option) => option.evidence_refs.length === 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_option_id'], message: 'recommendation requires reason and evidence' });
    }
  }
});

export const PlanningContractSchema = z.union([
  PlanningConstraintSchema,
  PlanningConstraintEvaluationSchema,
  PlanningCostTradeoffSchema,
  PlanningMilestoneDependencySchema,
  PlanningVendorChangeSchema,
  PlanningDecisionInterventionSchema,
]);

export type PlanningConstraint = z.infer<typeof PlanningConstraintSchema>;
export type PlanningContract = z.infer<typeof PlanningContractSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function canonicalPlanningContractJson(input: unknown): string {
  return JSON.stringify(canonicalize(PlanningContractSchema.parse(input)));
}

export async function planningContractFingerprint(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPlanningContractJson(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function assertPlanningConstraintIngress(
  input: unknown,
  authenticatedPlanId: string,
  userAuthority: boolean,
): PlanningConstraint {
  const constraint = PlanningConstraintSchema.parse(input);
  if (constraint.plan_id !== authenticatedPlanId) throw new Error('plan authority mismatch');
  if (!userAuthority && (
    constraint.authority === 'user'
    || constraint.authority === 'confirmed_interpretation'
    || constraint.status !== 'proposed'
  )) throw new Error('client payload cannot claim confirmation authority');
  return constraint;
}

export function assertPlanningConstraintSuccessor(
  previousInput: unknown,
  successorInput: unknown,
  userAuthority: boolean,
): PlanningConstraint {
  const previous = PlanningConstraintSchema.parse(previousInput);
  const successor = PlanningConstraintSchema.parse(successorInput);
  if (successor.plan_id !== previous.plan_id
    || successor.template_id !== previous.template_id
    || successor.supersedes !== previous.constraint_id) throw new Error('successor lineage mismatch');
  const privacyRank = { shareable_with_approval: 0, plan_private: 1, couple_private: 2 } as const;
  const authorityRank = { imported: 0, deterministic: 1, confirmed_interpretation: 2, user: 3 } as const;
  if (!userAuthority && (
    privacyRank[successor.privacy] < privacyRank[previous.privacy]
    || authorityRank[successor.authority] > authorityRank[previous.authority]
  )) throw new Error('client payload cannot relax privacy or escalate authority');
  return successor;
}

import { z } from 'zod';

export const QUOTATION_SCHEMA_VERSION = 'quotation.normalised.v1' as const;
export const COMPARISON_SCHEMA_VERSION = 'quotation.comparison.v1' as const;

export const EvidenceStateSchema = z.enum([
  'confirmed',
  'inferred',
  'unknown',
  'conflicting',
]);

export const SourceAnchorSchema = z.object({
  source_id: z.string().min(1).max(500),
  source_version_id: z.string().min(1).max(500),
  locator: z.string().min(1).max(500),
  exact_excerpt: z.string().min(1).max(2_000),
}).strict();

export const EvidenceSchema = z.object({
  state: EvidenceStateSchema,
  anchors: z.array(SourceAnchorSchema).max(8).default([]),
  rationale: z.string().max(1_000).optional(),
}).strict();

export const MoneySchema = z.object({
  amount_minor: z.number().int().nonnegative().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();

export const ScaledQuantitySchema = z.object({
  units: z.number().int().nonnegative().safe(),
  scale: z.number().int().min(0).max(6),
}).strict();

export const InclusionStateSchema = z.enum([
  'included',
  'required',
  'optional',
  'excluded',
  'conditional',
  'unknown',
]);

export const PriceBasisSchema = z.enum([
  'fixed',
  'per_person',
  'per_item',
  'per_hour',
  'percentage',
  'minimum_spend',
]);

export const LineEffectSchema = z.enum(['charge', 'discount']);

export const TaxTreatmentSchema = z.enum([
  'inclusive',
  'exclusive',
  'exempt',
  'unknown',
]);

export const QuoteLifecycleSchema = z.enum([
  'draft',
  'active',
  'superseded',
  'accepted',
  'declined',
  'expired',
]);

export const SourceReferenceSchema = z.object({
  source_id: z.string().min(1).max(500),
  source_version_id: z.string().min(1).max(500),
  media_type: z.string().min(1).max(500),
  content_hash: z.string().max(200).optional(),
}).strict();

export const QuotationIdentitySchema = z.object({
  quotation_id: z.string().min(1).max(500),
  version_id: z.string().min(1).max(500),
  supersedes_version_id: z.string().min(1).max(500).optional(),
  vendor_id: z.string().min(1).max(500),
  context_namespace: z.string().min(1).max(500),
}).strict();

export const LineItemSchema = z.object({
  line_id: z.string().min(1).max(500),
  label: z.string().min(1).max(500),
  category: z.string().min(1).max(500),
  inclusion: InclusionStateSchema,
  price_basis: PriceBasisSchema,
  effect: LineEffectSchema.default('charge'),
  unit_price: MoneySchema.optional(),
  quantity: ScaledQuantitySchema.optional(),
  rate_bps: z.number().int().min(0).max(100_000).optional(),
  percentage_basis_line_ids: z.array(z.string().min(1).max(500)).max(500).default([]),
  evidence: EvidenceSchema,
}).strict();

export const CommercialTermSchema = z.object({
  term_id: z.string().min(1).max(500),
  kind: z.string().min(1).max(500),
  label: z.string().min(1).max(500),
  amount: MoneySchema.optional(),
  due_at: z.string().datetime().optional(),
  refundable: z.boolean().optional(),
  evidence: EvidenceSchema,
}).strict();

export const UnmappedItemSchema = z.object({
  vendor_label: z.string().min(1).max(500),
  proposed_key: z.string().min(1).max(500).optional(),
  evidence: EvidenceSchema,
}).strict();

export const TaxRuleSchema = z.object({
  treatment: TaxTreatmentSchema,
  rate_bps: z.number().int().min(0).max(100_000).optional(),
  evidence: EvidenceSchema,
}).strict();

export const NormalisedQuotationSchema = z.object({
  schema_version: z.literal(QUOTATION_SCHEMA_VERSION),
  registry_version: z.string().min(1).max(100),
  identity: QuotationIdentitySchema,
  lifecycle: QuoteLifecycleSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  issued_at: z.string().datetime().optional(),
  valid_until: z.string().datetime().optional(),
  sources: z.array(SourceReferenceSchema).min(1).max(20),
  line_items: z.array(LineItemSchema).max(500),
  commercial_terms: z.array(CommercialTermSchema).max(100).default([]),
  unmapped_items: z.array(UnmappedItemSchema).max(100).default([]),
  tax: TaxRuleSchema,
}).strict();

export const ComparableScenarioSchema = z.object({
  scenario_id: z.string().min(1).max(500),
  guest_count: z.number().int().nonnegative().optional(),
  selected_optional_line_ids: z.array(z.string().min(1).max(500)).default([]),
  quantity_overrides: z.record(ScaledQuantitySchema).default({}),
}).strict();

export const ComparableTotalSchema = z.object({
  quotation_id: z.string(),
  version_id: z.string(),
  scenario_id: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['complete', 'incomplete', 'ambiguous']),
  subtotal_minor: z.number().int().safe().optional(),
  tax_minor: z.number().int().safe().optional(),
  total_minor: z.number().int().safe().optional(),
  evidence_coverage_bps: z.number().int().min(0).max(10_000),
  gaps: z.array(z.object({
    code: z.string(),
    line_id: z.string().nullable().optional(),
    message: z.string(),
  }).strict()),
  formula_trace: z.array(z.object({
    line_id: z.string(),
    formula_id: z.string(),
    formula_version: z.string(),
    input_line_ids: z.array(z.string()).default([]),
    rounding: z.string(),
    expression: z.string(),
    amount_minor: z.number().int().safe(),
  }).strict()),
}).strict();

export const RequirementAssessmentSchema = z.object({
  requirement_id: z.string().min(1).max(500),
  importance: z.enum(['hard', 'soft']),
  status: z.enum(['met', 'conflict', 'unknown']),
  evidence: EvidenceSchema,
}).strict();

export const RankedCandidateSchema = z.object({
  quotation_id: z.string().min(1).max(500),
  version_id: z.string().min(1).max(500),
  vendor_id: z.string().min(1).max(500),
  disposition: z.enum(['eligible', 'conditional', 'excluded']),
  total: ComparableTotalSchema,
  requirement_coverage_bps: z.number().int().min(0).max(10_000),
  evidence_strength_bps: z.number().int().min(0).max(10_000),
  hard_conflict_ids: z.array(z.string()),
  unknown_hard_requirement_ids: z.array(z.string()),
}).strict();

export const QuotationComparisonSchema = z.object({
  schema_version: z.literal(COMPARISON_SCHEMA_VERSION),
  comparison_id: z.string().min(1).max(500),
  scenario_id: z.string().min(1).max(500),
  candidates: z.array(RankedCandidateSchema),
  recommended_quotation_id: z.string().optional(),
  recommendation_reason: z.string().optional(),
}).strict();

export type EvidenceState = z.infer<typeof EvidenceStateSchema>;
export type SourceAnchor = z.infer<typeof SourceAnchorSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type CommercialTerm = z.infer<typeof CommercialTermSchema>;
export type UnmappedItem = z.infer<typeof UnmappedItemSchema>;
export type NormalisedQuotation = z.infer<typeof NormalisedQuotationSchema>;
export type ComparableScenario = z.infer<typeof ComparableScenarioSchema>;
export type ComparableTotal = z.infer<typeof ComparableTotalSchema>;
export type RequirementAssessment = z.infer<typeof RequirementAssessmentSchema>;
export type RankedCandidate = z.infer<typeof RankedCandidateSchema>;
export type QuotationComparison = z.infer<typeof QuotationComparisonSchema>;

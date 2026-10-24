import { z } from 'zod/v3';

export const QUOTATION_SCHEMA_VERSION = 'quotation.normalised.v1' as const;
export const COMPARISON_SCHEMA_VERSION = 'quotation.comparison.v1' as const;
export const VENDOR_RESPONSE_SCHEMA_VERSION = 'quotation.vendor_response.v1' as const;

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

const ResponseIdSchema = z.string().trim().min(1).max(180);
const ResponseTimestampSchema = z.string().datetime({ offset: true });

export const VendorResponseEvidenceStateSchema = z.enum([
  'confirmed',
  'proposed',
  'unknown',
]);

export const VendorResponseChannelSchema = z.enum([
  'afp',
  'secure_link',
  'upload',
  'email',
]);

export const VendorResponseStatusSchema = z.enum([
  'draft',
  'submitted',
  'received',
  'reviewed',
  'rejected',
  'superseded',
]);

export const VendorResponseChannelReceiptSchema = z.object({
  receipt_id: ResponseIdSchema,
  received_at: ResponseTimestampSchema,
  transport_message_id: z.string().trim().min(1).max(300).optional(),
}).strict();

export const VendorQuestionAnswerSchema = z.object({
  question_id: ResponseIdSchema,
  state: VendorResponseEvidenceStateSchema,
  answer: z.string().trim().min(1).max(4_000).optional(),
  anchors: z.array(SourceAnchorSchema).max(8).default([]),
}).strict().superRefine((answer, context) => {
  if (answer.state === 'unknown' && answer.answer !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'unknown answers cannot carry a value' });
  }
  if (answer.state !== 'unknown' && answer.answer === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'answered states require a value' });
  }
});

export const VendorCommercialValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('money'), value: MoneySchema }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('date'), value: ResponseTimestampSchema }).strict(),
  z.object({ kind: z.literal('text'), value: z.string().trim().min(1).max(4_000) }).strict(),
  z.object({ kind: z.literal('inclusion'), value: InclusionStateSchema }).strict(),
  z.object({ kind: z.literal('integer'), value: z.number().int().safe() }).strict(),
]);

export const VendorCommercialFactSchema = z.object({
  fact_id: ResponseIdSchema,
  key: ResponseIdSchema,
  state: VendorResponseEvidenceStateSchema,
  value: VendorCommercialValueSchema.optional(),
  anchors: z.array(SourceAnchorSchema).max(8).default([]),
}).strict().superRefine((fact, context) => {
  if (fact.state === 'unknown' && (fact.value !== undefined || fact.anchors.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'unknown facts cannot carry value or evidence' });
  }
  if (fact.state !== 'unknown' && fact.value === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'material facts require a typed value' });
  }
  if (fact.state === 'confirmed' && fact.anchors.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['anchors'], message: 'confirmed facts require exact evidence' });
  }
});

export const VendorAvailabilitySchema = z.object({
  state: z.enum(['available', 'unavailable', 'conditional', 'unknown']),
  starts_at: ResponseTimestampSchema.optional(),
  ends_at: ResponseTimestampSchema.optional(),
  notes: z.string().trim().min(1).max(2_000).optional(),
  anchors: z.array(SourceAnchorSchema).max(8).default([]),
}).strict().superRefine((availability, context) => {
  if (availability.starts_at && availability.ends_at
      && Date.parse(availability.starts_at) >= Date.parse(availability.ends_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ends_at'], message: 'availability end must follow start' });
  }
});

export const VendorResponseAttachmentSchema = z.object({
  attachment_id: ResponseIdSchema,
  file_name: z.string().trim().min(1).max(500),
  media_type: z.string().trim().min(1).max(180),
  size_bytes: z.number().int().min(1).max(25 * 1024 * 1024),
  content_hash: z.string().trim().min(1).max(200),
  source_id: ResponseIdSchema,
  source_version_id: ResponseIdSchema,
}).strict();

export const VendorAttestationSchema = z.object({
  attested_by: ResponseIdSchema,
  authority: z.enum(['vendor_representative', 'claimed_agent', 'verified_email_recipient']),
  affirmed: z.boolean(),
  attested_at: ResponseTimestampSchema,
}).strict();

export const VendorResponseSenderIdentitySchema = z.object({
  identity_id: ResponseIdSchema,
  kind: z.enum(['connected_email', 'omnyid_mask']),
  address: z.string().trim().email().max(254),
  display_name: z.string().trim().min(1).max(180),
}).strict().superRefine((identity, context) => {
  if (identity.kind === 'omnyid_mask'
      && !/^[a-z0-9]+(?:_[a-z0-9]+)*@omnyid\.com$/.test(identity.address)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'invalid OmnyID vendor mask' });
  }
});

export const QuotationVendorResponseSchema = z.object({
  schema_version: z.literal(VENDOR_RESPONSE_SCHEMA_VERSION),
  response_id: ResponseIdSchema,
  parent_response_id: ResponseIdSchema.optional(),
  vendor_id: ResponseIdSchema,
  thread_id: ResponseIdSchema,
  grant_id: ResponseIdSchema,
  quotation_id: ResponseIdSchema,
  quotation_version_id: ResponseIdSchema,
  projection_fingerprint: z.string().regex(/^[0-9a-fA-F]{64}$/),
  channel: VendorResponseChannelSchema,
  channel_receipt: VendorResponseChannelReceiptSchema,
  status: VendorResponseStatusSchema,
  submitted_at: ResponseTimestampSchema,
  sender_identity: VendorResponseSenderIdentitySchema.optional(),
  question_answers: z.array(VendorQuestionAnswerSchema).max(50).default([]),
  commercial_facts: z.array(VendorCommercialFactSchema).max(100).default([]),
  availability: VendorAvailabilitySchema.optional(),
  explanation: z.string().trim().min(1).max(4_000).optional(),
  sources: z.array(SourceReferenceSchema).max(20).default([]),
  attachments: z.array(VendorResponseAttachmentSchema).max(20).default([]),
  attestation: VendorAttestationSchema,
}).strict().superRefine((response, context) => {
  if (response.parent_response_id === response.response_id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parent_response_id'], message: 'response cannot parent itself' });
  }
  const sourceKeys = new Set(response.sources.map((source) => `${source.source_id}\0${source.source_version_id}`));
  if (sourceKeys.size !== response.sources.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'sources must be unique' });
  }
  const anchors = [
    ...response.question_answers.flatMap((answer) => answer.anchors),
    ...response.commercial_facts.flatMap((fact) => fact.anchors),
    ...(response.availability?.anchors ?? []),
  ];
  if (anchors.some((anchor) => !sourceKeys.has(`${anchor.source_id}\0${anchor.source_version_id}`))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'all evidence must resolve to a source' });
  }
  if (response.attachments.some((attachment) => !sourceKeys.has(`${attachment.source_id}\0${attachment.source_version_id}`))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'all attachments must resolve to a source' });
  }
  if (new Set(response.question_answers.map((answer) => answer.question_id)).size !== response.question_answers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['question_answers'], message: 'question IDs must be unique' });
  }
  if (new Set(response.commercial_facts.map((fact) => fact.fact_id)).size !== response.commercial_facts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['commercial_facts'], message: 'fact IDs must be unique' });
  }
  if (new Set(response.attachments.map((attachment) => attachment.attachment_id)).size !== response.attachments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'attachment IDs must be unique' });
  }
  if (response.status !== 'draft' && !response.attestation.affirmed) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attestation', 'affirmed'], message: 'submitted responses require attestation' });
  }
  if (Date.parse(response.channel_receipt.received_at) < Date.parse(response.submitted_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['channel_receipt', 'received_at'], message: 'receipt cannot precede submission' });
  }
  if (Date.parse(response.attestation.attested_at) > Date.parse(response.submitted_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attestation', 'attested_at'], message: 'attestation cannot follow submission' });
  }
  const hasMaterial = response.question_answers.length > 0
    || response.commercial_facts.length > 0
    || response.availability !== undefined
    || response.explanation !== undefined
    || response.attachments.length > 0;
  if (!hasMaterial) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'response cannot be empty' });
  }
});

function sortedCanonical(values: unknown[]) {
  return values.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function sourceIdentity(sourceKeys: Map<string, string>, sourceId: string, sourceVersionId: string) {
  const key = `${sourceId.trim()}\0${sourceVersionId.trim()}`;
  return sourceKeys.get(key) ?? key;
}

function anchorMaterial(anchor: SourceAnchor, sourceKeys: Map<string, string>) {
  return [
    sourceIdentity(sourceKeys, anchor.source_id, anchor.source_version_id),
    anchor.locator.trim(),
    anchor.exact_excerpt.trim(),
  ];
}

function commercialValueMaterial(value: VendorCommercialValue) {
  if (value.kind === 'money') return ['money', value.value.amount_minor, value.value.currency.trim()];
  if (value.kind === 'boolean') return ['boolean', value.value];
  if (value.kind === 'date') return ['date', new Date(value.value).toISOString()];
  if (value.kind === 'text') return ['text', value.value.trim()];
  if (value.kind === 'inclusion') return ['inclusion', value.value];
  return ['integer', value.value];
}

export function canonicalVendorResponseMaterial(input: QuotationVendorResponse) {
  const response = QuotationVendorResponseSchema.parse(input);
  const sourceKeys = new Map(response.sources.map((source) => [
    `${source.source_id}\0${source.source_version_id}`,
    source.content_hash?.trim().toLowerCase() ?? `${source.source_id}\0${source.source_version_id}`,
  ]));
  const answers = sortedCanonical(response.question_answers.map((answer) => [
    answer.question_id.trim(), answer.state, answer.answer?.trim() ?? null,
    sortedCanonical(answer.anchors.map((anchor) => anchorMaterial(anchor, sourceKeys))),
  ]));
  const facts = sortedCanonical(response.commercial_facts.map((fact) => [
    fact.fact_id.trim(), fact.key.trim(), fact.state,
    fact.value ? commercialValueMaterial(fact.value) : null,
    sortedCanonical(fact.anchors.map((anchor) => anchorMaterial(anchor, sourceKeys))),
  ]));
  const availability = response.availability ? [
    response.availability.state,
    response.availability.starts_at ? new Date(response.availability.starts_at).toISOString() : null,
    response.availability.ends_at ? new Date(response.availability.ends_at).toISOString() : null,
    response.availability.notes?.trim() ?? null,
    sortedCanonical(response.availability.anchors.map((anchor) => anchorMaterial(anchor, sourceKeys))),
  ] : null;
  const sources = sortedCanonical(response.sources.map((source) => [
    sourceIdentity(sourceKeys, source.source_id, source.source_version_id),
    source.media_type.trim().toLowerCase(),
  ]));
  const attachments = sortedCanonical(response.attachments.map((attachment) => [
    attachment.content_hash.trim().toLowerCase(), attachment.media_type.trim().toLowerCase(), attachment.size_bytes,
  ]));
  return [
    VENDOR_RESPONSE_SCHEMA_VERSION,
    response.vendor_id.trim(), response.thread_id.trim(), response.grant_id.trim(),
    response.quotation_id.trim(), response.quotation_version_id.trim(),
    response.projection_fingerprint.toLowerCase(), answers, facts, availability,
    response.explanation?.trim() ?? null, sources, attachments,
  ];
}

export async function vendorResponseFingerprint(input: QuotationVendorResponse) {
  const material = canonicalVendorResponseMaterial(input);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(material)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function vendorResponseStatusTransitionAllowed(
  from: VendorResponseStatus,
  to: VendorResponseStatus,
) {
  return (from === 'draft' && to === 'submitted')
    || (from === 'submitted' && to === 'received')
    || (from === 'received' && (to === 'reviewed' || to === 'rejected'))
    || (['submitted', 'received', 'reviewed', 'rejected'].includes(from) && to === 'superseded');
}

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
export type VendorResponseEvidenceState = z.infer<typeof VendorResponseEvidenceStateSchema>;
export type VendorResponseChannel = z.infer<typeof VendorResponseChannelSchema>;
export type VendorResponseStatus = z.infer<typeof VendorResponseStatusSchema>;
export type VendorCommercialValue = z.infer<typeof VendorCommercialValueSchema>;
export type QuotationVendorResponse = z.infer<typeof QuotationVendorResponseSchema>;

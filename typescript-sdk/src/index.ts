import { z } from 'zod/v3';
export {
  approvalDraftPreviewLines,
  approvalDraftPreviewSummary,
  responseItemPreparedDraftAnchorSummary,
  contextPackObjectSearchTarget,
  responseItemPreparedDraftAnchorLabels,
  resolveContinuityTargetLabel,
  summarizeReferenceLabels,
  watcherMessageSummary,
  type ContinuityMessageLike,
  type ContinuityObjectSearchTarget,
  type ThreadSummaryLike,
} from './continuity.js';
export * from './retrieval.js';
export * from './quotation.js'; export * from './planning-intelligence.js';

const ViewSchema = z.object({
  format: z.enum(['email', 'notion', 'database', 'calendar', 'graph', 'system']),
  content: z.record(z.any()),
  priority: z.number().int().default(0),
});

const ReferenceSchema = z.object({
  type: z.string(),
  target: z.string(),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  storage: z.record(z.any()),
  encryption: z.record(z.any()),
  sha256: z.string().optional(),
});

export const AFP_TYPE_KNOWLEDGE_LINK = 'knowledge_link' as const;
export const AFP_TYPE_RELATION_LINK = 'relation_link' as const;
export const AFP_TYPE_LEDGER = 'ledger' as const;
export const AFP_TYPE_FILE_LEDGER = 'file_ledger' as const;
export const AFP_TYPE_STATE_SNAPSHOT = 'state_snapshot' as const;
export const AFP_TYPE_BROWSER_TASK = 'browser_task' as const;
export const AFP_TYPE_PROVENANCE_RECORD = 'provenance_record' as const;
export const AFP_TOPOLOGY_LINK_TYPES = [
  AFP_TYPE_KNOWLEDGE_LINK,
  AFP_TYPE_RELATION_LINK,
] as const;
export const AFP_OPERATIONAL_MESSAGE_TYPES = [
  AFP_TYPE_KNOWLEDGE_LINK,
  AFP_TYPE_RELATION_LINK,
  AFP_TYPE_FILE_LEDGER,
  AFP_TYPE_STATE_SNAPSHOT,
  AFP_TYPE_BROWSER_TASK,
  AFP_TYPE_PROVENANCE_RECORD,
] as const;
export const AFP_UNIFIED_OBJECT_KINDS = [
  'task',
  'project',
  'note',
  'observation',
  'resource',
  'relationship',
  'decision',
  'meeting',
  'database_view',
  'chat_thread',
  'rich_note',
  'communication',
  'event',
  'research',
] as const;
export const AFP_SUBTYPE_LINK_ENTITY = 'entity' as const;
export const AFP_SUBTYPE_LINK_RELATIONSHIP = 'relationship' as const;

export type UnifiedObjectKind = (typeof AFP_UNIFIED_OBJECT_KINDS)[number] | (string & {});

export function isTopologyLinkMessageType(type: string): boolean {
  return AFP_TOPOLOGY_LINK_TYPES.includes(type as (typeof AFP_TOPOLOGY_LINK_TYPES)[number]);
}

export function isOperationalMessageType(type: string): boolean {
  return AFP_OPERATIONAL_MESSAGE_TYPES.includes(
    type as (typeof AFP_OPERATIONAL_MESSAGE_TYPES)[number],
  );
}

export function isUnifiedObjectMessage(message: {
  type?: string;
  kind?: string | null;
}): boolean {
  return message.type === AFP_TYPE_LEDGER && typeof message.kind === 'string' && message.kind.trim().length > 0;
}

export const AfpEntityMentionSchema = z.object({
  kind: z.string(),
  name: z.string(),
  canonical: z.string(),
  context_snippet: z.string().optional(),
  confidence: z.number().default(0),
});

export const AfpRelationshipSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number().default(0),
});

export const AfpRelationLinkContentSchema = z.object({
  source_message_id: z.string(),
  thread_id: z.string(),
  extracted_at: z.string(),
  entities: z.array(AfpEntityMentionSchema).default([]),
  relationships: z.array(AfpRelationshipSchema).default([]),
  extractor_version: z.string().optional(),
  target_message_id: z.string().optional(),
  link_type: z.string().optional(),
  relationship_id: z.string().optional(),
  confidence: z.number().optional(),
  source_refs: z.array(z.string()).default([]),
});

export const MessageSchema = z.object({
  protocol: z.literal('afp-v1').default('afp-v1'),
  id: z.string().default(''),
  thread_id: z.string(),
  parent_id: z.string().optional(),
  from: z.string().default(''),
  to: z.array(z.string()).default([]),
  timestamp: z.string().default(''),
  type: z.string(),
  kind: z.string().optional(),
  supertags: z.array(z.string()).default([]),
  subtype: z.string().optional(),
  content: z.record(z.any()).default({}),
  metadata: z.record(z.any()).optional(),
  signature: z.string().default(''),
  encryption: z.record(z.any()).nullable().optional(),
  views: z.array(ViewSchema).default([]),
  references: z.array(ReferenceSchema).default([]),
  typed_refs: z.array(z.record(z.any())).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  store_in_relational: z.boolean().default(false),
});

const ActionSchema = z.object({
  type: z.enum(['label', 'star', 'archive', 'move', 'share', 'forward', 'reply', 'summarise']),
  thread_id: z.string(),
  payload: z.record(z.any()).default({}),
});

export type View = z.infer<typeof ViewSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type AfpEntityMention = z.infer<typeof AfpEntityMentionSchema>;
export type AfpRelationship = z.infer<typeof AfpRelationshipSchema>;
export type AfpRelationLinkContent = z.infer<typeof AfpRelationLinkContentSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type MessageInput = z.input<typeof MessageSchema>;
export type ActionInput = z.input<typeof ActionSchema>;

// Wedding vendor email is carried as encrypted AFP content. These schemas keep
// the decrypted payload, its permitted plaintext routing metadata, and the AFP
// envelope distinct so callers cannot accidentally persist an email body in
// metadata while constructing a relay message.
export const WeddingVendorEmailParticipantSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  address: z.string().trim().email().max(320),
});

export const WeddingVendorEmailContentSchema = z.object({
  schema: z.literal('wedding_vendor_email/v1'),
  vendor_id: z.string().trim().min(1).max(256),
  direction: z.enum(['inbound', 'outbound', 'reply']),
  subject: z.string().max(998).optional(),
  text: z.string().max(1_000_000).optional(),
  html: z.string().max(1_000_000).optional(),
  from: WeddingVendorEmailParticipantSchema,
  to: z.array(WeddingVendorEmailParticipantSchema).min(1).max(50),
  provider_message_id: z.string().trim().min(1).max(512).optional(),
  internet_message_id: z.string().trim().min(1).max(998).optional(),
  in_reply_to: z.string().trim().min(1).max(998).optional(),
  references: z.array(z.string().trim().min(1).max(998)).max(100).default([]),
  received_at: z.string().datetime().optional(),
}).strict();

export const EmailReadContentSchema = z.object({
  schema_version: z.literal('email_read/v1'),
  source_message_id: z.string().trim().min(1).max(128),
  read_at: z.string().datetime(),
  actor_agent_id: z.string().trim().min(1).max(512),
}).strict();

export const EmailDeliveryStatusContentSchema = z.object({
  schema: z.literal('email_delivery_status/v1'),
  source_message_id: z.string().trim().min(1).max(128),
  status: z.enum(['accepted', 'sent', 'delivered', 'delayed', 'failed']),
  occurred_at: z.string().datetime(),
  provider_message_id: z.string().trim().min(1).max(512).optional(),
}).strict();

export const EmailBounceContentSchema = z.object({
  schema: z.literal('email_bounce/v1'),
  source_message_id: z.string().trim().min(1).max(128),
  bounce_kind: z.enum(['hard', 'soft', 'complaint']),
  occurred_at: z.string().datetime(),
  provider_message_id: z.string().trim().min(1).max(512).optional(),
  diagnostic_code: z.string().trim().min(1).max(128).optional(),
}).strict();

const OpaqueRelayValueSchema = z.string().trim().min(1).max(512)
  .refine((value) => !value.includes('@'), 'must not contain an email address');
const IdempotencyKeySchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

export const WeddingVendorEmailMetadataSchema = z.object({
  schema: z.enum([
    'wedding_vendor_email/v1',
    'email_delivery_status/v1',
    'email_bounce/v1',
  ]),
  transport: z.literal('email_relay').optional(),
  provider_event_digest: IdempotencyKeySchema.optional(),
  vendor_id: OpaqueRelayValueSchema.optional(),
  relay_thread_id: OpaqueRelayValueSchema.optional(),
  risk_classification: z.enum(['normal', 'quarantined', 'blocked']).optional(),
  idempotency_key: IdempotencyKeySchema,
}).strict();

export const EmailReadMetadataSchema = z.object({
  schema: z.literal('email_read/v1'),
  idempotency_key: IdempotencyKeySchema,
}).strict();

export const WeddingVendorEncryptedContentMarkerSchema = z.object({
  omnyid_encrypted: z.literal(true),
  scheme: z.literal('omnyid-envelope-v1'),
}).strict();

const RelaySubtypes = ['incoming', 'outgoing', 'reply', 'delivery_status', 'bounce'] as const;

export const WeddingVendorEmailEnvelopeSchema = MessageSchema.superRefine((message, ctx) => {
  if (message.type !== 'email') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relay messages must use type=email', path: ['type'] });
  }
  if (message.kind !== 'communication') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relay messages must use kind=communication', path: ['kind'] });
  }
  if (!RelaySubtypes.includes(message.subtype as (typeof RelaySubtypes)[number])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'unsupported relay subtype', path: ['subtype'] });
  }
  if (!message.supertags.includes('wedding_vendor_email')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relay supertag is required', path: ['supertags'] });
  }
  if (!WeddingVendorEncryptedContentMarkerSchema.safeParse(message.content).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relay content must be an encrypted marker', path: ['content'] });
  }
  if (!message.encryption || typeof message.encryption !== 'object') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relay encryption envelope is required', path: ['encryption'] });
  }
  const metadata = message.metadata ?? {};
  if (!WeddingVendorEmailMetadataSchema.safeParse(metadata).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'relay metadata is not allowlisted', path: ['metadata'] });
  }
});

export const EmailReadEnvelopeSchema = MessageSchema.superRefine((message, ctx) => {
  if (message.type !== 'email' || message.kind !== 'communication' || message.subtype !== 'read') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid read-event envelope' });
  }
  if (!message.parent_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'read event must name its source message', path: ['parent_id'] });
  }
  const matchingReference = message.references.some((reference) =>
    reference.type === 'message'
    && reference.target === message.parent_id
    && reference.metadata?.relation === 'read');
  if (!matchingReference) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'read event must reference its source message in the same thread', path: ['references'] });
  }
  if (!message.supertags.includes('wedding_vendor_email') || !message.supertags.includes('user_read_event')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'read-event supertags are required', path: ['supertags'] });
  }
  if (!WeddingVendorEncryptedContentMarkerSchema.safeParse(message.content).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'read content must be an encrypted marker', path: ['content'] });
  }
  if (!EmailReadMetadataSchema.safeParse(message.metadata ?? {}).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'read metadata is not allowlisted', path: ['metadata'] });
  }
});

export type WeddingVendorEmailContent = z.infer<typeof WeddingVendorEmailContentSchema>;
export type EmailReadContent = z.infer<typeof EmailReadContentSchema>;
export type EmailDeliveryStatusContent = z.infer<typeof EmailDeliveryStatusContentSchema>;
export type EmailBounceContent = z.infer<typeof EmailBounceContentSchema>;

export interface WeddingVendorEmailEnvelopeInput {
  id: string;
  thread_id: string;
  parent_id?: string;
  from: string;
  to: string[];
  timestamp: string;
  subtype: (typeof RelaySubtypes)[number];
  metadata: z.infer<typeof WeddingVendorEmailMetadataSchema>;
  encryption: Record<string, unknown>;
  signature?: string;
}

export function buildWeddingVendorEmailEnvelope(input: WeddingVendorEmailEnvelopeInput): Message {
  return WeddingVendorEmailEnvelopeSchema.parse({
    protocol: 'afp-v1',
    ...input,
    type: 'email',
    kind: 'communication',
    supertags: ['wedding_vendor_email'],
    content: { omnyid_encrypted: true, scheme: 'omnyid-envelope-v1' },
    views: [],
    references: [],
    typed_refs: [],
    attachments: [],
    store_in_relational: true,
    signature: input.signature ?? '',
  });
}

export async function weddingVendorEmailIdempotencyKey(
  namespace: string,
  stableParts: readonly string[],
): Promise<string> {
  const canonical = [namespace.trim(), ...stableParts.map((part) => part.trim())]
    .map((part) => `${part.length}:${part}`)
    .join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export interface MessageSearchFacets {
  type?: string;
  kind?: string;
  subtype?: string;
  supertags: string[];
  referenceTypes: string[];
  referenceTargets: string[];
  linkTypes: string[];
  metadataKeys: string[];
  metadataValues: string[];
}

function collectMetadataStrings(
  value: unknown,
  path: string[] = [],
  acc: { keys: Set<string>; values: Set<string> },
): void {
  if (value == null) {
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      acc.values.add(trimmed);
    }
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    acc.values.add(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMetadataStrings(item, path, acc);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = [...path, key];
      acc.keys.add(nextPath.join('.'));
      collectMetadataStrings(nested, nextPath, acc);
    }
  }
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractMessageSearchFacets(
  message: Partial<Message> & {
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): MessageSearchFacets {
  const metadataAccumulator = { keys: new Set<string>(), values: new Set<string>() };
  const contentMetadata =
    message.content && typeof message.content.metadata === 'object' && !Array.isArray(message.content.metadata)
      ? (message.content.metadata as Record<string, unknown>)
      : undefined;
  const topLevelMetadata =
    message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? message.metadata
      : undefined;

  collectMetadataStrings(topLevelMetadata, ['metadata'], metadataAccumulator);
  collectMetadataStrings(contentMetadata, ['content', 'metadata'], metadataAccumulator);

  const supertags = Array.from(
    new Set([
      ...extractStringArray(message.content?.supertags),
      ...extractStringArray(message.supertags),
      ...extractStringArray(topLevelMetadata?.supertags),
    ]),
  );
  const referenceTypes = Array.from(
    new Set(
      Array.isArray(message.references)
        ? message.references
            .map((reference) =>
              reference && typeof reference === 'object' && typeof reference.type === 'string'
                ? reference.type.trim()
                : '',
            )
            .filter(Boolean)
        : [],
    ),
  );
  const referenceTargets = Array.from(
    new Set(
      Array.isArray(message.references)
        ? message.references
            .map((reference) =>
              reference && typeof reference === 'object' && typeof reference.target === 'string'
                ? reference.target.trim()
                : '',
            )
            .filter(Boolean)
        : [],
    ),
  );
  const linkTypes = Array.from(
    new Set(
      Array.isArray(message.references)
        ? message.references
            .map((reference) =>
              reference && typeof reference === 'object' && typeof reference.metadata === 'object'
                ? (reference.metadata as Record<string, unknown>).link_type
                : undefined,
            )
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [],
    ),
  );

  return {
    type: typeof message.type === 'string' ? message.type : undefined,
    kind: typeof message.kind === 'string' ? message.kind : undefined,
    subtype: typeof message.subtype === 'string' ? message.subtype : undefined,
    supertags,
    referenceTypes,
    referenceTargets,
    linkTypes,
    metadataKeys: [...metadataAccumulator.keys],
    metadataValues: [...metadataAccumulator.values],
  };
}

export interface AgentOptions {
  signingKeyHex?: string;
  encryptionKeyHex?: string;
  encryptByDefault?: boolean;
  recipientKeys?: Record<string, string>;
  transportPreference?: 'auto' | 'http' | 'websocket' | 'webtransport';
  discoveryTrustMode?: 'strict' | 'tofu';
}

export interface RelayEvent {
  event: string;
  message_id?: string;
  thread_id?: string;
  type?: string;
  payload?: unknown;
}

export interface RelaySubscriptionHandle {
  close(): Promise<void>;
}

export interface TransportCapabilities {
  public_transport?: {
    primary?: string;
    fallback?: string;
    webtransport?: {
      enabled?: boolean;
      reason?: string;
      path?: string;
      bind_addr?: string;
    };
    websocket?: {
      enabled?: boolean;
      path?: string;
    };
    http?: {
      enabled?: boolean;
      path?: string;
    };
  };
  internal_transport?: {
    grpc_enabled?: boolean;
  };
}

const UnknownRecordSchema = z.record(z.any());
const ComparisonRowSchema = z.object({
  label: z.string(),
  values: z.array(z.string()),
});
const ApprovalDraftPreviewSchema = z.object({
  label: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  content_type: z.string().nullable().optional(),
});

export const DashboardContinuityBriefSchema = z.object({
  source_type: z.string(),
  title: z.string(),
  decision_count: z.number().int(),
  commitment_count: z.number().int(),
  critical_change_count: z.number().int(),
  suggested_actions: z.array(z.string()),
  staleness_at: z.string().nullable().optional(),
});

export const ThreadRetrievalStateSchema = z.object({
  summary: z.string(),
  badges: z.array(z.string()),
});

export const ThreadSummarySchema = z.object({
  thread_id: z.string(),
  title: z.string(),
  preview: z.string(),
  message_count: z.number().int(),
  last_message_at: z.string(),
  activity_freshness: z.string().optional(),
  dominant_kind: z.string().nullable().optional(),
  supertags: z.array(z.string()),
  metadata_terms: z.array(z.string()).optional(),
  score: z.number().int(),
});

export const ContinuityPriorityItemSchema = z.object({
  title: z.string(),
  panel_kind: z.string(),
  requires_approval: z.boolean(),
  surface_hint: z.string().nullable().optional(),
  suggested_action: z.string().nullable().optional(),
  confidence: z.string().nullable().optional(),
  prepared_draft_class: z.string().nullable().optional(),
  selection_reason: z.string().nullable().optional(),
  source_refs: z.array(z.string()),
});

export const ContinuityPriorityCardSchema = z.object({
  title: z.string(),
  description: z.string(),
  panel_kind: z.string(),
  requires_approval: z.boolean(),
  action_label: z.string(),
  surface_hint: z.string().nullable().optional(),
  confidence: z.string().nullable().optional(),
  prepared_draft_class: z.string().nullable().optional(),
  selection_reason: z.string().nullable().optional(),
  linked_target_label: z.string().nullable().optional(),
  source_refs: z.array(z.string()),
  object_refs: z.array(z.string()),
  object_labels: z.array(z.string()),
  thread_retrieval_state: ThreadRetrievalStateSchema.nullable().optional(),
});

export const ContinuityActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  urgency: z.string(),
  confidence: z.string(),
  requires_approval: z.boolean(),
  suggested_action: z.string(),
  surface_hint: z.string().nullable().optional(),
  source_refs: z.array(z.string()),
});

export const ContinuityResponseItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: z.string(),
  urgency: z.string(),
  confidence: z.string(),
  response_due_hint: z.string(),
  suggested_action: z.string(),
  prepared_draft_id: z.string().nullable().optional(),
  prepared_draft_summary: z.string().nullable().optional(),
  prepared_draft_readiness: z.string().nullable().optional(),
  prepared_draft_body: z.string().nullable().optional(),
  prepared_draft_class: z.string().nullable().optional(),
  prepared_draft_selection_reason: z.string().nullable().optional(),
  prepared_draft_available: z.boolean().optional(),
  prepared_draft_requires_approval: z.boolean().optional(),
  prepared_draft_lead_summary: z.string().nullable().optional(),
  prepared_draft_summary_lines: z.array(z.string()).optional(),
  prepared_draft_object_refs: z.array(z.string()).optional(),
  prepared_draft_object_labels: z.array(z.string()).optional(),
  prepared_draft_thread_retrieval_state: ThreadRetrievalStateSchema.nullable().optional(),
  source_refs: z.array(z.string()),
});

export const ContinuityPreparedDraftItemSchema = z.object({
  id: z.string(),
  draft_class: z.string(),
  title: z.string(),
  channel: z.string(),
  summary: z.string(),
  body: z.string(),
  confidence: z.string(),
  readiness: z.string(),
  response_due_hint: z.string(),
  requires_approval: z.boolean(),
  suggested_action: z.string(),
  selection_reason: z.string().nullable().optional(),
  source_refs: z.array(z.string()),
  object_refs: z.array(z.string()).optional(),
  object_labels: z.array(z.string()).optional(),
  comparison_headers: z.array(z.string()).optional(),
  comparison_rows: z.array(ComparisonRowSchema).optional(),
});

export const ContinuityContextPanelItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  why_surfaced: z.string(),
  confidence: z.string(),
  relation_path: z.array(z.string()),
  source_refs: z.array(z.string()),
  decrypt_needed: z.boolean(),
});

export const ContinuityWatcherSignalSchema = z.object({
  id: z.string(),
  signal_key: z.string(),
  category: z.string(),
  freshness: z.string(),
  urgency: z.string(),
  confidence: z.string(),
  urgency_hint: z.string().optional(),
  suppression_status: z.string().optional(),
  suppression_reason: z.string().optional(),
  escalation_status: z.string().optional(),
  escalation_reason: z.string().optional(),
  decrypt_needed: z.boolean().optional(),
  source_type: z.string(),
  source_subtype: z.string(),
  thread_id: z.string(),
  source_refs: z.array(z.string()),
});

export const ContinuityPreparedContextPackItemSchema = z.object({
  id: z.string(),
  pack_kind: z.string(),
  title: z.string(),
  summary: z.string(),
  confidence: z.string(),
  why_surfaced: z.string(),
  anchor_refs: z.array(z.string()),
  source_refs: z.array(z.string()),
  reference_refs: z.array(z.string()),
  reference_labels: z.array(z.string()),
  object_refs: z.array(z.string()),
  object_labels: z.array(z.string()),
  file_refs: z.array(z.string()),
  file_labels: z.array(z.string()),
  evidence_kinds: z.array(z.string()),
  thread_retrieval_state: ThreadRetrievalStateSchema.nullable().optional(),
});

export const ContinuityStateFieldItemSchema = z.object({
  field_key: z.string(),
  label: z.string(),
  status: z.string(),
  confidence: z.string(),
  surface_hint: z.string(),
  recommended_action: z.string(),
  autonomy_level: z.string(),
  reason: z.string(),
  evidence_refs: z.array(z.string()),
});

export const DashboardContinuityMessageSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  subtype: z.string(),
  content: UnknownRecordSchema,
  parsed_content: z.unknown().optional(),
  synthesizer_handoff: UnknownRecordSchema.nullable().optional(),
  metadata: UnknownRecordSchema.nullable(),
  views: z.unknown(),
});

export const ProactiveSuggestionSchema = z.object({
  id: z.string(),
  kind: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  suggested_action: z.string().optional(),
  action_label: z.string().optional(),
  confidence: z.string().optional(),
  requires_approval: z.boolean().optional(),
  destination_view: z.string().nullable().optional(),
  surface_hint: z.string().nullable().optional(),
  panel_kind: z.string().nullable().optional(),
  draft_class: z.string().optional(),
  pack_id: z.string().optional(),
  pack_kind: z.string().optional(),
  is_pack_suggestion: z.boolean().optional(),
  channel: z.string().optional(),
  readiness: z.string().optional(),
  response_due_hint: z.string().optional(),
  approval_or_reversibility_hint: z.string().nullable().optional(),
  selection_reason: z.string().nullable().optional(),
  artifact_summary_lines: z.array(z.string()).optional(),
  source_refs: z.array(z.string()).optional(),
  source_count: z.number().int().optional(),
  reference_refs: z.array(z.string()).optional(),
  reference_labels: z.array(z.string()).optional(),
  object_refs: z.array(z.string()).optional(),
  object_labels: z.array(z.string()).optional(),
  file_refs: z.array(z.string()).optional(),
  file_labels: z.array(z.string()).optional(),
  linked_target_label: z.string().nullable().optional(),
  thread_retrieval_state: ThreadRetrievalStateSchema.nullable().optional(),
  anchor_refs: z.array(z.string()).optional(),
  evidence_kinds: z.array(z.string()).optional(),
  heuristic_family_id: z.string().optional(),
  outcome_feedback: UnknownRecordSchema.optional(),
  comparison_headers: z.array(z.string()).optional(),
  comparison_rows: z.array(ComparisonRowSchema).optional(),
  approval_kind: z.string().nullable().optional(),
  draft_preview: ApprovalDraftPreviewSchema.nullable().optional(),
  preview_only: z.boolean().optional(),
  preview_boundary_summary: z.string().nullable().optional(),
});

export const ContinuityStateResponseSchema = z.object({
  latest_state_snapshot_ref: z.string().nullable().optional(),
  latest_state_synthesis_ref: z.string().nullable().optional(),
  latest_state_snapshot: DashboardContinuityMessageSchema.nullable().optional(),
  latest_state_synthesis: DashboardContinuityMessageSchema.nullable().optional(),
  preferred_state_type: z.string(),
  preferred_state_brief: DashboardContinuityBriefSchema.nullable().optional(),
  preferred_synthesizer_handoff: UnknownRecordSchema.nullable().optional(),
  preferred_priority_item: ContinuityPriorityItemSchema.nullable().optional(),
  preferred_priority_card: ContinuityPriorityCardSchema.nullable().optional(),
  preferred_action_items: z.array(ContinuityActionItemSchema),
  preferred_response_items: z.array(ContinuityResponseItemSchema),
  preferred_prepared_draft_items: z.array(ContinuityPreparedDraftItemSchema),
  preferred_context_panel_items: z.array(ContinuityContextPanelItemSchema),
  preferred_context_pack_items: z.array(ContinuityPreparedContextPackItemSchema),
  preferred_state_fields: z.array(ContinuityStateFieldItemSchema),
});

export const ContinuitySummaryResponseSchema = z.object({
  messages: z.array(UnknownRecordSchema),
  state: ContinuityStateResponseSchema,
  latest_state_snapshot_ref: z.string().nullable().optional(),
  preferred_state_brief: DashboardContinuityBriefSchema.nullable().optional(),
  preferred_synthesizer_handoff: UnknownRecordSchema.nullable().optional(),
  preferred_priority_item: ContinuityPriorityItemSchema.nullable().optional(),
  preferred_priority_card: ContinuityPriorityCardSchema.nullable().optional(),
  preferred_action_items: z.array(ContinuityActionItemSchema),
  preferred_response_items: z.array(ContinuityResponseItemSchema),
  preferred_prepared_draft_items: z.array(ContinuityPreparedDraftItemSchema),
  preferred_context_panel_items: z.array(ContinuityContextPanelItemSchema),
  preferred_context_pack_items: z.array(ContinuityPreparedContextPackItemSchema),
  preferred_state_fields: z.array(ContinuityStateFieldItemSchema),
});

export const DashboardBootstrapResponseSchema = z.object({
  user: UnknownRecordSchema,
  agents: z.array(UnknownRecordSchema),
  messages: z.array(MessageSchema),
  thread_summaries: z.array(ThreadSummarySchema),
  thread_retrieval_state: ThreadRetrievalStateSchema.nullable().optional(),
  continuity_state: DashboardContinuityMessageSchema.nullable().optional(),
  continuity_brief: DashboardContinuityBriefSchema.nullable().optional(),
  continuity_handoff: UnknownRecordSchema.nullable().optional(),
  continuity_primary_mode: z.string().optional(),
  continuity_priority_item: ContinuityPriorityItemSchema.nullable().optional(),
  continuity_priority_card: ContinuityPriorityCardSchema.nullable().optional(),
  continuity_action_items: z.array(ContinuityActionItemSchema),
  continuity_response_items: z.array(ContinuityResponseItemSchema),
  continuity_prepared_draft_items: z.array(ContinuityPreparedDraftItemSchema),
  continuity_context_panel_items: z.array(ContinuityContextPanelItemSchema),
  continuity_context_pack_items: z.array(ContinuityPreparedContextPackItemSchema),
  continuity_state_fields: z.array(ContinuityStateFieldItemSchema),
  proactive_suggestions: z.array(ProactiveSuggestionSchema),
});

const ObjectFacetMoveEntrySchema = z.object({
  value: z.string(),
  count: z.number().int(),
  score: z.number(),
  rationale: z.string(),
});

const ThreadFacetSuggestionEntrySchema = z.object({
  value: z.string(),
  count: z.number().int(),
});

const ThreadFacetMoveEntrySchema = z.object({
  value: z.string(),
  count: z.number().int(),
  score: z.number(),
  rationale: z.string(),
});

export const ObjectMessagesResponseSchema = z.object({
  query: z.string().optional(),
  free_text: z.string().optional(),
  facet_suggestions: z.object({
    kinds: z.array(z.object({ value: z.string(), count: z.number().int() })),
    tags: z.array(z.object({ value: z.string(), count: z.number().int() })),
    reference_targets: z.array(z.object({ value: z.string(), count: z.number().int() })),
    reference_types: z.array(z.object({ value: z.string(), count: z.number().int() })),
    link_types: z.array(z.object({ value: z.string(), count: z.number().int() })),
    metadata_terms: z.array(z.object({ value: z.string(), count: z.number().int() })),
  }).optional(),
  facet_next_moves: z.object({
    kinds: z.array(ObjectFacetMoveEntrySchema),
    tags: z.array(ObjectFacetMoveEntrySchema),
    reference_targets: z.array(ObjectFacetMoveEntrySchema),
    reference_types: z.array(ObjectFacetMoveEntrySchema),
    link_types: z.array(ObjectFacetMoveEntrySchema),
    metadata_terms: z.array(ObjectFacetMoveEntrySchema),
  }).optional(),
  retrieval_state: ThreadRetrievalStateSchema.optional(),
  count: z.number().int(),
  messages: z.array(MessageSchema),
});

export const ThreadSummariesResponseSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()),
  reference_targets: z.array(z.string()).optional(),
  metadata_values: z.array(z.string()).optional(),
  metadata_terms: z.array(z.string()).optional(),
  kind: z.string().optional(),
  match: z.enum(["all", "any"]).optional(),
  facet_suggestions: z.object({
    kinds: z.array(ThreadFacetSuggestionEntrySchema),
    tags: z.array(ThreadFacetSuggestionEntrySchema),
    metadata_terms: z.array(ThreadFacetSuggestionEntrySchema).optional(),
  }).optional(),
  facet_next_moves: z.object({
    kinds: z.array(ThreadFacetMoveEntrySchema),
    tags: z.array(ThreadFacetMoveEntrySchema),
    metadata_terms: z.array(ThreadFacetMoveEntrySchema).optional(),
  }).optional(),
  retrieval_state: ThreadRetrievalStateSchema.optional(),
  count: z.number().int(),
  thread_summaries: z.array(ThreadSummarySchema),
});

export interface DashboardContinuityBrief {
  source_type: string;
  title: string;
  decision_count: number;
  commitment_count: number;
  critical_change_count: number;
  suggested_actions: string[];
  staleness_at?: string | null;
}

export interface ContinuityPriorityItem {
  title: string;
  panel_kind: string;
  requires_approval: boolean;
  surface_hint?: string | null;
  suggested_action?: string | null;
  confidence?: string | null;
  prepared_draft_class?: string | null;
  selection_reason?: string | null;
  source_refs: string[];
}

export interface ContinuityPriorityCard {
  title: string;
  description: string;
  panel_kind: string;
  requires_approval: boolean;
  action_label: string;
  surface_hint?: string | null;
  confidence?: string | null;
  prepared_draft_class?: string | null;
  selection_reason?: string | null;
  linked_target_label?: string | null;
  source_refs: string[];
  object_refs: string[];
  object_labels: string[];
  thread_retrieval_state?: ThreadRetrievalState | null;
}

export interface ContinuityActionItem {
  id: string;
  title: string;
  category: string;
  urgency: string;
  confidence: string;
  requires_approval: boolean;
  suggested_action: string;
  source_refs: string[];
}

export interface ContinuityResponseItem {
  id: string;
  title: string;
  channel: string;
  urgency: string;
  confidence: string;
  response_due_hint: string;
  suggested_action: string;
  prepared_draft_id?: string | null;
  prepared_draft_summary?: string | null;
  prepared_draft_readiness?: string | null;
  prepared_draft_body?: string | null;
  prepared_draft_class?: string | null;
  prepared_draft_selection_reason?: string | null;
  prepared_draft_available?: boolean;
  prepared_draft_requires_approval?: boolean;
  prepared_draft_lead_summary?: string | null;
  prepared_draft_summary_lines?: string[];
  prepared_draft_object_refs?: string[];
  prepared_draft_object_labels?: string[];
  prepared_draft_thread_retrieval_state?: ThreadRetrievalState | null;
  source_refs: string[];
}

export interface ContinuityPreparedDraftItem {
  id: string;
  draft_class: string;
  title: string;
  channel: string;
  summary: string;
  body: string;
  confidence: string;
  readiness: string;
  response_due_hint: string;
  requires_approval: boolean;
  suggested_action: string;
  selection_reason?: string | null;
  source_refs: string[];
  object_refs?: string[];
  object_labels?: string[];
  comparison_headers?: string[];
  comparison_rows?: Array<{ label: string; values: string[] }>;
}

export interface ContinuityContextPanelItem {
  id: string;
  label: string;
  why_surfaced: string;
  confidence: string;
  relation_path: string[];
  source_refs: string[];
  decrypt_needed: boolean;
}

export interface ContinuityWatcherSignal {
  id: string;
  signal_key: string;
  category: string;
  freshness: string;
  urgency: string;
  confidence: string;
  urgency_hint?: string;
  suppression_status?: string;
  suppression_reason?: string;
  escalation_status?: string;
  escalation_reason?: string;
  decrypt_needed?: boolean;
  source_type: string;
  source_subtype: string;
  thread_id: string;
  source_refs: string[];
}

export interface ContinuityPreparedContextPackItem {
  id: string;
  pack_kind: string;
  title: string;
  summary: string;
  confidence: string;
  why_surfaced: string;
  anchor_refs: string[];
  source_refs: string[];
  reference_refs: string[];
  reference_labels: string[];
  object_refs: string[];
  object_labels: string[];
  file_refs: string[];
  file_labels: string[];
  evidence_kinds: string[];
  thread_retrieval_state?: ThreadRetrievalState | null;
}

export interface ThreadRetrievalState {
  summary: string;
  badges: string[];
}

export interface ObjectFacetSuggestionEntry {
  value: string;
  count: number;
}

export interface ObjectFacetMoveEntry extends ObjectFacetSuggestionEntry {
  score: number;
  rationale: string;
}

export interface ObjectMessagesResponse {
  query?: string;
  free_text?: string;
  facet_suggestions?: {
    kinds: ObjectFacetSuggestionEntry[];
    tags: ObjectFacetSuggestionEntry[];
    reference_targets: ObjectFacetSuggestionEntry[];
    reference_types: ObjectFacetSuggestionEntry[];
    link_types: ObjectFacetSuggestionEntry[];
    metadata_terms: ObjectFacetSuggestionEntry[];
  };
  facet_next_moves?: {
    kinds: ObjectFacetMoveEntry[];
    tags: ObjectFacetMoveEntry[];
    reference_targets: ObjectFacetMoveEntry[];
    reference_types: ObjectFacetMoveEntry[];
    link_types: ObjectFacetMoveEntry[];
    metadata_terms: ObjectFacetMoveEntry[];
  };
  retrieval_state?: ThreadRetrievalState;
  count: number;
  messages: Message[];
}

export interface ThreadSummary {
  thread_id: string;
  title: string;
  preview: string;
  message_count: number;
  last_message_at: string;
  activity_freshness?: string;
  dominant_kind?: string | null;
  supertags: string[];
  metadata_terms?: string[];
  score: number;
}

export interface ThreadSummariesResponse {
  query?: string;
  tags: string[];
  reference_targets?: string[];
  metadata_values?: string[];
  metadata_terms?: string[];
  kind?: string;
  match?: "all" | "any";
  facet_suggestions?: {
    kinds: ObjectFacetSuggestionEntry[];
    tags: ObjectFacetSuggestionEntry[];
    metadata_terms?: ObjectFacetSuggestionEntry[];
  };
  facet_next_moves?: {
    kinds: ObjectFacetMoveEntry[];
    tags: ObjectFacetMoveEntry[];
    metadata_terms?: ObjectFacetMoveEntry[];
  };
  retrieval_state?: ThreadRetrievalState;
  count: number;
  thread_summaries: ThreadSummary[];
}

export interface ContinuityStateFieldItem {
  field_key: string;
  label: string;
  status: string;
  confidence: string;
  surface_hint: string;
  recommended_action: string;
  autonomy_level: string;
  reason: string;
  evidence_refs: string[];
}

export interface DashboardContinuityMessage {
  id: string;
  thread_id: string;
  timestamp: string;
  type: string;
  subtype: string;
  content: Record<string, unknown>;
  parsed_content?: unknown;
  synthesizer_handoff?: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  views: unknown;
}

export interface ApprovalDraftPreview {
  label?: string | null;
  content?: string | null;
  content_type?: 'text' | 'code' | string | null;
}

export interface ProactiveSuggestion {
  id: string;
  kind?: string;
  title?: string;
  description?: string;
  suggested_action?: string;
  action_label?: string;
  confidence?: string;
  requires_approval?: boolean;
  destination_view?: string | null;
  surface_hint?: string | null;
  panel_kind?: string | null;
  draft_class?: string;
  pack_id?: string;
  pack_kind?: string;
  is_pack_suggestion?: boolean;
  channel?: string;
  readiness?: string;
  response_due_hint?: string;
  approval_or_reversibility_hint?: string | null;
  selection_reason?: string | null;
  artifact_summary_lines?: string[];
  source_refs?: string[];
  source_count?: number;
  reference_refs?: string[];
  reference_labels?: string[];
  linked_target_label?: string | null;
  thread_retrieval_state?: ThreadRetrievalState | null;
  anchor_refs?: string[];
  evidence_kinds?: string[];
  heuristic_family_id?: string;
  outcome_feedback?: Record<string, unknown>;
  comparison_headers?: string[];
  comparison_rows?: Array<{ label: string; values: string[] }>;
  approval_kind?: string | null;
  draft_preview?: ApprovalDraftPreview | null;
  preview_only?: boolean;
  preview_boundary_summary?: string | null;
}

export interface ContinuitySummaryResponse {
  messages: Record<string, unknown>[];
  state: {
    latest_state_snapshot_ref?: string | null;
    latest_state_synthesis_ref?: string | null;
    latest_state_snapshot?: DashboardContinuityMessage | null;
    latest_state_synthesis?: DashboardContinuityMessage | null;
    preferred_state_type: string;
    preferred_state_brief?: DashboardContinuityBrief | null;
    preferred_synthesizer_handoff?: Record<string, unknown> | null;
    preferred_priority_item?: ContinuityPriorityItem | null;
    preferred_priority_card?: ContinuityPriorityCard | null;
    preferred_action_items: ContinuityActionItem[];
    preferred_response_items: ContinuityResponseItem[];
    preferred_prepared_draft_items: ContinuityPreparedDraftItem[];
    preferred_context_panel_items: ContinuityContextPanelItem[];
    preferred_context_pack_items: ContinuityPreparedContextPackItem[];
    preferred_state_fields: ContinuityStateFieldItem[];
  };
  latest_state_snapshot_ref?: string | null;
  preferred_state_brief?: DashboardContinuityBrief | null;
  preferred_synthesizer_handoff?: Record<string, unknown> | null;
  preferred_priority_item?: ContinuityPriorityItem | null;
  preferred_priority_card?: ContinuityPriorityCard | null;
  preferred_action_items: ContinuityActionItem[];
  preferred_response_items: ContinuityResponseItem[];
  preferred_prepared_draft_items: ContinuityPreparedDraftItem[];
  preferred_context_panel_items: ContinuityContextPanelItem[];
  preferred_context_pack_items: ContinuityPreparedContextPackItem[];
  preferred_state_fields: ContinuityStateFieldItem[];
}

export interface DashboardBootstrapResponse {
  user: Record<string, unknown>;
  agents: Record<string, unknown>[];
  messages: Message[];
  thread_summaries: ThreadSummary[];
  thread_retrieval_state?: ThreadRetrievalState | null;
  continuity_state?: DashboardContinuityMessage | null;
  continuity_brief?: DashboardContinuityBrief | null;
  continuity_primary_mode?: string;
  continuity_priority_item?: ContinuityPriorityItem | null;
  continuity_priority_card?: ContinuityPriorityCard | null;
  continuity_action_items: ContinuityActionItem[];
  continuity_response_items: ContinuityResponseItem[];
  continuity_prepared_draft_items: ContinuityPreparedDraftItem[];
  continuity_context_panel_items: ContinuityContextPanelItem[];
  continuity_context_pack_items: ContinuityPreparedContextPackItem[];
  continuity_state_fields: ContinuityStateFieldItem[];
  proactive_suggestions: ProactiveSuggestion[];
}

export function parseContinuitySummaryResponse(input: unknown): ContinuitySummaryResponse {
  return ContinuitySummaryResponseSchema.parse(input) as ContinuitySummaryResponse;
}

export function parseDashboardBootstrapResponse(input: unknown): DashboardBootstrapResponse {
  return DashboardBootstrapResponseSchema.parse(input) as DashboardBootstrapResponse;
}

export function parseObjectMessagesResponse(input: unknown): ObjectMessagesResponse {
  return ObjectMessagesResponseSchema.parse(input) as ObjectMessagesResponse;
}

export function parseThreadSummariesResponse(input: unknown): ThreadSummariesResponse {
  return ThreadSummariesResponseSchema.parse(input) as ThreadSummariesResponse;
}

type Sodium = typeof import('libsodium-wrappers');
type TransportPreference = NonNullable<AgentOptions['transportPreference']>;

let sodiumReadyPromise: Promise<Sodium> | null = null;

async function loadSodium(): Promise<Sodium> {
  if (!sodiumReadyPromise) {
    sodiumReadyPromise = import('libsodium-wrappers').then(async (module) => {
      const sodium = (module.default ?? module) as Sodium;
      await sodium.ready;
      return sodium;
    });
  }
  return sodiumReadyPromise;
}

type WebTransportLike = {
  ready: Promise<unknown>;
  closed: Promise<unknown>;
  close?: (options?: { closeCode?: number; reason?: string }) => void;
  createBidirectionalStream?: () => Promise<WritableReadablePair>;
};

type WritableReadablePair = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type WebTransportConstructorLike = new (url: string) => WebTransportLike;

function generateId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

function isoNow() {
  return new Date().toISOString();
}

function readEnv(name: string): string {
  const scope = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return scope.process?.env?.[name]?.trim() ?? '';
}

function canonicalJson(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJson((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function isEncryptedPlaceholder(content: Record<string, unknown>) {
  return content.omnyid_encrypted === true;
}

function encryptionAad(message: Message) {
  return canonicalJson({
    protocol: message.protocol,
    id: message.id,
    thread_id: message.thread_id,
    parent_id: message.parent_id ?? '',
    from: message.from,
    to: message.to,
    timestamp: message.timestamp,
    type: message.type,
  });
}

function encryptionAadFromObject(message: Record<string, unknown>) {
  return canonicalJson({
    protocol: message.protocol ?? 'afp-v1',
    id: message.id ?? '',
    thread_id: message.thread_id ?? '',
    parent_id: message.parent_id ?? '',
    from: message.from ?? '',
    to: Array.isArray(message.to) ? message.to : [],
    timestamp: message.timestamp ?? '',
    type: message.type ?? '',
  });
}

function agentCardSignablePayload(card: Record<string, unknown>) {
  return [
    String(card.protocol ?? 'afp-v1'),
    String(card.agent_id ?? ''),
    String(card.key_id ?? ''),
    canonicalJson(Array.isArray(card.previous_key_ids) ? card.previous_key_ids : []),
    String(card.public_key_hex ?? ''),
    String(card.homeserver_url ?? ''),
    canonicalJson(Array.isArray(card.capabilities) ? card.capabilities : []),
    String(card.timestamp ?? ''),
  ].join('\n');
}

function resolveEncryptByDefault(input: boolean | undefined, hasEncryptionKey: boolean) {
  if (typeof input === 'boolean') {
    return input;
  }

  const envValue = readEnv('OMNYID_ENCRYPT_BY_DEFAULT').toLowerCase();
  if (['1', 'true', 'yes'].includes(envValue)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(envValue)) {
    return false;
  }

  return hasEncryptionKey;
}

export class Agent {
  private url: string;
  private agentId: string;
  private signingKeyHex: string;
  private encryptionKeyHex: string;
  private encryptByDefault: boolean;
  private recipientKeys: Record<string, string>;
  private sodiumReady: Promise<Sodium>;
  private transportPreference: TransportPreference;
  private discoveryTrustMode: 'strict' | 'tofu';

  constructor(
    homeserverUrl = 'http://localhost:8080',
    agentId = 'agent:you@yourdomain.ai',
    options: AgentOptions = {},
  ) {
    this.url = homeserverUrl.replace(/\/+$/, '');
    this.agentId = agentId;
    this.signingKeyHex = options.signingKeyHex ?? readEnv('OMNYID_SIGNING_KEY_HEX');
    this.encryptionKeyHex = options.encryptionKeyHex ?? readEnv('OMNYID_ENCRYPTION_KEY_HEX');
    this.encryptByDefault = resolveEncryptByDefault(
      options.encryptByDefault,
      Boolean(this.encryptionKeyHex || this.signingKeyHex),
    );
    this.recipientKeys = this.loadRecipientKeys(options.recipientKeys);
    this.sodiumReady = loadSodium();
    this.transportPreference = this.resolveTransportPreference(options.transportPreference);
    this.discoveryTrustMode = this.resolveDiscoveryTrustMode(options.discoveryTrustMode);
  }

  async send(input: MessageInput) {
    const sodiumLib = await this.sodiumReady;
    const msg = MessageSchema.parse(input);
    const payload: Message = {
      ...msg,
      id: msg.id || generateId('msg'),
      timestamp: msg.timestamp || isoNow(),
      from: msg.from || this.agentId,
    };

    await this.ensureRecipientKeys(payload);

    if (this.shouldEncrypt(payload)) {
      const plaintext = payload.content;
      payload.encryption = this.encryptContent(sodiumLib, payload, plaintext);
      payload.content = {
        omnyid_encrypted: true,
        scheme: 'omnyid-envelope-v1',
      };
    }

    if (this.signingKeyHex) {
      payload.signature = this.signMessage(sodiumLib, payload);
    }

    const transportPlan = await this.resolveSendTransportPlan();
    for (const transport of transportPlan) {
      try {
        if (transport === 'webtransport') {
          return await this.sendViaWebTransport(payload);
        }
        if (transport === 'websocket') {
          return await this.sendViaWebSocket(payload);
        }
        return await this.sendViaHttp(payload);
      } catch {
        continue;
      }
    }

    throw new Error('Omnyid transport fallback chain exhausted');
  }

  async act(input: ActionInput) {
    const action = ActionSchema.parse(input);
    return this.send({
      thread_id: action.thread_id,
      type: `action_${action.type}`,
      content: action.payload,
      views: [
        {
          format: 'system',
          content: action,
          priority: 0,
        },
      ],
    });
  }

  async label(threadId: string, labels: string[]) {
    return this.act({ type: 'label', thread_id: threadId, payload: { labels } });
  }

  async star(threadId: string) {
    return this.act({ type: 'star', thread_id: threadId, payload: {} });
  }

  async archive(threadId: string) {
    return this.act({ type: 'archive', thread_id: threadId, payload: {} });
  }

  async move(threadId: string, destination: string) {
    return this.act({
      type: 'move',
      thread_id: threadId,
      payload: { destination },
    });
  }

  async share(threadId: string, to: string[]) {
    return this.act({ type: 'share', thread_id: threadId, payload: { to } });
  }

  async forward(threadId: string, to: string[], note = '') {
    const payload: Record<string, unknown> = { to };
    if (note) {
      payload.note = note;
    }
    return this.act({ type: 'forward', thread_id: threadId, payload });
  }

  async reply(
    threadId: string,
    body: string,
    options: {
      to?: string[];
      subject?: string;
      in_reply_to?: string;
      references?: string[];
    } = {},
  ) {
    return this.act({
      type: 'reply',
      thread_id: threadId,
      payload: {
        body,
        ...options,
      },
    });
  }

  async summarise(threadId: string, style = 'brief') {
    return this.act({
      type: 'summarise',
      thread_id: threadId,
      payload: { style },
    });
  }

  async getThread(threadId: string) {
    const sodiumLib = await this.sodiumReady;
    const res = await fetch(`${this.url}/thread/${threadId}`);
    const messages = (await res.json()) as Record<string, unknown>[];
    return messages.map((message) => this.decryptMessageContent(sodiumLib, message));
  }

  async discover(domainUrl: string) {
    const domain = domainUrl.replace(/\/+$/, '');
    const cardBaseUrl = await this.resolveDiscoveryBaseUrl(domain);
    const res = await fetch(`${cardBaseUrl}/.well-known/agent-card`);
    return res.json();
  }

  async discoverVerified(domainUrl: string) {
    const sodiumLib = await this.sodiumReady;
    const card = (await this.discover(domainUrl)) as Record<string, unknown>;
    if (!this.verifyAgentCard(sodiumLib, card)) {
      throw new Error('Invalid or unsigned Omnyid AgentCard');
    }
    if (!this.agentCardMatchesRequestedDomain(card, domainUrl)) {
      if (this.discoveryTrustMode !== 'tofu') {
        throw new Error('Discovered AgentCard does not match requested domain');
      }
      if (!this.canTrustOnFirstUse(card)) {
        throw new Error(
          'TOFU discovery rejected because the AgentCard key conflicts with cached identity',
        );
      }
    } else if (!this.canTrustOnFirstUse(card)) {
      throw new Error('Discovered AgentCard key conflicts with cached identity');
    }
    this.rememberAgentCard(card);
    return card;
  }

  async discoverDelegation(domainUrl: string) {
    const domain = domainUrl.replace(/\/+$/, '');
    const res = await fetch(`${domain}/.well-known/afp-delegation`);
    if (res.status === 404) {
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async getTransportCapabilities() {
    const res = await fetch(`${this.url}/transport/capabilities`);
    return (await res.json()) as TransportCapabilities;
  }

  /**
   * Execute a typed integration action against an external endpoint.
   *
   * The homeserver validates `capability.approval_mode`, fires the HTTP call
   * (if autonomous), stores AFP intent + result messages into the thread, and
   * returns the structured result.
   */
  async executeCapability(options: {
    capability: {
      capability_id: string;
      provider: string;
      operation: string;
      transport: 'rest' | 'graphql' | 'browser_automation';
      scopes: string[];
      approval_mode: 'autonomous' | 'suggest_only' | 'human_approval_required';
      secret_refs: string[];
      metadata?: unknown;
    };
    intent: {
      capability_id: string;
      thread_id: string;
      requested_by: string;
      input: unknown;
      reason?: string;
    };
    url: string;
    method?: string;
    bearer_token?: string;
  }) {
    const res = await fetch(`${this.url}/actions/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...options,
        method: options.method ?? 'POST',
      }),
    });
    return res.json() as Promise<{
      status: string;
      capability_id: string;
      thread_id: string;
      intent_message_id: string;
      result_message_id: string;
      output: unknown;
      external_reference: string | null;
    }>;
  }

  /**
   * Request a server-side Ed25519 key rotation.
   * Returns new key material. The operator must update OMNYID_SIGNING_KEY_HEX
   * and restart the homeserver for the rotation to take effect.
   */
  async rotateKey(reason?: string) {
    const res = await fetch(`${this.url}/keys/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    return res.json() as Promise<{
      event_id: string;
      agent_id: string;
      old_key_id: string;
      new_key_id: string;
      new_public_key_hex: string;
      new_private_key_hex: string;
      action_required: string;
    }>;
  }

  private async upsertPeerKeyServerSide(card: Record<string, unknown>) {
    const { agent_id, key_id, public_key_hex, homeserver_url, previous_key_ids } = card;
    if (!agent_id || !key_id || !public_key_hex) return;
    try {
      await fetch(`${this.url}/keys/peer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id,
          key_id,
          public_key_hex,
          homeserver_url: homeserver_url ?? '',
          previous_key_ids: previous_key_ids ?? [],
        }),
      });
    } catch {
      // Best-effort; local in-memory cache is the primary path
    }
  }

  subscribeRelay(onEvent: (event: RelayEvent) => void) {
    const socket = new WebSocket(this.relayUrl());
    socket.addEventListener('message', (messageEvent) => {
      const raw = String(messageEvent.data);
      try {
        onEvent(JSON.parse(raw) as RelayEvent);
      } catch {
        onEvent({ event: 'raw', payload: raw });
      }
    });
    return socket;
  }

  subscribeThread(
    threadId: string,
    onEvent: (event: RelayEvent & { messages?: unknown[] }) => void,
    includeSnapshot = true,
  ) {
    const socket = new WebSocket(this.relayUrl());
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          op: 'subscribe_thread',
          thread_id: threadId,
          include_snapshot: includeSnapshot,
        }),
      );
    });
    socket.addEventListener('message', (messageEvent) => {
      const raw = String(messageEvent.data);
      try {
        onEvent(JSON.parse(raw) as RelayEvent & { messages?: unknown[] });
      } catch {
        onEvent({ event: 'raw', payload: raw });
      }
    });
    return socket;
  }

  async openThreadSubscription(
    threadId: string,
    onEvent: (event: RelayEvent & { messages?: unknown[] }) => void,
    includeSnapshot = true,
  ): Promise<RelaySubscriptionHandle> {
    const plan = await this.resolveSendTransportPlan();
    for (const transport of plan) {
      try {
        if (transport === 'webtransport') {
          return await this.subscribeThreadViaWebTransport(threadId, onEvent, includeSnapshot);
        }
        if (transport === 'websocket') {
          const socket = this.subscribeThread(threadId, onEvent, includeSnapshot);
          return {
            async close() {
              socket.close();
            },
          };
        }
      } catch {
        continue;
      }
    }

    throw new Error('No supported realtime transport is available for thread subscription');
  }

  private async ensureRecipientKeys(message: Message) {
    for (const agentId of this.recipientAgentIds(message)) {
      if (agentId === this.agentId || this.recipientKeys[agentId]) {
        continue;
      }

      const domainUrl = this.agentDomainUrl(agentId);
      if (!domainUrl) {
        continue;
      }

      try {
        const card = await this.discoverVerified(domainUrl);
        void this.upsertPeerKeyServerSide(card);
      } catch {
        continue;
      }
    }
  }

  private shouldEncrypt(message: Message) {
    if (!this.encryptByDefault) {
      return false;
    }

    if (message.encryption) {
      return false;
    }

    return !isEncryptedPlaceholder(message.content);
  }

  private encryptContent(
    sodiumLib: Sodium,
    message: Message,
    content: Record<string, unknown>,
  ): Record<string, unknown> {
    const recipientEnvelope = this.encryptContentForRecipients(sodiumLib, message, content);
    if (recipientEnvelope) {
      return recipientEnvelope;
    }

    if (!this.encryptionKeyHex) {
      throw new Error(
        'Omnyid encryption requires either OMNYID_ENCRYPTION_KEY_HEX or known recipient keys',
      );
    }

    const key = this.loadEncryptionKey(sodiumLib);
    const nonce = sodiumLib.randombytes_buf(
      sodiumLib.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const ciphertext = sodiumLib.crypto_aead_xchacha20poly1305_ietf_encrypt(
      canonicalJson(content),
      encryptionAad(message),
      null,
      nonce,
      key,
    );

    return {
      scheme: 'omnyid-envelope-v1',
      algorithm: 'xchacha20poly1305-ietf',
      mode: 'shared-key',
      nonce: sodiumLib.to_base64(nonce, sodiumLib.base64_variants.ORIGINAL),
      ciphertext: sodiumLib.to_base64(ciphertext, sodiumLib.base64_variants.ORIGINAL),
    };
  }

  private decryptMessageContent(sodiumLib: Sodium, message: Record<string, unknown>) {
    const envelope = message.encryption;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return message;
    }

    const typedEnvelope = envelope as Record<string, unknown>;
    if (typedEnvelope.scheme !== 'omnyid-envelope-v1') {
      return message;
    }
    if (typedEnvelope.algorithm !== 'xchacha20poly1305-ietf') {
      return message;
    }
    if (typeof typedEnvelope.nonce !== 'string' || typeof typedEnvelope.ciphertext !== 'string') {
      return message;
    }

    try {
      const key =
        this.unwrapContentKey(sodiumLib, message, typedEnvelope) ??
        (this.encryptionKeyHex ? this.loadEncryptionKey(sodiumLib) : null);
      if (!key) {
        return message;
      }
      const nonce = sodiumLib.from_base64(
        typedEnvelope.nonce,
        sodiumLib.base64_variants.ORIGINAL,
      );
      const ciphertext = sodiumLib.from_base64(
        typedEnvelope.ciphertext,
        sodiumLib.base64_variants.ORIGINAL,
      );
      const plaintext = sodiumLib.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        encryptionAadFromObject(message),
        nonce,
        key,
      );
      const decrypted = JSON.parse(sodiumLib.to_string(plaintext));

      return {
        ...message,
        content: decrypted,
        content_encrypted: true,
      };
    } catch {
      return message;
    }
  }

  private signMessage(sodiumLib: Sodium, message: Message) {
    const seed = this.loadSigningSeed(sodiumLib);
    const keyPair = sodiumLib.crypto_sign_seed_keypair(seed);
    const signable = this.signablePayload(message);
    const signature = sodiumLib.crypto_sign_detached(signable, keyPair.privateKey);
    const publicKeyHex = sodiumLib.to_hex(keyPair.publicKey);
    const signatureBase64 = sodiumLib.to_base64(
      signature,
      sodiumLib.base64_variants.ORIGINAL,
    );
    return `ed25519:${publicKeyHex}:${signatureBase64}`;
  }

  private rememberAgentCard(card: Record<string, unknown>) {
    if (
      typeof card.agent_id === 'string' &&
      typeof card.public_key_hex === 'string' &&
      typeof card.key_id === 'string' &&
      Boolean(card.key_id.trim()) &&
      this.parseAgentId(card.agent_id)
    ) {
      this.recipientKeys[card.agent_id] = card.public_key_hex;
    }
  }

  private verifyAgentCard(sodiumLib: Sodium, card: Record<string, unknown>) {
    if (typeof card.agent_id !== 'string' || !this.parseAgentId(card.agent_id)) {
      return false;
    }
    if (typeof card.key_id !== 'string' || !card.key_id.trim()) {
      return false;
    }
    if (
      !Array.isArray(card.previous_key_ids) ||
      card.previous_key_ids.some((value) => typeof value !== 'string')
    ) {
      return false;
    }

    if (typeof card.signature !== 'string' || typeof card.public_key_hex !== 'string') {
      return false;
    }

    const parts = card.signature.split(':', 3);
    if (parts.length !== 3 || parts[0] !== 'ed25519') {
      return false;
    }

    const [, signaturePublicKeyHex, signatureBase64] = parts;
    if (signaturePublicKeyHex !== card.public_key_hex) {
      return false;
    }

    try {
      const publicKey = sodiumLib.from_hex(card.public_key_hex);
      const signature = sodiumLib.from_base64(
        signatureBase64,
        sodiumLib.base64_variants.ORIGINAL,
      );
      return sodiumLib.crypto_sign_verify_detached(
        signature,
        agentCardSignablePayload(card),
        publicKey,
      );
    } catch {
      return false;
    }
  }

  private signablePayload(message: Message) {
    return [
      message.protocol,
      message.id,
      message.thread_id,
      message.parent_id ?? '',
      message.from,
      canonicalJson(message.to),
      message.timestamp,
      message.type,
      canonicalJson(message.content),
      canonicalJson(message.encryption ?? {}),
      canonicalJson(message.views),
      canonicalJson(message.references),
      canonicalJson(message.attachments),
      String(message.store_in_relational).toLowerCase(),
    ].join('\n');
  }

  private loadSigningSeed(sodiumLib: Sodium) {
    const seed = sodiumLib.from_hex(this.signingKeyHex);
    if (seed.length !== sodiumLib.crypto_sign_SEEDBYTES) {
      throw new Error('OMNYID signing key must be a 32-byte Ed25519 seed in hex form');
    }
    return seed;
  }

  private loadEncryptionKey(sodiumLib: Sodium) {
    const key = sodiumLib.from_hex(this.encryptionKeyHex);
    if (key.length !== sodiumLib.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
      throw new Error('OMNYID encryption key must be a 32-byte key in hex form');
    }
    return key;
  }

  private loadRecipientKeys(input: Record<string, string> | undefined) {
    if (input) {
      return { ...input };
    }

    const raw = readEnv('OMNYID_RECIPIENT_KEYS_JSON');
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OMNYID_RECIPIENT_KEYS_JSON must decode to a JSON object');
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  }

  private encryptContentForRecipients(
    sodiumLib: Sodium,
    message: Message,
    content: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!this.signingKeyHex) {
      return null;
    }

    const contentKey = sodiumLib.randombytes_buf(
      sodiumLib.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    );
    const recipients = this.recipientAgentIds(message).map((agentId) => {
      const publicKeyHex = this.recipientPublicKeyHex(sodiumLib, agentId);
      if (!publicKeyHex) {
        throw new Error(`Missing Omnyid public key for recipient ${agentId}`);
      }

      const curvePublicKey = sodiumLib.crypto_sign_ed25519_pk_to_curve25519(
        sodiumLib.from_hex(publicKeyHex),
      );
      const wrappedContentKey = sodiumLib.crypto_box_seal(contentKey, curvePublicKey);
      return {
        agent_id: agentId,
        public_key_hex: publicKeyHex,
        wrapped_content_key: sodiumLib.to_base64(
          wrappedContentKey,
          sodiumLib.base64_variants.ORIGINAL,
        ),
      };
    });

    const nonce = sodiumLib.randombytes_buf(
      sodiumLib.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const ciphertext = sodiumLib.crypto_aead_xchacha20poly1305_ietf_encrypt(
      canonicalJson(content),
      encryptionAad(message),
      null,
      nonce,
      contentKey,
    );

    return {
      scheme: 'omnyid-envelope-v1',
      algorithm: 'xchacha20poly1305-ietf',
      mode: 'recipient-wrapped',
      key_wrapping: 'curve25519-sealedbox-v1',
      nonce: sodiumLib.to_base64(nonce, sodiumLib.base64_variants.ORIGINAL),
      ciphertext: sodiumLib.to_base64(ciphertext, sodiumLib.base64_variants.ORIGINAL),
      recipients,
    };
  }

  private unwrapContentKey(
    sodiumLib: Sodium,
    message: Record<string, unknown>,
    envelope: Record<string, unknown>,
  ) {
    if (!Array.isArray(envelope.recipients) || !this.signingKeyHex) {
      return null;
    }

    const seed = this.loadSigningSeed(sodiumLib);
    const signingKeyPair = sodiumLib.crypto_sign_seed_keypair(seed);
    const ownPublicKeyHex = sodiumLib.to_hex(signingKeyPair.publicKey);
    const curvePublicKey = sodiumLib.crypto_sign_ed25519_pk_to_curve25519(
      signingKeyPair.publicKey,
    );
    const curvePrivateKey = sodiumLib.crypto_sign_ed25519_sk_to_curve25519(
      signingKeyPair.privateKey,
    );

    for (const recipient of envelope.recipients) {
      if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
        continue;
      }
      const entry = recipient as Record<string, unknown>;
      if (
        typeof entry.public_key_hex !== 'string' ||
        typeof entry.wrapped_content_key !== 'string'
      ) {
        continue;
      }
      if (
        entry.public_key_hex !== ownPublicKeyHex &&
        entry.agent_id !== this.agentId
      ) {
        continue;
      }

      try {
        return sodiumLib.crypto_box_seal_open(
          sodiumLib.from_base64(
            entry.wrapped_content_key,
            sodiumLib.base64_variants.ORIGINAL,
          ),
          curvePublicKey,
          curvePrivateKey,
        );
      } catch {
        return null;
      }
    }

    return null;
  }

  private recipientAgentIds(message: Message) {
    return Array.from(
      new Set([message.from, ...message.to].filter((agentId) => {
        return typeof agentId === 'string' && Boolean(this.parseAgentId(agentId));
      })),
    );
  }

  private recipientPublicKeyHex(sodiumLib: Sodium, agentId: string) {
    if (agentId === this.agentId && this.signingKeyHex) {
      const seed = this.loadSigningSeed(sodiumLib);
      return sodiumLib.to_hex(sodiumLib.crypto_sign_seed_keypair(seed).publicKey);
    }
    return this.recipientKeys[agentId] ?? null;
  }

  private agentDomainUrl(agentId: string) {
    const parsed = this.parseAgentId(agentId);
    if (!parsed) {
      return null;
    }

    const domain = parsed.domain;
    if (!domain) {
      return null;
    }

    if (domain.startsWith('localhost') || domain.startsWith('127.0.0.1')) {
      return `http://${domain}`;
    }

    return `https://${domain}`;
  }

  private parseAgentId(agentId: string) {
    const trimmed = agentId.trim();
    if (!trimmed.startsWith('agent:')) {
      return null;
    }

    const remainder = trimmed.slice('agent:'.length);
    const atIndex = remainder.indexOf('@');
    if (atIndex <= 0 || atIndex === remainder.length - 1) {
      return null;
    }

    const localpart = remainder.slice(0, atIndex);
    const domain = remainder.slice(atIndex + 1);
    if (!/^[A-Za-z0-9._+\-]+$/.test(localpart)) {
      return null;
    }
    if (domain.startsWith('.') || domain.endsWith('.')) {
      return null;
    }

    const labels = domain.split('.');
    if (labels.some((label) => !label || label.startsWith('-') || label.endsWith('-'))) {
      return null;
    }
    if (
      labels.some((label) => !/^[A-Za-z0-9-]+$/.test(label))
    ) {
      return null;
    }

    return { full: trimmed, localpart, domain };
  }

  private relayUrl() {
    if (this.url.startsWith('https://')) {
      return this.url.replace('https://', 'wss://') + '/relay/ws';
    }
    if (this.url.startsWith('http://')) {
      return this.url.replace('http://', 'ws://') + '/relay/ws';
    }
    return this.url + '/relay/ws';
  }

  private resolveTransportPreference(
    input: AgentOptions['transportPreference'],
  ): TransportPreference {
    if (input === 'auto' || input === 'webtransport' || input === 'websocket' || input === 'http') {
      return input;
    }
    const envValue = readEnv('OMNYID_TRANSPORT').toLowerCase();
    if (envValue === 'webtransport' || envValue === 'wt') {
      return 'webtransport';
    }
    if (input === 'websocket') {
      return 'websocket';
    }
    if (envValue === 'websocket' || envValue === 'ws') {
      return 'websocket';
    }
    if (envValue === 'http') {
      return 'http';
    }
    return 'auto';
  }

  private resolveDiscoveryTrustMode(
    input: AgentOptions['discoveryTrustMode'],
  ): 'strict' | 'tofu' {
    if (input === 'tofu') {
      return 'tofu';
    }
    const envValue = readEnv('OMNYID_DISCOVERY_TRUST_MODE').toLowerCase();
    if (envValue === 'tofu') {
      return 'tofu';
    }
    return 'strict';
  }

  private async resolveDiscoveryBaseUrl(domainUrl: string) {
    const delegation = await this.discoverDelegation(domainUrl);
    const server = delegation?.['afp.server'];
    if (typeof server !== 'string' || !server.trim()) {
      return domainUrl;
    }

    const trimmed = server.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const candidate = trimmed.replace(/\/+$/, '');
      return this.isAllowedDelegationTarget(domainUrl, candidate) ? candidate : domainUrl;
    }

    const candidate = `https://${trimmed}`.replace(/\/+$/, '');
    return this.isAllowedDelegationTarget(domainUrl, candidate) ? candidate : domainUrl;
  }

  private agentCardMatchesRequestedDomain(
    card: Record<string, unknown>,
    domainUrl: string,
  ) {
    if (typeof card.agent_id !== 'string') {
      return false;
    }
    const parsedAgent = this.parseAgentId(card.agent_id);
    const requestedHost = this.normalizedHost(domainUrl);
    if (!parsedAgent || !requestedHost) {
      return false;
    }
    return parsedAgent.domain === requestedHost;
  }

  private isAllowedDelegationTarget(requestedDomainUrl: string, candidateUrl: string) {
    const requestedHost = this.normalizedHost(requestedDomainUrl);
    const candidate = new URL(candidateUrl);
    if (!requestedHost || !candidate.hostname) {
      return false;
    }
    if (requestedHost === 'localhost' || requestedHost === '127.0.0.1') {
      return candidate.protocol === 'http:' || candidate.protocol === 'https:';
    }
    return candidate.protocol === 'https:';
  }

  private normalizedHost(urlOrHost: string) {
    try {
      return new URL(urlOrHost).hostname.toLowerCase();
    } catch {
      const trimmed = urlOrHost.trim().toLowerCase().replace(/\/+$/, '');
      if (!trimmed || trimmed.includes('://')) {
        return null;
      }
      return trimmed;
    }
  }

  private canTrustOnFirstUse(card: Record<string, unknown>) {
    if (typeof card.agent_id !== 'string' || typeof card.public_key_hex !== 'string') {
      return false;
    }
    const cached = this.recipientKeys[card.agent_id];
    if (!cached) {
      return true;
    }
    return cached === card.public_key_hex;
  }

  private sendViaWebSocket(payload: Message) {
    return new Promise<{ success: boolean; message_id: string }>((resolve, reject) => {
      const socket = new WebSocket(this.relayUrl());
      let settled = false;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ op: 'send', message: payload }));
      });

      socket.addEventListener('message', (messageEvent) => {
        const raw = String(messageEvent.data);
        try {
          const event = JSON.parse(raw) as RelayEvent & {
            message?: string;
            success?: boolean;
          };
          if (event.event === 'ack') {
            settled = true;
            socket.close();
            resolve({
              success: Boolean(event.success),
              message_id: event.message_id ?? payload.id,
            });
            return;
          }
          if (event.event === 'error') {
            settled = true;
            socket.close();
            reject(new Error(event.message ?? raw));
          }
        } catch {
          // Ignore relay broadcast frames until an ack or error arrives.
        }
      });

      socket.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket send failed'));
        }
      });

      socket.addEventListener('close', () => {
        if (!settled) {
          reject(new Error('WebSocket relay closed before ack'));
        }
      });
    });
  }

  private async sendViaHttp(payload: Message) {
    const res = await fetch(`${this.url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  private async resolveSendTransportPlan(): Promise<Array<'webtransport' | 'websocket' | 'http'>> {
    switch (this.transportPreference) {
      case 'webtransport':
        return ['webtransport', 'websocket', 'http'];
      case 'websocket':
        return ['websocket', 'http'];
      case 'http':
        return ['http'];
      case 'auto':
      default: {
        const capabilities = await this.safeTransportCapabilities();
        if (capabilities?.public_transport?.primary === 'webtransport') {
          return ['webtransport', 'websocket', 'http'];
        }
        return ['websocket', 'http'];
      }
    }
  }

  private async safeTransportCapabilities() {
    try {
      return await this.getTransportCapabilities();
    } catch {
      return null;
    }
  }

  private webTransportUrl() {
    try {
      const parsed = new URL(this.url);
      parsed.protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
      parsed.hostname = parsed.hostname === 'api.omnyid.com' ? 'wt.omnyid.com' : parsed.hostname;
      parsed.pathname = '/relay/wt';
      return parsed.toString();
    } catch {
      return this.url + '/relay/wt';
    }
  }

  private webTransportConstructor(): WebTransportConstructorLike | null {
    const scope = globalThis as typeof globalThis & {
      WebTransport?: WebTransportConstructorLike;
    };
    return scope.WebTransport ?? null;
  }

  private async sendViaWebTransport(payload: Message) {
    const WebTransportCtor = this.webTransportConstructor();
    if (!WebTransportCtor) {
      throw new Error('WebTransport is not available in this runtime');
    }

    const transport = new WebTransportCtor(this.webTransportUrl());
    await transport.ready;
    if (!transport.createBidirectionalStream) {
      throw new Error('WebTransport bidirectional streams are unavailable');
    }

    const stream = await transport.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await writer.write(encoder.encode(JSON.stringify({ op: 'send', message: payload })));
    await writer.close();

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const raw = decoder.decode(merged);
    if (!raw.trim()) {
      throw new Error('WebTransport relay returned an empty response');
    }

    try {
      const event = JSON.parse(raw) as RelayEvent & {
        message?: string;
        success?: boolean;
      };
      if (event.event === 'ack') {
        return {
          success: Boolean(event.success),
          message_id: event.message_id ?? payload.id,
        };
      }
      if (event.event === 'error') {
        throw new Error(event.message ?? raw);
      }
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
    }

    throw new Error('WebTransport relay returned an unsupported response');
  }

  private async subscribeThreadViaWebTransport(
    threadId: string,
    onEvent: (event: RelayEvent & { messages?: unknown[] }) => void,
    includeSnapshot: boolean,
  ): Promise<RelaySubscriptionHandle> {
    const WebTransportCtor = this.webTransportConstructor();
    if (!WebTransportCtor) {
      throw new Error('WebTransport is not available in this runtime');
    }

    const transport = new WebTransportCtor(this.webTransportUrl());
    await transport.ready;
    if (!transport.createBidirectionalStream) {
      throw new Error('WebTransport bidirectional streams are unavailable');
    }

    const stream = await transport.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await writer.write(
      encoder.encode(
        JSON.stringify({
          op: 'subscribe_thread',
          thread_id: threadId,
          include_snapshot: includeSnapshot,
        }),
      ),
    );
    await writer.close();

    let pending = '';
    let closed = false;

    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }

          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }
            try {
              onEvent(JSON.parse(trimmed) as RelayEvent & { messages?: unknown[] });
            } catch {
              onEvent({ event: 'raw', payload: trimmed });
            }
          }
        }

        const trailing = pending.trim();
        if (trailing) {
          try {
            onEvent(JSON.parse(trailing) as RelayEvent & { messages?: unknown[] });
          } catch {
            onEvent({ event: 'raw', payload: trailing });
          }
        }
      } finally {
        closed = true;
      }
    })();

    return {
      async close() {
        if (closed) {
          return;
        }
        transport.close?.({ closeCode: 0, reason: 'thread subscription closed' });
        await transport.closed.catch(() => undefined);
      },
    };
  }
}

export * from './continuity.js';
export * from './retrieval.js';
export * from './workspace-assistance.js';
export * from './workflows.js';

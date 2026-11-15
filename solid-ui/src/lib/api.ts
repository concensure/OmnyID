import { customEventDetail, isRecord } from "./eventDetail";
import { COOKIE_SESSION_TOKEN, forgetSessionBearerToken, rememberSessionBearerToken, resolveSessionBearerToken } from "./sessionCredentialState";
import { normalizeWeddingVendorSourceEvidence, type WeddingVendorAvailabilityUpdate, type WeddingVendorSourceEvidence } from "./weddingVendorRankingState";
import { normalizeAdminWeddingVendorRooms, type AdminWeddingVendorRoom } from "./adminWeddingVendorRoomState";
import { normalizeWeddingVendorAttributeCatalogFields, normalizeWeddingVendorAttributeFields, type WeddingVendorAttributeCatalogFields, type WeddingVendorAttributeFields, type WeddingVendorAttributeWriteFields } from "./weddingVendorAttributeCatalogState";
import { normalizeInboxSummary, type InboxSummary } from "./firstRunExperienceResponseState";
import {
  fleetMasterInstance,
  fleetStatusSummary,
  normalizeAgentFleetResponse,
  type AgentFleetInstance,
  type AgentFleetResponse,
  type AgentFleetStatusSummary,
} from "./agentFleetResponseState";
import { normalizeAgentTriggersResponse, type AgentTriggerRecord } from "./agentTriggerResponseState";
import { parseAuthApiResponse, parseAuthMessageResponse, type AuthApiResponse } from "./authResponseState";
import {
  normalizeGmailConnectionStatus,
  normalizeGmailOAuthConfig,
  oauthUrlFromResponse,
  type GmailConnectionStatus,
  type GmailOAuthConfig,
} from "./gmailConnectionState";
import { normalizeGoogleCalendarConnectionStatus, type GoogleCalendarConnectionStatus } from "./googleCalendarConnectionState";
import { normalizeGoogleAuthConfig } from "./googleIdentity";
import {
  activeGoalsToGoalPulseItems,
  activeGoalsToPulseGoalOptions,
  normalizeActiveGoalsResponse,
} from "./activeGoalsResponseState";
import { normalizeBriefResponse, type BriefApiResponse, type GoalPulseItem } from "./intelligenceBriefState";
import {
  parseInlineEntityCurrencyPayload,
  parseInlineEntityMapLocationPayload,
  type InlineEntityCurrencyConversion,
  type InlineEntityMapLocation,
} from "./inlineEntityExternalData";
import { parseJsonValue } from "./jsonParseState";
import { parseNavBarWeatherResponse, type NavBarWeatherState } from "./navBarWeatherState";
import { normalizePublicFeedResponse, type PublicArticle } from "./publicFeedResponseState";
import {
  normalizePulseChannelsResponse,
  normalizePulseItemsResponse,
  normalizePulseNewsChannel,
  type PulseGoalOption,
  type PulseNewsChannel,
  type PulseNewsItem,
} from "./pulseFeedResponseState";
import { normalizeSessionChangedDetail } from "./sessionRecoveryState";
import {
  parseSocialComposerPostsResponse,
  parseSocialComposerPublishResponse,
  parseSocialComposerSuggestionsResponse,
  type SocialComposerPlatform,
  type SocialComposerPost,
  type SocialComposerSuggestion,
} from "./socialComposerResponseState";
import {
  normalizeCreatedSpaceMessageResponse,
  normalizeCreatedSpaceResponse,
  normalizeSpaceMembersResponse,
  normalizeSpaceMessagesResponse,
  normalizeSpacesResponse,
  type NormalizedSpace,
  type NormalizedSpaceMember,
  type NormalizedSpaceMessage,
} from "./spacesViewState";
import { normalizeTaskDetailResponse, type AgentTask as AgentTaskDetailSummary, type TaskDetail } from "./taskDetailResponseState";
import { normalizeThreadRelatedContextResponse, type ThreadRelatedContextItem } from "./threadRelatedContextState";
import {
  parseUploadAttachmentPayload,
  parseUploadErrorDetail,
  parseUploadMessageIdPayload,
} from "./uploadResponseState";
import { extractWorkspaceBundleSignature } from "./workspaceUpdateState";

function isLoopbackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
}

function deriveDefaultApiBase(origin: string): string {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if (isLoopbackHostname(hostname) || hostname.startsWith("api.") || hostname.startsWith("cloud.")) {
      return url.origin;
    }

    if (!hostname.includes(".")) {
      return url.origin;
    }

    const apiUrl = new URL(url.origin);
    apiUrl.hostname = `api.${hostname}`;
    return apiUrl.origin;
  } catch {
    return origin;
  }
}

type RuntimeApiWindow = Window & {
  __API_BASE__?: string;
};

function safeRuntimeApiBase(): string {
  if (typeof window === "undefined") return "";
  const runtimeWindow: RuntimeApiWindow = window;
  const raw = runtimeWindow.__API_BASE__?.trim() ?? "";
  if (!raw) return "";
  try {
    const u = new URL(raw);
    // Only accept same origin or explicit localhost during development
    const allowed =
      u.origin === window.location.origin ||
      (window.location.hostname === "localhost" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    return allowed ? raw : "";
  } catch { return ""; }
}
const runtimeApiBase = safeRuntimeApiBase();
const envApiBase =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_API_BASE?.trim?.()
    : "";

export const API_BASE =
  runtimeApiBase ||
  envApiBase ||
  (typeof window !== "undefined" ? deriveDefaultApiBase(window.location.origin) : "");
export const SESSION_STORAGE_KEY = "omnyid.preview.session";
const GUEST_FINGERPRINT_STORAGE_KEY = "omnyid.preview.guest_fingerprint";
export const SESSION_CHANGED_EVENT = "omnyid:session-changed";
export type Session = {
  token: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    auth_provider: string;
    operator?: boolean;
  };
};

export type SessionEndReason = "manual_sign_out" | "unauthorized" | "account_disabled" | "unknown";

export type SessionChangedEventDetail = {
  session: Session | null;
  reason: SessionEndReason | null;
};

export function apiUrlForPath(path: unknown, base: string = API_BASE): string {
  if (typeof path !== "string" || !path.trim()) return "";
  const trimmedPath = path.trim();
  if (!/^\/[^/]/.test(trimmedPath)) return "";
  const trimmedBase = base.trim().replace(/\/+$/, "");
  return trimmedBase ? `${trimmedBase}${trimmedPath}` : trimmedPath;
}

export type FocusItem = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  due_at?: string | null;
};

export type CreateSpaceInput = {
  name: string;
  description?: string;
  is_public?: boolean;
};

export type CreateSpaceMessageInput = {
  afp_message_id: string;
  from_agent: string;
  type: string;
  subtype?: string;
  content: Record<string, unknown>;
};

export type UiCommandRequest = {
  query?: string;
  engine?: string;
  active_file_id?: string;
  browser_intent?: string;
  browser_parsed?: Record<string, unknown>;
  optimization_mode?: string;
} & Record<string, unknown>;

export type WeddingVendorSearchApiQuery = {
  provider_kind: string;
  category?: string | null;
  query: string;
  google_place_types?: string[];
  overpass_tags?: string[];
};

export type WeddingVendorSearchApiSource = {
  title: string;
  url: string;
  snippet?: string | null;
  provider?: string | null;
  website_url?: string | null;
  map_url?: string | null;
  photo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  instagram_url?: string | null;
} & WeddingVendorSourceEvidence;

export type WeddingVendorSearchApiResponse = {
  ok: boolean;
  status: string;
  external_search_performed: boolean;
  provider_label: string | null;
  query_count: number;
  source_count: number;
  queries: string[];
  sources: WeddingVendorSearchApiSource[];
  message: string;
  receipt_metadata: Record<string, unknown>;
};

export type WeddingProviderCapabilityStatus = {
  kind: string;
  connectedAppId: string;
  label: string;
  credentialRequired: boolean;
  credentialConfigured: boolean;
  sharedCreditEnabled: boolean;
  configured: boolean;
  verificationStatus?: string | null;
  diagnosticLabel?: string | null;
  sourceLabel: string | null;
};

export type WeddingProviderCapabilitiesResponse = {
  providers: WeddingProviderCapabilityStatus[];
  connectedAppIds: string[];
  guardrails: string[];
};

export type WeddingLiveEvidenceResponse = {
  ok: boolean;
  status: string;
  locationsRequested: number;
  geocodes: Record<string, unknown>[];
  weather: Record<string, unknown>[];
  failures: string[];
  receiptMetadata: Record<string, unknown>;
  guardrails: string[];
};

export type AgentOrchestrationRequest = {
  objective: string;
  thread_id?: string;
} & Record<string, unknown>;

export type ExportFileRequest = {
  format: string;
  filename: string;
  columns: string[];
  rows: string[][];
  thread_id?: string | null;
  parent_id?: string | null;
};

export type ExportFileResult = {
  ok: boolean;
  filename: string;
  size_bytes: number;
  download_url?: string;
  data?: string;
  mime_type?: string;
  workflow_family_context?: unknown;
  summary?: string;
  format?: string;
};

export type ApplyTaskDiffRequest = {
  task_id?: string;
  after: Record<string, unknown>;
  source_message_id: string;
};

export type ApplyMultiEditRequest<TEdit = Record<string, unknown>> = {
  correlation_id?: string;
  edits: TEdit[];
  source_message_id: string;
};

export type ShellDecisionRequest = {
  source_message_id: string;
  approved: boolean;
  command: string;
};

export type UploadedFilePayload = {
  message_id: string | null;
  attachment: AfpAttachment | null;
};

export type AttachmentRetentionMode =
  | "keep_file"
  | "keep_extracted_only"
  | "keep_nothing";

export type KnowledgeOrganizationMode =
  | "standard"
  | "connected_notes"
  | "zettelkasten";

export type SearchAttachmentUpload = {
  source_message_id: string;
  attachment_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  inline_text?: string | null;
  inline_content_type?: string | null;
  extraction_mode?: string | null;
};

export type SearchSubmitPayload = {
  query: string;
  engine: string;
  optimizationMode: string;
  attachments?: File[];
  attachmentRetentionMode?: AttachmentRetentionMode;
  knowledgeOrganizationMode?: KnowledgeOrganizationMode;
  studyLaunchMetadata?: {
    originLabel?: string | null;
    focusBadges?: string[];
    entryPoint?: string | null;
    flowKind?: string | null;
  };
};

export type AttachmentBatchIngestRequest = {
  thread_id: string;
  query?: string;
  retention_mode: AttachmentRetentionMode;
  knowledge_mode?: KnowledgeOrganizationMode;
  uploads: SearchAttachmentUpload[];
};

export type AttachmentBatchIngestItem = {
  source_message_id: string;
  source_attachment_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  output_message_id?: string | null;
  output_type?: string | null;
  supertags: string[];
  extraction_mode?: string | null;
  inline_extracted?: boolean;
  support_mode?: "inline_text" | "server_processing" | "not_supported_yet" | null;
  support_label?: string | null;
  support_description?: string | null;
  cost_usd?: number | null;
  cost_source?: string | null;
  academic_kind?: string | null;
  academic_course_tag?: string | null;
  academic_week_tag?: string | null;
  academic_lecture_tag?: string | null;
  academic_chapter_tag?: string | null;
  academic_unit_tag?: string | null;
  academic_summary?: string | null;
  zettelkasten_stage?: string | null;
  zettelkasten_entry_type?: string | null;
  zettelkasten_next_action?: string | null;
  knowledge_graph_seed?: boolean | null;
  knowledge_graph_group_key?: string | null;
  knowledge_graph_link_tags?: string[];
  kept_source_file: boolean;
  ephemeral_output: boolean;
  attachment_retention_mode?: AttachmentRetentionMode | null;
  attachment_retention_label?: string | null;
  source_persisted?: boolean;
  derived_content_persisted?: boolean;
  cleanup_required?: boolean;
  knowledge_mode?: KnowledgeOrganizationMode | null;
  ingested?: boolean;
  error?: string | null;
};

export type AttachmentBatchIngestResponse = {
  thread_id: string;
  retention_mode: AttachmentRetentionMode;
  knowledge_mode?: KnowledgeOrganizationMode;
  items: AttachmentBatchIngestItem[];
  cleanup_message_ids: string[];
};

export type AttachmentCleanupResponse = {
  deleted_count: number;
};

export type AttachmentPersistResponse = {
  persisted_count: number;
  skipped_count?: number;
};

export type AttachmentIngestCapabilities = {
  image_ocr_supported: boolean;
  pdf_server_processing_supported: boolean;
  legacy_office_supported: boolean;
  generated_at?: string;
};

export type ApiReachability = {
  reachable: boolean;
  ok: boolean;
  status: number;
  latency_ms: number;
};

export type MemoryWorkspaceScopeInput = {
  memory_space?: string | null;
  author_mask?: string | null;
  author_type?: string | null;
  author_id?: string | null;
  is_human_authored?: boolean | null;
  human_only?: boolean | null;
};

export function mergeMemoryScopeMetadata(
  metadata: Record<string, unknown>,
  scope?: MemoryWorkspaceScopeInput | null,
): Record<string, unknown> {
  if (!scope) return metadata;
  const merged = { ...metadata };
  if (scope.memory_space !== null && scope.memory_space !== undefined) {
    merged.memory_space = scope.memory_space;
  }
  if (scope.author_mask !== null && scope.author_mask !== undefined) {
    merged.author_mask = scope.author_mask;
  }
  if (scope.author_type !== null && scope.author_type !== undefined) {
    merged.author_type = scope.author_type;
  }
  if (scope.author_id !== null && scope.author_id !== undefined) {
    merged.author_id = scope.author_id;
  }
  if (scope.is_human_authored !== null && scope.is_human_authored !== undefined) {
    merged.is_human_authored = scope.is_human_authored;
  }
  if (scope.human_only !== null && scope.human_only !== undefined) {
    merged.human_only = scope.human_only;
  }
  return merged;
}

export function memoryScopeFromMetadata(
  metadata?: Record<string, unknown> | null,
  overrides?: MemoryWorkspaceScopeInput | null,
): MemoryWorkspaceScopeInput | null {
  const base: MemoryWorkspaceScopeInput = {
    memory_space:
      typeof metadata?.["memory_space"] === "string" ? (metadata["memory_space"] as string) : null,
    author_mask:
      typeof metadata?.["author_mask"] === "string" ? (metadata["author_mask"] as string) : null,
    author_type:
      typeof metadata?.["author_type"] === "string" ? (metadata["author_type"] as string) : null,
    author_id:
      typeof metadata?.["author_id"] === "string" ? (metadata["author_id"] as string) : null,
    is_human_authored:
      typeof metadata?.["is_human_authored"] === "boolean"
        ? (metadata["is_human_authored"] as boolean)
        : null,
    human_only:
      typeof metadata?.["human_only"] === "boolean" ? (metadata["human_only"] as boolean) : null,
  };
  const merged: MemoryWorkspaceScopeInput = {
    ...base,
    ...(overrides ?? {}),
  };
  const hasValue = Object.values(merged).some((value) => value !== null && value !== undefined);
  return hasValue ? merged : null;
}

export type SendAfpMessageInput = {
  id?: string;
  thread_id: string;
  from: string;
  to: string[];
  type: string;
  kind?: string | null;
  content: unknown;
  timestamp?: string;
  parent_id?: string | null;
  subtype?: string;
  views?: unknown[];
  attachments?: unknown[];
  references?: unknown[];
  supertags?: string[];
  metadata?: Record<string, unknown> | null;
  memory_scope?: MemoryWorkspaceScopeInput | null;
  store_in_relational?: boolean;
  signature?: string;
};

const AFP_TRANSPORT_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let afpTransportSequence = 0;

function isAfpTransportId(value: unknown): value is string {
  return typeof value === "string"
    && value.length === 26
    && /^[0-9A-HJKMNP-TV-Z]+$/i.test(value);
}

/**
 * `/send` deliberately accepts only ULID-shaped transport identifiers. UI
 * features still use readable logical IDs for their local domain model, so
 * keep those in metadata and derive an opaque, valid transport ID here.
 */
function afpTransportId(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193) >>> 0;
  }
  let result = "";
  for (let index = 0; index < 26; index += 1) {
    hash = Math.imul(hash ^ (index + 1), 0x27d4eb2d) >>> 0;
    result += AFP_TRANSPORT_ALPHABET[(hash >>> 27) & 31];
  }
  return result;
}

export function normalizeAfpTransportInput(body: SendAfpMessageInput): SendAfpMessageInput {
  const logicalThreadId = body.thread_id.trim();
  const logicalMessageId = body.id?.trim() ?? "";
  const timestamp = body.timestamp ?? new Date().toISOString();
  const transportThreadId = isAfpTransportId(logicalThreadId)
    ? logicalThreadId
    : afpTransportId(`thread|${logicalThreadId}`);
  const transportMessageId = isAfpTransportId(logicalMessageId)
    ? logicalMessageId
    : afpTransportId(`message|${logicalMessageId}|${logicalThreadId}|${timestamp}|${JSON.stringify(body.content)}${logicalMessageId ? "" : `|${++afpTransportSequence}`}`);
  if (transportThreadId === logicalThreadId && transportMessageId === logicalMessageId && timestamp === body.timestamp) {
    return body;
  }
  const metadata = { ...(body.metadata ?? {}) };
  if (transportThreadId !== logicalThreadId && logicalThreadId && !metadata.logical_thread_id) {
    metadata.logical_thread_id = logicalThreadId;
  }
  if (transportMessageId !== logicalMessageId && logicalMessageId && !metadata.logical_message_id) {
    metadata.logical_message_id = logicalMessageId;
  }
  return {
    ...body,
    id: transportMessageId,
    thread_id: transportThreadId,
    timestamp,
    metadata,
  };
}

export function sendAfpMessage<T = { success: boolean; message_id: string }>(
  body: SendAfpMessageInput,
) {
  const message = normalizeAfpTransportInput(body);
  return apiFetch<T>("/send", {
    method: "POST",
    bodyJson: {
      id: message.id,
      thread_id: message.thread_id,
      parent_id: message.parent_id ?? null,
      from: message.from,
      to: message.to,
      timestamp: message.timestamp,
      type: message.type,
      kind: message.kind ?? undefined,
      subtype: message.subtype,
      content: message.content,
      views: message.views ?? [],
      attachments: message.attachments ?? [],
      references: message.references ?? [],
      supertags: message.supertags ?? [],
      metadata: mergeMemoryScopeMetadata(message.metadata ?? {}, message.memory_scope),
      store_in_relational: message.store_in_relational,
      signature: message.signature ?? "",
    },
  });
}

export function sendAfpPayloadMessage<T = { success: boolean; message_id: string }>(
  payload: Record<string, unknown>,
) {
  return sendAfpMessage<T>({
    thread_id: typeof payload["thread_id"] === "string" ? payload["thread_id"] : "",
    parent_id: typeof payload["parent_id"] === "string" ? payload["parent_id"] : null,
    from: typeof payload["from"] === "string" ? payload["from"] : "",
    to: Array.isArray(payload["to"])
      ? payload["to"].filter((value): value is string => typeof value === "string")
      : [],
    timestamp: typeof payload["timestamp"] === "string" ? payload["timestamp"] : undefined,
    type: typeof payload["type"] === "string" ? payload["type"] : "",
    kind: typeof payload["kind"] === "string" ? payload["kind"] : null,
    subtype: typeof payload["subtype"] === "string" ? payload["subtype"] : undefined,
    content: payload["content"] ?? {},
    views: Array.isArray(payload["views"]) ? payload["views"] : [],
    attachments: Array.isArray(payload["attachments"]) ? payload["attachments"] : [],
    references: Array.isArray(payload["references"]) ? payload["references"] : [],
    supertags: Array.isArray(payload["supertags"])
      ? payload["supertags"].filter((value): value is string => typeof value === "string")
      : [],
    metadata: isRecord(payload["metadata"]) ? payload["metadata"] : null,
    store_in_relational:
      typeof payload["store_in_relational"] === "boolean"
        ? payload["store_in_relational"]
        : true,
    signature: typeof payload["signature"] === "string" ? payload["signature"] : "",
  });
}

// ── AFP core types ────────────────────────────────────────────────────────────

/** One view hint attached to an AFP message. `format` drives the renderer. */
export type AfpView = {
  format: "email" | "canvas" | "table" | "calendar" | "attachments" | "approvals" | string;
  content: Record<string, unknown>;
  priority?: number;
};

export type AfpAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage: Record<string, unknown>;
  encryption: Record<string, unknown>;
  sha256?: string;
};

export type FileLibraryItem = {
  id: string;
  message_id: string;
  thread_id: string;
  source_thread_id?: string | null;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage: Record<string, unknown>;
  encryption: Record<string, unknown>;
  sha256?: string | null;
  created_at: string;
  source_timestamp: string;
  source_type: string;
  source_kind?: string | null;
  source_summary?: string | null;
  source_metadata: Record<string, unknown>;
  source_supertags: string[];
  download_url?: string | null;
  derived_message_id?: string | null;
  derived_thread_id?: string | null;
  derived_type?: string | null;
};

export type FileLibraryTagFacet = {
  tag: string;
  count: number;
};

export type FileLibraryFacets = {
  top_tags: FileLibraryTagFacet[];
  availability_counts: Record<string, number>;
  category_counts: Record<string, number>;
  source_kind_counts: Record<string, number>;
  knowledge_counts: Record<string, number>;
  retention_counts: Record<string, number>;
  academic_kind_counts: Record<string, number>;
  course_tag_counts: Record<string, number>;
  unit_tag_counts: Record<string, number>;
  chapter_tag_counts: Record<string, number>;
  week_tag_counts: Record<string, number>;
  lecture_tag_counts: Record<string, number>;
  zettelkasten_stage_counts: Record<string, number>;
  linked_count: number;
};

export type FileLibraryResponse = {
  items: FileLibraryItem[];
  count: number;
  summary: {
    storage_used_bytes: number;
    storage_quota_bytes: number;
    visible_bytes: number;
    matching_count: number;
  };
  facets: FileLibraryFacets;
  page: {
    limit: number;
    returned_count: number;
    matching_count: number;
    has_more: boolean;
  };
  filters: {
    q?: string;
    tag?: string;
    category?: string;
    source_kind?: string;
    availability?: string;
    knowledge_mode?: string;
    retention_mode?: string;
    academic_kind?: string;
    course_tag?: string;
    week_tag?: string;
    lecture_tag?: string;
    zettelkasten_stage?: string;
    sort?: string;
    limit?: number;
  };
};

export type AfpReference = {
  type: string;
  target: string;
  label?: string;
  metadata?: Record<string, unknown>;
};

/**
 * A full AFP message as returned by GET /thread/{id}.
 * The `views` array is the agent-native rendering contract:
 * agents set views[].format to tell the workspace how to render this message.
 * Keep `type` broad and stable. Use top-level `kind` for semantic typing,
 * and use `subtype`, payload-local fields such as `content.kind`, and
 * `metadata` for message-family-specific routing without exploding the taxonomy.
 */
export type AfpMessage = {
  id: string;
  thread_id: string;
  parent_id?: string | null;
  from: string;
  to?: string[];
  timestamp: string;
  type: string;
  kind?: string | null;
  subtype?: string | null;
  supertags?: string[];
  content: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  views: AfpView[];
  attachments: AfpAttachment[];
  references?: AfpReference[];
  encryption?: Record<string, unknown> | null;
  signature?: string;
};

export type ThreadSummary = {
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
};

export type DashboardBootstrap = {
  user: Session["user"];
  agents: Array<{ agent_id: string; label?: string }>;
  messages: AfpMessage[];
  thread_summaries?: ThreadSummary[];
  thread_retrieval_state?: {
    summary: string;
    badges: string[];
  };
  action_log?: Array<{
    capability_id: string;
    thread_id: string;
    status: string;
    output: Record<string, unknown>;
    external_reference?: string | null;
    recorded_at: string;
    reversible_summary?: {
      reversible: boolean;
      undo_label?: string | null;
      action_message_id?: string | null;
      rollback_checkpoint_id?: string | null;
      provenance_record_id?: string | null;
      side_effect_boundary?: string | null;
    } | null;
  }>;
  proactive_suggestions?: Array<{
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
    provenance_cue?: string | null;
    autonomy_tier?: string | null;
    retrieval_mode?: string | null;
    deeper_retrieval_recommended?: boolean;
    readiness_reason?: string | null;
    topology_budget_used?: number;
    working_set_count?: number;
    active_topic_count?: number;
    working_set_refs?: string[];
    active_topic_refs?: string[];
    artifact_summary_lines?: string[];
    memory_space?: string | null;
    author_mask?: string | null;
    author_type?: string | null;
    author_id?: string | null;
    is_human_authored?: boolean | null;
    human_only?: boolean | null;
    source_refs?: string[];
    source_count?: number;
    reference_refs?: string[];
    decision_history_refs?: string[];
    project_refs?: string[];
    reference_labels?: string[];
    object_refs?: string[];
    object_labels?: string[];
    thread_refs?: string[];
    file_refs?: string[];
    file_labels?: string[];
    linked_target_label?: string | null;
    thread_retrieval_state?: {
      summary: string;
      badges: string[];
    } | null;
    anchor_refs?: string[];
    evidence_kinds?: string[];
    heuristic_family_id?: string;
    action_afp_payload?: Record<string, unknown> | null;
    outcome_feedback?: {
      heuristic_id: string;
      total: number;
      accepted: number;
      acceptance_rate: number;
      status: string;
      scope?: string;
      suggested_suppression_hours?: number | null;
      suggested_half_life_days: number;
      adaptation_reason?: string | null;
      threshold_delta?: number | null;
      sample_count?: number | null;
      adaptation_signals?: string[];
    };
    comparison_headers?: string[];
    comparison_rows?: Array<{ label: string; values: string[] }>;
    approval_kind?: string | null;
    autonomy_decision?: {
      autonomy_level?: string | null;
      reversibility?: string | null;
      consequence_level?: string | null;
      confidence?: string | null;
      approval_required?: boolean | null;
      interruption_budget?: string | null;
      reason?: string | null;
    } | null;
    draft_preview?: {
      label?: string | null;
      content?: string | null;
      content_type?: "text" | "code" | string | null;
    } | null;
    preview_only?: boolean;
    preview_boundary_summary?: string | null;
  }>;
  cost_snapshot?: {
    total_usd: number;
    total_tokens: number;
    event_count: number;
    run_count: number;
    monthly_budget_usd: number;
    soft_limit_ratio: number;
    recent_spend_usd_14d: number;
    cost_month_usd: number;
    estimated_monthly_margin_usd: number;
    deep_queries_today: number;
    daily_deep_query_limit: number;
    margin_guard_active: boolean;
    usage_guard_active: boolean;
  } | null;
  cost_status?: {
    level: string;
    title: string;
    detail: string;
    action_label: string;
  } | null;
  continuity_brief?: {
    source_type: string;
    title: string;
    decision_count: number;
    commitment_count: number;
    critical_change_count: number;
    suggested_actions: string[];
    staleness_at?: string | null;
  } | null;
  continuity_handoff?: Record<string, unknown> | null;
  continuity_primary_mode?: "priority_card" | "briefing_bar" | "continuity_panel" | string;
  continuity_priority_card?: {
    title: string;
    description: string;
    panel_kind: string;
    requires_approval: boolean;
    action_label: string;
    surface_hint?: string | null;
    confidence?: string | null;
    prepared_draft_class?: string | null;
    selection_reason?: string | null;
    approval_or_reversibility_hint?: string | null;
    provenance_cue?: string | null;
    autonomy_tier?: string | null;
    retrieval_mode?: string | null;
    deeper_retrieval_recommended?: boolean;
    readiness_reason?: string | null;
    topology_budget_used?: number;
    working_set_count?: number;
    active_topic_count?: number;
    working_set_refs?: string[];
    active_topic_refs?: string[];
    decision_history_refs?: string[];
    project_refs?: string[];
    thread_refs?: string[];
    linked_target_label?: string | null;
    source_refs?: string[];
    object_refs?: string[];
    object_labels?: string[];
    file_refs?: string[];
    file_labels?: string[];
    memory_space?: string | null;
    autonomy_decision?: {
      autonomy_level?: string | null;
      reversibility?: string | null;
      consequence_level?: string | null;
      confidence?: string | null;
      approval_required?: boolean | null;
      interruption_budget?: string | null;
      reason?: string | null;
    } | null;
    author_mask?: string | null;
    author_type?: string | null;
    author_id?: string | null;
    is_human_authored?: boolean | null;
    human_only?: boolean | null;
    thread_retrieval_state?: {
      summary: string;
      badges: string[];
    } | null;
  } | null;
  continuity_action_items?: Array<{
    id: string;
    title: string;
    category: string;
    urgency: string;
    confidence: string;
    requires_approval: boolean;
    suggested_action: string;
    surface_hint?: string | null;
    selection_reason?: string | null;
    approval_or_reversibility_hint?: string | null;
    provenance_cue?: string | null;
    autonomy_tier?: string | null;
    autonomy_decision?: {
      autonomy_level?: string | null;
      reversibility?: string | null;
      consequence_level?: string | null;
      confidence?: string | null;
      approval_required?: boolean | null;
      interruption_budget?: string | null;
      reason?: string | null;
    } | null;
    source_refs: string[];
    memory_space?: string | null;
    author_mask?: string | null;
    author_type?: string | null;
    author_id?: string | null;
    is_human_authored?: boolean | null;
    human_only?: boolean | null;
  }>;
  continuity_action_overflow_count?: number;
  continuity_action_overflow_summary?: string | null;
  continuity_response_items?: Array<{
    id: string;
    title: string;
    channel: string;
    urgency: string;
    confidence: string;
    response_due_hint: string;
    suggested_action: string;
    autonomy_decision?: {
      autonomy_level?: string | null;
      reversibility?: string | null;
      consequence_level?: string | null;
      confidence?: string | null;
      approval_required?: boolean | null;
      interruption_budget?: string | null;
      reason?: string | null;
    } | null;
    prepared_draft_id?: string | null;
    prepared_draft_summary?: string | null;
    prepared_draft_readiness?: string | null;
    prepared_draft_body?: string | null;
    prepared_draft_class?: string | null;
    prepared_draft_selection_reason?: string | null;
    prepared_draft_available?: boolean;
    prepared_draft_requires_approval?: boolean;
    prepared_draft_autonomy_decision?: {
      autonomy_level?: string | null;
      reversibility?: string | null;
      consequence_level?: string | null;
      confidence?: string | null;
      approval_required?: boolean | null;
      interruption_budget?: string | null;
      reason?: string | null;
    } | null;
    prepared_draft_lead_summary?: string | null;
    prepared_draft_summary_lines?: string[];
    prepared_draft_object_refs?: string[];
    prepared_draft_object_labels?: string[];
    prepared_draft_thread_retrieval_state?: {
      summary: string;
      badges: string[];
    } | null;
    source_refs: string[];
  }>;
  continuity_prepared_draft_items?: Array<{
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
    autonomy_decision?: {
      autonomy_level?: string | null;
      reversibility?: string | null;
      consequence_level?: string | null;
      confidence?: string | null;
      approval_required?: boolean | null;
      interruption_budget?: string | null;
      reason?: string | null;
    } | null;
    selection_reason?: string | null;
    approval_or_reversibility_hint?: string | null;
    provenance_cue?: string | null;
    autonomy_tier?: string | null;
    source_refs: string[];
    object_refs?: string[];
    object_labels?: string[];
    comparison_headers?: string[];
    comparison_rows?: Array<{ label: string; values: string[] }>;
  }>;
  continuity_context_panel_items?: Array<{
    id: string;
    label: string;
    why_surfaced: string;
    confidence: string;
    relation_path: string[];
    source_refs: string[];
    decrypt_needed: boolean;
  }>;
  continuity_watcher_signals?: Array<{
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
  }>;
  continuity_context_pack_items?: Array<{
    id: string;
    pack_kind: string;
    title: string;
    summary: string;
    confidence: string;
    why_surfaced: string;
    retrieval_mode?: string | null;
    deeper_retrieval_recommended?: boolean;
    readiness_reason?: string | null;
    topology_budget_used?: number;
    working_set_count?: number;
    active_topic_count?: number;
    anchor_refs: string[];
    source_refs: string[];
    reference_refs: string[];
    reference_labels: string[];
    object_refs: string[];
    object_labels: string[];
    file_refs: string[];
    file_labels: string[];
    evidence_kinds: string[];
    thread_retrieval_state?: {
      summary: string;
      badges: string[];
    } | null;
  }>;
  continuity_state_fields?: Array<{
    field_key: string;
    label: string;
    status: string;
    confidence: string;
    surface_hint: string;
    recommended_action: string;
    autonomy_level: string;
    reason: string;
    evidence_refs: string[];
  }>;
  conversation_attention_items?: Array<{
    id: string;
    provider: string;
    account_ref: string;
    conversation_key: string;
    conversation_family: string;
    conversation_family_label?: string | null;
    display_label: string;
    latest_message_ref?: string | null;
    latest_subject?: string | null;
    latest_sender?: string | null;
    last_observed_at: string;
    thread_id?: string | null;
    source_event_id?: string | null;
    latest_artifact_id?: string | null;
    latest_artifact_summary?: string | null;
    needs_attention: boolean;
    attention_rank?: number;
    latest_attention_kind: string;
    latest_attention_label?: string | null;
    review_action_label?: string | null;
    latest_artifact_type?: string | null;
    latest_artifact_subtype?: string | null;
    latest_artifact_draft_class?: string | null;
    latest_artifact_destination_view?: string | null;
    latest_value_hint?: string | null;
    latest_form_owner?: string | null;
    latest_submission_mode?: string | null;
    latest_requires_signature?: boolean | null;
    latest_sensitive_form?: boolean | null;
    summary: string;
  }>;
  conversation_attention_summary?: {
    count: number;
    prepared_draft_count: number;
    approval_request_count: number;
    background_follow_up_count: number;
    communication_count?: number;
    renewal_count?: number;
    bill_count?: number;
    form_count?: number;
  } | null;
  runtime_updates?: RuntimeUpdatesResponse | null;
  workflow_runtime_summary?: {
    workflow_count: number;
    active_run_count: number;
    waiting_run_count: number;
    failed_run_count: number;
    completed_run_count: number;
    paused_wait_resume_count: number;
    latest_workflow_title?: string | null;
    latest_run_status?: string | null;
  } | null;
  browser_runtime_summary?: {
    task_count: number;
    active_task_count: number;
    blocked_task_count: number;
    step_approval_task_count: number;
    failed_task_count: number;
    completed_task_count: number;
    cancelled_task_count: number;
    latest_task_goal?: string | null;
    latest_task_status?: string | null;
  } | null;
  task_runtime_summary?: {
    active_draft_task_count: number;
    cancelled_draft_task_count: number;
    total_draft_task_count: number;
    latest_draft_task_id?: string | null;
    latest_draft_task_title?: string | null;
    latest_draft_task_status?: string | null;
    latest_draft_task_thread_id?: string | null;
    latest_draft_task_action_message_id?: string | null;
  } | null;
  calendar_runtime_summary?: {
    tentative_hold_count: number;
    confirmed_event_count: number;
    latest_tentative_event_id?: string | null;
    latest_tentative_thread_id?: string | null;
    latest_tentative_action_message_id?: string | null;
    latest_tentative_title?: string | null;
    next_tentative_start_at?: string | null;
    latest_tentative_location?: string | null;
    latest_tentative_note_kind?: string | null;
    latest_tentative_prep_lead_minutes?: number | null;
    latest_tentative_profile?: Record<string, unknown> | null;
  } | null;
  trust_runtime_summary?: {
    provenance_record_count: number;
    audited_action_count: number;
    pending_audit_count: number;
    failed_audit_count: number;
    successful_audit_count: number;
    reversible_action_count: number;
    undo_ready_action_count: number;
    latest_provenance_action_type?: string | null;
    latest_audit_status?: string | null;
    latest_undo_label?: string | null;
  } | null;
  file_runtime_summary?: {
    ledger_create_count: number;
    ledger_update_count: number;
    export_result_count: number;
    active_staged_bundle_count: number;
    active_staged_bundle_file_count: number;
    staged_bundle_count: number;
    staged_bundle_file_count: number;
    discarded_bundle_count: number;
    active_file_entry_count: number;
    pending_access_request_count: number;
    active_grant_count: number;
    denied_access_count: number;
    revoked_access_count: number;
    file_op_count: number;
    latest_ledger_name?: string | null;
    latest_action_message_id?: string | null;
    latest_action_thread_id?: string | null;
    latest_reversible_message_id?: string | null;
    latest_reversible_thread_id?: string | null;
    latest_activity?: string | null;
  } | null;
  inbox_runtime_summary?: {
    active_staged_organization_count: number;
    staged_organization_count: number;
    reverted_organization_count: number;
    latest_provider?: string | null;
    latest_conversation_ref?: string | null;
    latest_action_message_id?: string | null;
    latest_action_thread_id?: string | null;
    latest_activity?: string | null;
  } | null;
  device_sync_runtime_summary?: {
    device_policy_count: number;
    used_device_count: number;
    local_key_device_count: number;
    desktop_device_count: number;
    mobile_device_count: number;
    watch_device_count: number;
    latest_device_id?: string | null;
    latest_device_class?: string | null;
    latest_policy_profile?: string | null;
    latest_last_used_at?: string | null;
    latest_policy_note?: string | null;
  } | null;
  simulator_runtime_summary?: {
    enabled_surface_count: number;
    promotion_enabled_surface_count: number;
    review_surface_count: number;
    sampled_surface_count: number;
    highest_rollout_stage: string;
    policy_posture_summary: string;
    latest_observed_at?: string | null;
    observed_rollout_stage?: string | null;
    observed_calibration_mode?: string | null;
    observed_projection_summary?: string | null;
    observed_review_summary?: string | null;
    observed_actionable_event_count?: number | null;
    observed_promotion_candidate_count?: number | null;
    observed_review_surface_count?: number | null;
    observed_calibration_notes?: string[] | null;
    rollout_alignment_status: string;
    rollout_alignment_summary: string;
    surfaces: Array<{
      surface: string;
      enabled: boolean;
      allow_promotion: boolean;
      probabilistic_sampling_enabled: boolean;
      review_surfaces_enabled: boolean;
      rollout_stage: string;
      calibration_mode: string;
      policy_summary: string;
      calibration_notes: string[];
    }>;
  } | null;
  runtime_deployment?: {
    id: string;
    framework: string;
    status: string;
    workspace_path: string;
    gui?: string | null;
    runtime_monitor?: {
      status: string;
      source: string;
      lines: string[];
      updated_at: string;
    } | null;
    runtime_status_panel?: Record<string, unknown> | null;
    runtime_status_views?: AfpView[] | null;
  } | null;
  operational_guidance?: {
    status: string;
    summary: string;
    command: string;
    source: string;
    pressure_status?: string | null;
    pressure_total_rows?: number | null;
    cleanup_mode?: string | null;
    generated_at?: string | null;
  } | null;
  support_access?: {
    status: string;
    access_scope: string;
    reason?: string | null;
    support_disabled_by_default: boolean;
    granted_at?: string | null;
    expires_at?: string | null;
    revoked_at?: string | null;
  } | null;
  support_access_history?: Array<{
    id: string;
    status: string;
    access_scope: string;
    reason?: string | null;
    granted_at: string;
    expires_at: string;
    revoked_at?: string | null;
  }>;
  device_sync_policies?: {
    entries: DeviceSyncPolicyEntry[];
  };
  runtime_backups?: RuntimeBackupsResponse | null;
  runtime_restore_drills?: RuntimeRestoreDrillsResponse | null;
};

export type RuntimeBackupsResponse = {
  policy: {
    retention_days: number;
    storage_mode: string;
    last_snapshot_at?: string | null;
    support_disabled_by_default: boolean;
  };
  entries: Array<{
    id: string;
    snapshot_type: string;
    storage_mode: string;
    status: string;
    file_count: number;
    total_workspace_bytes: number;
    artifact_size_bytes: number;
    created_at: string;
    expires_at: string;
    manifest_summary: Record<string, unknown> | null;
  }>;
};

export type RuntimeRestoreDrillsResponse = {
  entries: Array<{
    id: string;
    backup_id: string;
    status: string;
    started_at: string;
    completed_at?: string | null;
    notes_summary: Record<string, unknown> | null;
  }>;
};

export type RuntimeUpdatesResponse = {
  policy: {
    update_channel: string;
    auto_apply: string;
    support_disabled_by_default: boolean;
  };
  current_version: string;
  latest_version: string;
  update_available: boolean;
  runtime_status: string;
  framework?: string | null;
  last_checked_at?: string | null;
  last_applied_at?: string | null;
  entries: Array<{
    id: string;
    action: string;
    from_version?: string | null;
    to_version?: string | null;
    status: string;
    created_at: string;
    notes_summary: Record<string, unknown> | null;
  }>;
  panel?: Record<string, unknown> | null;
};

export type RuntimeRecoveryPacketResponse = {
  generated_at: string;
  packet_version: string;
  packet_name: string;
  user: Session["user"];
  runtime_deployment?: {
    id: string;
    framework: string;
    status: string;
    workspace_path: string;
  } | null;
  recovery_checklist: string[];
  privacy_notes: string[];
  runtime_backups: RuntimeBackupsResponse;
  runtime_restore_drills: RuntimeRestoreDrillsResponse;
  runtime_updates: RuntimeUpdatesResponse;
  operational_guidance?: {
    status: string;
    summary: string;
    command: string;
    source: string;
    pressure_status?: string | null;
    pressure_total_rows?: number | null;
    cleanup_mode?: string | null;
    generated_at?: string | null;
  } | null;
};

export type RuntimeBackupManifestResponse = {
  id: string;
  storage_mode: string;
  created_at: string;
  expires_at: string;
  manifest_json: Record<string, unknown> | null;
};

export type DeviceSyncPolicyEntry = {
  device_id: string;
  agent_id: string;
  device_class: string;
  policy_profile: string;
  sync_slices: Record<string, unknown> | unknown[] | null;
  requires_local_key_material: boolean;
  last_bundle_at: string;
  last_used_at?: string | null;
  updated_at: string;
  notes_summary: Record<string, unknown> | null;
};

export type DeviceSyncPoliciesResponse = {
  entries: DeviceSyncPolicyEntry[];
};

export type RuntimeWorkspaceFileEntry = {
  file_id: string;
  label: string;
  relative_path: string;
  language: string;
  editable: boolean;
};

export type RuntimeWorkspaceFileResponse = RuntimeWorkspaceFileEntry & {
  content: string;
  updated_at: string;
};

export type RuntimeWorkspaceFilesResponse = {
  framework: string;
  active_file_id?: string | null;
  files: RuntimeWorkspaceFileEntry[];
};

export type UiCommandResponse = {
  intent: string;
  suggested_view: string;
  preferred_view?: string;
  summary: string;
  engine: string;
  links: Array<{ title: string; url: string; kind: string; origin?: string | null }>;
  boundary?: Record<string, unknown> | null;
  bullets?: string[];
  card_id?: string | null;
  preview_message?: AfpMessage | null;
  runner_draft?: {
    target_file_id: string;
    title: string;
    content: string;
    requires_confirmation: boolean;
  } | null;
};

export type WorkflowTriggerRegistrationPreview = {
  status: string;
  activation_count: number;
  live_registration_supported: boolean;
  family_counts: Record<string, number>;
  registration_target_counts: Record<string, number>;
  runtime_requirement_counts: Record<string, number>;
  registration_targets: string[];
  runtime_requirements: string[];
  missing_runtime_capabilities: string[];
  next_dependency?: string | null;
};

export type WorkflowCompiledIr = Record<string, unknown> & {
  manifests?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  activation_registration_preview?: WorkflowTriggerRegistrationPreview;
};

export type SavedWorkflow = {
  workflow_id: string;
  owner_user_id: string;
  title: string;
  description?: string | null;
  favorite: boolean;
  preset_kinds: string[];
  graph: Record<string, unknown>;
  latest_ir?: WorkflowCompiledIr | null;
  trigger_readiness_summary?: WorkflowTriggerReadinessSummary;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

export type WorkflowListResponse = {
  workflows: SavedWorkflow[];
};

function normalizeWorkflowTriggerRegistrationPreview(value: unknown): WorkflowTriggerRegistrationPreview | undefined {
  if (!isRecord(value)) return undefined;
  return {
    status: apiString(value.status),
    activation_count: apiNumber(value.activation_count) ?? 0,
    live_registration_supported: apiBoolean(value.live_registration_supported),
    family_counts: normalizeWorkflowNumberMap(value.family_counts),
    registration_target_counts: normalizeWorkflowNumberMap(value.registration_target_counts),
    runtime_requirement_counts: normalizeWorkflowNumberMap(value.runtime_requirement_counts),
    registration_targets: apiStringList(value.registration_targets),
    runtime_requirements: apiStringList(value.runtime_requirements),
    missing_runtime_capabilities: apiStringList(value.missing_runtime_capabilities),
    next_dependency: apiNullableString(value.next_dependency),
  };
}

function normalizeWorkflowCompiledIr(value: unknown): WorkflowCompiledIr | null {
  if (!isRecord(value)) return null;
  const normalized: WorkflowCompiledIr = { ...value };
  if ("manifests" in normalized) {
    normalized.manifests = Array.isArray(value.manifests) ? value.manifests.filter(isRecord) : undefined;
  }
  if ("edges" in normalized) {
    normalized.edges = Array.isArray(value.edges) ? value.edges.filter(isRecord) : undefined;
  }
  if ("activation_registration_preview" in normalized) {
    normalized.activation_registration_preview =
      normalizeWorkflowTriggerRegistrationPreview(value.activation_registration_preview);
  }
  return normalized;
}

function normalizeSavedWorkflow(value: unknown): SavedWorkflow | null {
  if (!isRecord(value) || typeof value.workflow_id !== "string") return null;
  return {
    workflow_id: value.workflow_id,
    owner_user_id: apiString(value.owner_user_id),
    title: apiString(value.title, value.workflow_id),
    description: apiNullableString(value.description),
    favorite: apiBoolean(value.favorite),
    preset_kinds: apiStringList(value.preset_kinds),
    graph: isRecord(value.graph) ? value.graph : {},
    latest_ir: value.latest_ir === null ? null : normalizeWorkflowCompiledIr(value.latest_ir) ?? undefined,
    trigger_readiness_summary: normalizeWorkflowTriggerReadinessSummary(value.trigger_readiness_summary),
    created_at: apiString(value.created_at),
    updated_at: apiString(value.updated_at),
    archived_at: apiNullableString(value.archived_at),
  };
}

export function normalizeWorkflowListResponse(value: unknown): WorkflowListResponse {
  return {
    workflows: isRecord(value) && Array.isArray(value.workflows)
      ? value.workflows.flatMap((workflow): SavedWorkflow[] => {
          const normalized = normalizeSavedWorkflow(workflow);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeWorkflowSaveResponse(value: unknown): { saved: boolean; workflow: SavedWorkflow } {
  const workflow = isRecord(value) ? normalizeSavedWorkflow(value.workflow) : null;
  if (!isRecord(value) || !workflow) {
    throw new Error("Server response did not include a saved workflow.");
  }
  return {
    saved: apiBoolean(value.saved),
    workflow,
  };
}

export function normalizeWorkflowPatchResponse(value: unknown): { patched: boolean; ir_invalidated: boolean; workflow: SavedWorkflow } {
  const workflow = isRecord(value) ? normalizeSavedWorkflow(value.workflow) : null;
  if (!isRecord(value) || !workflow) {
    throw new Error("Server response did not include a patched workflow.");
  }
  return {
    patched: apiBoolean(value.patched),
    ir_invalidated: apiBoolean(value.ir_invalidated),
    workflow,
  };
}

function normalizeWorkflowNumberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) => {
      const normalized = apiNumber(count);
      return normalized === undefined ? [] : [[key, normalized]];
    }),
  );
}

function normalizeWorkflowTriggerReadinessSummary(value: unknown): WorkflowTriggerReadinessSummary | undefined {
  if (!isRecord(value)) return value === null ? null : undefined;
  return {
    status: typeof value.status === "string" || value.status === null ? value.status : undefined,
    live_registration_supported: typeof value.live_registration_supported === "boolean" || value.live_registration_supported === null
      ? value.live_registration_supported
      : undefined,
    activation_count: typeof value.activation_count === "number" && Number.isFinite(value.activation_count) || value.activation_count === null
      ? value.activation_count
      : undefined,
    registration_targets: Array.isArray(value.registration_targets) ? apiStringList(value.registration_targets) : undefined,
    runtime_requirements: Array.isArray(value.runtime_requirements) ? apiStringList(value.runtime_requirements) : undefined,
    missing_runtime_capabilities: Array.isArray(value.missing_runtime_capabilities) ? apiStringList(value.missing_runtime_capabilities) : undefined,
  };
}

function normalizeWorkflowTemplateSuggestion(value: unknown): WorkflowTemplateSuggestion | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  return {
    title: value.title,
    score: apiNumber(value.score) ?? 0,
    template_id: apiString(value.template_id),
    workflow_family: apiString(value.workflow_family),
    implementation_status: apiString(value.implementation_status),
    reliability: apiString(value.reliability),
    already_aligned: apiBoolean(value.already_aligned),
    rationale: apiString(value.rationale),
    advisory: apiString(value.advisory),
    semantic_roles: apiStringList(value.semantic_roles),
    matched_node_ids: apiStringList(value.matched_node_ids),
  };
}

function normalizeWorkflowCompiledSummary(value: unknown): WorkflowCompiledSummary | undefined {
  if (!isRecord(value)) return undefined;
  return {
    manifest_count: apiNumber(value.manifest_count) ?? 0,
    runtime_kind_counts: normalizeWorkflowNumberMap(value.runtime_kind_counts),
    afp_message_family_counts: normalizeWorkflowNumberMap(value.afp_message_family_counts),
    approval_manifest_count: apiNumber(value.approval_manifest_count) ?? 0,
    wait_resume_count: apiNumber(value.wait_resume_count) ?? 0,
  };
}

export function normalizeWorkflowValidationResponse(value: unknown): WorkflowValidationResponse {
  const summary = isRecord(value) && isRecord(value.summary) ? value.summary : null;
  return {
    valid: isRecord(value) ? apiBoolean(value.valid) : false,
    errors: isRecord(value) ? apiStringList(value.errors) : [],
    warnings: isRecord(value) ? apiStringList(value.warnings) : [],
    summary: summary
      ? {
          workflow_id: typeof summary.workflow_id === "string" || summary.workflow_id === null ? summary.workflow_id : undefined,
          node_count: apiNumber(summary.node_count) ?? 0,
          edge_count: apiNumber(summary.edge_count) ?? 0,
          compiled: normalizeWorkflowCompiledSummary(summary.compiled),
          trigger_readiness_summary: normalizeWorkflowTriggerReadinessSummary(summary.trigger_readiness_summary),
        }
      : undefined,
    template_suggestions: isRecord(value) && Array.isArray(value.template_suggestions)
      ? value.template_suggestions.flatMap((suggestion): WorkflowTemplateSuggestion[] => {
          const normalized = normalizeWorkflowTemplateSuggestion(suggestion);
          return normalized ? [normalized] : [];
        })
      : undefined,
  };
}

export type WorkflowTemplateSuggestion = {
  title: string;
  score: number;
  template_id: string;
  workflow_family: string;
  implementation_status: string;
  reliability: string;
  already_aligned: boolean;
  rationale: string;
  advisory: string;
  semantic_roles: string[];
  matched_node_ids: string[];
};

export type WorkflowCompiledSummary = {
  manifest_count: number;
  runtime_kind_counts: Record<string, number>;
  afp_message_family_counts: Record<string, number>;
  approval_manifest_count: number;
  wait_resume_count: number;
};

export type WorkflowValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary?: {
    workflow_id?: string | null;
    node_count: number;
    edge_count: number;
    compiled?: WorkflowCompiledSummary;
    trigger_readiness_summary?: WorkflowTriggerReadinessSummary;
  };
  template_suggestions?: WorkflowTemplateSuggestion[];
};

export type WorkflowIntentExpansion = {
  preset_kind: string;
  requires_approval: boolean;
  needs_branching: boolean;
  needs_research_support: boolean;
  public_output: boolean;
  optimization_mode: "balanced" | "speed" | "cost";
};

export type WorkflowDescribeResponse = {
  described: boolean;
  saved?: boolean;
  intent_expansion: WorkflowIntentExpansion;
  workflow: SavedWorkflow;
};

export type WorkflowCompileResponse = {
  compiled: boolean;
  workflow_id: string;
  ir: WorkflowCompiledIr;
  trigger_readiness_summary?: WorkflowTriggerReadinessSummary;
};

export type WorkflowTriggerReadinessSummary = {
  status?: string | null;
  live_registration_supported?: boolean | null;
  activation_count?: number | null;
  registration_targets?: string[];
  runtime_requirements?: string[];
  missing_runtime_capabilities?: string[];
} | null;

export type WorkflowDeployment = {
  deployment_id: string;
  workflow_id: string;
  owner_user_id: string;
  environment: string;
  status: string;
  ir_snapshot: WorkflowCompiledIr;
  trigger_readiness_summary?: WorkflowTriggerReadinessSummary;
  graph_snapshot: Record<string, unknown>;
  source_deployment_id?: string | null;
  deployed_at: string;
  created_at: string;
};

export type WorkflowDeploymentsResponse = {
  workflow_id: string;
  deployments: WorkflowDeployment[];
};

export type WorkflowRun = {
  run_id: string;
  workflow_id: string;
  deployment_id: string;
  owner_user_id: string;
  status: string;
  trigger_kind: string;
  replay_of_run_id?: string | null;
  timeline: Array<Record<string, unknown>>;
  result: Record<string, unknown>;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
};

export type WorkflowRunsResponse = {
  workflow_id: string;
  runs: WorkflowRun[];
};

export type WorkflowRunStartResponse = {
  started: boolean;
  workflow_id: string;
  run: WorkflowRun;
};

export type WorkflowWaitResumeRecord = {
  wait_resume_id: string;
  workflow_id: string;
  deployment_id: string;
  run_id: string;
  owner_user_id: string;
  manifest_node_id: string;
  source_graph_node_id: string;
  status: string;
  resume_family: string;
  resume_kind: string;
  wait_reason?: string | null;
  scheduled_for?: string | null;
  descriptor: Record<string, unknown>;
  created_at: string;
  resumed_at?: string | null;
};

export type WorkflowWaitResumeListResponse = {
  workflow_id: string;
  run_id: string;
  wait_resume_records: WorkflowWaitResumeRecord[];
};

export type WorkflowWaitResumeDecisionResponse = {
  updated: boolean;
  workflow_id: string;
  run_id: string;
  wait_resume_id: string;
  decision: "approved" | "rejected";
  wait_resume_status: string;
  run: WorkflowRun;
  decision_dispatch: Record<string, unknown>;
};

export type WorkflowActionResponse = {
  updated: boolean;
  deployment_id?: string;
  trigger_readiness_summary?: WorkflowTriggerReadinessSummary;
  workflow: SavedWorkflow;
};

function normalizeWorkflowIntentExpansion(value: unknown): WorkflowIntentExpansion {
  const record = isRecord(value) ? value : {};
  return {
    preset_kind: apiString(record.preset_kind),
    requires_approval: apiBoolean(record.requires_approval),
    needs_branching: apiBoolean(record.needs_branching),
    needs_research_support: apiBoolean(record.needs_research_support),
    public_output: apiBoolean(record.public_output),
    optimization_mode: record.optimization_mode === "speed" || record.optimization_mode === "cost"
      ? record.optimization_mode
      : "balanced",
  };
}

export function normalizeWorkflowDescribeResponse(value: unknown): WorkflowDescribeResponse {
  const workflow = isRecord(value) ? normalizeSavedWorkflow(value.workflow) : null;
  if (!isRecord(value) || !workflow) {
    throw new Error("Server response did not include a described workflow.");
  }
  return {
    described: apiBoolean(value.described),
    saved: typeof value.saved === "boolean" ? value.saved : undefined,
    intent_expansion: normalizeWorkflowIntentExpansion(value.intent_expansion),
    workflow,
  };
}

export function normalizeSavedWorkflowResponse(value: unknown): SavedWorkflow {
  const workflow = normalizeSavedWorkflow(value);
  if (!workflow) {
    throw new Error("Server response did not include a workflow.");
  }
  return workflow;
}

export function normalizeWorkflowCompileResponse(value: unknown): WorkflowCompileResponse {
  if (!isRecord(value) || typeof value.workflow_id !== "string") {
    throw new Error("Server response did not include a compiled workflow id.");
  }
  return {
    compiled: apiBoolean(value.compiled),
    workflow_id: value.workflow_id,
    ir: normalizeWorkflowCompiledIr(value.ir) ?? {},
    trigger_readiness_summary: normalizeWorkflowTriggerReadinessSummary(value.trigger_readiness_summary),
  };
}

export function normalizeWorkflowDeployment(value: unknown): WorkflowDeployment | null {
  if (!isRecord(value) || typeof value.deployment_id !== "string") return null;
  return {
    deployment_id: value.deployment_id,
    workflow_id: apiString(value.workflow_id),
    owner_user_id: apiString(value.owner_user_id),
    environment: apiString(value.environment),
    status: apiString(value.status),
    ir_snapshot: isRecord(value.ir_snapshot) ? value.ir_snapshot : {},
    trigger_readiness_summary: normalizeWorkflowTriggerReadinessSummary(value.trigger_readiness_summary),
    graph_snapshot: isRecord(value.graph_snapshot) ? value.graph_snapshot : {},
    source_deployment_id: typeof value.source_deployment_id === "string" || value.source_deployment_id === null ? value.source_deployment_id : undefined,
    deployed_at: apiString(value.deployed_at),
    created_at: apiString(value.created_at),
  };
}

export function normalizeWorkflowDeploymentsResponse(value: unknown): WorkflowDeploymentsResponse {
  return {
    workflow_id: isRecord(value) ? apiString(value.workflow_id) : "",
    deployments: isRecord(value) && Array.isArray(value.deployments)
      ? value.deployments.flatMap((deployment): WorkflowDeployment[] => {
          const normalized = normalizeWorkflowDeployment(deployment);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeWorkflowRun(value: unknown): WorkflowRun | null {
  if (!isRecord(value) || typeof value.run_id !== "string") return null;
  return {
    run_id: value.run_id,
    workflow_id: apiString(value.workflow_id),
    deployment_id: apiString(value.deployment_id),
    owner_user_id: apiString(value.owner_user_id),
    status: apiString(value.status),
    trigger_kind: apiString(value.trigger_kind),
    replay_of_run_id: typeof value.replay_of_run_id === "string" || value.replay_of_run_id === null ? value.replay_of_run_id : undefined,
    timeline: Array.isArray(value.timeline) ? value.timeline.filter(isRecord) : [],
    result: isRecord(value.result) ? value.result : {},
    started_at: apiString(value.started_at),
    completed_at: typeof value.completed_at === "string" || value.completed_at === null ? value.completed_at : undefined,
    created_at: apiString(value.created_at),
  };
}

export function normalizeWorkflowRunsResponse(value: unknown): WorkflowRunsResponse {
  return {
    workflow_id: isRecord(value) ? apiString(value.workflow_id) : "",
    runs: isRecord(value) && Array.isArray(value.runs)
      ? value.runs.flatMap((run): WorkflowRun[] => {
          const normalized = normalizeWorkflowRun(run);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeWorkflowRunStartResponse(value: unknown): WorkflowRunStartResponse {
  const run = isRecord(value) ? normalizeWorkflowRun(value.run) : null;
  if (!isRecord(value) || !run) {
    throw new Error("Server response did not include a started workflow run.");
  }
  return {
    started: apiBoolean(value.started),
    workflow_id: apiString(value.workflow_id, run.workflow_id),
    run,
  };
}

export function normalizeWorkflowWaitResumeRecord(value: unknown): WorkflowWaitResumeRecord | null {
  if (!isRecord(value) || typeof value.wait_resume_id !== "string") return null;
  return {
    wait_resume_id: value.wait_resume_id,
    workflow_id: apiString(value.workflow_id),
    deployment_id: apiString(value.deployment_id),
    run_id: apiString(value.run_id),
    owner_user_id: apiString(value.owner_user_id),
    manifest_node_id: apiString(value.manifest_node_id),
    source_graph_node_id: apiString(value.source_graph_node_id),
    status: apiString(value.status),
    resume_family: apiString(value.resume_family),
    resume_kind: apiString(value.resume_kind),
    wait_reason: typeof value.wait_reason === "string" || value.wait_reason === null ? value.wait_reason : undefined,
    scheduled_for: typeof value.scheduled_for === "string" || value.scheduled_for === null ? value.scheduled_for : undefined,
    descriptor: isRecord(value.descriptor) ? value.descriptor : {},
    created_at: apiString(value.created_at),
    resumed_at: typeof value.resumed_at === "string" || value.resumed_at === null ? value.resumed_at : undefined,
  };
}

export function normalizeWorkflowWaitResumeListResponse(value: unknown): WorkflowWaitResumeListResponse {
  return {
    workflow_id: isRecord(value) ? apiString(value.workflow_id) : "",
    run_id: isRecord(value) ? apiString(value.run_id) : "",
    wait_resume_records: isRecord(value) && Array.isArray(value.wait_resume_records)
      ? value.wait_resume_records.flatMap((record): WorkflowWaitResumeRecord[] => {
          const normalized = normalizeWorkflowWaitResumeRecord(record);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeWorkflowWaitResumeDecision(value: unknown): "approved" | "rejected" {
  return value === "rejected" ? "rejected" : "approved";
}

export function normalizeWorkflowWaitResumeDecisionResponse(value: unknown): WorkflowWaitResumeDecisionResponse {
  const run = isRecord(value) ? normalizeWorkflowRun(value.run) : null;
  if (!isRecord(value) || typeof value.wait_resume_id !== "string" || !run) {
    throw new Error("Server response did not include a wait/resume decision.");
  }
  return {
    updated: apiBoolean(value.updated),
    workflow_id: apiString(value.workflow_id, run.workflow_id),
    run_id: apiString(value.run_id, run.run_id),
    wait_resume_id: value.wait_resume_id,
    decision: normalizeWorkflowWaitResumeDecision(value.decision),
    wait_resume_status: apiString(value.wait_resume_status),
    run,
    decision_dispatch: isRecord(value.decision_dispatch) ? value.decision_dispatch : {},
  };
}

export function normalizeWorkflowActionResponse(value: unknown): WorkflowActionResponse {
  const workflow = isRecord(value) ? normalizeSavedWorkflow(value.workflow) : null;
  if (!isRecord(value) || !workflow) {
    throw new Error("Server response did not include an updated workflow.");
  }
  return {
    updated: apiBoolean(value.updated),
    deployment_id: typeof value.deployment_id === "string" ? value.deployment_id : undefined,
    trigger_readiness_summary: normalizeWorkflowTriggerReadinessSummary(value.trigger_readiness_summary),
    workflow,
  };
}

export type WorkflowConnectorOverrideFields = {
  delivery_tier?: string;
  auth_mode?: string;
  side_effects?: string;
  provider_route?: string;
};

export type WorkflowConnectorOverrides = WorkflowConnectorOverrideFields & {
  family_overrides?: Record<string, WorkflowConnectorOverrideFields>;
  node_overrides?: Record<string, WorkflowConnectorOverrideFields>;
};

export type DaemonRecord = {
  daemon_id: string;
  daemon_kind: string;
  display_name: string;
  status: string;
  workflow_id?: string | null;
  delegated_key_id: string;
  last_heartbeat_at?: string | null;
  created_at: string;
  revoked_at?: string | null;
  policy_config?: Record<string, unknown> | null;
  stale_minutes?: number | null;
};

export type DaemonHeartbeatDetail = {
  heartbeat_id: string;
  daemon_id: string;
  user_id: string;
  metrics: Record<string, unknown>;
  created_at: string;
};

function apiString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function apiNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function apiBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function apiStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function apiNullableString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function apiNullableBoolean(value: unknown): boolean | null | undefined {
  return typeof value === "boolean" || value === null ? value : undefined;
}

function normalizeAutonomyDecisionValue(value: unknown): {
  autonomy_level?: string | null;
  reversibility?: string | null;
  consequence_level?: string | null;
  confidence?: string | null;
  approval_required?: boolean | null;
  interruption_budget?: string | null;
  reason?: string | null;
} | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const approvalRequired = apiNullableBoolean(value.approval_required);
  const reversibility = apiNullableString(value.reversibility)
    ?? (() => {
      if (approvalRequired === true) return "approval_required";
      if (value.reversible === true) return "reversible";
      if (value.reversible === false) return "not_reversible";
      return undefined;
    })();
  const consequenceLevel =
    apiNullableString(value.consequence_level)
    ?? apiNullableString(value.consequence);
  const reason = apiNullableString(value.reason) ?? apiNullableString(value.rationale);

  return {
    autonomy_level: apiNullableString(value.autonomy_level),
    reversibility,
    consequence_level: consequenceLevel,
    confidence: apiNullableString(value.confidence),
    approval_required: approvalRequired,
    interruption_budget: apiNullableString(value.interruption_budget),
    reason,
  };
}

function normalizeAutonomyTierValue(value: unknown): string | null | undefined {
  const normalized = apiNullableString(value);
  if (normalized === undefined || normalized === null) return normalized;
  switch (normalized) {
    case "ask_always":
    case "notify_then_act":
    case "auto_execute":
      return normalized;
    default:
      return undefined;
  }
}

function apiNullableNumber(value: unknown): number | null | undefined {
  const normalized = apiNumber(value);
  return normalized ?? (value === null ? null : undefined);
}

export function normalizeRuntimeWorkspaceFileEntry(value: unknown): RuntimeWorkspaceFileEntry | null {
  if (!isRecord(value) || typeof value.file_id !== "string" || typeof value.relative_path !== "string") return null;
  return {
    file_id: value.file_id,
    label: apiString(value.label, value.relative_path),
    relative_path: value.relative_path,
    language: apiString(value.language),
    editable: apiBoolean(value.editable),
  };
}

export function normalizeRuntimeWorkspaceFilesResponse(value: unknown): RuntimeWorkspaceFilesResponse {
  const record = isRecord(value) ? value : {};
  return {
    framework: apiString(record.framework),
    active_file_id: typeof record.active_file_id === "string" || record.active_file_id === null
      ? record.active_file_id
      : undefined,
    files: Array.isArray(record.files)
      ? record.files.flatMap((file): RuntimeWorkspaceFileEntry[] => {
          const normalized = normalizeRuntimeWorkspaceFileEntry(file);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeRuntimeWorkspaceFileResponse(value: unknown): RuntimeWorkspaceFileResponse | null {
  const entry = normalizeRuntimeWorkspaceFileEntry(value);
  if (!entry || !isRecord(value) || typeof value.content !== "string") return null;
  return {
    ...entry,
    content: value.content,
    updated_at: apiString(value.updated_at),
  };
}

export function normalizeRuntimeLogsResponse(value: unknown): { lines: string[]; source?: string } {
  if (!isRecord(value)) return { lines: [] };
  return {
    lines: apiStringList(value.lines),
    source: typeof value.source === "string" ? value.source : undefined,
  };
}

function normalizeUiCommandLink(value: unknown): UiCommandResponse["links"][number] | null {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.url !== "string") return null;
  return {
    title: value.title,
    url: value.url,
    kind: apiString(value.kind),
    origin: typeof value.origin === "string" || value.origin === null ? value.origin : undefined,
  };
}

function normalizeUiCommandRunnerDraft(value: unknown): UiCommandResponse["runner_draft"] {
  if (!isRecord(value) || typeof value.target_file_id !== "string" || typeof value.content !== "string") return null;
  return {
    target_file_id: value.target_file_id,
    title: apiString(value.title),
    content: value.content,
    requires_confirmation: apiBoolean(value.requires_confirmation),
  };
}

export function normalizeUiCommandResponse(value: unknown): UiCommandResponse {
  const record = isRecord(value) ? value : {};
  return {
    intent: apiString(record.intent),
    suggested_view: apiString(record.suggested_view),
    preferred_view: typeof record.preferred_view === "string" ? record.preferred_view : undefined,
    summary: apiString(record.summary),
    engine: apiString(record.engine),
    links: Array.isArray(record.links)
      ? record.links.flatMap((link): UiCommandResponse["links"] => {
          const normalized = normalizeUiCommandLink(link);
          return normalized ? [normalized] : [];
        })
      : [],
    boundary: isRecord(record.boundary) || record.boundary === null ? record.boundary : undefined,
    bullets: apiStringList(record.bullets),
    card_id: typeof record.card_id === "string" || record.card_id === null ? record.card_id : undefined,
    preview_message: record.preview_message === null ? null : normalizeAfpMessage(record.preview_message),
    runner_draft: normalizeUiCommandRunnerDraft(record.runner_draft),
  };
}

function normalizeDashboardAgent(value: unknown): DashboardBootstrap["agents"][number] | null {
  if (!isRecord(value) || typeof value.agent_id !== "string") return null;
  return {
    agent_id: value.agent_id,
    label: typeof value.label === "string" ? value.label : undefined,
  };
}

function normalizeDashboardThreadRetrievalState(value: unknown): DashboardBootstrap["thread_retrieval_state"] | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    summary: apiString(value.summary),
    badges: apiStringList(value.badges),
  };
}

function normalizeDashboardActionLogEntry(value: unknown): NonNullable<DashboardBootstrap["action_log"]>[number] | null {
  if (!isRecord(value) || typeof value.capability_id !== "string" || typeof value.thread_id !== "string") return null;
  const reversible = isRecord(value.reversible_summary)
    ? {
        reversible: apiBoolean(value.reversible_summary.reversible),
        undo_label: typeof value.reversible_summary.undo_label === "string" || value.reversible_summary.undo_label === null
          ? value.reversible_summary.undo_label
          : undefined,
        action_message_id: typeof value.reversible_summary.action_message_id === "string" || value.reversible_summary.action_message_id === null
          ? value.reversible_summary.action_message_id
          : undefined,
        rollback_checkpoint_id: typeof value.reversible_summary.rollback_checkpoint_id === "string" || value.reversible_summary.rollback_checkpoint_id === null
          ? value.reversible_summary.rollback_checkpoint_id
          : undefined,
        provenance_record_id: typeof value.reversible_summary.provenance_record_id === "string" || value.reversible_summary.provenance_record_id === null
          ? value.reversible_summary.provenance_record_id
          : undefined,
        side_effect_boundary: typeof value.reversible_summary.side_effect_boundary === "string" || value.reversible_summary.side_effect_boundary === null
          ? value.reversible_summary.side_effect_boundary
          : undefined,
      }
    : value.reversible_summary === null ? null : undefined;
  return {
    capability_id: value.capability_id,
    thread_id: value.thread_id,
    status: apiString(value.status),
    output: isRecord(value.output) ? value.output : {},
    external_reference: typeof value.external_reference === "string" || value.external_reference === null
      ? value.external_reference
      : undefined,
    recorded_at: apiString(value.recorded_at),
    reversible_summary: reversible,
  };
}

function normalizeDashboardSuggestion(value: unknown): NonNullable<DashboardBootstrap["proactive_suggestions"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const outcomeFeedback = isRecord(value.outcome_feedback)
    ? {
        heuristic_id: apiString(value.outcome_feedback.heuristic_id),
        total: apiNumber(value.outcome_feedback.total) ?? 0,
        accepted: apiNumber(value.outcome_feedback.accepted) ?? 0,
        acceptance_rate: apiNumber(value.outcome_feedback.acceptance_rate) ?? 0,
        status: apiString(value.outcome_feedback.status),
        scope: typeof value.outcome_feedback.scope === "string" ? value.outcome_feedback.scope : undefined,
        suggested_suppression_hours: apiNullableNumber(value.outcome_feedback.suggested_suppression_hours),
        suggested_half_life_days: apiNumber(value.outcome_feedback.suggested_half_life_days) ?? 0,
        adaptation_reason: apiNullableString(value.outcome_feedback.adaptation_reason),
        threshold_delta: apiNullableNumber(value.outcome_feedback.threshold_delta),
        sample_count: apiNullableNumber(value.outcome_feedback.sample_count),
        adaptation_signals: apiStringList(value.outcome_feedback.adaptation_signals),
      }
    : undefined;
  const draftPreview = isRecord(value.draft_preview)
    ? {
        label: apiNullableString(value.draft_preview.label),
        content: apiNullableString(value.draft_preview.content),
        content_type: apiNullableString(value.draft_preview.content_type),
      }
    : value.draft_preview === null ? null : undefined;
  return {
    id: value.id,
    kind: typeof value.kind === "string" ? value.kind : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    suggested_action: typeof value.suggested_action === "string" ? value.suggested_action : undefined,
    action_label: typeof value.action_label === "string" ? value.action_label : undefined,
    confidence: typeof value.confidence === "string" ? value.confidence : undefined,
    requires_approval: typeof value.requires_approval === "boolean" ? value.requires_approval : undefined,
    destination_view: apiNullableString(value.destination_view),
    surface_hint: apiNullableString(value.surface_hint),
    panel_kind: apiNullableString(value.panel_kind),
    draft_class: typeof value.draft_class === "string" ? value.draft_class : undefined,
    pack_id: typeof value.pack_id === "string" ? value.pack_id : undefined,
    pack_kind: typeof value.pack_kind === "string" ? value.pack_kind : undefined,
    is_pack_suggestion: typeof value.is_pack_suggestion === "boolean" ? value.is_pack_suggestion : undefined,
    channel: typeof value.channel === "string" ? value.channel : undefined,
    readiness: typeof value.readiness === "string" ? value.readiness : undefined,
    response_due_hint: typeof value.response_due_hint === "string" ? value.response_due_hint : undefined,
    approval_or_reversibility_hint: apiNullableString(value.approval_or_reversibility_hint),
    selection_reason: apiNullableString(value.selection_reason),
    provenance_cue: apiNullableString(value.provenance_cue),
    autonomy_tier: normalizeAutonomyTierValue(value.autonomy_tier),
    retrieval_mode: apiNullableString(value.retrieval_mode),
    deeper_retrieval_recommended:
      typeof value.deeper_retrieval_recommended === "boolean"
        ? value.deeper_retrieval_recommended
        : undefined,
    readiness_reason: apiNullableString(value.readiness_reason),
    topology_budget_used: apiNumber(value.topology_budget_used) ?? 0,
    working_set_count: apiNumber(value.working_set_count) ?? 0,
    active_topic_count: apiNumber(value.active_topic_count) ?? 0,
    working_set_refs: Array.isArray(value.working_set_refs) ? apiStringList(value.working_set_refs) : [],
    active_topic_refs: Array.isArray(value.active_topic_refs) ? apiStringList(value.active_topic_refs) : [],
    artifact_summary_lines: Array.isArray(value.artifact_summary_lines) ? apiStringList(value.artifact_summary_lines) : [],
    memory_space: apiNullableString(value.memory_space),
    author_mask: apiNullableString(value.author_mask),
    author_type: apiNullableString(value.author_type),
    author_id: apiNullableString(value.author_id),
    is_human_authored: apiNullableBoolean(value.is_human_authored),
    human_only: apiNullableBoolean(value.human_only),
    source_refs: Array.isArray(value.source_refs) ? apiStringList(value.source_refs) : [],
    source_count: apiNumber(value.source_count) ?? 0,
    reference_refs: Array.isArray(value.reference_refs) ? apiStringList(value.reference_refs) : [],
    decision_history_refs: Array.isArray(value.decision_history_refs) ? apiStringList(value.decision_history_refs) : [],
    project_refs: Array.isArray(value.project_refs) ? apiStringList(value.project_refs) : [],
    reference_labels: Array.isArray(value.reference_labels) ? apiStringList(value.reference_labels) : [],
    object_refs: Array.isArray(value.object_refs) ? apiStringList(value.object_refs) : [],
    object_labels: Array.isArray(value.object_labels) ? apiStringList(value.object_labels) : [],
    thread_refs: Array.isArray(value.thread_refs) ? apiStringList(value.thread_refs) : [],
    file_refs: Array.isArray(value.file_refs) ? apiStringList(value.file_refs) : [],
    file_labels: Array.isArray(value.file_labels) ? apiStringList(value.file_labels) : [],
    linked_target_label: apiNullableString(value.linked_target_label),
    thread_retrieval_state: normalizeDashboardThreadRetrievalState(value.thread_retrieval_state),
    anchor_refs: Array.isArray(value.anchor_refs) ? apiStringList(value.anchor_refs) : [],
    evidence_kinds: Array.isArray(value.evidence_kinds) ? apiStringList(value.evidence_kinds) : [],
    heuristic_family_id: typeof value.heuristic_family_id === "string" ? value.heuristic_family_id : undefined,
    action_afp_payload: value.action_afp_payload === null ? null : isRecord(value.action_afp_payload) ? value.action_afp_payload : undefined,
    outcome_feedback: outcomeFeedback,
    comparison_headers: Array.isArray(value.comparison_headers) ? apiStringList(value.comparison_headers) : undefined,
    comparison_rows: normalizeComparisonRows(value.comparison_rows),
    approval_kind: apiNullableString(value.approval_kind),
    autonomy_decision: normalizeAutonomyDecisionValue(value.autonomy_decision),
    draft_preview: draftPreview,
    preview_only: typeof value.preview_only === "boolean" ? value.preview_only : undefined,
    preview_boundary_summary: apiNullableString(value.preview_boundary_summary),
  };
}

function normalizeDashboardCostSnapshot(value: unknown): DashboardBootstrap["cost_snapshot"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    total_usd: apiNumber(value.total_usd) ?? 0,
    total_tokens: apiNumber(value.total_tokens) ?? 0,
    event_count: apiNumber(value.event_count) ?? 0,
    run_count: apiNumber(value.run_count) ?? 0,
    monthly_budget_usd: apiNumber(value.monthly_budget_usd) ?? 0,
    soft_limit_ratio: apiNumber(value.soft_limit_ratio) ?? 0,
    recent_spend_usd_14d: apiNumber(value.recent_spend_usd_14d) ?? 0,
    cost_month_usd: apiNumber(value.cost_month_usd) ?? 0,
    estimated_monthly_margin_usd: apiNumber(value.estimated_monthly_margin_usd) ?? 0,
    deep_queries_today: apiNumber(value.deep_queries_today) ?? 0,
    daily_deep_query_limit: apiNumber(value.daily_deep_query_limit) ?? 0,
    margin_guard_active: apiBoolean(value.margin_guard_active),
    usage_guard_active: apiBoolean(value.usage_guard_active),
  };
}

function normalizeDashboardCostStatus(value: unknown): DashboardBootstrap["cost_status"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    level: apiString(value.level),
    title: apiString(value.title),
    detail: apiString(value.detail),
    action_label: apiString(value.action_label),
  };
}

function normalizeDashboardRuntimeDeployment(value: unknown): DashboardBootstrap["runtime_deployment"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const monitor = isRecord(value.runtime_monitor)
    ? {
        status: apiString(value.runtime_monitor.status),
        source: apiString(value.runtime_monitor.source),
        lines: apiStringList(value.runtime_monitor.lines),
        updated_at: apiString(value.runtime_monitor.updated_at),
      }
    : value.runtime_monitor === null ? null : undefined;
  return {
    id: apiString(value.id),
    framework: apiString(value.framework),
    status: apiString(value.status),
    workspace_path: apiString(value.workspace_path),
    gui: typeof value.gui === "string" || value.gui === null ? value.gui : undefined,
    runtime_monitor: monitor,
    runtime_status_panel: isRecord(value.runtime_status_panel) || value.runtime_status_panel === null
      ? value.runtime_status_panel
      : undefined,
    runtime_status_views: Array.isArray(value.runtime_status_views)
      ? value.runtime_status_views.filter((view): view is AfpView => isRecord(view) && typeof view.format === "string")
      : value.runtime_status_views === null ? null : undefined,
  };
}

function normalizeDashboardContinuityBrief(value: unknown): DashboardBootstrap["continuity_brief"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    source_type: apiString(value.source_type),
    title: apiString(value.title),
    decision_count: apiNumber(value.decision_count) ?? 0,
    commitment_count: apiNumber(value.commitment_count) ?? 0,
    critical_change_count: apiNumber(value.critical_change_count) ?? 0,
    suggested_actions: apiStringList(value.suggested_actions),
    staleness_at: apiNullableString(value.staleness_at),
  };
}

function normalizeDashboardContinuityPriorityCard(value: unknown): DashboardBootstrap["continuity_priority_card"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    title: apiString(value.title),
    description: apiString(value.description),
    panel_kind: apiString(value.panel_kind),
    requires_approval: apiBoolean(value.requires_approval),
    action_label: apiString(value.action_label),
    surface_hint: apiNullableString(value.surface_hint),
    confidence: apiNullableString(value.confidence),
    prepared_draft_class: apiNullableString(value.prepared_draft_class),
    selection_reason: apiNullableString(value.selection_reason),
    approval_or_reversibility_hint: apiNullableString(value.approval_or_reversibility_hint),
    provenance_cue: apiNullableString(value.provenance_cue),
    autonomy_tier: normalizeAutonomyTierValue(value.autonomy_tier),
    retrieval_mode: apiNullableString(value.retrieval_mode),
    deeper_retrieval_recommended:
      typeof value.deeper_retrieval_recommended === "boolean"
        ? value.deeper_retrieval_recommended
        : undefined,
    readiness_reason: apiNullableString(value.readiness_reason),
    topology_budget_used: apiNumber(value.topology_budget_used) ?? 0,
    working_set_count: apiNumber(value.working_set_count) ?? 0,
    active_topic_count: apiNumber(value.active_topic_count) ?? 0,
    working_set_refs: Array.isArray(value.working_set_refs) ? apiStringList(value.working_set_refs) : [],
    active_topic_refs: Array.isArray(value.active_topic_refs) ? apiStringList(value.active_topic_refs) : [],
    decision_history_refs: Array.isArray(value.decision_history_refs) ? apiStringList(value.decision_history_refs) : [],
    project_refs: Array.isArray(value.project_refs) ? apiStringList(value.project_refs) : [],
    thread_refs: Array.isArray(value.thread_refs) ? apiStringList(value.thread_refs) : [],
    linked_target_label: apiNullableString(value.linked_target_label),
    source_refs: apiStringList(value.source_refs),
    object_refs: Array.isArray(value.object_refs) ? apiStringList(value.object_refs) : [],
    object_labels: Array.isArray(value.object_labels) ? apiStringList(value.object_labels) : [],
    file_refs: Array.isArray(value.file_refs) ? apiStringList(value.file_refs) : [],
    file_labels: Array.isArray(value.file_labels) ? apiStringList(value.file_labels) : [],
    memory_space: apiNullableString(value.memory_space),
    autonomy_decision: normalizeAutonomyDecisionValue(value.autonomy_decision),
    author_mask: apiNullableString(value.author_mask),
    author_type: apiNullableString(value.author_type),
    author_id: apiNullableString(value.author_id),
    is_human_authored: apiNullableBoolean(value.is_human_authored),
    human_only: apiNullableBoolean(value.human_only),
    thread_retrieval_state: normalizeDashboardThreadRetrievalState(value.thread_retrieval_state),
  };
}

function normalizeDashboardContinuityActionItem(value: unknown): NonNullable<DashboardBootstrap["continuity_action_items"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    title: apiString(value.title),
    category: apiString(value.category),
    urgency: apiString(value.urgency),
    confidence: apiString(value.confidence),
    requires_approval: apiBoolean(value.requires_approval),
    suggested_action: apiString(value.suggested_action),
    surface_hint: apiNullableString(value.surface_hint),
    selection_reason: apiNullableString(value.selection_reason),
    approval_or_reversibility_hint: apiNullableString(value.approval_or_reversibility_hint),
    provenance_cue: apiNullableString(value.provenance_cue),
    autonomy_tier: normalizeAutonomyTierValue(value.autonomy_tier),
    autonomy_decision: normalizeAutonomyDecisionValue(value.autonomy_decision),
    source_refs: apiStringList(value.source_refs),
    memory_space: apiNullableString(value.memory_space),
    author_mask: apiNullableString(value.author_mask),
    author_type: apiNullableString(value.author_type),
    author_id: apiNullableString(value.author_id),
    is_human_authored: apiNullableBoolean(value.is_human_authored),
    human_only: apiNullableBoolean(value.human_only),
  };
}

function normalizeDashboardContinuityResponseItem(value: unknown): NonNullable<DashboardBootstrap["continuity_response_items"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    title: apiString(value.title),
    channel: apiString(value.channel),
    urgency: apiString(value.urgency),
    confidence: apiString(value.confidence),
    response_due_hint: apiString(value.response_due_hint),
    suggested_action: apiString(value.suggested_action),
    autonomy_decision: normalizeAutonomyDecisionValue(value.autonomy_decision),
    prepared_draft_id: apiNullableString(value.prepared_draft_id),
    prepared_draft_summary: apiNullableString(value.prepared_draft_summary),
    prepared_draft_readiness: apiNullableString(value.prepared_draft_readiness),
    prepared_draft_body: apiNullableString(value.prepared_draft_body),
    prepared_draft_class: apiNullableString(value.prepared_draft_class),
    prepared_draft_selection_reason: apiNullableString(value.prepared_draft_selection_reason),
    prepared_draft_available: typeof value.prepared_draft_available === "boolean" ? value.prepared_draft_available : undefined,
    prepared_draft_requires_approval: typeof value.prepared_draft_requires_approval === "boolean" ? value.prepared_draft_requires_approval : undefined,
    prepared_draft_autonomy_decision: normalizeAutonomyDecisionValue(value.prepared_draft_autonomy_decision),
    prepared_draft_lead_summary: apiNullableString(value.prepared_draft_lead_summary),
    prepared_draft_summary_lines: Array.isArray(value.prepared_draft_summary_lines) ? apiStringList(value.prepared_draft_summary_lines) : undefined,
    prepared_draft_object_refs: Array.isArray(value.prepared_draft_object_refs) ? apiStringList(value.prepared_draft_object_refs) : undefined,
    prepared_draft_object_labels: Array.isArray(value.prepared_draft_object_labels) ? apiStringList(value.prepared_draft_object_labels) : undefined,
    prepared_draft_thread_retrieval_state: normalizeDashboardThreadRetrievalState(value.prepared_draft_thread_retrieval_state),
    source_refs: apiStringList(value.source_refs),
  };
}

function normalizeDashboardContinuityPreparedDraftItem(value: unknown): NonNullable<DashboardBootstrap["continuity_prepared_draft_items"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    draft_class: apiString(value.draft_class),
    title: apiString(value.title),
    channel: apiString(value.channel),
    summary: apiString(value.summary),
    body: apiString(value.body),
    confidence: apiString(value.confidence),
    readiness: apiString(value.readiness),
    response_due_hint: apiString(value.response_due_hint),
    requires_approval: apiBoolean(value.requires_approval),
    suggested_action: apiString(value.suggested_action),
    autonomy_decision: normalizeAutonomyDecisionValue(value.autonomy_decision),
    selection_reason: apiNullableString(value.selection_reason),
    approval_or_reversibility_hint: apiNullableString(value.approval_or_reversibility_hint),
    provenance_cue: apiNullableString(value.provenance_cue),
    autonomy_tier: normalizeAutonomyTierValue(value.autonomy_tier),
    source_refs: apiStringList(value.source_refs),
    object_refs: Array.isArray(value.object_refs) ? apiStringList(value.object_refs) : undefined,
    object_labels: Array.isArray(value.object_labels) ? apiStringList(value.object_labels) : undefined,
    comparison_headers: Array.isArray(value.comparison_headers) ? apiStringList(value.comparison_headers) : undefined,
    comparison_rows: normalizeComparisonRows(value.comparison_rows),
  };
}

function normalizeDashboardContinuityContextPanelItem(value: unknown): NonNullable<DashboardBootstrap["continuity_context_panel_items"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    label: apiString(value.label),
    why_surfaced: apiString(value.why_surfaced),
    confidence: apiString(value.confidence),
    relation_path: apiStringList(value.relation_path),
    source_refs: apiStringList(value.source_refs),
    decrypt_needed: apiBoolean(value.decrypt_needed),
  };
}

function normalizeDashboardContinuityWatcherSignal(value: unknown): NonNullable<DashboardBootstrap["continuity_watcher_signals"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    signal_key: apiString(value.signal_key),
    category: apiString(value.category),
    freshness: apiString(value.freshness),
    urgency: apiString(value.urgency),
    confidence: apiString(value.confidence),
    urgency_hint: typeof value.urgency_hint === "string" ? value.urgency_hint : undefined,
    suppression_status: typeof value.suppression_status === "string" ? value.suppression_status : undefined,
    suppression_reason: typeof value.suppression_reason === "string" ? value.suppression_reason : undefined,
    escalation_status: typeof value.escalation_status === "string" ? value.escalation_status : undefined,
    escalation_reason: typeof value.escalation_reason === "string" ? value.escalation_reason : undefined,
    decrypt_needed: typeof value.decrypt_needed === "boolean" ? value.decrypt_needed : undefined,
    source_type: apiString(value.source_type),
    source_subtype: apiString(value.source_subtype),
    thread_id: apiString(value.thread_id),
    source_refs: apiStringList(value.source_refs),
  };
}

function normalizeDashboardContinuityContextPackItem(value: unknown): NonNullable<DashboardBootstrap["continuity_context_pack_items"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    pack_kind: apiString(value.pack_kind),
    title: apiString(value.title),
    summary: apiString(value.summary),
    confidence: apiString(value.confidence),
    why_surfaced: apiString(value.why_surfaced),
    retrieval_mode: apiNullableString(value.retrieval_mode),
    deeper_retrieval_recommended:
      typeof value.deeper_retrieval_recommended === "boolean"
        ? value.deeper_retrieval_recommended
        : undefined,
    readiness_reason: apiNullableString(value.readiness_reason),
    topology_budget_used: apiNumber(value.topology_budget_used) ?? 0,
    working_set_count: apiNumber(value.working_set_count) ?? 0,
    active_topic_count: apiNumber(value.active_topic_count) ?? 0,
    anchor_refs: apiStringList(value.anchor_refs),
    source_refs: apiStringList(value.source_refs),
    reference_refs: apiStringList(value.reference_refs),
    reference_labels: apiStringList(value.reference_labels),
    object_refs: apiStringList(value.object_refs),
    object_labels: apiStringList(value.object_labels),
    file_refs: apiStringList(value.file_refs),
    file_labels: apiStringList(value.file_labels),
    evidence_kinds: apiStringList(value.evidence_kinds),
    thread_retrieval_state: normalizeDashboardThreadRetrievalState(value.thread_retrieval_state),
  };
}

function normalizeDashboardContinuityStateField(value: unknown): NonNullable<DashboardBootstrap["continuity_state_fields"]>[number] | null {
  if (!isRecord(value) || typeof value.field_key !== "string") return null;
  return {
    field_key: value.field_key,
    label: apiString(value.label),
    status: apiString(value.status),
    confidence: apiString(value.confidence),
    surface_hint: apiString(value.surface_hint),
    recommended_action: apiString(value.recommended_action),
    autonomy_level: apiString(value.autonomy_level),
    reason: apiString(value.reason),
    evidence_refs: apiStringList(value.evidence_refs),
  };
}

function normalizeDashboardConversationAttentionItem(value: unknown): NonNullable<DashboardBootstrap["conversation_attention_items"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    provider: apiString(value.provider),
    account_ref: apiString(value.account_ref),
    conversation_key: apiString(value.conversation_key),
    conversation_family: apiString(value.conversation_family),
    conversation_family_label: apiNullableString(value.conversation_family_label),
    display_label: apiString(value.display_label),
    latest_message_ref: apiNullableString(value.latest_message_ref),
    latest_subject: apiNullableString(value.latest_subject),
    latest_sender: apiNullableString(value.latest_sender),
    last_observed_at: apiString(value.last_observed_at),
    thread_id: apiNullableString(value.thread_id),
    source_event_id: apiNullableString(value.source_event_id),
    latest_artifact_id: apiNullableString(value.latest_artifact_id),
    latest_artifact_summary: apiNullableString(value.latest_artifact_summary),
    needs_attention: apiBoolean(value.needs_attention),
    attention_rank: apiNumber(value.attention_rank),
    latest_attention_kind: apiString(value.latest_attention_kind),
    latest_attention_label: apiNullableString(value.latest_attention_label),
    review_action_label: apiNullableString(value.review_action_label),
    latest_artifact_type: apiNullableString(value.latest_artifact_type),
    latest_artifact_subtype: apiNullableString(value.latest_artifact_subtype),
    latest_artifact_draft_class: apiNullableString(value.latest_artifact_draft_class),
    latest_artifact_destination_view: apiNullableString(value.latest_artifact_destination_view),
    latest_value_hint: apiNullableString(value.latest_value_hint),
    latest_form_owner: apiNullableString(value.latest_form_owner),
    latest_submission_mode: apiNullableString(value.latest_submission_mode),
    latest_requires_signature: apiNullableBoolean(value.latest_requires_signature),
    latest_sensitive_form: apiNullableBoolean(value.latest_sensitive_form),
    summary: apiString(value.summary),
  };
}

function normalizeDashboardConversationAttentionSummary(value: unknown): DashboardBootstrap["conversation_attention_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    count: apiNumber(value.count) ?? 0,
    prepared_draft_count: apiNumber(value.prepared_draft_count) ?? 0,
    approval_request_count: apiNumber(value.approval_request_count) ?? 0,
    background_follow_up_count: apiNumber(value.background_follow_up_count) ?? 0,
    communication_count: apiNumber(value.communication_count),
    renewal_count: apiNumber(value.renewal_count),
    bill_count: apiNumber(value.bill_count),
    form_count: apiNumber(value.form_count),
  };
}

function normalizeDashboardWorkflowRuntimeSummary(value: unknown): DashboardBootstrap["workflow_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    workflow_count: apiNumber(value.workflow_count) ?? 0,
    active_run_count: apiNumber(value.active_run_count) ?? 0,
    waiting_run_count: apiNumber(value.waiting_run_count) ?? 0,
    failed_run_count: apiNumber(value.failed_run_count) ?? 0,
    completed_run_count: apiNumber(value.completed_run_count) ?? 0,
    paused_wait_resume_count: apiNumber(value.paused_wait_resume_count) ?? 0,
    latest_workflow_title: apiNullableString(value.latest_workflow_title),
    latest_run_status: apiNullableString(value.latest_run_status),
  };
}

function normalizeDashboardBrowserRuntimeSummary(value: unknown): DashboardBootstrap["browser_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    task_count: apiNumber(value.task_count) ?? 0,
    active_task_count: apiNumber(value.active_task_count) ?? 0,
    blocked_task_count: apiNumber(value.blocked_task_count) ?? 0,
    step_approval_task_count: apiNumber(value.step_approval_task_count) ?? 0,
    failed_task_count: apiNumber(value.failed_task_count) ?? 0,
    completed_task_count: apiNumber(value.completed_task_count) ?? 0,
    cancelled_task_count: apiNumber(value.cancelled_task_count) ?? 0,
    latest_task_goal: apiNullableString(value.latest_task_goal),
    latest_task_status: apiNullableString(value.latest_task_status),
  };
}

function normalizeDashboardTaskRuntimeSummary(value: unknown): DashboardBootstrap["task_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    active_draft_task_count: apiNumber(value.active_draft_task_count) ?? 0,
    cancelled_draft_task_count: apiNumber(value.cancelled_draft_task_count) ?? 0,
    total_draft_task_count: apiNumber(value.total_draft_task_count) ?? 0,
    latest_draft_task_id: apiNullableString(value.latest_draft_task_id),
    latest_draft_task_title: apiNullableString(value.latest_draft_task_title),
    latest_draft_task_status: apiNullableString(value.latest_draft_task_status),
    latest_draft_task_thread_id: apiNullableString(value.latest_draft_task_thread_id),
    latest_draft_task_action_message_id: apiNullableString(value.latest_draft_task_action_message_id),
  };
}

function normalizeDashboardCalendarRuntimeSummary(value: unknown): DashboardBootstrap["calendar_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    tentative_hold_count: apiNumber(value.tentative_hold_count) ?? 0,
    confirmed_event_count: apiNumber(value.confirmed_event_count) ?? 0,
    latest_tentative_event_id: apiNullableString(value.latest_tentative_event_id),
    latest_tentative_thread_id: apiNullableString(value.latest_tentative_thread_id),
    latest_tentative_action_message_id: apiNullableString(value.latest_tentative_action_message_id),
    latest_tentative_title: apiNullableString(value.latest_tentative_title),
    next_tentative_start_at: apiNullableString(value.next_tentative_start_at),
    latest_tentative_location: apiNullableString(value.latest_tentative_location),
    latest_tentative_note_kind: apiNullableString(value.latest_tentative_note_kind),
    latest_tentative_prep_lead_minutes: apiNullableNumber(value.latest_tentative_prep_lead_minutes),
    latest_tentative_profile: value.latest_tentative_profile === null ? null : isRecord(value.latest_tentative_profile) ? value.latest_tentative_profile : undefined,
  };
}

function normalizeDashboardTrustRuntimeSummary(value: unknown): DashboardBootstrap["trust_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    provenance_record_count: apiNumber(value.provenance_record_count) ?? 0,
    audited_action_count: apiNumber(value.audited_action_count) ?? 0,
    pending_audit_count: apiNumber(value.pending_audit_count) ?? 0,
    failed_audit_count: apiNumber(value.failed_audit_count) ?? 0,
    successful_audit_count: apiNumber(value.successful_audit_count) ?? 0,
    reversible_action_count: apiNumber(value.reversible_action_count) ?? 0,
    undo_ready_action_count: apiNumber(value.undo_ready_action_count) ?? 0,
    latest_provenance_action_type: apiNullableString(value.latest_provenance_action_type),
    latest_audit_status: apiNullableString(value.latest_audit_status),
    latest_undo_label: apiNullableString(value.latest_undo_label),
  };
}

function normalizeDashboardFileRuntimeSummary(value: unknown): DashboardBootstrap["file_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    ledger_create_count: apiNumber(value.ledger_create_count) ?? 0,
    ledger_update_count: apiNumber(value.ledger_update_count) ?? 0,
    export_result_count: apiNumber(value.export_result_count) ?? 0,
    active_staged_bundle_count: apiNumber(value.active_staged_bundle_count) ?? 0,
    active_staged_bundle_file_count: apiNumber(value.active_staged_bundle_file_count) ?? 0,
    staged_bundle_count: apiNumber(value.staged_bundle_count) ?? 0,
    staged_bundle_file_count: apiNumber(value.staged_bundle_file_count) ?? 0,
    discarded_bundle_count: apiNumber(value.discarded_bundle_count) ?? 0,
    active_file_entry_count: apiNumber(value.active_file_entry_count) ?? 0,
    pending_access_request_count: apiNumber(value.pending_access_request_count) ?? 0,
    active_grant_count: apiNumber(value.active_grant_count) ?? 0,
    denied_access_count: apiNumber(value.denied_access_count) ?? 0,
    revoked_access_count: apiNumber(value.revoked_access_count) ?? 0,
    file_op_count: apiNumber(value.file_op_count) ?? 0,
    latest_ledger_name: apiNullableString(value.latest_ledger_name),
    latest_action_message_id: apiNullableString(value.latest_action_message_id),
    latest_action_thread_id: apiNullableString(value.latest_action_thread_id),
    latest_reversible_message_id: apiNullableString(value.latest_reversible_message_id),
    latest_reversible_thread_id: apiNullableString(value.latest_reversible_thread_id),
    latest_activity: apiNullableString(value.latest_activity),
  };
}

function normalizeDashboardInboxRuntimeSummary(value: unknown): DashboardBootstrap["inbox_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    active_staged_organization_count: apiNumber(value.active_staged_organization_count) ?? 0,
    staged_organization_count: apiNumber(value.staged_organization_count) ?? 0,
    reverted_organization_count: apiNumber(value.reverted_organization_count) ?? 0,
    latest_provider: apiNullableString(value.latest_provider),
    latest_conversation_ref: apiNullableString(value.latest_conversation_ref),
    latest_action_message_id: apiNullableString(value.latest_action_message_id),
    latest_action_thread_id: apiNullableString(value.latest_action_thread_id),
    latest_activity: apiNullableString(value.latest_activity),
  };
}

function normalizeDashboardDeviceSyncRuntimeSummary(value: unknown): DashboardBootstrap["device_sync_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    device_policy_count: apiNumber(value.device_policy_count) ?? 0,
    used_device_count: apiNumber(value.used_device_count) ?? 0,
    local_key_device_count: apiNumber(value.local_key_device_count) ?? 0,
    desktop_device_count: apiNumber(value.desktop_device_count) ?? 0,
    mobile_device_count: apiNumber(value.mobile_device_count) ?? 0,
    watch_device_count: apiNumber(value.watch_device_count) ?? 0,
    latest_device_id: apiNullableString(value.latest_device_id),
    latest_device_class: apiNullableString(value.latest_device_class),
    latest_policy_profile: apiNullableString(value.latest_policy_profile),
    latest_last_used_at: apiNullableString(value.latest_last_used_at),
    latest_policy_note: apiNullableString(value.latest_policy_note),
  };
}

function normalizeDashboardSimulatorRuntimeSummary(value: unknown): DashboardBootstrap["simulator_runtime_summary"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    enabled_surface_count: apiNumber(value.enabled_surface_count) ?? 0,
    promotion_enabled_surface_count: apiNumber(value.promotion_enabled_surface_count) ?? 0,
    review_surface_count: apiNumber(value.review_surface_count) ?? 0,
    sampled_surface_count: apiNumber(value.sampled_surface_count) ?? 0,
    highest_rollout_stage: apiString(value.highest_rollout_stage),
    policy_posture_summary: apiString(value.policy_posture_summary),
    latest_observed_at: apiNullableString(value.latest_observed_at),
    observed_rollout_stage: apiNullableString(value.observed_rollout_stage),
    observed_calibration_mode: apiNullableString(value.observed_calibration_mode),
    observed_projection_summary: apiNullableString(value.observed_projection_summary),
    observed_review_summary: apiNullableString(value.observed_review_summary),
    observed_actionable_event_count: apiNullableNumber(value.observed_actionable_event_count),
    observed_promotion_candidate_count: apiNullableNumber(value.observed_promotion_candidate_count),
    observed_review_surface_count: apiNullableNumber(value.observed_review_surface_count),
    observed_calibration_notes: Array.isArray(value.observed_calibration_notes)
      ? value.observed_calibration_notes.flatMap((note) => {
          const normalized = apiNullableString(note);
          return typeof normalized === "string" ? [normalized] : [];
        })
      : [],
    rollout_alignment_status: apiString(value.rollout_alignment_status),
    rollout_alignment_summary: apiString(value.rollout_alignment_summary),
    surfaces: Array.isArray(value.surfaces)
      ? value.surfaces.flatMap((surface): NonNullable<DashboardBootstrap["simulator_runtime_summary"]>["surfaces"] => {
          if (!isRecord(surface) || typeof surface.surface !== "string") return [];
          return [{
            surface: surface.surface,
            enabled: apiBoolean(surface.enabled),
            allow_promotion: apiBoolean(surface.allow_promotion),
            probabilistic_sampling_enabled: apiBoolean(surface.probabilistic_sampling_enabled),
            review_surfaces_enabled: apiBoolean(surface.review_surfaces_enabled),
            rollout_stage: apiString(surface.rollout_stage),
            calibration_mode: apiString(surface.calibration_mode),
            policy_summary: apiString(surface.policy_summary),
            calibration_notes: Array.isArray(surface.calibration_notes)
              ? surface.calibration_notes.flatMap((note) => {
                  const normalized = apiNullableString(note);
                  return typeof normalized === "string" ? [normalized] : [];
                })
              : [],
          }];
        })
      : [],
  };
}

function normalizeDashboardOperationalGuidance(value: unknown): DashboardBootstrap["operational_guidance"] | undefined {
  if (!isRecord(value)) return value === null ? null : undefined;
  return {
    status: apiString(value.status),
    summary: apiString(value.summary),
    command: apiString(value.command),
    source: apiString(value.source),
    pressure_status: apiNullableString(value.pressure_status),
    pressure_total_rows: apiNumber(value.pressure_total_rows),
    cleanup_mode: apiNullableString(value.cleanup_mode),
    generated_at: apiNullableString(value.generated_at),
  };
}

function normalizeDashboardSupportAccess(value: unknown): DashboardBootstrap["support_access"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  return {
    status: apiString(value.status),
    access_scope: apiString(value.access_scope),
    reason: apiNullableString(value.reason),
    support_disabled_by_default: apiBoolean(value.support_disabled_by_default),
    granted_at: apiNullableString(value.granted_at),
    expires_at: apiNullableString(value.expires_at),
    revoked_at: apiNullableString(value.revoked_at),
  };
}

function normalizeDashboardSupportAccessHistoryEntry(value: unknown): NonNullable<DashboardBootstrap["support_access_history"]>[number] | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    status: apiString(value.status),
    access_scope: apiString(value.access_scope),
    reason: apiNullableString(value.reason),
    granted_at: apiString(value.granted_at),
    expires_at: apiString(value.expires_at),
    revoked_at: apiNullableString(value.revoked_at),
  };
}

function normalizeDashboardRecordArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? value.filter(isRecord) as T[] : undefined;
}

function normalizeDashboardNullableRecord<T>(value: unknown): T | null | undefined {
  if (value === null) return null;
  return isRecord(value) ? value as T : undefined;
}

export function normalizeDashboardBootstrap(value: unknown): DashboardBootstrap {
  if (!isRecord(value)) throw new Error("Server response did not include a dashboard bootstrap.");
  const dashboard = value as Partial<DashboardBootstrap>;
  return {
    ...dashboard,
    user: normalizeAuthUser(value.user),
    agents: Array.isArray(value.agents)
      ? value.agents.flatMap((agent): DashboardBootstrap["agents"] => {
          const normalized = normalizeDashboardAgent(agent);
          return normalized ? [normalized] : [];
        })
      : [],
    messages: normalizeAfpMessageList(value.messages),
    thread_summaries: Array.isArray(value.thread_summaries)
      ? value.thread_summaries.flatMap((summary): ThreadSummary[] => {
          const normalized = normalizeThreadSummary(summary);
          return normalized ? [normalized] : [];
        })
      : undefined,
    thread_retrieval_state: normalizeDashboardThreadRetrievalState(value.thread_retrieval_state) ?? undefined,
    action_log: Array.isArray(value.action_log)
      ? value.action_log.flatMap((entry): NonNullable<DashboardBootstrap["action_log"]> => {
          const normalized = normalizeDashboardActionLogEntry(entry);
          return normalized ? [normalized] : [];
        })
      : undefined,
    proactive_suggestions: Array.isArray(value.proactive_suggestions)
      ? value.proactive_suggestions.flatMap((suggestion): NonNullable<DashboardBootstrap["proactive_suggestions"]> => {
          const normalized = normalizeDashboardSuggestion(suggestion);
          return normalized ? [normalized] : [];
        })
      : undefined,
    cost_snapshot: normalizeDashboardCostSnapshot(value.cost_snapshot),
    cost_status: normalizeDashboardCostStatus(value.cost_status),
    continuity_brief: normalizeDashboardContinuityBrief(value.continuity_brief),
    continuity_handoff: normalizeDashboardNullableRecord<NonNullable<DashboardBootstrap["continuity_handoff"]>>(value.continuity_handoff),
    continuity_primary_mode: typeof value.continuity_primary_mode === "string" ? value.continuity_primary_mode : undefined,
    continuity_priority_card: normalizeDashboardContinuityPriorityCard(value.continuity_priority_card),
    continuity_action_items: Array.isArray(value.continuity_action_items)
      ? value.continuity_action_items.flatMap((item): NonNullable<DashboardBootstrap["continuity_action_items"]> => {
          const normalized = normalizeDashboardContinuityActionItem(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    continuity_action_overflow_count: apiNumber(value.continuity_action_overflow_count) ?? 0,
    continuity_action_overflow_summary: apiNullableString(value.continuity_action_overflow_summary),
    continuity_response_items: Array.isArray(value.continuity_response_items)
      ? value.continuity_response_items.flatMap((item): NonNullable<DashboardBootstrap["continuity_response_items"]> => {
          const normalized = normalizeDashboardContinuityResponseItem(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    continuity_prepared_draft_items: Array.isArray(value.continuity_prepared_draft_items)
      ? value.continuity_prepared_draft_items.flatMap((item): NonNullable<DashboardBootstrap["continuity_prepared_draft_items"]> => {
          const normalized = normalizeDashboardContinuityPreparedDraftItem(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    continuity_context_panel_items: Array.isArray(value.continuity_context_panel_items)
      ? value.continuity_context_panel_items.flatMap((item): NonNullable<DashboardBootstrap["continuity_context_panel_items"]> => {
          const normalized = normalizeDashboardContinuityContextPanelItem(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    continuity_watcher_signals: Array.isArray(value.continuity_watcher_signals)
      ? value.continuity_watcher_signals.flatMap((item): NonNullable<DashboardBootstrap["continuity_watcher_signals"]> => {
          const normalized = normalizeDashboardContinuityWatcherSignal(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    continuity_context_pack_items: Array.isArray(value.continuity_context_pack_items)
      ? value.continuity_context_pack_items.flatMap((item): NonNullable<DashboardBootstrap["continuity_context_pack_items"]> => {
          const normalized = normalizeDashboardContinuityContextPackItem(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    continuity_state_fields: Array.isArray(value.continuity_state_fields)
      ? value.continuity_state_fields.flatMap((item): NonNullable<DashboardBootstrap["continuity_state_fields"]> => {
          const normalized = normalizeDashboardContinuityStateField(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    conversation_attention_items: Array.isArray(value.conversation_attention_items)
      ? value.conversation_attention_items.flatMap((item): NonNullable<DashboardBootstrap["conversation_attention_items"]> => {
          const normalized = normalizeDashboardConversationAttentionItem(item);
          return normalized ? [normalized] : [];
        })
      : undefined,
    conversation_attention_summary: normalizeDashboardConversationAttentionSummary(value.conversation_attention_summary),
    runtime_updates: value.runtime_updates === undefined
      ? undefined
      : value.runtime_updates === null ? null : normalizeRuntimeUpdatesResponse(value.runtime_updates),
    workflow_runtime_summary: normalizeDashboardWorkflowRuntimeSummary(value.workflow_runtime_summary),
    browser_runtime_summary: normalizeDashboardBrowserRuntimeSummary(value.browser_runtime_summary),
    task_runtime_summary: normalizeDashboardTaskRuntimeSummary(value.task_runtime_summary),
    calendar_runtime_summary: normalizeDashboardCalendarRuntimeSummary(value.calendar_runtime_summary),
    trust_runtime_summary: normalizeDashboardTrustRuntimeSummary(value.trust_runtime_summary),
    file_runtime_summary: normalizeDashboardFileRuntimeSummary(value.file_runtime_summary),
    inbox_runtime_summary: normalizeDashboardInboxRuntimeSummary(value.inbox_runtime_summary),
    device_sync_runtime_summary: normalizeDashboardDeviceSyncRuntimeSummary(value.device_sync_runtime_summary),
    simulator_runtime_summary: normalizeDashboardSimulatorRuntimeSummary(value.simulator_runtime_summary),
    runtime_deployment: normalizeDashboardRuntimeDeployment(value.runtime_deployment),
    operational_guidance: normalizeDashboardOperationalGuidance(value.operational_guidance),
    support_access: normalizeDashboardSupportAccess(value.support_access),
    support_access_history: Array.isArray(value.support_access_history)
      ? value.support_access_history.flatMap((entry): NonNullable<DashboardBootstrap["support_access_history"]> => {
          const normalized = normalizeDashboardSupportAccessHistoryEntry(entry);
          return normalized ? [normalized] : [];
        })
      : undefined,
    device_sync_policies: value.device_sync_policies === undefined
      ? undefined
      : normalizeDeviceSyncPoliciesResponse(value.device_sync_policies),
    runtime_backups: value.runtime_backups === undefined
      ? undefined
      : value.runtime_backups === null ? null : normalizeRuntimeBackupsResponse(value.runtime_backups),
    runtime_restore_drills: value.runtime_restore_drills === undefined
      ? undefined
      : value.runtime_restore_drills === null ? null : normalizeRuntimeRestoreDrillsResponse(value.runtime_restore_drills),
  };
}

export function normalizeDaemonRecord(value: unknown): DaemonRecord | null {
  if (!isRecord(value) || typeof value.daemon_id !== "string") return null;
  return {
    daemon_id: value.daemon_id,
    daemon_kind: apiString(value.daemon_kind),
    display_name: apiString(value.display_name),
    status: apiString(value.status, "unknown"),
    workflow_id: typeof value.workflow_id === "string" || value.workflow_id === null ? value.workflow_id : undefined,
    delegated_key_id: apiString(value.delegated_key_id),
    last_heartbeat_at: typeof value.last_heartbeat_at === "string" || value.last_heartbeat_at === null ? value.last_heartbeat_at : undefined,
    created_at: apiString(value.created_at),
    revoked_at: typeof value.revoked_at === "string" || value.revoked_at === null ? value.revoked_at : undefined,
    policy_config: isRecord(value.policy_config) || value.policy_config === null ? value.policy_config : undefined,
    stale_minutes: typeof value.stale_minutes === "number" && Number.isFinite(value.stale_minutes) || value.stale_minutes === null
      ? value.stale_minutes
      : undefined,
  };
}

export function normalizeDaemonsResponse(value: unknown): { daemons: DaemonRecord[] } {
  if (!isRecord(value) || !Array.isArray(value.daemons)) return { daemons: [] };
  return {
    daemons: value.daemons.flatMap((daemon): DaemonRecord[] => {
      const normalized = normalizeDaemonRecord(daemon);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizeDaemonHeartbeatDetail(value: unknown): DaemonHeartbeatDetail | null {
  if (!isRecord(value) || typeof value.heartbeat_id !== "string" || typeof value.daemon_id !== "string") return null;
  return {
    heartbeat_id: value.heartbeat_id,
    daemon_id: value.daemon_id,
    user_id: apiString(value.user_id),
    metrics: isRecord(value.metrics) ? value.metrics : {},
    created_at: apiString(value.created_at),
  };
}

export function normalizeDaemonHeartbeatResponse(value: unknown): { daemon: DaemonRecord; heartbeat: DaemonHeartbeatDetail | null } {
  const daemon = isRecord(value) ? normalizeDaemonRecord(value.daemon) : null;
  if (!daemon) throw new Error("Server response did not include a daemon.");
  return {
    daemon,
    heartbeat: isRecord(value) ? normalizeDaemonHeartbeatDetail(value.heartbeat) : null,
  };
}

export function normalizeDeviceSyncPolicyEntry(value: unknown): DeviceSyncPolicyEntry | null {
  if (!isRecord(value) || typeof value.device_id !== "string") return null;
  return {
    device_id: value.device_id,
    agent_id: apiString(value.agent_id),
    device_class: apiString(value.device_class),
    policy_profile: apiString(value.policy_profile),
    sync_slices: isRecord(value.sync_slices) || Array.isArray(value.sync_slices) || value.sync_slices === null
      ? value.sync_slices
      : null,
    requires_local_key_material: apiBoolean(value.requires_local_key_material),
    last_bundle_at: apiString(value.last_bundle_at),
    last_used_at: typeof value.last_used_at === "string" || value.last_used_at === null ? value.last_used_at : undefined,
    updated_at: apiString(value.updated_at),
    notes_summary: isRecord(value.notes_summary) || value.notes_summary === null ? value.notes_summary : null,
  };
}

export function normalizeDeviceSyncPoliciesResponse(value: unknown): DeviceSyncPoliciesResponse {
  return {
    entries: isRecord(value) && Array.isArray(value.entries)
      ? value.entries.flatMap((entry): DeviceSyncPolicyEntry[] => {
          const normalized = normalizeDeviceSyncPolicyEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeRuntimeBackupsResponse(value: unknown): RuntimeBackupsResponse {
  const policy = isRecord(value) && isRecord(value.policy) ? value.policy : {};
  return {
    policy: {
      retention_days: apiNumber(policy.retention_days) ?? 0,
      storage_mode: apiString(policy.storage_mode),
      last_snapshot_at: typeof policy.last_snapshot_at === "string" || policy.last_snapshot_at === null ? policy.last_snapshot_at : undefined,
      support_disabled_by_default: apiBoolean(policy.support_disabled_by_default),
    },
    entries: isRecord(value) && Array.isArray(value.entries)
      ? value.entries.flatMap((entry): RuntimeBackupsResponse["entries"] => (
          isRecord(entry) && typeof entry.id === "string"
            ? [{
                id: entry.id,
                snapshot_type: apiString(entry.snapshot_type),
                storage_mode: apiString(entry.storage_mode),
                status: apiString(entry.status),
                file_count: apiNumber(entry.file_count) ?? 0,
                total_workspace_bytes: apiNumber(entry.total_workspace_bytes) ?? 0,
                artifact_size_bytes: apiNumber(entry.artifact_size_bytes) ?? 0,
                created_at: apiString(entry.created_at),
                expires_at: apiString(entry.expires_at),
                manifest_summary: isRecord(entry.manifest_summary) || entry.manifest_summary === null ? entry.manifest_summary : null,
              }]
            : []
        ))
      : [],
  };
}

export function normalizeRuntimeRestoreDrillsResponse(value: unknown): RuntimeRestoreDrillsResponse {
  return {
    entries: isRecord(value) && Array.isArray(value.entries)
      ? value.entries.flatMap((entry): RuntimeRestoreDrillsResponse["entries"] => (
          isRecord(entry) && typeof entry.id === "string"
            ? [{
                id: entry.id,
                backup_id: apiString(entry.backup_id),
                status: apiString(entry.status),
                started_at: apiString(entry.started_at),
                completed_at: typeof entry.completed_at === "string" || entry.completed_at === null ? entry.completed_at : undefined,
                notes_summary: isRecord(entry.notes_summary) || entry.notes_summary === null ? entry.notes_summary : null,
              }]
            : []
        ))
      : [],
  };
}

export function normalizeRuntimeUpdatesResponse(value: unknown): RuntimeUpdatesResponse {
  const policy = isRecord(value) && isRecord(value.policy) ? value.policy : {};
  return {
    policy: {
      update_channel: apiString(policy.update_channel),
      auto_apply: apiString(policy.auto_apply),
      support_disabled_by_default: apiBoolean(policy.support_disabled_by_default),
    },
    current_version: isRecord(value) ? apiString(value.current_version) : "",
    latest_version: isRecord(value) ? apiString(value.latest_version) : "",
    update_available: isRecord(value) ? apiBoolean(value.update_available) : false,
    runtime_status: isRecord(value) ? apiString(value.runtime_status) : "",
    framework: isRecord(value) && (typeof value.framework === "string" || value.framework === null) ? value.framework : undefined,
    last_checked_at: isRecord(value) && (typeof value.last_checked_at === "string" || value.last_checked_at === null) ? value.last_checked_at : undefined,
    last_applied_at: isRecord(value) && (typeof value.last_applied_at === "string" || value.last_applied_at === null) ? value.last_applied_at : undefined,
    entries: isRecord(value) && Array.isArray(value.entries)
      ? value.entries.flatMap((entry): RuntimeUpdatesResponse["entries"] => (
          isRecord(entry) && typeof entry.id === "string"
            ? [{
                id: entry.id,
                action: apiString(entry.action),
                from_version: typeof entry.from_version === "string" || entry.from_version === null ? entry.from_version : undefined,
                to_version: typeof entry.to_version === "string" || entry.to_version === null ? entry.to_version : undefined,
                status: apiString(entry.status),
                created_at: apiString(entry.created_at),
                notes_summary: isRecord(entry.notes_summary) || entry.notes_summary === null ? entry.notes_summary : null,
              }]
            : []
        ))
      : [],
    panel: isRecord(value) && (isRecord(value.panel) || value.panel === null) ? value.panel : undefined,
  };
}

export function normalizeRuntimeBackupManifestResponse(value: unknown): RuntimeBackupManifestResponse {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Server response did not include a runtime backup manifest.");
  }
  return {
    id: value.id,
    storage_mode: apiString(value.storage_mode),
    created_at: apiString(value.created_at),
    expires_at: apiString(value.expires_at),
    manifest_json: isRecord(value.manifest_json) || value.manifest_json === null ? value.manifest_json : null,
  };
}

export function normalizeRuntimeRecoveryPacketResponse(value: unknown): RuntimeRecoveryPacketResponse {
  if (!isRecord(value)) throw new Error("Server response did not include a runtime recovery packet.");
  return {
    generated_at: apiString(value.generated_at),
    packet_version: apiString(value.packet_version),
    packet_name: apiString(value.packet_name),
    user: normalizeAuthUser(value.user),
    runtime_deployment: isRecord(value.runtime_deployment)
      ? {
          id: apiString(value.runtime_deployment.id),
          framework: apiString(value.runtime_deployment.framework),
          status: apiString(value.runtime_deployment.status),
          workspace_path: apiString(value.runtime_deployment.workspace_path),
        }
      : value.runtime_deployment === null ? null : undefined,
    recovery_checklist: apiStringList(value.recovery_checklist),
    privacy_notes: apiStringList(value.privacy_notes),
    runtime_backups: normalizeRuntimeBackupsResponse(value.runtime_backups),
    runtime_restore_drills: normalizeRuntimeRestoreDrillsResponse(value.runtime_restore_drills),
    runtime_updates: normalizeRuntimeUpdatesResponse(value.runtime_updates),
    operational_guidance: isRecord(value.operational_guidance)
      ? {
          status: apiString(value.operational_guidance.status),
          summary: apiString(value.operational_guidance.summary),
          command: apiString(value.operational_guidance.command),
          source: apiString(value.operational_guidance.source),
          pressure_status:
            typeof value.operational_guidance.pressure_status === "string"
              ? value.operational_guidance.pressure_status
              : undefined,
          pressure_total_rows: apiNumber(value.operational_guidance.pressure_total_rows),
          cleanup_mode:
            typeof value.operational_guidance.cleanup_mode === "string"
              ? value.operational_guidance.cleanup_mode
              : undefined,
          generated_at:
            typeof value.operational_guidance.generated_at === "string"
              ? value.operational_guidance.generated_at
              : undefined,
        }
      : value.operational_guidance === null ? null : undefined,
  };
}

export function normalizeAfpMessageList(value: unknown): AfpMessage[] {
  return Array.isArray(value)
    ? value.flatMap((message): AfpMessage[] => {
        const normalized = normalizeAfpMessage(message);
        return normalized ? [normalized] : [];
      })
    : [];
}

export function messageIdFromResponse(value: unknown, field = "message_id"): string {
  if (!isRecord(value) || typeof value[field] !== "string" || !value[field]) {
    throw new Error("Server response did not include a message id.");
  }
  return value[field];
}

export function normalizeOkResponse(value: unknown): { ok: boolean } {
  return { ok: isRecord(value) ? apiBoolean(value.ok) : false };
}

export function normalizeUrlResponse(value: unknown, required = true): { url: string } {
  if (!isRecord(value) || typeof value.url !== "string" || !value.url) {
    if (required) throw new Error("Server response did not include a URL.");
    return { url: "" };
  }
  return { url: value.url };
}

export function normalizeOrchestrationResponse(value: unknown): { status: string; message_id?: string; thread_id?: string } {
  return {
    status: isRecord(value) ? apiString(value.status) : "",
    message_id: isRecord(value) && typeof value.message_id === "string" ? value.message_id : undefined,
    thread_id: isRecord(value) && typeof value.thread_id === "string" ? value.thread_id : undefined,
  };
}

export function normalizeExportFileResponse(value: unknown): ExportFileResult {
  return {
    ok: isRecord(value) ? (apiBoolean(value.ok) ?? false) : false,
    filename: isRecord(value) ? (apiString(value.filename) ?? "") : "",
    size_bytes: isRecord(value) ? (apiNumber(value.size_bytes) ?? 0) : 0,
    download_url: isRecord(value) && typeof value.download_url === "string" ? value.download_url : undefined,
    data: isRecord(value) && typeof value.data === "string" ? value.data : undefined,
    mime_type: isRecord(value) && typeof value.mime_type === "string" ? value.mime_type : undefined,
    workflow_family_context: isRecord(value) ? value.workflow_family_context : undefined,
    summary: isRecord(value) && typeof value.summary === "string" ? value.summary : undefined,
    format: isRecord(value) && typeof value.format === "string" ? value.format : undefined,
  };
}

function isValidSession(v: unknown): v is Session {
  if (!isRecord(v)) return false;
  const o = v;
  if (typeof o.token !== "string" || !o.token) return false;
  const u = o.user;
  if (!isRecord(u)) return false;
  const usr = u;
  return (
    typeof usr.id === "string" &&
    typeof usr.email === "string" &&
    typeof usr.display_name === "string" &&
    typeof usr.auth_provider === "string"
  );
}

function normalizeSession(value: unknown): Session | null {
  return isValidSession(value) ? value : null;
}

function readSessionStorageValue(storage: Storage | undefined): string | null {
  try {
    return storage?.getItem(SESSION_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function removeSessionStorageValue(storage: Storage | undefined): void {
  try {
    storage?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore persistence failures
  }
}

function writeSessionStorageValue(storage: Storage | undefined, value: string): void {
  try {
    storage?.setItem(SESSION_STORAGE_KEY, value);
  } catch {
    // ignore persistence failures
  }
}

function randomHex(length: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(Math.max(1, Math.ceil(length / 2)));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length);
  }
  let fallback = "";
  while (fallback.length < length) {
    fallback += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  }
  return fallback.slice(0, length);
}

function getGuestBrowserFingerprint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const existing = storage.getItem(GUEST_FINGERPRINT_STORAGE_KEY)?.trim() ?? "";
    if (existing) return existing;
    const generated = `browser-${randomHex(24)}`;
    storage.setItem(GUEST_FINGERPRINT_STORAGE_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  const sessionStorage = window.sessionStorage;
  try {
    const raw = readSessionStorageValue(sessionStorage);
    if (!raw) {
      forgetSessionBearerToken(); removeSessionStorageValue(window.localStorage); return null;
    }
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      forgetSessionBearerToken(); removeSessionStorageValue(sessionStorage);
      removeSessionStorageValue(window.localStorage); return null;
    }
    const normalized = normalizeSession(parsed.value);
    if (!normalized) {
      forgetSessionBearerToken(); removeSessionStorageValue(sessionStorage);
      removeSessionStorageValue(window.localStorage); return null;
    }
    rememberSessionBearerToken(normalized.token);
    const persisted = { ...normalized, token: COOKIE_SESSION_TOKEN }; const serialized = JSON.stringify(persisted);
    if (serialized !== raw || readSessionStorageValue(sessionStorage) !== serialized) {
      writeSessionStorageValue(sessionStorage, serialized);
    }
    removeSessionStorageValue(window.localStorage);
    return { ...persisted, token: resolveSessionBearerToken(persisted.token) ?? persisted.token };
  } catch {
    forgetSessionBearerToken();
    removeSessionStorageValue(sessionStorage);
    removeSessionStorageValue(window.localStorage);
    return null;
  }
}

export function writeSession(
  session: Session | null,
  options?: { reason?: SessionEndReason | null },
): void {
  const normalizedSession = normalizeSession(session); if (!normalizedSession) {
    forgetSessionBearerToken();
  } else {
    rememberSessionBearerToken(normalizedSession.token);
  }
  try {
    if (!normalizedSession) {
      removeSessionStorageValue(window.sessionStorage);
      removeSessionStorageValue(window.localStorage);
    } else {
      writeSessionStorageValue(
        window.sessionStorage,
        JSON.stringify({ ...normalizedSession, token: COOKIE_SESSION_TOKEN }),
      );
      removeSessionStorageValue(window.localStorage);
    }
  } catch {
    // ignore persistence failures
  } finally {
    dispatchSessionChangedEvent({
      session: normalizedSession,
      reason: options?.reason ?? null,
    });
  }
}

export const sessionBearerToken = (token: string | null = readSession()?.token ?? null): string | null => resolveSessionBearerToken(token);

export function clearSession(reason: SessionEndReason | null = null): void {
  writeSession(null, { reason });
}

function isAccountDisabledResponse(status: number, text: string): boolean {
  return status === 403 && text.toLowerCase().includes("account access is disabled");
}

async function publicApiFetch<T>(
  path: string,
  options?: RequestInit & { bodyJson?: unknown },
): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  if (options?.bodyJson !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: options?.credentials ?? "include",
    body: options?.bodyJson !== undefined ? JSON.stringify(options.bodyJson) : options?.body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & {
    bodyJson?: unknown;
    authToken?: string | null;
  }
): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  if (options?.bodyJson !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = sessionBearerToken(options?.authToken ?? readSession()?.token);
  // Newly issued credentials remain in memory for the login transition. After
  // a reload, the HttpOnly session cookie is the browser's only credential.
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: options?.credentials ?? "include",
    body: options?.bodyJson !== undefined ? JSON.stringify(options.bodyJson) : options?.body
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) {
      // Only clear the local session when the rejection is from the application layer
      // (Bearer token invalid). If the upstream gateway returns Basic auth (WWW-Authenticate: Basic …),
      // that is a proxy/Caddy layer challenge — clearing the app session in response to it causes
      // spurious logouts after every successful sign-in.
      const wwwAuth = (response.headers.get("WWW-Authenticate") ?? "").toLowerCase();
      if (!wwwAuth.startsWith("basic")) {
        clearSession("unauthorized");
      }
    } else if (isAccountDisabledResponse(response.status, text)) {
      clearSession("account_disabled");
    }
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

const GOOGLE_WEDDING_VENDOR_PHOTO_PATH = /^\/wedding\/vendor-photo\/google\?name=places%2f[^&]+(?:&max_width_px=\d{1,4})?$/i;

/**
 * Browser image elements cannot send the bearer session header used by the
 * workspace API. Keep the Places proxy authenticated by loading its bytes via
 * fetch, then let the caller render a short-lived object URL instead.
 */
export function isGoogleWeddingVendorPhotoPath(path: unknown): path is string {
  return typeof path === "string" && GOOGLE_WEDDING_VENDOR_PHOTO_PATH.test(path.trim());
}

export async function fetchGoogleWeddingVendorPhoto(
  path: string,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!isGoogleWeddingVendorPhotoPath(path)) {
    throw new Error("Invalid Google wedding vendor photo path.");
  }
  const token = sessionBearerToken();
  const headers = new Headers({ Accept: "image/*" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(apiUrlForPath(path), {
    headers,
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Vendor photo request failed with ${response.status}.`);
  }
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Vendor photo response was not an image.");
  }
  return response.blob();
}

function normalizeAttachmentIngestCapabilities(value: unknown): AttachmentIngestCapabilities {
  const record = isRecord(value) ? value : {};
  return {
    image_ocr_supported: Boolean(record.image_ocr_supported),
    pdf_server_processing_supported: Boolean(record.pdf_server_processing_supported),
    legacy_office_supported: Boolean(record.legacy_office_supported),
    generated_at: typeof record.generated_at === "string" ? record.generated_at : undefined,
  };
}

export async function fetchAttachmentIngestCapabilities(): Promise<AttachmentIngestCapabilities> {
  return normalizeAttachmentIngestCapabilities(await apiFetch<unknown>("/ingest/capabilities"));
}

/** Fetch all messages for a thread. Returns AFP messages sorted oldest-first. */
export async function fetchThread(threadId: string): Promise<AfpMessage[]> {
  const messages = normalizeAfpMessageList(await apiFetch<unknown>(`/thread/${encodeURIComponent(threadId)}`));
  try {
    const decrypt = await import("@/lib/decrypt");
    // Thread navigation can win the race against App's session initialiser. Ensure
    // the in-memory key is ready here so encrypted chat never renders as ciphertext.
    if (!decrypt.isDecryptReady() && readSession()?.token) {
      const keys = await fetchEncKey();
      await decrypt.initDecrypt(keys.enc_key_hex);
    }
    return decrypt.decryptMessages(messages);
  } catch {
    return messages;
  }
}

export async function undoAction(input: {
  thread_id: string;
  checkpoint_message_id: string;
  reason?: string;
}): Promise<UndoActionResponse> {
  return normalizeUndoActionResponse(await apiFetch<unknown>("/actions/undo", {
    method: "POST",
    bodyJson: input,
  }));
}

export async function updateDeviceSyncPolicyProfile(input: {
  device_id: string;
  policy_profile: "full" | "balanced" | "lightweight";
}): Promise<DeviceSyncPoliciesResponse> {
  return normalizeDeviceSyncPoliciesResponse(await apiFetch<unknown>("/dashboard/device-sync-policies", {
    method: "POST",
    bodyJson: {
      action: "set_profile",
      device_id: input.device_id,
      policy_profile: input.policy_profile,
    },
  }));
}

export async function setRuntimeBackupRetention(
  retentionDays: 7 | 14 | 30 | 90
): Promise<RuntimeBackupsResponse> {
  return normalizeRuntimeBackupsResponse(await apiFetch<unknown>("/dashboard/runtime-backups", {
    method: "POST",
    bodyJson: {
      action: "set_retention",
      retention_days: retentionDays,
    },
  }));
}

export async function createRuntimeBackupSnapshot(): Promise<RuntimeBackupsResponse> {
  return normalizeRuntimeBackupsResponse(await apiFetch<unknown>("/dashboard/runtime-backups", {
    method: "POST",
    bodyJson: {
      action: "create_snapshot",
    },
  }));
}

export async function createRuntimeRestoreDrill(
  backupId: string
): Promise<RuntimeRestoreDrillsResponse> {
  return normalizeRuntimeRestoreDrillsResponse(await apiFetch<unknown>("/dashboard/runtime-restore-drills", {
    method: "POST",
    bodyJson: {
      backup_id: backupId,
    },
  }));
}

export async function setRuntimeUpdatePolicy(input: {
  update_channel: "stable" | "manual_only";
  auto_apply: "manual_only" | "scaffold_refresh_only";
}): Promise<RuntimeUpdatesResponse> {
  return normalizeRuntimeUpdatesResponse(await apiFetch<unknown>("/dashboard/runtime-updates", {
    method: "POST",
    bodyJson: {
      action: "set_policy",
      update_channel: input.update_channel,
      auto_apply: input.auto_apply,
    },
  }));
}

export async function checkRuntimeUpdates(): Promise<RuntimeUpdatesResponse> {
  return normalizeRuntimeUpdatesResponse(await apiFetch<unknown>("/dashboard/runtime-updates", {
    method: "POST",
    bodyJson: {
      action: "check_updates",
    },
  }));
}

export async function applyRuntimeUpdate(): Promise<RuntimeUpdatesResponse> {
  return normalizeRuntimeUpdatesResponse(await apiFetch<unknown>("/dashboard/runtime-updates", {
    method: "POST",
    bodyJson: {
      action: "apply_update",
    },
  }));
}

export async function fetchRuntimeRecoveryPacket(): Promise<RuntimeRecoveryPacketResponse> {
  return normalizeRuntimeRecoveryPacketResponse(await apiFetch<unknown>("/dashboard/runtime-recovery-packet"));
}

export async function fetchRuntimeBackupManifest(
  backupId: string
): Promise<RuntimeBackupManifestResponse> {
  return normalizeRuntimeBackupManifestResponse(await apiFetch<unknown>(
    `/dashboard/runtime-backups/${encodeURIComponent(backupId)}`
  ));
}

export async function listDaemons(): Promise<DaemonRecord[]> {
  return normalizeDaemonsResponse(await apiFetch<unknown>("/daemons")).daemons;
}

export async function fetchDaemonHeartbeat(
  daemonId: string
): Promise<{ daemon: DaemonRecord; heartbeat: DaemonHeartbeatDetail | null }> {
  return normalizeDaemonHeartbeatResponse(await apiFetch<unknown>(`/daemons/${encodeURIComponent(daemonId)}/heartbeat`));
}

export async function revokeDaemon(daemonId: string): Promise<void> {
  await apiFetch<unknown>(`/daemons/${encodeURIComponent(daemonId)}/revoke`, { method: "POST" }).then(normalizeOkResponse);
}

// ── Note organisation messages ────────────────────────────────────────────────

export type FolderRulePayload = {
  folder_id: string;
  summary_style?: string;
  backlink_rules?: string;
  tag_suggestions?: string[];
};

export type AreaRulesPayload = {
  area: string;
  summary_style?: string;
  backlink_rules?: string;
  tag_suggestions?: string[];
};

export type TagUpdatePayload = {
  remove_tags?: string[];
  add_tags?: string[];
  remove_supertags?: string[];
  add_supertags?: string[];
};

export type NoteContentPayload = {
  title: string;
  summary?: string;
  body?: string;
  tags?: string[];
  supertags?: string[];
  folder_id?: string;
  area_id?: string;
};

type NoteMessageRequest =
  | {
      type: "note";
      thread_id: string;
      content: NoteContentPayload;
      references?: Array<{ id: string }>;
    }
  | { type: "folder_rule"; thread_id: string; content: FolderRulePayload }
  | { type: "area_rules"; thread_id: string; content: AreaRulesPayload }
  | {
      type: "tag_update";
      thread_id: string;
      content: TagUpdatePayload;
      /** IDs of the original note messages being updated. */
      references: Array<{ id: string }>;
    };

/**
 * Send a notes AFP message through the note workspace seam.
 * Returns the server-assigned message_id.
 */
export async function sendNoteMessage(req: NoteMessageRequest): Promise<string> {
  const body = await apiFetch<unknown>(
    "/notes/message",
    { method: "POST", bodyJson: req }
  );
  return messageIdFromResponse(body);
}

/**
 * Open a relay WebSocket subscription for a thread.
 * Calls `onMessage` when `thread_snapshot` or `message_stored` arrives for this thread.
 * Returns a cleanup function to close the socket.
 */
export function subscribeThread(
  threadId: string,
  onMessage: () => void
): () => void {
  const wsBase = API_BASE.startsWith("https://")
    ? API_BASE.replace("https://", "wss://")
    : API_BASE.replace("http://", "ws://");
  const socket = new WebSocket(`${wsBase}/relay/ws`);

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        op: "subscribe_thread",
        thread_id: threadId,
        include_snapshot: false,
      })
    );
  });

  socket.addEventListener("message", (ev) => {
    const event = parseRelayWebSocketEvent(ev.data);
    if (
      event &&
      (event.event === "thread_snapshot" || event.event === "message_stored") &&
      (!event.threadId || event.threadId === threadId)
    ) {
      onMessage();
    }
  });

  return () => socket.close();
}

/**
 * Subscribe to fleet_update events via the relay WebSocket.
 * Calls `onUpdate` whenever any task changes status.
 * Returns a cleanup function to close the socket.
 */
export function subscribeFleet(onUpdate: () => void): () => void {
  const wsBase = API_BASE.startsWith("https://")
    ? API_BASE.replace("https://", "wss://")
    : API_BASE.replace("http://", "ws://");
  const socket = new WebSocket(`${wsBase}/relay/ws`);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ op: "subscribe_fleet" }));
  });

  socket.addEventListener("message", (ev) => {
    const event = parseRelayWebSocketEvent(ev.data);
    if (event?.event === "fleet_update") {
      onUpdate();
    }
  });

  return () => socket.close();
}

export type RelayWebSocketEvent = {
  event: string;
  threadId?: string;
};

function relayString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseRelayWebSocketEvent(data: unknown): RelayWebSocketEvent | null {
  const parsed = typeof data === "string" ? parseJsonValue(data) : { ok: true as const, value: data };
  if (!parsed.ok || !isRecord(parsed.value)) return null;

  const event = relayString(parsed.value.event);
  if (!event) return null;

  if ("thread_id" in parsed.value && typeof parsed.value.thread_id !== "string") return null;

  const threadId = relayString(parsed.value.thread_id);
  return threadId ? { event, threadId } : { event };
}

function normalizeFocusItem(value: unknown): FocusItem | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    description: typeof value.description === "string" ? value.description : undefined,
    status: typeof value.status === "string" ? value.status : "pending",
    priority: typeof value.priority === "string" ? value.priority : "normal",
    due_at: typeof value.due_at === "string" || value.due_at === null ? value.due_at : undefined,
  };
}

export function normalizeFocusItemsResponse(payload: unknown): FocusItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap((item): FocusItem[] => {
    const normalized = normalizeFocusItem(item);
    return normalized ? [normalized] : [];
  });
}

export const cancelTask = (taskId: string) =>
  apiFetch<unknown>(`/agent/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" }).then(normalizeOkResponse);

export const fetchAgentTaskDetail = async (task: AgentTaskDetailSummary): Promise<TaskDetail> => {
  const detail = normalizeTaskDetailResponse(
    await apiFetch<unknown>(`/agent/tasks/${encodeURIComponent(task.id)}`),
    task,
  );
  if (!detail) {
    throw new Error("Task service returned an invalid task detail.");
  }
  return detail;
};

export const resolveAgentTask = (taskId: string, decision: "approve" | "reject") =>
  apiFetch<unknown>(`/agent/tasks/${encodeURIComponent(taskId)}/${decision}`, { method: "POST" }).then(normalizeOkResponse);

// ── Workspace preference persistence ─────────────────────────────────────────

const PREF_KEY_BASE = "omnyid.workspace.prefs";

export type WorkspacePrefs = {
  activeView: string;
  openThreadId: string | null;
};

const DEFAULT_PREFS: WorkspacePrefs = { activeView: "search", openThreadId: null };

function prefKey(userId?: string): string {
  return userId ? `${PREF_KEY_BASE}.${userId}` : PREF_KEY_BASE;
}

function normalizeWorkspacePrefs(value: unknown): WorkspacePrefs {
  if (!isRecord(value)) {
    return { ...DEFAULT_PREFS };
  }
  const prefs = value;
  return {
    activeView:
      typeof prefs.activeView === "string" && prefs.activeView
        ? prefs.activeView
        : DEFAULT_PREFS.activeView,
    openThreadId: typeof prefs.openThreadId === "string" ? prefs.openThreadId : null,
  };
}

export function loadPrefs(userId?: string): WorkspacePrefs {
  const key = prefKey(userId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      window.localStorage.removeItem(key);
      return { ...DEFAULT_PREFS };
    }
    const normalized = normalizeWorkspacePrefs(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) window.localStorage.setItem(key, serialized);
    return normalized;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage unavailable in guest/private mode - ignore
    }
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: WorkspacePrefs, userId?: string): void {
  try {
    window.localStorage.setItem(prefKey(userId), JSON.stringify(normalizeWorkspacePrefs(prefs)));
  } catch {
    // storage unavailable in guest/private mode — ignore
  }
}

/**
 * Pick the best view format from an AFP message's views array.
 * Returns the highest-priority view whose format is in the known set,
 * or null if no suitable view exists (caller renders a generic card).
 */
export function pickView(message: AfpMessage, known: string[]): AfpView | null {
  if (!message.views?.length) return null;
  const sorted = [...message.views].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return sorted.find((v) => known.includes(v.format)) ?? null;
}

export const KNOWN_VIEW_FORMATS = [
  "email",
  "rich_text",
  "canvas",
  "table",
  "supertag_grid",
  "calendar",
  "attachments",
  "approvals",
  "search_result",
  "task_card",
  "generative_card",
  "a2ui.v1",
  "a2ui_render",
  "ui_blueprint",
  "ui_presentation",
  "blueprint",
  "ledger_diff",
  "ledger_board",
  "multi_edit",
  "shell_result",
  "planning_result",
  "export_request",
  "export_result",
  "inbox_canvas",
  "inbox_thread_dashboard",
  "parsed_document",
  "transcript",
  // Single-node A2UI view formats emitted by backend agents (watcher, synthesizer, etc.)
  "insight_line",
  "action_chips",
  "stat_row",
] as const;

// ── Master agent / dashboard API ─────────────────────────────────────────────

export const getDashboardSession = () => {
  const fingerprint = getGuestBrowserFingerprint();
  return apiFetch<unknown>("/dashboard/session", {
    headers: fingerprint ? { "X-OmnyID-Browser-Fingerprint": fingerprint } : undefined,
  });
};
export const fetchDashboardBootstrap = () =>
  apiFetch<unknown>("/dashboard/bootstrap").then(normalizeDashboardBootstrap);
export const getFleet = (): Promise<AgentFleetResponse> =>
  apiFetch<unknown>("/agent/fleet").then(normalizeAgentFleetResponse);
export const getFleetMasterInstance = (): Promise<AgentFleetInstance | null> =>
  getFleet().then((fleet) => fleetMasterInstance(fleet));
export const getFleetStatusSummary = (): Promise<AgentFleetStatusSummary> =>
  getFleet().then((fleet) => fleetStatusSummary(fleet));
export const probeApiReachability = async (): Promise<ApiReachability> => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const response = await fetch(`${API_BASE}/healthz`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    reachable: true,
    ok: response.ok,
    status: response.status,
    latency_ms: Math.max(0, Math.round(finishedAt - startedAt)),
  };
};
export type VerifyEmailResponse = {
  ok: boolean;
  email_verified: boolean;
  experience: "generic" | "wedding" | "vendor";
};

export const verifyEmailToken = (token: string): Promise<VerifyEmailResponse> =>
  publicApiFetch<unknown>("/auth/verify-email", {
    method: "POST",
    bodyJson: { token },
  }).then((value) => {
    if (!isRecord(value)) throw new Error("Invalid email-verification response.");
    return {
      ok: apiBoolean(value.ok),
      email_verified: apiBoolean(value.email_verified),
      experience: value.experience === "wedding" ? "wedding" : value.experience === "vendor" ? "vendor" : "generic",
    };
  });
export const authenticateWithGoogleIdToken = (idToken: string, acquisitionVisitId?: string | null, source?: string | null): Promise<AuthApiResponse> =>
  publicApiFetch<unknown>("/auth/google", {
    method: "POST",
    bodyJson: { id_token: idToken, ...(acquisitionVisitId ? { acquisition_visit_id: acquisitionVisitId } : {}), ...(source ? { source } : {}) },
  }).then(parseAuthApiResponse);
export const authenticateWithPassword = (args: {
  mode: "login" | "register";
  email: string;
  password: string;
  display_name?: string;
  source?: string;
  acquisition_visit_id?: string | null;
}): Promise<AuthApiResponse> =>
  publicApiFetch<unknown>(args.mode === "login" ? "/auth/login" : "/auth/register", {
    method: "POST",
    bodyJson: {
      email: args.email,
      password: args.password,
      ...(args.mode === "register" && args.display_name ? { display_name: args.display_name } : {}),
      ...(args.mode === "register" && args.source ? { source: args.source } : {}),
      ...(args.mode === "register" && args.acquisition_visit_id ? { acquisition_visit_id: args.acquisition_visit_id } : {}),
    },
  }).then(parseAuthApiResponse);

export type PasskeyAuthenticationOptions = {
  challenge: string;
  rp_id: string;
  timeout_ms: number;
  user_verification: string;
  allow_credentials: Array<{
    id: string;
    type: string;
  }>;
};

function normalizePasskeyAuthenticationOptions(value: unknown): PasskeyAuthenticationOptions {
  if (!isRecord(value)) {
    throw new Error("Passkey authentication options were missing from the homeserver response.");
  }
  const allow_credentials = Array.isArray(value.allow_credentials)
    ? value.allow_credentials.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.id !== "string") return [];
        return [{
          id: entry.id,
          type: typeof entry.type === "string" ? entry.type : "public-key",
        }];
      })
    : [];
  return {
    challenge: apiString(value.challenge),
    rp_id: apiString(value.rp_id),
    timeout_ms: apiNumber(value.timeout_ms) ?? 300000,
    user_verification: apiString(value.user_verification, "required"),
    allow_credentials,
  };
}

export const beginPasskeyAuthenticationByEmail = (email: string): Promise<{
  user_id: string;
  options: PasskeyAuthenticationOptions;
}> =>
  publicApiFetch<unknown>("/auth/passkey/authenticate/begin-email", {
    method: "POST",
    bodyJson: { email },
  }).then((value) => {
    if (!isRecord(value) || typeof value.user_id !== "string") {
      throw new Error("Passkey sign-in could not start because the homeserver response was incomplete.");
    }
    return {
      user_id: value.user_id,
      options: normalizePasskeyAuthenticationOptions(value.options),
    };
  });

export const finishPasskeyAuthentication = (body: {
  user_id: string;
  credential_id: string;
  client_data_json: string;
  authenticator_data: string;
  signature: string;
}): Promise<AuthApiResponse> =>
  publicApiFetch<unknown>("/auth/passkey/authenticate/finish", {
    method: "POST",
    bodyJson: body,
  }).then(parseAuthApiResponse);
export const resendVerificationEmail = (email: string, source?: string) =>
  publicApiFetch<unknown>("/auth/verify-email/resend", {
    method: "POST",
    bodyJson: { email, ...(source ? { source } : {}) },
  }).then(parseAuthMessageResponse);
export const requestPasswordReset = (email: string) =>
  publicApiFetch<unknown>("/auth/forgot-password", {
    method: "POST",
    bodyJson: { email },
  }).then(parseAuthMessageResponse);
export const resetPassword = (token: string, newPassword: string) =>
  publicApiFetch<unknown>("/auth/reset-password", {
    method: "POST",
    bodyJson: { token, new_password: newPassword },
  }).then(parseAuthMessageResponse);
export const fetchGoogleAuthClientId = async (): Promise<string> => {
  const clientId = normalizeGoogleAuthConfig(await publicApiFetch<unknown>("/auth/google/config"));
  if (!clientId) {
    throw new Error("Google sign-in is not configured for this homeserver.");
  }
  return clientId;
};
export const getPublicFeed = (limit = 20): Promise<PublicArticle[]> =>
  apiFetch<unknown>(`/feed/public?limit=${limit}`).then(normalizePublicFeedResponse);
export const signOut = () =>
  apiFetch<unknown>("/auth/session", { method: "DELETE" }).then(normalizeOkResponse);
export const updateAgentMask = (mask: "private" | "team" | "public") =>
  apiFetch<unknown>("/agent/mask", { method: "PATCH", bodyJson: { mask } }).then(normalizeOkResponse);
export const listFocusItems = () =>
  apiFetch<unknown>("/agent/focus").then(normalizeFocusItemsResponse);
export const createFocusItem = (data: { title: string; description?: string; priority?: string }) =>
  apiFetch<unknown>("/agent/focus", { method: "POST", bodyJson: data }).then(normalizeOkResponse);
export const updateFocusItem = (id: string, data: { status?: string; priority?: string }) =>
  apiFetch<unknown>(`/agent/focus/${id}`, { method: "PATCH", bodyJson: data }).then(normalizeOkResponse);
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise<void>((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastError;
}

export const orchestrateAgent = (body: AgentOrchestrationRequest) =>
  withRetry(() =>
    apiFetch<unknown>("/agent/orchestrate", {
      method: "POST",
      bodyJson: body,
    }).then(normalizeOrchestrationResponse),
  );
export const orchestrate = (objective: string, options?: { thread_id?: string }) =>
  orchestrateAgent({ objective, ...options });
export const onboard = (answers: Record<string, string>) =>
  apiFetch<unknown>("/agent/onboarding", { method: "POST", bodyJson: answers }).then(normalizeOkResponse);
export const createDelegation = (scope: string, mask: string, expiresIn: number) =>
  apiFetch<unknown>("/agent/delegate", { method: "POST", bodyJson: { scope, mask, expires_in: expiresIn } });
export const revokeDelegation = (id: string) =>
  apiFetch<unknown>(`/agent/delegate/${id}`, { method: "DELETE" }).then(normalizeOkResponse);
export const updateLoraConfidence = (score: number) =>
  apiFetch<unknown>("/agent/lora-confidence", { method: "PATCH", bodyJson: { score } }).then(normalizeOkResponse);
export const createAgentDelegation = (body: {
  scope: string;
  mask: string;
  expires_at: string;
  task?: string;
}) => apiFetch<unknown>("/agent/delegate", {
  method: "POST",
  bodyJson: body,
}).then(normalizeOkResponse);
export const fetchAgentTriggerCollection = (): Promise<{ triggers: AgentTriggerRecord[] }> =>
  apiFetch<unknown>("/agent/triggers").then(normalizeAgentTriggersResponse);
export const fetchAgentTriggers = (): Promise<AgentTriggerRecord[]> =>
  fetchAgentTriggerCollection().then((value) => value.triggers);
export const createAgentTrigger = (body: { trigger_type: string; config: Record<string, unknown> }) =>
  apiFetch<unknown>("/agent/trigger", { method: "POST", bodyJson: body }).then(normalizeOkResponse);
export const deleteAgentTrigger = (id: string) =>
  apiFetch<unknown>(`/agent/trigger/${id}`, { method: "DELETE" }).then(normalizeOkResponse);
export const updateAgentTrigger = (id: string, patch: { enabled?: boolean }) =>
  apiFetch<unknown>(`/agent/trigger/${id}`, { method: "PATCH", bodyJson: patch }).then(normalizeOkResponse);
export const updateAgentSoulMd = (soul_md: string) =>
  apiFetch<unknown>("/agent/soul_md", { method: "PUT", bodyJson: { soul_md } }).then(normalizeOkResponse);
export const fetchGmailStatus = (scope: "workspace" | "integration" = "workspace"): Promise<GmailConnectionStatus> =>
  apiFetch<unknown>(scope === "integration" ? "/integrations/gmail/status" : "/gmail/status")
    .then(normalizeGmailConnectionStatus);
export const fetchGmailOAuthUrl = (scope: "workspace" | "integration" = "workspace"): Promise<string> =>
  apiFetch<unknown>(scope === "integration" ? "/integrations/gmail/oauth-url" : "/gmail/connect-url")
    .then(oauthUrlFromResponse);
export const requestGmailAlphaAccess = (scope: "workspace" | "integration" = "workspace"): Promise<{ accepted: boolean; access_status: string; requested_at?: string; message?: string }> =>
  apiFetch<unknown>(scope === "integration" ? "/integrations/gmail/access-request" : "/gmail/access-request", { method: "POST" })
    .then((value) => {
      const record = isRecord(value) ? value : {};
      return {
        accepted: record.accepted === true,
        access_status: apiString(record.access_status, "pending"),
        requested_at: apiString(record.requested_at) || undefined,
        message: apiString(record.message) || undefined,
      };
    });
export const fetchGmailOAuthConfig = (scope: "workspace" | "integration" = "workspace"): Promise<GmailOAuthConfig> =>
  apiFetch<unknown>(scope === "integration" ? "/integrations/gmail/config" : "/gmail/config")
    .then(normalizeGmailOAuthConfig);
export const fetchGoogleCalendarStatus = (): Promise<GoogleCalendarConnectionStatus> =>
  apiFetch<unknown>("/calendar/google/status").then(normalizeGoogleCalendarConnectionStatus);
export const fetchGoogleCalendarOAuthUrl = (): Promise<string> =>
  apiFetch<unknown>("/calendar/google/connect-url").then(oauthUrlFromResponse);
export type GoogleCalendarOAuthConfig = {
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  csrfSecretConfigured: boolean;
  homeserverUrlConfigured: boolean;
  redirectUri: string | null;
  requiredAuthorizedRedirectUri: string | null;
  requiredScopes: string[];
  oauthClientSource: string | null;
};
function normalizeGoogleCalendarOAuthConfig(value: unknown): GoogleCalendarOAuthConfig {
  const record = isRecord(value) ? value : {};
  return {
    configured: apiBoolean(record.configured),
    clientIdConfigured: apiBoolean(record.client_id_configured),
    clientSecretConfigured: apiBoolean(record.client_secret_configured),
    csrfSecretConfigured: apiBoolean(record.csrf_secret_configured),
    homeserverUrlConfigured: apiBoolean(record.homeserver_url_configured),
    redirectUri: typeof record.redirect_uri === "string" ? record.redirect_uri : null,
    requiredAuthorizedRedirectUri: typeof record.required_authorized_redirect_uri === "string" ? record.required_authorized_redirect_uri : null,
    requiredScopes: apiStringList(record.required_scopes),
    oauthClientSource: typeof record.oauth_client_source === "string" ? record.oauth_client_source : null,
  };
}
export const fetchGoogleCalendarOAuthConfig = (): Promise<GoogleCalendarOAuthConfig> =>
  apiFetch<unknown>("/calendar/google/config").then(normalizeGoogleCalendarOAuthConfig);
export const disconnectGoogleCalendar = () =>
  apiFetch<unknown>("/calendar/google/disconnect", { method: "POST" }).then(normalizeOkResponse);
export const syncGoogleCalendar = (): Promise<{ ok: boolean; synced_count: number }> =>
  apiFetch<unknown>("/calendar/google/sync", { method: "POST" }).then((value) => {
    const record = isRecord(value) ? value : {};
    return {
      ok: record.ok === true,
      synced_count: typeof record.synced_count === "number" ? record.synced_count : 0,
    };
  });
export const fetchGmailInboxSummary = (): Promise<InboxSummary> =>
  apiFetch<unknown>("/integrations/gmail/inbox-summary", {
    method: "POST",
  }).then(normalizeInboxSummary);
export const sendGmailDraft = (body: {
  email_id?: string | null;
  subject: string;
  body: string;
}): Promise<{ ok: boolean }> =>
  apiFetch<unknown>("/integrations/gmail/send-draft", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOkResponse);
export type GmailApprovedDraftSendInput = {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  thread_id?: string | null;
  in_reply_to?: string | null;
  references?: string[];
  attachment_ids?: string[];
};
export type GmailApprovedDraftSendResponse = {
  ok: boolean;
  sent: boolean;
  messageId: string | null;
  clientMessageId: string | null;
  draftMessageId: string | null;
  message: string | null;
};
function normalizeGmailApprovedDraftSendResponse(value: unknown): GmailApprovedDraftSendResponse {
  const record = isRecord(value) ? value : {};
  const messageId = typeof record.message_id === "string" && record.message_id.trim()
    ? record.message_id.trim()
    : typeof record.messageId === "string" && record.messageId.trim()
      ? record.messageId.trim()
      : typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : null;
  const clientMessageId = typeof record.client_message_id === "string" && record.client_message_id.trim()
    ? record.client_message_id.trim()
    : typeof record.clientMessageId === "string" && record.clientMessageId.trim()
      ? record.clientMessageId.trim()
      : null;
  const draftMessageId = typeof record.draft_message_id === "string" && record.draft_message_id.trim()
    ? record.draft_message_id.trim()
    : typeof record.draftMessageId === "string" && record.draftMessageId.trim()
      ? record.draftMessageId.trim()
      : null;
  const message = typeof record.message === "string" && record.message.trim()
    ? record.message.trim()
    : typeof record.error === "string" && record.error.trim()
      ? record.error.trim()
      : typeof record.detail === "string" && record.detail.trim()
        ? record.detail.trim()
        : null;
  return {
    ok: record.ok === true || record.sent === true,
    sent: record.sent === true || record.ok === true,
    messageId,
    clientMessageId,
    draftMessageId,
    message,
  };
}
export const sendGmailApprovedDraft = (
  body: GmailApprovedDraftSendInput,
): Promise<GmailApprovedDraftSendResponse> =>
  apiFetch<unknown>("/integrations/gmail/send-draft", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeGmailApprovedDraftSendResponse);
export const sendWeddingVendorApprovedEnquiry = (body: {
  vendor_id: string;
  to: string;
  subject: string;
  text: string;
  draft_message_id: string;
}): Promise<GmailApprovedDraftSendResponse> =>
  apiFetch<unknown>("/wedding/vendor-outreach/send-approved", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeGmailApprovedDraftSendResponse);
export type WeddingTaskAssignmentDeliveryInput = {
  wedding_plan_id: string;
  response_workspace_id: string;
  task_id: string;
  task_title: string;
  task_brief?: string;
  due_label?: string;
  assignee_name: string;
  assignee_email: string;
};
export type WeddingTaskAssignmentDeliveryResponse = {
  sent: boolean;
  already_delivered: boolean;
  research_attached: boolean;
  agent_delivered: boolean;
  provider_message_id?: string | null;
  message?: string | null;
};
export const deliverWeddingTaskAssignment = (
  body: WeddingTaskAssignmentDeliveryInput,
): Promise<WeddingTaskAssignmentDeliveryResponse> =>
  apiFetch<WeddingTaskAssignmentDeliveryResponse>("/wedding/task-assignment/deliver", {
    method: "POST",
    bodyJson: body,
  });
export const fetchBriefToday = (): Promise<BriefApiResponse | null> =>
  apiFetch<unknown>("/api/brief/today").then(normalizeBriefResponse);
const fetchActiveGoalsCollection = async (limit?: number) => {
  const query = new URLSearchParams({ status: "active" });
  if (typeof limit === "number") query.set("limit", String(limit));
  return normalizeActiveGoalsResponse(await apiFetch<unknown>(`/api/goals?${query.toString()}`));
};
export const fetchActiveGoalsPulse = (limit = 6): Promise<GoalPulseItem[]> =>
  fetchActiveGoalsCollection(limit).then(activeGoalsToGoalPulseItems);
export const queueBriefOffer = (briefId: string, intent: string) =>
  apiFetch<unknown>("/api/brief/offer", {
    method: "POST",
    bodyJson: { brief_id: briefId, intent },
  }).then(normalizeOkResponse);
export const listSpaces = (): Promise<NormalizedSpace[]> =>
  apiFetch<unknown>("/spaces").then(normalizeSpacesResponse);
export const fetchSpaceMessages = (spaceId: string, limit = 50): Promise<NormalizedSpaceMessage[]> =>
  apiFetch<unknown>(`/spaces/${encodeURIComponent(spaceId)}/messages?limit=${limit}`).then(normalizeSpaceMessagesResponse);
export const fetchSpaceMembers = (spaceId: string): Promise<NormalizedSpaceMember[]> =>
  apiFetch<unknown>(`/spaces/${encodeURIComponent(spaceId)}/members`).then(normalizeSpaceMembersResponse);
export const createSpace = async (body: CreateSpaceInput): Promise<NormalizedSpace> => {
  const created = normalizeCreatedSpaceResponse(await apiFetch<unknown>("/spaces", {
    method: "POST",
    bodyJson: body,
  }));
  if (!created) {
    throw new Error("Create space response did not include a space.");
  }
  return created;
};
export const joinSpace = (spaceId: string) =>
  apiFetch<unknown>(`/spaces/${encodeURIComponent(spaceId)}/join`, { method: "POST" }).then(normalizeOkResponse);
export const postSpaceMessage = async (spaceId: string, body: CreateSpaceMessageInput): Promise<NormalizedSpaceMessage> => {
  const created = normalizeCreatedSpaceMessageResponse(await apiFetch<unknown>(
    `/spaces/${encodeURIComponent(spaceId)}/messages`,
    {
      method: "POST",
      bodyJson: body,
    },
  ));
  if (!created) {
    throw new Error("Post response did not include a message.");
  }
  return created;
};
export const listPulseChannels = (): Promise<PulseNewsChannel[]> =>
  apiFetch<unknown>("/api/news/subscriptions").then(normalizePulseChannelsResponse);
export const listPulseGoals = (): Promise<PulseGoalOption[]> =>
  fetchActiveGoalsCollection().then(activeGoalsToPulseGoalOptions);
export const listPulseItems = (channelId: string, limit = 30): Promise<PulseNewsItem[]> =>
  apiFetch<unknown>(`/api/news/feed/${encodeURIComponent(channelId)}?limit=${limit}`).then(normalizePulseItemsResponse);
export const createPulseChannel = async (
  body: Omit<PulseNewsChannel, "channel_id" | "created_at">,
): Promise<PulseNewsChannel> => {
  const created = normalizePulseNewsChannel(await apiFetch<unknown>("/api/news/subscriptions", {
    method: "POST",
    bodyJson: body,
  }));
  if (!created) {
    throw new Error("Create channel response did not include a channel.");
  }
  return created;
};
export const updatePulseChannel = async (
  channelId: string,
  body: Omit<PulseNewsChannel, "channel_id" | "created_at">,
): Promise<PulseNewsChannel> => {
  const updated = normalizePulseNewsChannel(await apiFetch<unknown>(`/api/news/subscriptions/${encodeURIComponent(channelId)}`, {
    method: "PUT",
    bodyJson: body,
  }));
  if (!updated) {
    throw new Error("Save channel response did not include a channel.");
  }
  return updated;
};
export const deletePulseChannel = (channelId: string) =>
  apiFetch<unknown>(`/api/news/subscriptions/${encodeURIComponent(channelId)}`, { method: "DELETE" });
export const dismissPulseItem = (itemId: string) =>
  apiFetch<unknown>(`/api/news/items/${encodeURIComponent(itemId)}/dismiss`, { method: "POST" });
export const savePulseItem = (itemId: string) =>
  apiFetch<unknown>(`/api/news/items/${encodeURIComponent(itemId)}/save`, { method: "POST" });
export const listSocialPosts = (): Promise<SocialComposerPost[]> =>
  apiFetch<unknown>("/social/posts").then(parseSocialComposerPostsResponse);
export const fetchSocialSuggestions = (
  platform: SocialComposerPlatform,
  content: string,
): Promise<SocialComposerSuggestion[]> =>
  apiFetch<unknown>("/social/suggestions", {
    method: "POST",
    bodyJson: { platform, content },
  }).then(parseSocialComposerSuggestionsResponse);
export const publishSocialPost = async (
  platform: SocialComposerPlatform,
  content: string,
): Promise<string> => {
  const postId = parseSocialComposerPublishResponse(await apiFetch<unknown>("/social/publish", {
    method: "POST",
    bodyJson: { platform, content },
  }));
  if (!postId) {
    throw new Error("Publish response did not include a post id.");
  }
  return postId;
};
export const listRuntimeWorkspaceFiles = () =>
  apiFetch<unknown>("/runtime/workspace-files").then(normalizeRuntimeWorkspaceFilesResponse);
export const fetchRuntimeWorkspaceFile = async (fileId: string): Promise<RuntimeWorkspaceFileResponse> => {
  const payload = normalizeRuntimeWorkspaceFileResponse(
    await apiFetch<unknown>(`/runtime/workspace-file?file_id=${encodeURIComponent(fileId)}`)
  );
  if (!payload) {
    throw new Error("Runner file response did not include a valid file.");
  }
  return payload;
};
export const saveRuntimeWorkspaceFile = async (input: {
  file_id: string;
  content: string;
}): Promise<RuntimeWorkspaceFileResponse> => {
  const payload = normalizeRuntimeWorkspaceFileResponse(await apiFetch<unknown>("/runtime/workspace-file", {
    method: "POST",
    bodyJson: input,
  }));
  if (!payload) {
    throw new Error("Runner file save response did not include a valid file.");
  }
  return payload;
};
export const fetchRuntimeLogs = () =>
  apiFetch<unknown>("/runtime/logs").then(normalizeRuntimeLogsResponse);
export const deployRuntime = (framework: string) =>
  apiFetch<unknown>("/runtime/deploy", {
    method: "POST",
    bodyJson: { framework },
  }).then(normalizeOkResponse);
export const runRuntimeAction = (action: "start" | "stop" | "restart") =>
  apiFetch<unknown>("/runtime/action", {
    method: "POST",
    bodyJson: { action },
  }).then(normalizeOkResponse);
export const submitUiCommand = (body: UiCommandRequest) =>
  apiFetch<unknown>("/ui/command", {
    method: "POST",
    bodyJson: body,
  });
export const executeUiCommand = (body: UiCommandRequest) =>
  submitUiCommand(body).then(normalizeUiCommandResponse);
export const queueUiCommand = (body: UiCommandRequest) =>
  submitUiCommand(body).then(normalizeOkResponse);
function normalizeWeddingVendorSearchApiResponse(value: unknown): WeddingVendorSearchApiResponse {
  const record = isRecord(value) ? value : {};
  const sources = Array.isArray(record.sources)
    ? record.sources.flatMap((item): WeddingVendorSearchApiSource[] => {
      const source = isRecord(item) ? item : {};
      const title = typeof source.title === "string" ? source.title.trim() : "";
      const url = typeof source.url === "string" ? source.url.trim() : "";
      if (!title || !url) return [];
      return [{
        title,
        url,
        snippet: typeof source.snippet === "string" ? source.snippet : null,
        provider: typeof source.provider === "string" ? source.provider : null,
        website_url: typeof source.website_url === "string" ? source.website_url : null,
        map_url: typeof source.map_url === "string" ? source.map_url : null,
        photo_url: typeof source.photo_url === "string" ? source.photo_url : null,
        address: typeof source.address === "string" ? source.address : null,
        phone: typeof source.phone === "string" ? source.phone : null,
        email: typeof source.email === "string" ? source.email : null,
        instagram_url: typeof source.instagram_url === "string" ? source.instagram_url : null,
        ...normalizeWeddingVendorSourceEvidence(source),
      }];
    })
    : [];
  return {
    ok: record.ok === true,
    status: typeof record.status === "string" ? record.status : record.ok === true ? "executed" : "failed",
    external_search_performed: record.external_search_performed === true,
    provider_label: typeof record.provider_label === "string" ? record.provider_label : null,
    query_count: typeof record.query_count === "number" ? record.query_count : 0,
    source_count: typeof record.source_count === "number" ? record.source_count : sources.length,
    queries: Array.isArray(record.queries)
      ? record.queries.filter((query): query is string => typeof query === "string" && query.trim().length > 0)
      : [],
    sources,
    message: typeof record.message === "string" ? record.message : "",
    receipt_metadata: isRecord(record.receipt_metadata) ? record.receipt_metadata : {},
  };
}
export const searchWeddingVendors = (body: {
  workspace_id?: string | null;
  wedding_plan_id?: string | null;
  queries: WeddingVendorSearchApiQuery[];
  max_results_per_query?: number;
  source_policy?: "directory_only" | "online_capable";
  material_fingerprint?: string | null;
  ranking_policy_version?: string | null;
  selected_date?: string | null;
  guest_count?: number | null;
}): Promise<WeddingVendorSearchApiResponse> =>
  apiFetch<unknown>("/wedding/vendor-search", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeWeddingVendorSearchApiResponse);

export const recordWeddingVendorAvailability = (vendorId: string, body: WeddingVendorAvailabilityUpdate) =>
  apiFetch<unknown>(`/wedding/vendors/${encodeURIComponent(vendorId)}/availability`, { method: "POST", bodyJson: body });

function redactedRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Record<string, unknown>[] => {
    if (!isRecord(item)) return [];
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(item)) {
      if (/key|secret|token|credential|password/i.test(key)) continue;
      next[key] = entry;
    }
    return [next];
  });
}

export function normalizeWeddingLiveEvidenceResponse(value: unknown): WeddingLiveEvidenceResponse {
  const record = isRecord(value) ? value : {};
  return {
    ok: record.ok === true,
    status: typeof record.status === "string" ? record.status : record.ok === true ? "verified" : "blocked",
    locationsRequested: typeof record.locationsRequested === "number" ? record.locationsRequested : 0,
    geocodes: redactedRecordArray(record.geocodes),
    weather: redactedRecordArray(record.weather),
    failures: Array.isArray(record.failures)
      ? record.failures.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    receiptMetadata: isRecord(record.receiptMetadata) ? record.receiptMetadata : {},
    guardrails: Array.isArray(record.guardrails)
      ? record.guardrails.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  };
}

export const fetchWeddingLiveEvidence = (body: {
  workspace_id?: string | null;
  locations: string[];
  forecast_days?: number;
  include_weather?: boolean;
}): Promise<WeddingLiveEvidenceResponse> =>
  apiFetch<unknown>("/wedding/live-evidence", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeWeddingLiveEvidenceResponse);

function normalizeWeddingProviderCapabilitiesResponse(value: unknown): WeddingProviderCapabilitiesResponse {
  const record = isRecord(value) ? value : {};
  const providers = Array.isArray(record.providers)
    ? record.providers.flatMap((item): WeddingProviderCapabilityStatus[] => {
      const provider = isRecord(item) ? item : {};
      const kind = typeof provider.kind === "string" ? provider.kind.trim() : "";
      const connectedAppId = typeof provider.connectedAppId === "string" ? provider.connectedAppId.trim() : "";
      const label = typeof provider.label === "string" ? provider.label.trim() : "";
      if (!kind || !connectedAppId || !label) return [];
      return [{
        kind,
        connectedAppId,
        label,
        credentialRequired: provider.credentialRequired === true,
        credentialConfigured: provider.credentialConfigured === true,
        sharedCreditEnabled: provider.sharedCreditEnabled === true,
        configured: provider.configured === true,
        verificationStatus: typeof provider.verificationStatus === "string"
          ? provider.verificationStatus
          : typeof provider.verification_status === "string"
            ? provider.verification_status
            : null,
        diagnosticLabel: typeof provider.diagnosticLabel === "string"
          ? provider.diagnosticLabel
          : typeof provider.diagnostic_label === "string"
            ? provider.diagnostic_label
            : null,
        sourceLabel: typeof provider.sourceLabel === "string"
          ? provider.sourceLabel
          : typeof provider.source_label === "string"
            ? provider.source_label
            : null,
      }];
    })
    : [];
  return {
    providers,
    connectedAppIds: Array.isArray(record.connectedAppIds)
      ? record.connectedAppIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : providers.filter((provider) => provider.configured).map((provider) => provider.connectedAppId),
    guardrails: Array.isArray(record.guardrails)
      ? record.guardrails.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  };
}
export const fetchWeddingProviderCapabilities = (): Promise<WeddingProviderCapabilitiesResponse> =>
  apiFetch<unknown>("/wedding/provider-capabilities").then(normalizeWeddingProviderCapabilitiesResponse);
export const submitActionDecision = (body: {
  thread_id: string;
  target_message_id: string;
  decision: "approved" | "rejected";
}) =>
  apiFetch<unknown>("/actions/decision", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOkResponse);
export const postAgentMessage = (body: {
  to: string[];
  content: Record<string, unknown>;
}) =>
  apiFetch<unknown>("/message", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOkResponse);

export type WeddingPartnerMember = {
  user_id: string;
  display_name: string;
  role: "owner" | "co_owner";
  membership_revision: number;
  joined_at: string;
};

export type WeddingPartnerInviteSummary = {
  invite_id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
};

export type WeddingPartnerScope = {
  owner_user_id: string;
  wedding_plan_id: string;
  response_workspace_id: string;
  member_user_id: string;
  role: "owner" | "co_owner";
  membership_revision: number;
  cache_namespace: string;
};

export type WeddingSharedContact = {
  share_id: string;
  shared_by_user_id: string;
  updated_at: string;
  contact: {
    name: string;
    email?: string | null;
    phone?: string | null;
    relationship_kind?: string | null;
    roles: string[];
  };
};

const weddingPartnerScopeQuery = (weddingPlanId: string, responseWorkspaceId: string) =>
  `wedding_plan_id=${encodeURIComponent(weddingPlanId)}&response_workspace_id=${encodeURIComponent(responseWorkspaceId)}`;

export const listWeddingPartnerMembers = (weddingPlanId: string, responseWorkspaceId: string) =>
  apiFetch<{ scope: WeddingPartnerScope; members: WeddingPartnerMember[]; invites: WeddingPartnerInviteSummary[] }>(`/wedding/partners?${weddingPartnerScopeQuery(weddingPlanId, responseWorkspaceId)}`);

export const inviteWeddingPartner = (input: { weddingPlanId: string; responseWorkspaceId: string; email: string }) =>
  apiFetch<{ invite_id: string; invite_url: string; delivered: boolean; expires_in_days: number }>("/wedding/partners/invites", {
    method: "POST",
    bodyJson: { wedding_plan_id: input.weddingPlanId, response_workspace_id: input.responseWorkspaceId, email: input.email },
  });

export const acceptWeddingPartnerInvite = (token: string) =>
  apiFetch<{ accepted: boolean; wedding_plan_id: string; response_workspace_id: string }>("/wedding/partners/invites/accept", {
    method: "POST",
    bodyJson: { token },
  });

export const revokeWeddingPartner = (weddingPlanId: string, responseWorkspaceId: string, memberUserId: string) =>
  apiFetch<{ revoked: boolean }>(`/wedding/partners/${encodeURIComponent(memberUserId)}?${weddingPartnerScopeQuery(weddingPlanId, responseWorkspaceId)}`, {
    method: "DELETE",
  });

export const leaveWeddingPartnerPlan = (weddingPlanId: string, responseWorkspaceId: string) =>
  apiFetch<{ left: boolean }>(`/wedding/partners/leave?${weddingPartnerScopeQuery(weddingPlanId, responseWorkspaceId)}`, {
    method: "DELETE",
  });

export const openWeddingReviewInvitation = (token: string) =>
  apiFetch<{
    invitation_id: string;
    review_id: string;
    wedding_plan_id: string;
    response_workspace_id: string;
    vendor_id: string | null;
    status: "opened";
  }>("/wedding/reviews/invitations/open", {
    method: "POST",
    bodyJson: { token },
  });

export const shareWeddingContact = (input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  recipientUserId: string;
  contactRef: string;
  contact: { name: string; email?: string; phone?: string; relationshipKind?: string; roles?: string[] };
}) => apiFetch<{ shared: boolean; share_id: string }>("/wedding/partners/contacts", {
  method: "POST",
  bodyJson: {
    wedding_plan_id: input.weddingPlanId,
    response_workspace_id: input.responseWorkspaceId,
    recipient_user_id: input.recipientUserId,
    contact_ref: input.contactRef,
    contact: {
      name: input.contact.name,
      email: input.contact.email,
      phone: input.contact.phone,
      relationship_kind: input.contact.relationshipKind,
      roles: input.contact.roles ?? [],
    },
  },
});

export const listWeddingSharedContacts = (weddingPlanId: string, responseWorkspaceId: string) =>
  apiFetch<{ contacts: WeddingSharedContact[] }>(`/wedding/partners/contacts?${weddingPartnerScopeQuery(weddingPlanId, responseWorkspaceId)}`);
export const saveThreadMessage = (payload: Record<string, unknown>) =>
  apiFetch<unknown>("/messages", {
    method: "POST",
    bodyJson: payload,
  }).then(normalizeOkResponse);
export const sendFederatedAgentMessage = (body: {
  recipient_agent_id: string;
  thread_id: string;
  body: string;
  subject?: string | null;
}) =>
  apiFetch<{
    success: boolean;
    message_id: string;
    thread_id?: string;
    source_thread_id?: string | null;
    recipient_agent_id: string;
  }>("/federation/send", {
    method: "POST",
    bodyJson: body,
  });
export const retryFederatedAgentMessage = (body: {
  attempted_message_id: string;
}) =>
  apiFetch<{
    success: boolean;
    retried: boolean;
    message_id: string;
    thread_id?: string;
    recipient_agent_id: string;
    delivery_status?: string;
  }>("/federation/retry", {
    method: "POST",
    bodyJson: body,
  });
export const fetchThreadRelatedContext = (
  messageId: string,
  options?: { limit?: number; type?: string },
): Promise<ThreadRelatedContextItem[]> => {
  const limit = Math.max(0, options?.limit ?? 5);
  const type = options?.type ?? "knowledge_card";
  return apiFetch<unknown>(
    `/knowledge/context-window?message_id=${encodeURIComponent(messageId)}&limit=${limit}&type=${encodeURIComponent(type)}`,
  ).then((value) => normalizeThreadRelatedContextResponse(value, limit));
};
export const generateExportFile = (body: ExportFileRequest) =>
  apiFetch<unknown>("/export/file", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeExportFileResponse);
export const applyTaskDiff = (body: ApplyTaskDiffRequest) =>
  apiFetch<unknown>("/task/apply-diff", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOkResponse);
export const applyMultiEdit = <TEdit = Record<string, unknown>>(body: ApplyMultiEditRequest<TEdit>) =>
  apiFetch<unknown>("/multi-edit/apply", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOkResponse);
export const submitShellDecision = (body: ShellDecisionRequest) =>
  apiFetch<unknown>("/shell/decision", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOkResponse);
export const uploadFilePayload = async (
  file: Blob,
  options?: { token?: string | null; filename?: string | null; purpose?: string | null },
): Promise<UploadedFilePayload> => {
  const formData = new FormData();
  if (options?.purpose) formData.append("purpose", options.purpose);
  formData.append("file", file, options?.filename ?? undefined);
  const headers = new Headers();
  const token = sessionBearerToken(options?.token);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}/api/files/upload`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseUploadErrorDetail(payload) || `Upload failed${options?.filename ? ` for ${options.filename}` : ""}`);
  }
  return {
    message_id: parseUploadMessageIdPayload(payload),
    attachment: parseUploadAttachmentPayload(payload),
  };
};
export const uploadAttachmentFile = async (
  file: Blob,
  options?: { token?: string | null; filename?: string | null; purpose?: string | null },
): Promise<AfpAttachment> => {
  const uploaded = await uploadFilePayload(file, options);
  if (!uploaded.attachment) {
    throw new Error(
      `Uploaded file did not return attachment metadata${options?.filename ? ` for ${options.filename}` : ""}`,
    );
  }
  return uploaded.attachment;
};

export const uploadMessageFile = async (
  file: Blob,
  options?: { token?: string | null; filename?: string | null },
): Promise<string | null> => {
  const uploaded = await uploadFilePayload(file, options);
  return uploaded.message_id;
};
export const ingestAttachmentBatch = (body: AttachmentBatchIngestRequest) =>
  apiFetch<AttachmentBatchIngestResponse>("/ingest/attachment-batch", {
    method: "POST",
    bodyJson: body,
  });
export const cleanupIngestedAttachments = (body: { message_ids: string[] }) =>
  apiFetch<AttachmentCleanupResponse>("/ingest/cleanup", {
    method: "POST",
    bodyJson: body,
  });
export const persistIngestedAttachments = (body: { message_ids: string[] }) =>
  apiFetch<AttachmentPersistResponse>("/ingest/persist", {
    method: "POST",
    bodyJson: body,
  });
export const fetchWorkspaceBundleSignature = async (): Promise<string | null> => {
  const response = await fetch(`${API_BASE}/workspace/index.html`, { cache: "no-store" });
  if (!response.ok) return null;
  return extractWorkspaceBundleSignature(await response.text());
};

export const fetchNavBarWeather = async (
  lat: number,
  lon: number,
): Promise<NavBarWeatherState | null> => {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&current=weathercode,temperature_2m,relativehumidity_2m,windspeed_10m&timezone=auto`,
  );
  if (!response.ok) return null;
  return parseNavBarWeatherResponse(await response.json());
};

export const fetchInlineEntityMapLocation = async (query: string): Promise<InlineEntityMapLocation> => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error("Could not resolve this location right now.");
  const location = parseInlineEntityMapLocationPayload(await response.json());
  if (!location) throw new Error("No map match found.");
  return location;
};

export const fetchInlineEntityCurrencyConversion = async ({
  amount,
  from,
  to,
}: {
  amount: number;
  from: string;
  to: string;
}): Promise<InlineEntityCurrencyConversion> => {
  const response = await fetch(
    `https://api.frankfurter.app/latest?amount=${encodeURIComponent(String(amount))}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  if (!response.ok) throw new Error("Live exchange rate is unavailable right now.");
  return parseInlineEntityCurrencyPayload(await response.json(), to);
};
export const recordProactiveOutcome = (body: {
  suggestion_id: string;
  accepted: boolean;
  heuristic_id: string;
  outcome_afp_id?: string | null;
  memory_scope?: MemoryWorkspaceScopeInput | null;
}) =>
  apiFetch<unknown>("/proactive/outcomes", {
    method: "POST",
    bodyJson: {
      suggestion_id: body.suggestion_id,
      accepted: body.accepted,
      heuristic_id: body.heuristic_id,
      outcome_afp_id: body.outcome_afp_id ?? null,
      memory_space: body.memory_scope?.memory_space ?? null,
      author_mask: body.memory_scope?.author_mask ?? null,
      author_type: body.memory_scope?.author_type ?? null,
      author_id: body.memory_scope?.author_id ?? null,
      is_human_authored: body.memory_scope?.is_human_authored ?? null,
      human_only: body.memory_scope?.human_only ?? null,
    },
  }).then((value) => ({
    status: isRecord(value) ? apiString(value.status) : "",
    heuristic_feedback: isRecord(value) && (isRecord(value.heuristic_feedback) || value.heuristic_feedback === null)
      ? value.heuristic_feedback
      : undefined,
    agent_memory_id: isRecord(value) && (typeof value.agent_memory_id === "string" || value.agent_memory_id === null)
      ? value.agent_memory_id
      : undefined,
  }));

export const listWorkflows = (includeArchived = false, limit = 50) =>
  apiFetch<unknown>(
    `/workflows?include_archived=${includeArchived ? "true" : "false"}&limit=${limit}`,
  ).then(normalizeWorkflowListResponse);

export const getWorkflow = (workflowId: string) =>
  apiFetch<unknown>(`/workflows/${encodeURIComponent(workflowId)}`).then(normalizeSavedWorkflowResponse);

export const saveWorkflow = (body: {
  graph: Record<string, unknown>;
  latest_ir?: WorkflowCompiledIr | null;
  favorite?: boolean;
  archived?: boolean;
}) =>
  apiFetch<unknown>("/workflows", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeWorkflowSaveResponse);

export const patchWorkflow = (
  workflowId: string,
  body:
    | {
        op: "workflow_meta_replace";
        title?: string;
        description?: string;
        environment?: string;
        optimization_mode?: string;
      }
    | {
        op: "node_meta_replace";
        node_id: string;
        label?: string;
        description?: string;
      }
    | { op: "node_move"; node_id: string; x: number; y: number }
    | { op: "root_toggle"; node_id: string; root_enabled: boolean }
    | { op: "edge_add"; source: string; target: string; condition_label?: string }
    | { op: "edge_meta_replace"; edge_id: string; condition_label?: string }
    | { op: "edge_remove"; edge_id: string }
    | { op: "node_delete"; node_id: string }
    | { op: "node_config_replace"; node_id: string; config: Record<string, unknown> }
    | { op: "node_policy_replace"; node_id: string; policy: Record<string, unknown> }
    | {
        op: "node_prompt_replace";
        node_id: string;
        prompt: {
          system_prompt?: string;
          instruction_prompt?: string;
          user_editable?: boolean;
        };
      },
) =>
  apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/patch`,
    {
      method: "POST",
      bodyJson: body,
    },
  ).then(normalizeWorkflowPatchResponse);

export const validateWorkflow = (graph: Record<string, unknown>) =>
  apiFetch<unknown>("/workflows/validate", {
    method: "POST",
    bodyJson: { graph },
  }).then(normalizeWorkflowValidationResponse);

export const describeWorkflow = (body: {
  intent: string;
  base_workflow?: SavedWorkflow | null;
  preset_override?: string;
  optimization_override?: "balanced" | "speed" | "cost";
  regeneration_mode?: "rebuild" | "preserve_manual";
  save_draft?: boolean;
  branch_from_workflow_id?: string;
  branch_from_event_id?: string;
}) =>
  apiFetch<unknown>("/workflows/describe", {
    method: "POST",
    bodyJson: body,
  }).then(normalizeWorkflowDescribeResponse);

export const compileWorkflow = (workflowId: string) =>
  apiFetch<unknown>(`/workflows/${encodeURIComponent(workflowId)}/compile`, {
    method: "POST",
  }).then(normalizeWorkflowCompileResponse);

export const listWorkflowDeployments = (workflowId: string) =>
  apiFetch<unknown>(`/workflows/${encodeURIComponent(workflowId)}/deployments`).then(normalizeWorkflowDeploymentsResponse);

export const listWorkflowRuns = (workflowId: string) =>
  apiFetch<unknown>(`/workflows/${encodeURIComponent(workflowId)}/runs`).then(normalizeWorkflowRunsResponse);

export const startWorkflowRun = (
  workflowId: string,
  body: { deployment_id?: string; replay_run_id?: string; trigger_kind?: string },
) =>
  apiFetch<unknown>(`/workflows/${encodeURIComponent(workflowId)}/runs`, {
    method: "POST",
    bodyJson: body,
  }).then(normalizeWorkflowRunStartResponse);

export const listWorkflowWaitResumeRecords = (workflowId: string, runId: string) =>
  apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/wait-resume`,
  ).then(normalizeWorkflowWaitResumeListResponse);

export const decideWorkflowWaitResume = (
  workflowId: string,
  runId: string,
  waitResumeId: string,
  body: { decision: "approved" | "rejected"; option_id?: string; note?: string },
) =>
  apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/wait-resume/${encodeURIComponent(waitResumeId)}/decision`,
    {
      method: "POST",
      bodyJson: body,
    },
  ).then(normalizeWorkflowWaitResumeDecisionResponse);

export const runWorkflowAction = (
  workflowId: string,
  body: {
    action: "favorite" | "archive" | "deploy" | "rollback";
    favorite?: boolean;
    archived?: boolean;
    environment?: "dev" | "prod";
    deployment_id?: string;
    connector_overrides?: WorkflowConnectorOverrides;
  },
) =>
  apiFetch<unknown>(`/workflows/${encodeURIComponent(workflowId)}/action`, {
    method: "POST",
    bodyJson: body,
  }).then(normalizeWorkflowActionResponse);

export type WorkflowTriggerDescriptorTimeConfig = {
  schedule_kind?: string;
  cron_expression?: string;
  timezone?: string;
};

export type WorkflowTriggerDescriptorEventConfig = {
  source_kind?: string;
  webhook_path?: string;
  event_name?: string;
};

export type WorkflowTriggerDescriptorDelayConfig = {
  delay_kind?: string;
  duration_seconds?: number;
  offset_seconds?: number;
  anchor_field?: string;
};

export type WorkflowTriggerDescriptorHybridConfig = {
  condition_expression?: string;
  continuation_mode?: string;
};

export type WorkflowTriggerDescriptor = {
  trigger_family?: string;
  trigger_kind?: string;
  time?: WorkflowTriggerDescriptorTimeConfig | null;
  event?: WorkflowTriggerDescriptorEventConfig | null;
  delay?: WorkflowTriggerDescriptorDelayConfig | null;
  hybrid?: WorkflowTriggerDescriptorHybridConfig | null;
  event_filter?: Record<string, unknown>;
  afp_message_type?: string;
  afp_message_families?: string[];
  afp_trigger_origin_template?: string;
  registration_targets?: string[];
  runtime_requirements?: string[];
  source_workflow_id?: string;
  policy_blocked?: boolean;
  budget_limit_cents?: number;
  egress_allowed?: boolean;
};

export type WorkflowTriggerRegistration = {
  registration_id: string;
  workflow_id: string;
  deployment_id: string;
  owner_user_id: string;
  environment: string;
  trigger_node_id: string;
  manifest_node_id: string;
  trigger_family: string;
  trigger_kind: string;
  registration_status: "preview" | "registered" | "paused" | "unhealthy" | "retired";
  idempotency_key: string;
  dedup_hash?: string | null;
  descriptor_json: WorkflowTriggerDescriptor;
  last_fired_at?: string | null;
  next_fire_at?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

const WORKFLOW_TRIGGER_REGISTRATION_STATUSES = new Set(["preview", "registered", "paused", "unhealthy", "retired"]);

export function normalizeWorkflowTriggerRegistration(value: unknown): WorkflowTriggerRegistration | null {
  if (!isRecord(value) || typeof value.registration_id !== "string") return null;
  const registrationStatus = typeof value.registration_status === "string" && WORKFLOW_TRIGGER_REGISTRATION_STATUSES.has(value.registration_status)
    ? value.registration_status
    : "preview";
  return {
    registration_id: value.registration_id,
    workflow_id: apiString(value.workflow_id),
    deployment_id: apiString(value.deployment_id),
    owner_user_id: apiString(value.owner_user_id),
    environment: apiString(value.environment),
    trigger_node_id: apiString(value.trigger_node_id),
    manifest_node_id: apiString(value.manifest_node_id),
    trigger_family: apiString(value.trigger_family),
    trigger_kind: apiString(value.trigger_kind),
    registration_status: registrationStatus as WorkflowTriggerRegistration["registration_status"],
    idempotency_key: apiString(value.idempotency_key),
    dedup_hash: typeof value.dedup_hash === "string" || value.dedup_hash === null ? value.dedup_hash : undefined,
    descriptor_json: isRecord(value.descriptor_json) ? value.descriptor_json : {},
    last_fired_at: typeof value.last_fired_at === "string" || value.last_fired_at === null ? value.last_fired_at : undefined,
    next_fire_at: typeof value.next_fire_at === "string" || value.next_fire_at === null ? value.next_fire_at : undefined,
    retry_count: apiNumber(value.retry_count) ?? 0,
    created_at: apiString(value.created_at),
    updated_at: apiString(value.updated_at),
  };
}

export function normalizeWorkflowTriggerRegistrationsResponse(value: unknown): { registrations: WorkflowTriggerRegistration[] } {
  if (!isRecord(value) || !Array.isArray(value.registrations)) return { registrations: [] };
  return {
    registrations: value.registrations.flatMap((registration): WorkflowTriggerRegistration[] => {
      const normalized = normalizeWorkflowTriggerRegistration(registration);
      return normalized ? [normalized] : [];
    }),
  };
}

export const listWorkflowTriggerRegistrations = (workflowId: string, deploymentId?: string) => {
  const params = deploymentId ? `?deployment_id=${encodeURIComponent(deploymentId)}` : "";
  return apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-registrations${params}`,
  ).then(normalizeWorkflowTriggerRegistrationsResponse);
};

export const updateWorkflowTriggerRegistrationStatus = (
  workflowId: string,
  registrationId: string,
  status: "preview" | "registered" | "paused" | "unhealthy" | "retired",
) =>
  apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-registrations/${encodeURIComponent(registrationId)}/status`,
    { method: "POST", bodyJson: { status } },
  ).then(normalizeOkResponse);

export type WorkflowTriggerDispatchRequest = {
  dispatch_token: string;
  timestamp_secs: number;
  activation_id: string;
  trigger_node_id: string;
  payload_summary?: Record<string, unknown>;
  trigger_kind?: string;
};

export type WorkflowTriggerDispatchResponse = {
  dispatched: boolean;
  workflow_id: string;
  deployment_id: string;
  registration_id: string;
  activation_id: string;
  trigger_kind: string;
  provisional_run_id: string;
  note: string;
};

export function normalizeWorkflowTriggerDispatchResponse(value: unknown): WorkflowTriggerDispatchResponse {
  if (!isRecord(value) || typeof value.registration_id !== "string") {
    throw new Error("Server response did not include a trigger dispatch registration id.");
  }
  return {
    dispatched: apiBoolean(value.dispatched),
    workflow_id: apiString(value.workflow_id),
    deployment_id: apiString(value.deployment_id),
    registration_id: value.registration_id,
    activation_id: apiString(value.activation_id),
    trigger_kind: apiString(value.trigger_kind),
    provisional_run_id: apiString(value.provisional_run_id),
    note: apiString(value.note),
  };
}

export const dispatchWorkflowTrigger = (
  workflowId: string,
  registrationId: string,
  body: WorkflowTriggerDispatchRequest,
) =>
  apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-registrations/${encodeURIComponent(registrationId)}/dispatch`,
    { method: "POST", bodyJson: body },
  ).then(normalizeWorkflowTriggerDispatchResponse);

export type WorkflowTriggerObservationPayloadSummary = {
  trigger_kind?: string;
  event_type?: string;
  source_workflow_id?: string | null;
  source_run_id?: string | null;
  skill_capsule_outcome_kind?: string;
  skill_capsule_receipt_status?: string;
  blocked_reason?: string;
  failed_reason?: string;
  payload?: Record<string, unknown>;
};

export type WorkflowTriggerRunInitiationTrace = {
  run_id: string;
  workflow_id: string;
  deployment_id: string;
  trigger_node_id: string;
  activation_id?: string;
  via?: string;
};

export type WorkflowTriggerObservation = {
  observation_id: string;
  registration_id: string;
  workflow_id: string;
  deployment_id: string;
  owner_user_id: string;
  trigger_source: string;
  trigger_time: string;
  payload_summary: WorkflowTriggerObservationPayloadSummary;
  schedule_metadata: WorkflowTriggerDescriptor;
  delayed_resumption_reason?: string | null;
  hybrid_decision_chain: unknown[];
  run_initiation_trace: WorkflowTriggerRunInitiationTrace;
  replay_nonce: string;
  created_at: string;
  skill_capsule_outcome_kind?: string;
  skill_capsule_receipt_status?: string;
  blocked_reason?: string;
  failed_reason?: string;
};

export function normalizeWorkflowTriggerObservation(value: unknown): WorkflowTriggerObservation | null {
  if (!isRecord(value) || typeof value.observation_id !== "string") return null;
  return {
    observation_id: value.observation_id,
    registration_id: apiString(value.registration_id),
    workflow_id: apiString(value.workflow_id),
    deployment_id: apiString(value.deployment_id),
    owner_user_id: apiString(value.owner_user_id),
    trigger_source: apiString(value.trigger_source),
    trigger_time: apiString(value.trigger_time),
    payload_summary: isRecord(value.payload_summary) ? value.payload_summary : {},
    schedule_metadata: isRecord(value.schedule_metadata) ? value.schedule_metadata : {},
    delayed_resumption_reason: typeof value.delayed_resumption_reason === "string" || value.delayed_resumption_reason === null
      ? value.delayed_resumption_reason
      : undefined,
    hybrid_decision_chain: Array.isArray(value.hybrid_decision_chain) ? value.hybrid_decision_chain : [],
    run_initiation_trace: isRecord(value.run_initiation_trace) ? value.run_initiation_trace as WorkflowTriggerRunInitiationTrace : {
      run_id: "",
      workflow_id: "",
      deployment_id: "",
      trigger_node_id: "",
    },
    replay_nonce: apiString(value.replay_nonce),
    created_at: apiString(value.created_at),
    skill_capsule_outcome_kind: typeof value.skill_capsule_outcome_kind === "string" ? value.skill_capsule_outcome_kind : undefined,
    skill_capsule_receipt_status: typeof value.skill_capsule_receipt_status === "string" ? value.skill_capsule_receipt_status : undefined,
    blocked_reason: typeof value.blocked_reason === "string" ? value.blocked_reason : undefined,
    failed_reason: typeof value.failed_reason === "string" ? value.failed_reason : undefined,
  };
}

export function normalizeWorkflowTriggerObservationsResponse(value: unknown): { workflow_id: string; trigger_observations: WorkflowTriggerObservation[] } {
  if (!isRecord(value)) return { workflow_id: "", trigger_observations: [] };
  return {
    workflow_id: apiString(value.workflow_id),
    trigger_observations: Array.isArray(value.trigger_observations)
      ? value.trigger_observations.flatMap((observation): WorkflowTriggerObservation[] => {
          const normalized = normalizeWorkflowTriggerObservation(observation);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export const listWorkflowTriggerObservations = (workflowId: string, registrationId?: string) => {
  const params = registrationId ? `?registration_id=${encodeURIComponent(registrationId)}` : "";
  return apiFetch<unknown>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-observations${params}`,
  ).then(normalizeWorkflowTriggerObservationsResponse);
};

export type InternalWorkflowEventPayload = Record<string, unknown>;

export type InternalWorkflowEventIngestRequest = {
  source_workflow_id?: string;
  source_run_id?: string;
  payload: InternalWorkflowEventPayload;
};

export type InternalWorkflowEventIngestResponse = {
  event_id: string;
  event_type: string;
  status: "queued";
};

export function normalizeInternalWorkflowEventIngestResponse(value: unknown): InternalWorkflowEventIngestResponse {
  if (!isRecord(value) || typeof value.event_id !== "string") {
    throw new Error("Server response did not include an ingested workflow event id.");
  }
  return {
    event_id: value.event_id,
    event_type: apiString(value.event_type),
    status: "queued",
  };
}

export const queueInternalWorkflowEvent = (
  eventType: string,
  body: InternalWorkflowEventIngestRequest,
) =>
  apiFetch<unknown>(
    `/ingest/internal/${encodeURIComponent(eventType)}`,
    { method: "POST", bodyJson: body },
  ).then(normalizeInternalWorkflowEventIngestResponse);

export type WorkflowWebhookIngressPayloadSummary = Record<string, unknown>;

export type WorkflowWebhookIngressRequest = {
  timestamp_secs: number;
  signature: string;
  payload_summary?: WorkflowWebhookIngressPayloadSummary;
};

export type WorkflowWebhookIngressResponse = {
  accepted: boolean;
  registration_id: string;
  workflow_id: string;
  trigger_kind: string;
  provisional_run_id: string;
  note: string;
};

export function normalizeWorkflowWebhookIngressResponse(value: unknown): WorkflowWebhookIngressResponse {
  if (!isRecord(value) || typeof value.registration_id !== "string") {
    throw new Error("Server response did not include a webhook registration id.");
  }
  return {
    accepted: apiBoolean(value.accepted),
    registration_id: value.registration_id,
    workflow_id: apiString(value.workflow_id),
    trigger_kind: apiString(value.trigger_kind),
    provisional_run_id: apiString(value.provisional_run_id),
    note: apiString(value.note),
  };
}

export const ingestWorkflowWebhook = (
  registrationId: string,
  body: WorkflowWebhookIngressRequest,
) =>
  apiFetch<unknown>(
    `/ingest/webhook/${encodeURIComponent(registrationId)}`,
    { method: "POST", bodyJson: body },
  ).then(normalizeWorkflowWebhookIngressResponse);

export type WorkflowConnectorAdapterSpec = {
  connector_family: string;
  description: string;
  execution_path: string;
  afp_discovery_subtype?: string;
  afp_request_subtype?: string;
  afp_result_subtype?: string;
  metadata_tool_call: boolean;
  metadata_store_default: boolean;
  auth_modes: string[];
  side_effect_policy: string;
  bypass_llm_routing: boolean;
};

export function normalizeWorkflowConnectorAdapter(value: unknown): WorkflowConnectorAdapterSpec | null {
  if (!isRecord(value) || typeof value.connector_family !== "string") return null;
  return {
    connector_family: value.connector_family,
    description: apiString(value.description),
    execution_path: apiString(value.execution_path),
    afp_discovery_subtype: typeof value.afp_discovery_subtype === "string" ? value.afp_discovery_subtype : undefined,
    afp_request_subtype: typeof value.afp_request_subtype === "string" ? value.afp_request_subtype : undefined,
    afp_result_subtype: typeof value.afp_result_subtype === "string" ? value.afp_result_subtype : undefined,
    metadata_tool_call: apiBoolean(value.metadata_tool_call),
    metadata_store_default: apiBoolean(value.metadata_store_default),
    auth_modes: apiStringList(value.auth_modes),
    side_effect_policy: apiString(value.side_effect_policy),
    bypass_llm_routing: apiBoolean(value.bypass_llm_routing),
  };
}

export function normalizeWorkflowConnectorAdaptersResponse(value: unknown): { connector_families: string[]; adapters: WorkflowConnectorAdapterSpec[] } {
  if (!isRecord(value)) return { connector_families: [], adapters: [] };
  return {
    connector_families: apiStringList(value.connector_families),
    adapters: Array.isArray(value.adapters)
      ? value.adapters.flatMap((adapter): WorkflowConnectorAdapterSpec[] => {
          const normalized = normalizeWorkflowConnectorAdapter(adapter);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export const getWorkflowConnectorAdapters = () =>
  apiFetch<unknown>("/workflows/connector-adapters").then(normalizeWorkflowConnectorAdaptersResponse);

/** Fetch the user's AFP encryption key for client-side decryption. */
export function normalizeEncKeyResponse(value: unknown): { enc_key_hex: string; algorithm: string } {
  if (!isRecord(value) || typeof value.enc_key_hex !== "string" || !value.enc_key_hex) {
    throw new Error("Server response did not include an encryption key.");
  }
  return {
    enc_key_hex: value.enc_key_hex,
    algorithm: apiString(value.algorithm, "xchacha20poly1305"),
  };
}

export const fetchEncKey = () =>
  apiFetch<unknown>("/agent/keys").then(normalizeEncKeyResponse);

// ── LLM config ───────────────────────────────────────────────────────────────

export type LlmConfig = {
  id: string;
  backend: "hosted" | "byok" | "ollama" | "runpod";
  provider: string;
  model: string;
  ollama_url?: string | null;
  monthly_budget_cents: number;
  usage_cents_current_month: number;
  inference_ready: boolean;
};

function normalizeLlmBackend(value: unknown): LlmConfig["backend"] {
  return value === "byok" || value === "ollama" || value === "runpod" ? value : "hosted";
}

export function normalizeLlmConfig(value: unknown): LlmConfig {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Server response did not include an LLM config.");
  }
  return {
    id: value.id,
    backend: normalizeLlmBackend(value.backend),
    provider: apiString(value.provider),
    model: apiString(value.model),
    ollama_url: typeof value.ollama_url === "string" || value.ollama_url === null ? value.ollama_url : undefined,
    monthly_budget_cents: apiNumber(value.monthly_budget_cents) ?? 0,
    usage_cents_current_month: apiNumber(value.usage_cents_current_month) ?? 0,
    inference_ready: value.inference_ready === true,
  };
}

export const fetchLlmConfig = () =>
  apiFetch<unknown>("/user/llm-config").then(normalizeLlmConfig);

export type CostSummary = {
  user_id: string;
  total_usd: number;
  total_tokens: number;
  event_count: number;
  run_count: number;
};

export type CostBudget = {
  user_id?: string;
  max_cost_usd: number;
  max_api_calls: number;
  max_llm_tokens: number;
  soft_limit_ratio: number;
  degradation_policy?: "downgrade" | "cache_only" | "halt" | string;
};

export type CostProfitSummary = {
  user_id: string;
  pricing_tier: string;
  tier_max_stage: number;
  daily_deep_query_limit: number;
  deep_queries_today: number;
  budget_max_cost_usd: number;
  cost_day_usd: number;
  cost_month_usd: number;
  estimated_monthly_revenue_usd: number;
  estimated_monthly_margin_usd: number;
  margin_guard_active: boolean;
  usage_guard_active: boolean;
};

export type SpendHistoryEntry = {
  day: string;
  cost_usd: number;
  api_calls: number;
  tokens: number;
};

export type OperatorUserSummary = {
  user_id: string;
  email: string;
  display_name?: string;
  auth_provider?: string;
  created_at?: string;
  email_verified: boolean;
  plan: string;
  billing_status: string;
  last_session_at?: string;
  account_status: string;
  account_status_reason?: string;
  support_access_status?: string;
  support_access_expires_at?: string;
};

export type OperatorUsersResponse = {
  users: OperatorUserSummary[];
  limit: number;
  query?: string;
  total_users?: number;
};

export type OperatorProfitAdminUser = {
  user_id: string;
  sessions: number;
  plan: string;
  cost_usd: number;
  revenue_usd: number;
  margin_usd: number;
};

export type OperatorProfitAdminWorkflow = {
  workflow_id: string;
  cost_usd: number;
  events: number;
};

export type OperatorProfitAdminDailyCost = {
  day: string;
  cost_usd: number;
};

export type OperatorProfitAdminSummary = {
  users: OperatorProfitAdminUser[];
  by_workflow: OperatorProfitAdminWorkflow[];
  daily_cost: OperatorProfitAdminDailyCost[];
  operational_guidance?: DashboardBootstrap["operational_guidance"];
};

export type OperatorUserActionReceipt = {
  ok: boolean;
  action: string;
  user_id: string;
  email: string;
  sessions_revoked: number;
  support_access_revoked: boolean;
  account_status: string;
  account_status_reason?: string;
};

export type OperatorRuntimeRemediationReceipt = {
  ok: boolean;
  action: string;
  receipt_id: string;
  lifecycle_status: string;
  issued_at: string;
  execution_mode: string;
  approval_required: boolean;
  summary: string;
  command: string;
  source: string;
  guidance_status: string;
  pressure_status?: string | null;
  pressure_total_rows?: number;
  cleanup_mode?: string | null;
  artifact_generated_at?: string | null;
  note?: string | null;
  completed_at?: string | null;
  outcome_note?: string | null;
  proof_reference?: string | null;
};

export type OperatorRuntimeRemediationHistoryResponse = {
  entries: OperatorRuntimeRemediationReceipt[];
  retention?: {
    max_event_age_days: number;
    max_event_rows_per_user: number;
    rollover_behavior: string;
  };
};

export type AdminWeddingOpsMetricsPayload = Record<string, unknown>;

export type AdminWeddingQuoteShareMetrics = {
  sentTotal: number;
  sent7d: number;
  lastSentAt: string | null;
  toolUrl: string;
  privacy: string;
};

export type AdminWeddingApiProviderStatus = {
  providerId: string;
  connectedAppId: string;
  label: string;
  credentialRequired: boolean;
  configured: boolean;
  sourceLabel: string | null;
  requiredForStack: boolean;
};

export type AdminWeddingApiStackPayload = {
  providers: AdminWeddingApiProviderStatus[];
  connectedAppIds: string[];
  guardrails: string[];
};

export type AdminWeddingWaitlistSignup = {
  signupId: string;
  email: string;
  firstName: string;
  lastName: string;
  expectedWeddingDate: string | null;
  source: string;
  createdAt: string;
};

export type AdminWeddingWaitlistResponse = {
  signups: AdminWeddingWaitlistSignup[];
};

export type WeddingVendorPhoto = {
  photoId: string;
  vendorId: string;
  slot: number;
  photoUrl: string;
  altText: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
  licenceMetadata: Record<string, unknown>;
  createdAt: string;
};

export type WeddingVendor = {
  vendorId: string;
  vendorSlug: string;
  vendorName: string;
  category: string;
  serviceArea: string;
  address: string | null;
  websiteUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  sourceCheckedAt: string | null;
  status: "active" | "hidden" | "archived" | string;
  claimStatus: "unclaimed" | "claim_pending" | "claimed" | "verified" | "disputed" | string;
  linkedAgentId: string | null;
  notes: string | null;
  evidence: Record<string, unknown>;
  caveatLabels: string[];
  createdAt: string;
  updatedAt: string;
  photos: WeddingVendorPhoto[];
  rooms: AdminWeddingVendorRoom[];
  userContact: WeddingVendorContactRecord | null;
} & WeddingVendorAttributeFields;

export type WeddingVendorWritePayload = {
  vendor_slug: string;
  vendor_name: string;
  category: string;
  service_area: string;
  address?: string | null;
  website_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  source_url?: string | null;
  source_label?: string | null;
  source_checked_at?: string | null;
  status?: "active" | "hidden" | "archived";
  notes?: string | null;
  evidence?: Record<string, unknown>;
  caveat_labels?: string[];
  photos?: {
    slot: number;
    photo_url: string;
    alt_text?: string | null;
    source_label?: string | null;
    source_url?: string | null;
    retrieved_at?: string | null;
    licence_metadata?: Record<string, unknown>;
  }[];
} & WeddingVendorAttributeWriteFields;

export type AdminWeddingVendorsResponse = {
  vendors: WeddingVendor[];
} & WeddingVendorAttributeCatalogFields;

export type WeddingVendorContactRecord = {
  contactId: string;
  userId: string;
  vendorId: string;
  contactMethod: string;
  lastContactAt: string;
  responseReceivedAt: string | null;
  followUpDueAt: string | null;
  threadId: string | null;
  receiptRef: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WeddingIntakeSource = "wedding_site" | "wedding_quiz" | "generic";

export type WeddingUserOnboardingState = {
  userId: string;
  weddingPlanId: string;
  intakeVariant: WeddingIntakeSource;
  entrySource: WeddingIntakeSource;
  adminDataConsent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminWeddingAiRoutingPolicyPayload = {
  backendPolicyEndpointMounted?: boolean | null;
  auditReceiptProjectionReady?: boolean | null;
  tenantBoundaryEnforced?: boolean | null;
  budgetGuardrailsReady?: boolean | null;
  weddingTemplateScopeOnly?: boolean | null;
  masterAgentQueryExcluded?: boolean | null;
  lastVerifiedAt?: string | null;
  policySourceLabel?: string | null;
};

export type AdminThirdPartyToolPolicyRecordPayload = {
  toolId: string;
  enabledForAllUsers: boolean;
  enabledForWeddingTemplate: boolean;
  monthlyFreeQuotaLabel?: string | null;
  quotaUsedLabel?: string | null;
};

export type AdminThirdPartyToolPolicyPayload = {
  policies: AdminThirdPartyToolPolicyRecordPayload[];
  updatedAt?: string | null;
  sourceLabel?: string | null;
};

export type OperatorSupportAccessState = NonNullable<DashboardBootstrap["support_access"]>;

export type OperatorSupportAccessHistoryEntry = NonNullable<DashboardBootstrap["support_access_history"]>[number];

export type OperatorSessionEntry = {
  session_ref: string;
  token_preview: string;
  created_at: string;
  expires_at: string;
  current: boolean;
};

export type OperatorUserDetail = {
  user_id: string;
  email: string;
  display_name: string;
  auth_provider: string;
  created_at: string;
  account_status: string;
  account_status_reason?: string;
  support_access: OperatorSupportAccessState | null;
  support_access_history: OperatorSupportAccessHistoryEntry[];
  sessions: OperatorSessionEntry[];
};

export function normalizeCostSummary(value: unknown): CostSummary {
  const record = isRecord(value) ? value : {};
  return {
    user_id: apiString(record.user_id),
    total_usd: apiNumber(record.total_usd) ?? 0,
    total_tokens: apiNumber(record.total_tokens) ?? 0,
    event_count: apiNumber(record.event_count) ?? 0,
    run_count: apiNumber(record.run_count) ?? 0,
  };
}

export function normalizeCostBudget(value: unknown): CostBudget {
  const record = isRecord(value) ? value : {};
  return {
    user_id: typeof record.user_id === "string" ? record.user_id : undefined,
    max_cost_usd: apiNumber(record.max_cost_usd) ?? 0,
    max_api_calls: apiNumber(record.max_api_calls) ?? 0,
    max_llm_tokens: apiNumber(record.max_llm_tokens) ?? 0,
    soft_limit_ratio: apiNumber(record.soft_limit_ratio) ?? 0,
    degradation_policy: typeof record.degradation_policy === "string" ? record.degradation_policy : undefined,
  };
}

export function normalizeCostProfitSummary(value: unknown): CostProfitSummary {
  const record = isRecord(value) ? value : {};
  return {
    user_id: apiString(record.user_id),
    pricing_tier: apiString(record.pricing_tier),
    tier_max_stage: apiNumber(record.tier_max_stage) ?? 0,
    daily_deep_query_limit: apiNumber(record.daily_deep_query_limit) ?? 0,
    deep_queries_today: apiNumber(record.deep_queries_today) ?? 0,
    budget_max_cost_usd: apiNumber(record.budget_max_cost_usd) ?? 0,
    cost_day_usd: apiNumber(record.cost_day_usd) ?? 0,
    cost_month_usd: apiNumber(record.cost_month_usd) ?? 0,
    estimated_monthly_revenue_usd: apiNumber(record.estimated_monthly_revenue_usd) ?? 0,
    estimated_monthly_margin_usd: apiNumber(record.estimated_monthly_margin_usd) ?? 0,
    margin_guard_active: apiBoolean(record.margin_guard_active),
    usage_guard_active: apiBoolean(record.usage_guard_active),
  };
}

export function normalizeSpendHistoryEntry(value: unknown): SpendHistoryEntry | null {
  if (!isRecord(value) || typeof value.day !== "string") return null;
  return {
    day: value.day,
    cost_usd: apiNumber(value.cost_usd) ?? 0,
    api_calls: apiNumber(value.api_calls) ?? 0,
    tokens: apiNumber(value.tokens) ?? 0,
  };
}

export function normalizeSpendHistoryResponse(value: unknown): { days: number; history: SpendHistoryEntry[] } {
  return {
    days: isRecord(value) ? apiNumber(value.days) ?? 0 : 0,
    history: isRecord(value) && Array.isArray(value.history)
      ? value.history.flatMap((entry): SpendHistoryEntry[] => {
          const normalized = normalizeSpendHistoryEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeOperatorUserSummary(value: unknown): OperatorUserSummary | null {
  if (!isRecord(value) || typeof value.user_id !== "string" || typeof value.email !== "string") {
    return null;
  }
  return {
    user_id: value.user_id,
    email: value.email,
    display_name: typeof value.display_name === "string" ? value.display_name : undefined,
    auth_provider: typeof value.auth_provider === "string" ? value.auth_provider : undefined,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    email_verified: apiBoolean(value.email_verified),
    plan: apiString(value.plan),
    billing_status: apiString(value.billing_status),
    last_session_at: typeof value.last_session_at === "string" ? value.last_session_at : undefined,
    account_status: apiString(value.account_status, "active"),
    account_status_reason: typeof value.account_status_reason === "string" ? value.account_status_reason : undefined,
    support_access_status: typeof value.support_access_status === "string" ? value.support_access_status : undefined,
    support_access_expires_at:
      typeof value.support_access_expires_at === "string" ? value.support_access_expires_at : undefined,
  };
}

export function normalizeOperatorUsersResponse(value: unknown): OperatorUsersResponse {
  return {
    users: isRecord(value) && Array.isArray(value.users)
      ? value.users.flatMap((entry): OperatorUserSummary[] => {
          const normalized = normalizeOperatorUserSummary(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    limit: isRecord(value) ? apiNumber(value.limit) ?? 0 : 0,
    query: isRecord(value) && typeof value.query === "string" ? value.query : undefined,
    total_users: isRecord(value) && apiNumber(value.total_users) !== null
      ? apiNumber(value.total_users) ?? undefined
      : undefined,
  };
}

export function normalizeOperatorProfitAdminUser(value: unknown): OperatorProfitAdminUser | null {
  if (!isRecord(value) || typeof value.user_id !== "string") return null;
  return {
    user_id: value.user_id,
    sessions: apiNumber(value.sessions) ?? 0,
    plan: apiString(value.plan),
    cost_usd: apiNumber(value.cost_usd) ?? 0,
    revenue_usd: apiNumber(value.revenue_usd) ?? 0,
    margin_usd: apiNumber(value.margin_usd) ?? 0,
  };
}

export function normalizeOperatorProfitAdminWorkflow(value: unknown): OperatorProfitAdminWorkflow | null {
  if (!isRecord(value) || typeof value.workflow_id !== "string") return null;
  return {
    workflow_id: value.workflow_id,
    cost_usd: apiNumber(value.cost_usd) ?? 0,
    events: apiNumber(value.events) ?? 0,
  };
}

export function normalizeOperatorProfitAdminDailyCost(value: unknown): OperatorProfitAdminDailyCost | null {
  if (!isRecord(value) || typeof value.day !== "string") return null;
  return {
    day: value.day,
    cost_usd: apiNumber(value.cost_usd) ?? 0,
  };
}

export function normalizeOperatorProfitAdminSummary(value: unknown): OperatorProfitAdminSummary {
  return {
    users: isRecord(value) && Array.isArray(value.users)
      ? value.users.flatMap((entry): OperatorProfitAdminUser[] => {
          const normalized = normalizeOperatorProfitAdminUser(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    by_workflow: isRecord(value) && Array.isArray(value.by_workflow)
      ? value.by_workflow.flatMap((entry): OperatorProfitAdminWorkflow[] => {
          const normalized = normalizeOperatorProfitAdminWorkflow(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    daily_cost: isRecord(value) && Array.isArray(value.daily_cost)
      ? value.daily_cost.flatMap((entry): OperatorProfitAdminDailyCost[] => {
          const normalized = normalizeOperatorProfitAdminDailyCost(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    operational_guidance: isRecord(value)
      ? normalizeDashboardOperationalGuidance(value.operational_guidance)
      : undefined,
  };
}

export function normalizeOperatorUserActionReceipt(value: unknown): OperatorUserActionReceipt {
  const record = isRecord(value) ? value : {};
  return {
    ok: apiBoolean(record.ok),
    action: apiString(record.action),
    user_id: apiString(record.user_id),
    email: apiString(record.email),
    sessions_revoked: apiNumber(record.sessions_revoked) ?? 0,
    support_access_revoked: apiBoolean(record.support_access_revoked),
    account_status: apiString(record.account_status, "active"),
    account_status_reason: typeof record.account_status_reason === "string" ? record.account_status_reason : undefined,
  };
}

export function normalizeOperatorRuntimeRemediationReceipt(value: unknown): OperatorRuntimeRemediationReceipt {
  const record = isRecord(value) ? value : {};
  return {
    ok: apiBoolean(record.ok),
    action: apiString(record.action),
    receipt_id: apiString(record.receipt_id),
    lifecycle_status: apiString(record.lifecycle_status, "issued"),
    issued_at: apiString(record.issued_at),
    execution_mode: apiString(record.execution_mode),
    approval_required: apiBoolean(record.approval_required),
    summary: apiString(record.summary),
    command: apiString(record.command),
    source: apiString(record.source),
    guidance_status: apiString(record.guidance_status),
    pressure_status: apiNullableString(record.pressure_status),
    pressure_total_rows: apiNumber(record.pressure_total_rows),
    cleanup_mode: apiNullableString(record.cleanup_mode),
    artifact_generated_at: apiNullableString(record.artifact_generated_at),
    note: apiNullableString(record.note),
    completed_at: apiNullableString(record.completed_at),
    outcome_note: apiNullableString(record.outcome_note),
    proof_reference: apiNullableString(record.proof_reference),
  };
}

function normalizeOperatorRuntimeRemediationReceiptEntry(
  value: unknown,
): OperatorRuntimeRemediationReceipt | null {
  if (!isRecord(value) || typeof value.receipt_id !== "string" || typeof value.issued_at !== "string") {
    return null;
  }
  return normalizeOperatorRuntimeRemediationReceipt(value);
}

export function normalizeOperatorRuntimeRemediationHistoryResponse(
  value: unknown,
): OperatorRuntimeRemediationHistoryResponse {
  const record = isRecord(value) ? value : {};
  return {
    entries: Array.isArray(record.entries)
      ? record.entries.flatMap((entry): OperatorRuntimeRemediationReceipt[] => {
          const normalized = normalizeOperatorRuntimeRemediationReceiptEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    retention: isRecord(record.retention)
      ? {
          max_event_age_days: apiNumber(record.retention.max_event_age_days) ?? 0,
          max_event_rows_per_user: apiNumber(record.retention.max_event_rows_per_user) ?? 0,
          rollover_behavior: apiString(record.retention.rollover_behavior),
        }
      : undefined,
  };
}

export function normalizeAdminWeddingOpsMetricsPayload(value: unknown): AdminWeddingOpsMetricsPayload {
  return isRecord(value) ? value : {};
}

function normalizeAdminWeddingApiProviderStatus(value: unknown): AdminWeddingApiProviderStatus | null {
  if (!isRecord(value)) return null;
  const providerId = apiString(value.providerId);
  const connectedAppId = apiString(value.connectedAppId);
  const label = apiString(value.label);
  if (!providerId || !connectedAppId || !label) return null;
  return {
    providerId,
    connectedAppId,
    label,
    credentialRequired: apiBoolean(value.credentialRequired),
    configured: apiBoolean(value.configured),
    sourceLabel: apiNullableString(value.sourceLabel) ?? null,
    requiredForStack: apiBoolean(value.requiredForStack),
  };
}

export function normalizeAdminWeddingApiStackPayload(value: unknown): AdminWeddingApiStackPayload {
  const record = isRecord(value) ? value : {};
  const providers = Array.isArray(record.providers)
    ? record.providers.flatMap((entry): AdminWeddingApiProviderStatus[] => {
        const normalized = normalizeAdminWeddingApiProviderStatus(entry);
        return normalized ? [normalized] : [];
      })
    : [];
  const connectedAppIds = Array.isArray(record.connectedAppIds)
    ? record.connectedAppIds.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : providers.filter((provider) => provider.configured).map((provider) => provider.connectedAppId);
  return {
    providers,
    connectedAppIds: Array.from(new Set(connectedAppIds)),
    guardrails: Array.isArray(record.guardrails)
      ? record.guardrails.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
  };
}

function normalizeAdminWeddingWaitlistSignup(value: unknown): AdminWeddingWaitlistSignup | null {
  if (!isRecord(value) || typeof value.signup_id !== "string" || typeof value.email !== "string") {
    return null;
  }
  return {
    signupId: value.signup_id,
    email: value.email,
    firstName: typeof value.first_name === "string" ? value.first_name : "",
    lastName: typeof value.last_name === "string" ? value.last_name : "",
    expectedWeddingDate: typeof value.expected_wedding_date === "string" ? value.expected_wedding_date : null,
    source: typeof value.source === "string" ? value.source : "wedding_site",
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
  };
}

export function normalizeAdminWeddingWaitlistResponse(value: unknown): AdminWeddingWaitlistResponse {
  const record = isRecord(value) ? value : {};
  return {
    signups: Array.isArray(record.signups)
      ? record.signups.flatMap((entry) => {
          const normalized = normalizeAdminWeddingWaitlistSignup(entry);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeWeddingVendorPhoto(value: unknown): WeddingVendorPhoto | null {
  if (!isRecord(value) || typeof value.photo_id !== "string" || typeof value.vendor_id !== "string") return null;
  return {
    photoId: value.photo_id,
    vendorId: value.vendor_id,
    slot: apiNumber(value.slot) ?? 0,
    photoUrl: apiString(value.photo_url),
    altText: apiNullableString(value.alt_text) ?? null,
    sourceLabel: apiNullableString(value.source_label) ?? null,
    sourceUrl: apiNullableString(value.source_url) ?? null,
    retrievedAt: apiNullableString(value.retrieved_at) ?? null,
    licenceMetadata: isRecord(value.licence_metadata) ? value.licence_metadata : {},
    createdAt: apiString(value.created_at),
  };
}

function normalizeWeddingVendorContactRecord(value: unknown): WeddingVendorContactRecord | null {
  if (!isRecord(value) || typeof value.contact_id !== "string" || typeof value.vendor_id !== "string") return null;
  return {
    contactId: value.contact_id,
    userId: apiString(value.user_id),
    vendorId: value.vendor_id,
    contactMethod: apiString(value.contact_method),
    lastContactAt: apiString(value.last_contact_at),
    responseReceivedAt: apiNullableString(value.response_received_at) ?? null,
    followUpDueAt: apiNullableString(value.follow_up_due_at) ?? null,
    threadId: apiNullableString(value.thread_id) ?? null,
    receiptRef: apiNullableString(value.receipt_ref) ?? null,
    notes: apiNullableString(value.notes) ?? null,
    createdAt: apiString(value.created_at),
    updatedAt: apiString(value.updated_at),
  };
}

function normalizeWeddingVendor(value: unknown): WeddingVendor | null {
  if (!isRecord(value) || typeof value.vendor_id !== "string" || typeof value.vendor_name !== "string") return null;
  return {
    vendorId: value.vendor_id,
    vendorSlug: apiString(value.vendor_slug),
    vendorName: value.vendor_name,
    category: apiString(value.category),
    serviceArea: apiString(value.service_area),
    address: apiNullableString(value.address) ?? null,
    websiteUrl: apiNullableString(value.website_url) ?? null,
    contactPhone: apiNullableString(value.contact_phone) ?? null,
    contactEmail: apiNullableString(value.contact_email) ?? null,
    sourceUrl: apiNullableString(value.source_url) ?? null,
    sourceLabel: apiNullableString(value.source_label) ?? null,
    sourceCheckedAt: apiNullableString(value.source_checked_at) ?? null,
    status: apiString(value.status, "active"),
    claimStatus: apiString(value.claim_status, "unclaimed"),
    linkedAgentId: apiNullableString(value.linked_agent_id) ?? null,
    notes: apiNullableString(value.notes) ?? null,
    evidence: isRecord(value.evidence) ? value.evidence : {},
    caveatLabels: Array.isArray(value.caveat_labels) ? value.caveat_labels.filter((label): label is string => typeof label === "string") : [],
    createdAt: apiString(value.created_at),
    updatedAt: apiString(value.updated_at),
    photos: Array.isArray(value.photos)
      ? value.photos.flatMap((entry): WeddingVendorPhoto[] => {
          const normalized = normalizeWeddingVendorPhoto(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    rooms: normalizeAdminWeddingVendorRooms(value.rooms),
    userContact: normalizeWeddingVendorContactRecord(value.user_contact),
    ...normalizeWeddingVendorAttributeFields(value),
  };
}

export function normalizeAdminWeddingVendorsResponse(value: unknown): AdminWeddingVendorsResponse {
  const record = isRecord(value) ? value : {};
  return {
    vendors: Array.isArray(record.vendors)
      ? record.vendors.flatMap((entry): WeddingVendor[] => {
          const normalized = normalizeWeddingVendor(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    ...normalizeWeddingVendorAttributeCatalogFields(record),
  };
}

export function normalizeAdminWeddingVendorMutationResponse(value: unknown): { vendor: WeddingVendor | null } {
  const record = isRecord(value) ? value : {};
  return { vendor: normalizeWeddingVendor(record.vendor) };
}

export function normalizeWeddingVendorContactResponse(value: unknown): { contact: WeddingVendorContactRecord | null } {
  const record = isRecord(value) ? value : {};
  return { contact: normalizeWeddingVendorContactRecord(record.contact) };
}

function isWeddingIntakeSource(value: unknown): value is WeddingIntakeSource {
  return value === "wedding_site" || value === "wedding_quiz" || value === "generic";
}

function normalizeWeddingUserOnboardingState(value: unknown): WeddingUserOnboardingState | null {
  if (
    !isRecord(value)
    || typeof value.user_id !== "string"
    || typeof value.wedding_plan_id !== "string"
    || !isWeddingIntakeSource(value.intake_variant)
    || !isWeddingIntakeSource(value.entry_source)
  ) return null;
  return {
    userId: value.user_id,
    weddingPlanId: value.wedding_plan_id,
    intakeVariant: value.intake_variant,
    entrySource: value.entry_source,
    adminDataConsent: value.admin_data_consent === true,
    createdAt: apiString(value.created_at),
    updatedAt: apiString(value.updated_at),
  };
}

export function normalizeWeddingOnboardingStateResponse(value: unknown): { onboardingState: WeddingUserOnboardingState | null } {
  const record = isRecord(value) ? value : {};
  return { onboardingState: normalizeWeddingUserOnboardingState(record.onboarding_state) };
}

export function normalizeAdminWeddingAiRoutingPolicyPayload(value: unknown): AdminWeddingAiRoutingPolicyPayload {
  const record = isRecord(value) ? value : {};
  return {
    backendPolicyEndpointMounted: apiBoolean(record.backendPolicyEndpointMounted),
    auditReceiptProjectionReady: apiBoolean(record.auditReceiptProjectionReady),
    tenantBoundaryEnforced: apiBoolean(record.tenantBoundaryEnforced),
    budgetGuardrailsReady: apiBoolean(record.budgetGuardrailsReady),
    weddingTemplateScopeOnly: apiBoolean(record.weddingTemplateScopeOnly),
    masterAgentQueryExcluded: apiBoolean(record.masterAgentQueryExcluded),
    lastVerifiedAt: typeof record.lastVerifiedAt === "string" ? record.lastVerifiedAt : null,
    policySourceLabel: typeof record.policySourceLabel === "string" ? record.policySourceLabel : null,
  };
}

function normalizeAdminThirdPartyToolPolicyRecordPayload(
  value: unknown,
): AdminThirdPartyToolPolicyRecordPayload | null {
  if (!isRecord(value) || typeof value.toolId !== "string") return null;
  return {
    toolId: value.toolId,
    enabledForAllUsers: apiBoolean(value.enabledForAllUsers),
    enabledForWeddingTemplate: apiBoolean(value.enabledForWeddingTemplate),
    monthlyFreeQuotaLabel: apiNullableString(value.monthlyFreeQuotaLabel),
    quotaUsedLabel: apiNullableString(value.quotaUsedLabel),
  };
}

export function normalizeAdminThirdPartyToolPolicyPayload(value: unknown): AdminThirdPartyToolPolicyPayload {
  const record = isRecord(value) ? value : {};
  return {
    policies: Array.isArray(record.policies)
      ? record.policies.flatMap((entry): AdminThirdPartyToolPolicyRecordPayload[] => {
          const normalized = normalizeAdminThirdPartyToolPolicyRecordPayload(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    updatedAt: apiNullableString(record.updatedAt),
    sourceLabel: apiNullableString(record.sourceLabel),
  };
}

export function normalizeOperatorSessionEntry(value: unknown): OperatorSessionEntry | null {
  if (!isRecord(value) || typeof value.session_ref !== "string") return null;
  return {
    session_ref: value.session_ref,
    token_preview: apiString(value.token_preview),
    created_at: apiString(value.created_at),
    expires_at: apiString(value.expires_at),
    current: apiBoolean(value.current),
  };
}

export function normalizeOperatorUserDetail(value: unknown): OperatorUserDetail {
  const record = isRecord(value) ? value : {};
  return {
    user_id: apiString(record.user_id),
    email: apiString(record.email),
    display_name: apiString(record.display_name),
    auth_provider: apiString(record.auth_provider),
    created_at: apiString(record.created_at),
    account_status: apiString(record.account_status, "active"),
    account_status_reason: typeof record.account_status_reason === "string" ? record.account_status_reason : undefined,
    support_access: normalizeDashboardSupportAccess(record.support_access) ?? null,
    support_access_history: Array.isArray(record.support_access_history)
      ? record.support_access_history.flatMap((entry): OperatorSupportAccessHistoryEntry[] => {
          const normalized = normalizeDashboardSupportAccessHistoryEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    sessions: Array.isArray(record.sessions)
      ? record.sessions.flatMap((entry): OperatorSessionEntry[] => {
          const normalized = normalizeOperatorSessionEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export const fetchCostSummary = () =>
  apiFetch<unknown>("/api/cost/summary").then(normalizeCostSummary);

export const fetchCostProfitSummary = () =>
  apiFetch<unknown>("/api/cost/profit/summary").then(normalizeCostProfitSummary);

export const getCostBudget = () =>
  apiFetch<unknown>("/api/cost/budget").then(normalizeCostBudget);

export const upsertCostBudget = (body: Partial<CostBudget>) =>
  apiFetch<unknown>("/api/cost/budget", { method: "POST", bodyJson: body }).then(normalizeOkResponse);

export const fetchSpendHistory = (days = 30) =>
  apiFetch<unknown>(
    `/agent/spend-history?days=${encodeURIComponent(String(days))}`,
  ).then(normalizeSpendHistoryResponse);

export const fetchAdminUsers = (opts?: { limit?: number; query?: string }) => {
  const query = new URLSearchParams();
  if (opts?.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts?.query?.trim()) query.set("query", opts.query.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiFetch<unknown>(`/admin/users${suffix}`).then(normalizeOperatorUsersResponse);
};

export const fetchProfitAdminSummary = () =>
  apiFetch<unknown>("/api/cost/profit/admin").then(normalizeOperatorProfitAdminSummary);

export const fetchAdminUserDetail = (userId: string) =>
  apiFetch<unknown>(`/admin/users/${encodeURIComponent(userId)}`).then(normalizeOperatorUserDetail);

export const runAdminUserAction = (
  userId: string,
  body: {
    action: "revoke_all_sessions" | "revoke_support_access" | "suspend_account" | "reactivate_account";
    reason?: string;
  },
) =>
  apiFetch<unknown>(`/admin/users/${encodeURIComponent(userId)}/actions`, {
    method: "POST",
    bodyJson: body,
  }).then(normalizeOperatorUserActionReceipt);

export const issueOperatorRuntimeRemediationReceipt = (body?: { note?: string }) =>
  apiFetch<unknown>("/admin/runtime-remediation", {
    method: "POST",
    bodyJson: {
      action: "issue_cleanup_receipt",
      acknowledge_manual_execution: true,
      note: body?.note,
    },
  }).then(normalizeOperatorRuntimeRemediationReceipt);

export const completeOperatorRuntimeRemediationReceipt = (body: {
  receipt_id: string;
  outcome_note: string;
  proof_reference?: string;
}) =>
  apiFetch<unknown>("/admin/runtime-remediation", {
    method: "POST",
    bodyJson: {
      action: "complete_cleanup_receipt",
      receipt_id: body.receipt_id,
      acknowledge_manual_execution: true,
      outcome_note: body.outcome_note,
      proof_reference: body.proof_reference,
    },
  }).then(normalizeOperatorRuntimeRemediationReceipt);

export const fetchOperatorRuntimeRemediationHistory = () =>
  apiFetch<unknown>("/admin/runtime-remediation").then(normalizeOperatorRuntimeRemediationHistoryResponse);

export const fetchAdminWeddingOpsMetrics = () =>
  apiFetch<unknown>("/admin/wedding/ops-metrics").then(normalizeAdminWeddingOpsMetricsPayload);

export const fetchAdminWeddingQuoteShareMetrics = () =>
  apiFetch<unknown>("/admin/wedding/quote-shares").then((value): AdminWeddingQuoteShareMetrics => {
    const record = isRecord(value) ? value : {};
    return {
      sentTotal: apiNumber(record.sent_total) ?? 0,
      sent7d: apiNumber(record.sent_7d) ?? 0,
      lastSentAt: apiString(record.last_sent_at) || null,
      toolUrl: apiString(record.tool_url) || "https://omnyid.com/wedding/compare-wedding-venue-quotes.html",
      privacy: apiString(record.privacy) || "Quote content and recipient addresses are not stored.",
    };
  });

export const fetchAdminWeddingAiRoutingPolicy = () =>
  apiFetch<unknown>("/admin/wedding/ai-routing-policy").then(normalizeAdminWeddingAiRoutingPolicyPayload);

export const fetchAdminWeddingApiStack = () =>
  apiFetch<unknown>("/admin/wedding/api-stack").then(normalizeAdminWeddingApiStackPayload);

export const fetchAdminThirdPartyToolPolicy = () =>
  apiFetch<unknown>("/admin/third-party-tool-policy").then(normalizeAdminThirdPartyToolPolicyPayload);

export const saveAdminThirdPartyToolPolicy = (body: AdminThirdPartyToolPolicyPayload) =>
  apiFetch<unknown>("/admin/third-party-tool-policy", { method: "POST", bodyJson: body })
    .then(normalizeAdminThirdPartyToolPolicyPayload);

export const fetchAdminWeddingWaitlist = () =>
  apiFetch<unknown>("/admin/wedding/waitlist").then(normalizeAdminWeddingWaitlistResponse);

export const fetchAdminWeddingVendors = (opts?: { limit?: number; query?: string }) => {
  const query = new URLSearchParams();
  if (opts?.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts?.query?.trim()) query.set("query", opts.query.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiFetch<unknown>(`/admin/wedding/vendors${suffix}`).then(normalizeAdminWeddingVendorsResponse);
};

export const fetchWeddingVendors = (opts?: { limit?: number; query?: string }) => {
  const query = new URLSearchParams();
  if (opts?.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts?.query?.trim()) query.set("query", opts.query.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiFetch<unknown>(`/wedding/vendors${suffix}`).then(normalizeAdminWeddingVendorsResponse);
};

export const createAdminWeddingVendor = (body: WeddingVendorWritePayload) =>
  apiFetch<unknown>("/admin/wedding/vendors", { method: "POST", bodyJson: body })
    .then(normalizeAdminWeddingVendorMutationResponse);

export const updateAdminWeddingVendor = (vendorId: string, body: WeddingVendorWritePayload) =>
  apiFetch<unknown>(`/admin/wedding/vendors/${encodeURIComponent(vendorId)}`, { method: "PUT", bodyJson: body })
    .then(normalizeAdminWeddingVendorMutationResponse);

export const deleteAdminWeddingVendor = (vendorId: string) =>
  apiFetch<unknown>(`/admin/wedding/vendors/${encodeURIComponent(vendorId)}`, { method: "DELETE" })
    .then(normalizeOkResponse);

export const recordWeddingVendorContact = (
  vendorId: string,
  body: {
    contact_method: "master_agent" | "agent_email_draft" | "personal_email" | "phone" | "website_form" | "other";
    follow_up_due_at?: string | null;
    response_received_at?: string | null;
    thread_id?: string | null;
    receipt_ref?: string | null;
    notes?: string | null;
  },
) =>
  apiFetch<unknown>(`/wedding/vendors/${encodeURIComponent(vendorId)}/contact`, { method: "POST", bodyJson: body })
    .then(normalizeWeddingVendorContactResponse);

export const fetchWeddingOnboardingState = (weddingPlanId: string) =>
  apiFetch<unknown>(`/wedding/onboarding-state?wedding_plan_id=${encodeURIComponent(weddingPlanId)}`)
    .then(normalizeWeddingOnboardingStateResponse);

export const saveWeddingOnboardingState = (
  weddingPlanId: string,
  intakeVariant: WeddingIntakeSource,
  entrySource: WeddingIntakeSource,
  adminDataConsent?: boolean,
) =>
  apiFetch<unknown>("/wedding/onboarding-state", {
    method: "POST",
    bodyJson: { wedding_plan_id: weddingPlanId, intake_variant: intakeVariant, entry_source: entrySource, admin_data_consent: adminDataConsent },
  }).then(normalizeWeddingOnboardingStateResponse);

export const saveLlmConfig = (data: {
  backend: string;
  provider?: string;
  model?: string;
  api_key?: string;
  ollama_url?: string;
}) => apiFetch<unknown>("/user/llm-config", { method: "POST", bodyJson: data }).then(normalizeOkResponse);

export const pingLlmConfig = () =>
  apiFetch<unknown>("/user/llm-config/ping", { method: "POST" }).then((value) => ({
    ok: isRecord(value) ? apiBoolean(value.ok) : false,
    backend: isRecord(value) && typeof value.backend === "string" ? value.backend : undefined,
    provider: isRecord(value) && typeof value.provider === "string" ? value.provider : undefined,
    http_status: isRecord(value) ? apiNumber(value.http_status) : undefined,
    reason: isRecord(value) && typeof value.reason === "string" ? value.reason : undefined,
  }));

export type BillingStatus = {
  plan: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
  checkout_available?: boolean;
  billing_portal_available?: boolean;
  archive_only_enabled?: boolean;
  storage_quota_bytes?: number;
  max_single_upload_bytes?: number;
  storage_used_bytes?: number;
  storage_remaining_bytes?: number;
  storage_addon_count?: number;
  quota_state?: "ok" | "exceeded" | string;
  archive_only_available?: boolean;
  archive_only_warning?: string;
  operational_guidance?: DashboardBootstrap["operational_guidance"];
  external_tool_billing?: ExternalToolBillingStatus;
};

export type ExternalToolBillingCategory = {
  billing_category: string;
  total_quantity: number;
  total_estimated_cost_usd: number;
  event_count: number;
};

export type ExternalToolBillingProviderOrigin = "connected" | "built_in" | string;

export type ExternalToolBillingItem = {
  provider_origin: ExternalToolBillingProviderOrigin;
  provider_category: string;
  billing_category: string;
  tool_slug: string;
  tool_name: string;
  provider_key: string;
  usage_unit: string;
  total_quantity: number;
  total_estimated_cost_usd: number;
  latest_occurred_at?: string | null;
  event_count: number;
};

export type ExternalToolBillingEvent = {
  id: string;
  tool_slug: string;
  tool_name: string;
  provider_origin: ExternalToolBillingProviderOrigin;
  provider_key: string;
  provider_category: string;
  billing_category: string;
  usage_unit: string;
  quantity: number;
  estimated_cost_usd: number;
  currency: string;
  source: string;
  occurred_at: string;
  recorded_at: string;
};

export type ExternalToolBillingConnection = {
  tool_slug: string;
  tool_name: string;
  connection_provider: string;
  connected_at: string;
  provider_origin: ExternalToolBillingProviderOrigin;
  provider_key: string;
  provider_category: string;
  billing_model: string;
  pricing_summary: string;
  free_tier_summary?: string | null;
  production_caveat?: string | null;
  pricing_source_url?: string | null;
  default_usage_unit?: string | null;
};

export type ExternalToolBillingCoverage = {
  measurement_state: string;
  settlement_state: string;
  coverage_summary: string;
  retention?: {
    max_event_age_days: number;
    max_event_rows_per_user: number;
    rollover_behavior: string;
  };
  caveats: string[];
};

export type ExternalToolBillingStatus = {
  current_month_start: string;
  total_estimated_cost_usd: number;
  connected_estimated_cost_usd: number;
  built_in_estimated_cost_usd: number;
  currency: string;
  coverage?: ExternalToolBillingCoverage;
  categories: ExternalToolBillingCategory[];
  items: ExternalToolBillingItem[];
  recent_events: ExternalToolBillingEvent[];
  connected_tools: ExternalToolBillingConnection[];
};

function normalizeExternalToolBillingCoverage(value: unknown): ExternalToolBillingCoverage | undefined {
  if (!isRecord(value)) return undefined;
  return {
    measurement_state: apiString(value.measurement_state),
    settlement_state: apiString(value.settlement_state),
    coverage_summary: apiString(value.coverage_summary),
    retention: isRecord(value.retention)
      ? {
          max_event_age_days: apiNumber(value.retention.max_event_age_days) ?? 0,
          max_event_rows_per_user: apiNumber(value.retention.max_event_rows_per_user) ?? 0,
          rollover_behavior: apiString(value.retention.rollover_behavior),
        }
      : undefined,
    caveats: Array.isArray(value.caveats) ? apiStringList(value.caveats) : [],
  };
}

function normalizeExternalToolBillingCategory(value: unknown): ExternalToolBillingCategory | null {
  if (!isRecord(value) || typeof value.billing_category !== "string") return null;
  return {
    billing_category: value.billing_category,
    total_quantity: apiNumber(value.total_quantity) ?? 0,
    total_estimated_cost_usd: apiNumber(value.total_estimated_cost_usd) ?? 0,
    event_count: apiNumber(value.event_count) ?? 0,
  };
}

function normalizeExternalToolBillingItem(value: unknown): ExternalToolBillingItem | null {
  if (!isRecord(value) || typeof value.tool_slug !== "string" || typeof value.tool_name !== "string") return null;
  return {
    provider_origin: apiString(value.provider_origin, "built_in"),
    provider_category: apiString(value.provider_category),
    billing_category: apiString(value.billing_category),
    tool_slug: value.tool_slug,
    tool_name: value.tool_name,
    provider_key: apiString(value.provider_key),
    usage_unit: apiString(value.usage_unit),
    total_quantity: apiNumber(value.total_quantity) ?? 0,
    total_estimated_cost_usd: apiNumber(value.total_estimated_cost_usd) ?? 0,
    latest_occurred_at:
      typeof value.latest_occurred_at === "string" || value.latest_occurred_at === null
        ? value.latest_occurred_at
        : undefined,
    event_count: apiNumber(value.event_count) ?? 0,
  };
}

function normalizeExternalToolBillingEvent(value: unknown): ExternalToolBillingEvent | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    tool_slug: apiString(value.tool_slug),
    tool_name: apiString(value.tool_name),
    provider_origin: apiString(value.provider_origin, "built_in"),
    provider_key: apiString(value.provider_key),
    provider_category: apiString(value.provider_category),
    billing_category: apiString(value.billing_category),
    usage_unit: apiString(value.usage_unit),
    quantity: apiNumber(value.quantity) ?? 0,
    estimated_cost_usd: apiNumber(value.estimated_cost_usd) ?? 0,
    currency: apiString(value.currency, "USD"),
    source: apiString(value.source),
    occurred_at: apiString(value.occurred_at),
    recorded_at: apiString(value.recorded_at),
  };
}

function normalizeExternalToolBillingConnection(value: unknown): ExternalToolBillingConnection | null {
  if (!isRecord(value) || typeof value.tool_slug !== "string" || typeof value.tool_name !== "string") return null;
  return {
    tool_slug: value.tool_slug,
    tool_name: value.tool_name,
    connection_provider: apiString(value.connection_provider),
    connected_at: apiString(value.connected_at),
    provider_origin: apiString(value.provider_origin, "connected"),
    provider_key: apiString(value.provider_key),
    provider_category: apiString(value.provider_category),
    billing_model: apiString(value.billing_model),
    pricing_summary: apiString(value.pricing_summary),
    free_tier_summary:
      typeof value.free_tier_summary === "string" || value.free_tier_summary === null
        ? value.free_tier_summary
        : undefined,
    production_caveat:
      typeof value.production_caveat === "string" || value.production_caveat === null
        ? value.production_caveat
        : undefined,
    pricing_source_url:
      typeof value.pricing_source_url === "string" || value.pricing_source_url === null
        ? value.pricing_source_url
        : undefined,
    default_usage_unit:
      typeof value.default_usage_unit === "string" || value.default_usage_unit === null
        ? value.default_usage_unit
        : undefined,
  };
}

function normalizeExternalToolBillingStatus(value: unknown): ExternalToolBillingStatus | undefined {
  if (!isRecord(value)) return undefined;
  return {
    current_month_start: apiString(value.current_month_start),
    total_estimated_cost_usd: apiNumber(value.total_estimated_cost_usd) ?? 0,
    connected_estimated_cost_usd: apiNumber(value.connected_estimated_cost_usd) ?? 0,
    built_in_estimated_cost_usd: apiNumber(value.built_in_estimated_cost_usd) ?? 0,
    currency: apiString(value.currency, "USD"),
    coverage: normalizeExternalToolBillingCoverage(value.coverage),
    categories: Array.isArray(value.categories)
      ? value.categories.flatMap((entry): ExternalToolBillingCategory[] => {
          const normalized = normalizeExternalToolBillingCategory(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    items: Array.isArray(value.items)
      ? value.items.flatMap((entry): ExternalToolBillingItem[] => {
          const normalized = normalizeExternalToolBillingItem(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    recent_events: Array.isArray(value.recent_events)
      ? value.recent_events.flatMap((entry): ExternalToolBillingEvent[] => {
          const normalized = normalizeExternalToolBillingEvent(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    connected_tools: Array.isArray(value.connected_tools)
      ? value.connected_tools.flatMap((entry): ExternalToolBillingConnection[] => {
          const normalized = normalizeExternalToolBillingConnection(entry);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeBillingStatus(value: unknown): BillingStatus {
  const record = isRecord(value) ? value : {};
  return {
    plan: apiString(record.plan),
    status: apiString(record.status),
    stripe_customer_id: typeof record.stripe_customer_id === "string" || record.stripe_customer_id === null ? record.stripe_customer_id : undefined,
    stripe_subscription_id: typeof record.stripe_subscription_id === "string" || record.stripe_subscription_id === null ? record.stripe_subscription_id : undefined,
    current_period_end: typeof record.current_period_end === "string" || record.current_period_end === null ? record.current_period_end : undefined,
    checkout_available: typeof record.checkout_available === "boolean" ? record.checkout_available : undefined,
    billing_portal_available: typeof record.billing_portal_available === "boolean" ? record.billing_portal_available : undefined,
    archive_only_enabled: typeof record.archive_only_enabled === "boolean" ? record.archive_only_enabled : undefined,
    storage_quota_bytes: apiNumber(record.storage_quota_bytes),
    max_single_upload_bytes: apiNumber(record.max_single_upload_bytes),
    storage_used_bytes: apiNumber(record.storage_used_bytes),
    storage_remaining_bytes: apiNumber(record.storage_remaining_bytes),
    storage_addon_count: apiNumber(record.storage_addon_count),
    quota_state: typeof record.quota_state === "string" ? record.quota_state : undefined,
    archive_only_available: typeof record.archive_only_available === "boolean" ? record.archive_only_available : undefined,
    archive_only_warning: typeof record.archive_only_warning === "string" ? record.archive_only_warning : undefined,
    operational_guidance: normalizeDashboardOperationalGuidance(record.operational_guidance),
    external_tool_billing: normalizeExternalToolBillingStatus(record.external_tool_billing),
  };
}

export function normalizeBillingCheckoutResponse(value: unknown): { url: string; plan: string } {
  const url = normalizeUrlResponse(value).url;
  return { url, plan: isRecord(value) ? apiString(value.plan) : "" };
}

export const getBillingStatus = () =>
  apiFetch<unknown>("/billing/status").then(normalizeBillingStatus);

export const setArchiveOnlyMode = (enabled: boolean) =>
  apiFetch<unknown>("/billing/archive-only", { method: "POST", bodyJson: { enabled } }).then(normalizeBillingStatus);

export const createBillingCheckoutSession = (plan = "pro") =>
  apiFetch<unknown>("/billing/checkout", {
    method: "POST",
    bodyJson: { plan },
  }).then(normalizeBillingCheckoutResponse);

export const createBillingPortalSession = () =>
  apiFetch<unknown>("/billing/portal", { method: "POST" }).then(normalizeUrlResponse);

export function normalizeAuthUser(value: unknown): Session["user"] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.email !== "string") {
    throw new Error("Server response did not include a user session.");
  }
  return {
    id: value.id,
    email: value.email,
    display_name: apiString(value.display_name, value.email),
    auth_provider: apiString(value.auth_provider),
    operator: value.operator === true,
  };
}

export const getAuthSession = () =>
  apiFetch<unknown>("/auth/session").then(normalizeAuthUser);

// ── Capability registry ────────────────────────────────────────────────────

export type CapabilityDescriptor = {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  version: string;
  tags: string[];
  approval_mode: "autonomous" | "suggest_only" | "human_approval_required";
  created_at: string;
  enabled?: boolean;
};

const CAPABILITY_APPROVAL_MODES = new Set(["autonomous", "suggest_only", "human_approval_required"]);

export function normalizeCapabilityDescriptor(value: unknown): CapabilityDescriptor | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: apiString(value.name, value.id),
    description: apiString(value.description),
    input_schema: isRecord(value.input_schema) ? value.input_schema : {},
    output_schema: isRecord(value.output_schema) || value.output_schema === null ? value.output_schema : undefined,
    version: apiString(value.version),
    tags: apiStringList(value.tags),
    approval_mode: typeof value.approval_mode === "string" && CAPABILITY_APPROVAL_MODES.has(value.approval_mode)
      ? value.approval_mode as CapabilityDescriptor["approval_mode"]
      : "human_approval_required",
    created_at: apiString(value.created_at),
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
  };
}

export function normalizeCapabilityDescriptorResponse(value: unknown): CapabilityDescriptor {
  const descriptor = normalizeCapabilityDescriptor(value);
  if (!descriptor) throw new Error("Server response did not include a capability descriptor.");
  return descriptor;
}

export function normalizeCapabilitiesResponse(value: unknown): CapabilityDescriptor[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.capabilities)
      ? value.capabilities
      : [];
  return rows.flatMap((row): CapabilityDescriptor[] => {
    const normalized = normalizeCapabilityDescriptor(row);
    return normalized ? [normalized] : [];
  });
}

export const registerCapability = (d: Omit<CapabilityDescriptor, "id" | "created_at">) =>
  apiFetch<unknown>("/agent/capability", { method: "POST", bodyJson: d }).then(normalizeCapabilityDescriptorResponse);

export const listCapabilities = () =>
  apiFetch<unknown>("/agent/capabilities").then(normalizeCapabilitiesResponse);

export const deleteCapability = (id: string) =>
  apiFetch<unknown>(`/agent/capability/${id}`, { method: "DELETE" }).then(normalizeOkResponse);

export const patchCapability = (id: string, patch: Partial<Pick<CapabilityDescriptor, "approval_mode">>) =>
  apiFetch<unknown>(`/agent/capability/${id}`, { method: "PATCH", bodyJson: patch }).then(normalizeCapabilityDescriptorResponse);

// ── Agent personas ────────────────────────────────────────────────────────────

export type AgentPersona = {
  id: string;
  owner_user_id: string;
  name: string;
  soul_md: string;
  writing_style: string;
  skills_json: string[];
  labels_json: string[];
  image_data_url: string | null;
  lora_confidence_score: number;
  lora_genome_active: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function normalizeAgentPersona(value: unknown): AgentPersona | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    owner_user_id: apiString(value.owner_user_id),
    name: apiString(value.name, "Untitled persona"),
    soul_md: apiString(value.soul_md),
    writing_style: apiString(value.writing_style),
    skills_json: apiStringList(value.skills_json),
    labels_json: apiStringList(isRecord(value) && "labels_json" in value ? value.labels_json : value.skills_json),
    image_data_url: typeof value.image_data_url === "string" ? value.image_data_url : null,
    lora_confidence_score: apiNumber(value.lora_confidence_score) ?? 0,
    lora_genome_active: apiBoolean(value.lora_genome_active),
    is_active: apiBoolean(value.is_active),
    created_at: apiString(value.created_at),
    updated_at: apiString(value.updated_at),
  };
}

export function normalizePersonasResponse(value: unknown): { personas: AgentPersona[] } {
  if (!isRecord(value) || !Array.isArray(value.personas)) return { personas: [] };
  return {
    personas: value.personas.flatMap((persona): AgentPersona[] => {
      const normalized = normalizeAgentPersona(persona);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizePersonaResponse(value: unknown): { persona: AgentPersona } {
  const persona = isRecord(value) ? normalizeAgentPersona(value.persona) : null;
  if (!persona) throw new Error("Server response did not include a persona.");
  return { persona };
}

export const listPersonas = () =>
  apiFetch<unknown>("/agent/personas").then(normalizePersonasResponse);

export const createPersona = (d: { name: string; soul_md?: string; writing_style?: string; labels?: string[]; skills?: string[]; image_data_url?: string | null }) =>
  apiFetch<unknown>("/agent/personas", { method: "POST", bodyJson: d }).then(normalizePersonaResponse);

export const updatePersona = (id: string, d: { name?: string; soul_md?: string; writing_style?: string; labels?: string[]; skills?: string[]; image_data_url?: string | null; lora_confidence_score?: number }) =>
  apiFetch<unknown>(`/agent/personas/${encodeURIComponent(id)}`, { method: "PUT", bodyJson: d }).then(normalizePersonaResponse);

export const activatePersona = (id: string) =>
  apiFetch<unknown>(`/agent/personas/${encodeURIComponent(id)}/activate`, { method: "POST" })
    .then((value) => ({ activated: messageIdFromResponse(value, "activated") }));

export const deletePersona = (id: string) =>
  apiFetch<unknown>(`/agent/personas/${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((value) => ({ deleted: messageIdFromResponse(value, "deleted") }));

export type AgentUiPreferences = {
  persona_fab_visible: boolean;
  updated_at: string;
};

function normalizeAgentUiPreferences(value: unknown): AgentUiPreferences {
  const preferences = isRecord(value) && isRecord(value.preferences) ? value.preferences : {};
  return {
    persona_fab_visible: !("persona_fab_visible" in preferences) || apiBoolean(preferences.persona_fab_visible),
    updated_at: apiString(preferences.updated_at),
  };
}

export const getAgentUiPreferences = () =>
  apiFetch<unknown>("/agent/ui-preferences").then(normalizeAgentUiPreferences);

export const updateAgentUiPreferences = (personaFabVisible: boolean) =>
  apiFetch<unknown>("/agent/ui-preferences", {
    method: "PUT",
    bodyJson: { persona_fab_visible: personaFabVisible },
  }).then(normalizeAgentUiPreferences);

// ── Note creation (used by drag-and-drop) ─────────────────────────────────────

function escapeMd(s: string): string {
  // Escape characters that have structural meaning in Markdown
  return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function createNoteFromThread(opts: {
  threadId: string;
  title: string;
  summary: string;
  sourceMessageId?: string;
}): Promise<{ message_id: string }> {
  const noteThreadId = `note_from_email_${opts.threadId}_${Date.now()}`;
  const safeTitle = escapeMd(opts.title);
  const safeSummary = escapeMd(opts.summary);
  const content = {
    markdown: `# ${safeTitle}\n\n${safeSummary}\n\n---\n*Clipped from email thread*`,
    text: opts.summary,
  };
  const references = opts.sourceMessageId
    ? [{ id: opts.sourceMessageId, rel: "source_email" }]
    : [];
  return sendAfpMessage<{ success: boolean; message_id: string }>({
    thread_id: noteThreadId,
    parent_id: null,
    from: "agent:notes",
    to: [],
    type: "note",
    subtype: "content",
    content,
    views: [{ format: "rich_text", content: { markdown: content.markdown }, priority: 1 }],
    references,
    metadata: {
      origin: "email_drag_drop",
      source_thread_id: opts.threadId,
    },
    memory_scope: {
      memory_space: "work",
      author_mask: "private",
      author_type: "human",
    },
    store_in_relational: true,
  });
}

// ── Feed follow / engage ──────────────────────────────────────────────────────

export type AgentSearchResult = {
  id: string;
  agent_id: string;
  name: string;
  status: string;
};

export function normalizeAgentSearchResult(value: unknown): AgentSearchResult | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    agent_id: apiString(value.agent_id, value.id),
    name: apiString(value.name, "Unnamed agent"),
    status: apiString(value.status, "unknown"),
  };
}

export function normalizeAgentSearchResponse(value: unknown): { agents: AgentSearchResult[] } {
  if (!isRecord(value) || !Array.isArray(value.agents)) return { agents: [] };
  return {
    agents: value.agents.flatMap((agent): AgentSearchResult[] => {
      const normalized = normalizeAgentSearchResult(agent);
      return normalized ? [normalized] : [];
    }),
  };
}

export const searchAgents = (q: string, limit = 20) =>
  apiFetch<unknown>(`/feed/search?q=${encodeURIComponent(q)}&limit=${limit}`).then(normalizeAgentSearchResponse);

export const followAgent = (agentId: string) =>
  apiFetch<unknown>(`/feed/follow/${encodeURIComponent(agentId)}`, { method: "POST" }).then(normalizeOkResponse);

export const unfollowAgent = (agentId: string) =>
  apiFetch<unknown>(`/feed/follow/${encodeURIComponent(agentId)}`, { method: "DELETE" }).then(normalizeOkResponse);

export const listFollowing = () =>
  apiFetch<unknown>("/feed/following").then((value) => ({
    following: isRecord(value) && Array.isArray(value.following)
      ? value.following.flatMap((item): Array<{ followed_agent_id: string; created_at: string }> => (
          isRecord(item) && typeof item.followed_agent_id === "string"
            ? [{ followed_agent_id: item.followed_agent_id, created_at: apiString(item.created_at) }]
            : []
        ))
      : [],
  }));

export const recordEngagement = (messageId: string, type: "view" | "share" | "reply") =>
  apiFetch<unknown>("/feed/engage", { method: "POST", bodyJson: { message_id: messageId, type } }).then(normalizeOkResponse);

// ── Calendar events ───────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  all_day: boolean;
  location?: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  note_kind?: string | null;
  prep_lead_minutes?: number | null;
  profile?: Record<string, unknown> | null;
};

const CALENDAR_STATUSES = new Set(["confirmed", "tentative", "cancelled"]);

export function normalizeCalendarEvent(value: unknown): CalendarEvent | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const status = typeof value.status === "string" && CALENDAR_STATUSES.has(value.status) ? value.status : "confirmed";
  return {
    id: value.id,
    title: apiString(value.title, "Untitled event"),
    description: typeof value.description === "string" || value.description === null ? value.description : undefined,
    start_at: apiString(value.start_at),
    end_at: typeof value.end_at === "string" || value.end_at === null ? value.end_at : undefined,
    all_day: apiBoolean(value.all_day),
    location: typeof value.location === "string" || value.location === null ? value.location : undefined,
    status: status as CalendarEvent["status"],
    note_kind: typeof value.note_kind === "string" || value.note_kind === null ? value.note_kind : undefined,
    prep_lead_minutes: typeof value.prep_lead_minutes === "number" && Number.isFinite(value.prep_lead_minutes) || value.prep_lead_minutes === null
      ? value.prep_lead_minutes
      : undefined,
    profile: isRecord(value.profile) || value.profile === null ? value.profile : undefined,
  };
}

export function normalizeCalendarEventsResponse(value: unknown): { events: CalendarEvent[] } {
  if (!isRecord(value) || !Array.isArray(value.events)) return { events: [] };
  return {
    events: value.events.flatMap((event): CalendarEvent[] => {
      const normalized = normalizeCalendarEvent(event);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizeCalendarEventResponse(value: unknown): CalendarEvent {
  const event = normalizeCalendarEvent(value);
  if (!event) throw new Error("Server response did not include a calendar event.");
  return event;
}

export const listCalendarEvents = (month: string) =>
  apiFetch<unknown>(`/calendar/events?month=${encodeURIComponent(month)}`).then(normalizeCalendarEventsResponse);

export const createCalendarEvent = (data: {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
}) => apiFetch<unknown>("/calendar/events", { method: "POST", bodyJson: data }).then(normalizeCalendarEventResponse);

export const deleteCalendarEvent = (id: string) =>
  apiFetch<unknown>(`/calendar/events/${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((value) => ({ deleted: isRecord(value) ? apiBoolean(value.deleted) : false }));

// ── Knowledge Curator — backlinks & graph ─────────────────────────────────────

export type BacklinkItem = {
  backlink_id: string;
  source_id: string;
  target_id: string;
  direction: "inbound" | "outbound";
  link_kind: string;
  similarity: number;
  entities: string[];
  created_at: string;
};

export type BacklinksResponse = {
  message_id: string;
  backlinks: BacklinkItem[];
  count: number;
};

export type BacklinksGraphResponse = {
  root: string;
  depth: number;
  nodes: string[];
  edges: Omit<BacklinkItem, "direction">[];
  node_count: number;
  edge_count: number;
};

export function normalizeAfpMessage(value: unknown): AfpMessage | null {
  return isRecord(value) && typeof value.id === "string" ? value as AfpMessage : null;
}

export function normalizeThreadSummary(value: unknown): ThreadSummary | null {
  return isRecord(value) && typeof value.thread_id === "string" ? value as ThreadSummary : null;
}

function normalizeFileLibraryItem(value: unknown): FileLibraryItem | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    message_id: apiString(value.message_id),
    thread_id: apiString(value.thread_id),
    source_thread_id: value.source_thread_id == null ? null : apiString(value.source_thread_id),
    name: apiString(value.name),
    mime_type: apiString(value.mime_type),
    size_bytes: apiNumber(value.size_bytes) ?? 0,
    storage: isRecord(value.storage) ? value.storage : {},
    encryption: isRecord(value.encryption) ? value.encryption : {},
    sha256: value.sha256 == null ? null : apiString(value.sha256),
    created_at: apiString(value.created_at),
    source_timestamp: apiString(value.source_timestamp),
    source_type: apiString(value.source_type),
    source_kind: value.source_kind == null ? null : apiString(value.source_kind),
    source_summary: value.source_summary == null ? null : apiString(value.source_summary),
    source_metadata: isRecord(value.source_metadata) ? value.source_metadata : {},
    source_supertags: apiStringList(value.source_supertags),
    download_url: value.download_url == null ? null : apiString(value.download_url),
    derived_message_id: value.derived_message_id == null ? null : apiString(value.derived_message_id),
    derived_thread_id: value.derived_thread_id == null ? null : apiString(value.derived_thread_id),
    derived_type: value.derived_type == null ? null : apiString(value.derived_type),
  };
}

function normalizeFileLibraryResponse(value: unknown): {
  items: FileLibraryItem[];
  count: number;
  summary: {
    storage_used_bytes: number;
    storage_quota_bytes: number;
    visible_bytes: number;
    matching_count: number;
  };
  facets: FileLibraryFacets;
  page: {
    limit: number;
    returned_count: number;
    matching_count: number;
    has_more: boolean;
  };
  filters: {
    q?: string;
    tag?: string;
    category?: string;
    source_kind?: string;
    availability?: string;
    knowledge_mode?: string;
    retention_mode?: string;
    academic_kind?: string;
    course_tag?: string;
    week_tag?: string;
    lecture_tag?: string;
    zettelkasten_stage?: string;
    sort?: string;
    limit?: number;
  };
} {
  const record = isRecord(value) ? value : {};
  return {
    items: Array.isArray(record.items)
      ? record.items.flatMap((item): FileLibraryItem[] => {
          const normalized = normalizeFileLibraryItem(item);
          return normalized ? [normalized] : [];
        })
      : [],
    count: apiNumber(record.count) ?? 0,
    summary: isRecord(record.summary)
      ? {
          storage_used_bytes: apiNumber(record.summary.storage_used_bytes) ?? 0,
          storage_quota_bytes: apiNumber(record.summary.storage_quota_bytes) ?? 0,
          visible_bytes: apiNumber(record.summary.visible_bytes) ?? 0,
          matching_count: apiNumber(record.summary.matching_count) ?? 0,
        }
      : {
          storage_used_bytes: 0,
          storage_quota_bytes: 0,
          visible_bytes: 0,
          matching_count: 0,
        },
    facets: isRecord(record.facets)
      ? {
          top_tags: Array.isArray(record.facets.top_tags)
            ? record.facets.top_tags.flatMap((facet): FileLibraryTagFacet[] => {
                if (!isRecord(facet) || typeof facet.tag !== "string") return [];
                return [{
                  tag: facet.tag,
                  count: apiNumber(facet.count) ?? 0,
                }];
              })
            : [],
          availability_counts: isRecord(record.facets.availability_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.availability_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          category_counts: isRecord(record.facets.category_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.category_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          source_kind_counts: isRecord(record.facets.source_kind_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.source_kind_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          knowledge_counts: isRecord(record.facets.knowledge_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.knowledge_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          retention_counts: isRecord(record.facets.retention_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.retention_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          academic_kind_counts: isRecord(record.facets.academic_kind_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.academic_kind_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          course_tag_counts: isRecord(record.facets.course_tag_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.course_tag_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          unit_tag_counts: isRecord(record.facets.unit_tag_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.unit_tag_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          chapter_tag_counts: isRecord(record.facets.chapter_tag_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.chapter_tag_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          week_tag_counts: isRecord(record.facets.week_tag_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.week_tag_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          lecture_tag_counts: isRecord(record.facets.lecture_tag_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.lecture_tag_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          zettelkasten_stage_counts: isRecord(record.facets.zettelkasten_stage_counts)
            ? Object.fromEntries(
                Object.entries(record.facets.zettelkasten_stage_counts).map(([key, facetValue]) => [key, apiNumber(facetValue) ?? 0]),
              )
            : {},
          linked_count: apiNumber(record.facets.linked_count) ?? 0,
        }
      : {
          top_tags: [],
          availability_counts: {},
          category_counts: {},
          source_kind_counts: {},
          knowledge_counts: {},
          retention_counts: {},
          academic_kind_counts: {},
          course_tag_counts: {},
          unit_tag_counts: {},
          chapter_tag_counts: {},
          week_tag_counts: {},
          lecture_tag_counts: {},
          zettelkasten_stage_counts: {},
          linked_count: 0,
        },
    page: isRecord(record.page)
      ? {
          limit: apiNumber(record.page.limit) ?? 0,
          returned_count: apiNumber(record.page.returned_count) ?? 0,
          matching_count: apiNumber(record.page.matching_count) ?? 0,
          has_more: apiBoolean(record.page.has_more) ?? false,
        }
      : {
          limit: 0,
          returned_count: 0,
          matching_count: 0,
          has_more: false,
        },
    filters: isRecord(record.filters)
      ? {
          q: typeof record.filters.q === "string" ? record.filters.q : undefined,
          tag: typeof record.filters.tag === "string" ? record.filters.tag : undefined,
          category: typeof record.filters.category === "string" ? record.filters.category : undefined,
          source_kind: typeof record.filters.source_kind === "string" ? record.filters.source_kind : undefined,
          availability: typeof record.filters.availability === "string" ? record.filters.availability : undefined,
          knowledge_mode:
            typeof record.filters.knowledge_mode === "string" ? record.filters.knowledge_mode : undefined,
          retention_mode:
            typeof record.filters.retention_mode === "string" ? record.filters.retention_mode : undefined,
          academic_kind:
            typeof record.filters.academic_kind === "string" ? record.filters.academic_kind : undefined,
          course_tag:
            typeof record.filters.course_tag === "string" ? record.filters.course_tag : undefined,
          week_tag:
            typeof record.filters.week_tag === "string" ? record.filters.week_tag : undefined,
          lecture_tag:
            typeof record.filters.lecture_tag === "string" ? record.filters.lecture_tag : undefined,
          zettelkasten_stage:
            typeof record.filters.zettelkasten_stage === "string" ? record.filters.zettelkasten_stage : undefined,
          sort: typeof record.filters.sort === "string" ? record.filters.sort : undefined,
          limit: apiNumber(record.filters.limit) ?? undefined,
        }
      : {},
  };
}

export function normalizeBacklinkItem(value: unknown): BacklinkItem | null {
  if (!isRecord(value) || typeof value.backlink_id !== "string") return null;
  return {
    backlink_id: value.backlink_id,
    source_id: apiString(value.source_id),
    target_id: apiString(value.target_id),
    direction: value.direction === "outbound" ? "outbound" : "inbound",
    link_kind: apiString(value.link_kind),
    similarity: apiNumber(value.similarity) ?? 0,
    entities: apiStringList(value.entities),
    created_at: apiString(value.created_at),
  };
}

export function normalizeBacklinksResponse(value: unknown): BacklinksResponse {
  if (!isRecord(value)) return { message_id: "", backlinks: [], count: 0 };
  return {
    message_id: apiString(value.message_id),
    backlinks: Array.isArray(value.backlinks)
      ? value.backlinks.flatMap((backlink): BacklinkItem[] => {
          const normalized = normalizeBacklinkItem(backlink);
          return normalized ? [normalized] : [];
        })
      : [],
    count: apiNumber(value.count) ?? 0,
  };
}

export function normalizeBacklinksGraphResponse(value: unknown): BacklinksGraphResponse {
  if (!isRecord(value)) return { root: "", depth: 0, nodes: [], edges: [], node_count: 0, edge_count: 0 };
  return {
    root: apiString(value.root),
    depth: apiNumber(value.depth) ?? 0,
    nodes: apiStringList(value.nodes),
    edges: Array.isArray(value.edges)
      ? value.edges.flatMap((edge): Array<Omit<BacklinkItem, "direction">> => {
          const normalized = normalizeBacklinkItem({ ...(isRecord(edge) ? edge : {}), direction: "inbound" });
          if (!normalized) return [];
          const { direction: _direction, ...rest } = normalized;
          return [rest];
        })
      : [],
    node_count: apiNumber(value.node_count) ?? 0,
    edge_count: apiNumber(value.edge_count) ?? 0,
  };
}

export type SupertagCount = {
  tag: string;
  count: number;
};

export function normalizeSupertagCount(value: unknown): SupertagCount | null {
  if (!isRecord(value) || typeof value.tag !== "string" || !value.tag) return null;
  return {
    tag: value.tag,
    count: apiNumber(value.count) ?? 0,
  };
}

export function normalizeTopSupertagsResponse(value: unknown): { supertags: SupertagCount[] } {
  if (!isRecord(value) || !Array.isArray(value.supertags)) return { supertags: [] };
  return {
    supertags: value.supertags.flatMap((supertag): SupertagCount[] => {
      const normalized = normalizeSupertagCount(supertag);
      return normalized ? [normalized] : [];
    }),
  };
}

export type SupertagDefinitionRecord = {
  definition_id: string;
  tag_name: string;
  keywords: string[];
  folder_scope: string[];
  parent_tags: string[];
  alias_tags: string[];
  hierarchy_mode: string;
  afp_message_id: string;
  created_at: string;
};

export function normalizeSupertagDefinitionRecord(value: unknown): SupertagDefinitionRecord | null {
  if (!isRecord(value) || typeof value.definition_id !== "string" || typeof value.tag_name !== "string") return null;
  return {
    definition_id: value.definition_id,
    tag_name: value.tag_name,
    keywords: apiStringList(value.keywords),
    folder_scope: apiStringList(value.folder_scope),
    parent_tags: apiStringList(value.parent_tags),
    alias_tags: apiStringList(value.alias_tags),
    hierarchy_mode: apiString(value.hierarchy_mode),
    afp_message_id: apiString(value.afp_message_id),
    created_at: apiString(value.created_at),
  };
}

export function normalizeSupertagDefinitionsResponse(value: unknown): { definitions: SupertagDefinitionRecord[] } {
  if (!isRecord(value) || !Array.isArray(value.definitions)) return { definitions: [] };
  return {
    definitions: value.definitions.flatMap((definition): SupertagDefinitionRecord[] => {
      const normalized = normalizeSupertagDefinitionRecord(definition);
      return normalized ? [normalized] : [];
    }),
  };
}

export const fetchBacklinksForMessage = (messageId: string) =>
  apiFetch<unknown>(`/notes/backlinks/${encodeURIComponent(messageId)}`).then(normalizeBacklinksResponse);

export const fetchBacklinksGraph = (rootId: string, depth = 2) =>
  apiFetch<unknown>(
    `/backlinks/graph?root=${encodeURIComponent(rootId)}&depth=${depth}`,
  ).then(normalizeBacklinksGraphResponse);

export type SupertagMessagesResponse = {
  tags: string[];
  kind?: string;
  match: "all" | "any";
  count: number;
  limit?: number;
  offset?: number;
  next_offset?: number | null;
  has_more?: boolean;
  messages: AfpMessage[];
};

export type ReferenceMessagesResponse = {
  targets: string[];
  reference_type?: string;
  link_type?: string;
  kind?: string;
  count: number;
  messages: AfpMessage[];
};

export type ObjectMessagesResponse = {
  query?: string;
  free_text?: string;
  focus_thread_id?: string;
  focus_object_id?: string;
  kind?: string;
  tags: string[];
  reference_targets: string[];
  reference_type?: string;
  link_type?: string;
  metadata_keys: string[];
  metadata_values: string[];
  match: "all" | "any";
  facet_suggestions?: {
    kinds: Array<{ value: string; count: number }>;
    tags: Array<{ value: string; count: number }>;
    reference_targets: Array<{ value: string; count: number }>;
    reference_types: Array<{ value: string; count: number }>;
    link_types: Array<{ value: string; count: number }>;
    metadata_terms: Array<{ value: string; count: number }>;
  };
  facet_next_moves?: {
    kinds: Array<{ value: string; count: number; score: number; rationale: string }>;
    tags: Array<{ value: string; count: number; score: number; rationale: string }>;
    reference_targets: Array<{ value: string; count: number; score: number; rationale: string }>;
    reference_types: Array<{ value: string; count: number; score: number; rationale: string }>;
    link_types: Array<{ value: string; count: number; score: number; rationale: string }>;
    metadata_terms: Array<{ value: string; count: number; score: number; rationale: string }>;
  };
  retrieval_state?: {
    summary: string;
    badges: string[];
  };
  count: number;
  messages: AfpMessage[];
};

export type ThreadSummariesResponse = {
  query?: string;
  tags: string[];
  thread_ids?: string[];
  from_agents?: string[];
  time_from?: string;
  time_to?: string;
  reference_targets?: string[];
  metadata_values?: string[];
  metadata_terms?: string[];
  kind?: string;
  match?: "all" | "any";
  facet_suggestions?: {
    kinds: Array<{ value: string; count: number }>;
    tags: Array<{ value: string; count: number }>;
    metadata_terms?: Array<{ value: string; count: number }>;
  };
  facet_next_moves?: {
    kinds: Array<{ value: string; count: number; score: number; rationale: string }>;
    tags: Array<{ value: string; count: number; score: number; rationale: string }>;
    metadata_terms?: Array<{ value: string; count: number; score: number; rationale: string }>;
  };
  retrieval_state?: {
    summary: string;
    badges: string[];
  };
  count: number;
  thread_summaries: ThreadSummary[];
};

function apiMatch(value: unknown): "all" | "any" {
  return value === "all" ? "all" : "any";
}

function normalizeFacetCountItems(value: unknown): Array<{ value: string; count: number }> {
  return Array.isArray(value)
    ? value.flatMap((item): Array<{ value: string; count: number }> => (
        isRecord(item) && typeof item.value === "string"
          ? [{ value: item.value, count: apiNumber(item.count) ?? 0 }]
          : []
      ))
    : [];
}

function normalizeFacetMoveItems(value: unknown): Array<{ value: string; count: number; score: number; rationale: string }> {
  return Array.isArray(value)
    ? value.flatMap((item): Array<{ value: string; count: number; score: number; rationale: string }> => (
        isRecord(item) && typeof item.value === "string"
          ? [{
              value: item.value,
              count: apiNumber(item.count) ?? 0,
              score: apiNumber(item.score) ?? 0,
              rationale: apiString(item.rationale),
            }]
          : []
      ))
    : [];
}

function normalizeRetrievalState(value: unknown): { summary: string; badges: string[] } | undefined {
  return isRecord(value)
    ? { summary: apiString(value.summary), badges: apiStringList(value.badges) }
    : undefined;
}

export function normalizeSupertagMessagesResponse(value: unknown): SupertagMessagesResponse {
  if (!isRecord(value)) return { tags: [], match: "any", count: 0, messages: [] };
  return {
    tags: apiStringList(value.tags),
    kind: typeof value.kind === "string" ? value.kind : undefined,
    match: apiMatch(value.match),
    count: apiNumber(value.count) ?? 0,
    limit: apiNumber(value.limit),
    offset: apiNumber(value.offset),
    next_offset: apiNumber(value.next_offset) ?? null,
    has_more: typeof value.has_more === "boolean" ? value.has_more : undefined,
    messages: Array.isArray(value.messages)
      ? value.messages.flatMap((message): AfpMessage[] => {
          const normalized = normalizeAfpMessage(message);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeReferenceMessagesResponse(value: unknown): ReferenceMessagesResponse {
  if (!isRecord(value)) return { targets: [], count: 0, messages: [] };
  return {
    targets: apiStringList(value.targets),
    reference_type: typeof value.reference_type === "string" ? value.reference_type : undefined,
    link_type: typeof value.link_type === "string" ? value.link_type : undefined,
    kind: typeof value.kind === "string" ? value.kind : undefined,
    count: apiNumber(value.count) ?? 0,
    messages: Array.isArray(value.messages)
      ? value.messages.flatMap((message): AfpMessage[] => {
          const normalized = normalizeAfpMessage(message);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeObjectMessagesResponse(value: unknown): ObjectMessagesResponse {
  const record = isRecord(value) ? value : {};
  const facetSuggestions = isRecord(record.facet_suggestions) ? record.facet_suggestions : null;
  const facetNextMoves = isRecord(record.facet_next_moves) ? record.facet_next_moves : null;
  return {
    query: typeof record.query === "string" ? record.query : undefined,
    free_text: typeof record.free_text === "string" ? record.free_text : undefined,
    focus_thread_id: typeof record.focus_thread_id === "string" ? record.focus_thread_id : undefined,
    focus_object_id: typeof record.focus_object_id === "string" ? record.focus_object_id : undefined,
    kind: typeof record.kind === "string" ? record.kind : undefined,
    tags: apiStringList(record.tags),
    reference_targets: apiStringList(record.reference_targets),
    reference_type: typeof record.reference_type === "string" ? record.reference_type : undefined,
    link_type: typeof record.link_type === "string" ? record.link_type : undefined,
    metadata_keys: apiStringList(record.metadata_keys),
    metadata_values: apiStringList(record.metadata_values),
    match: apiMatch(record.match),
    facet_suggestions: facetSuggestions ? {
      kinds: normalizeFacetCountItems(facetSuggestions.kinds),
      tags: normalizeFacetCountItems(facetSuggestions.tags),
      reference_targets: normalizeFacetCountItems(facetSuggestions.reference_targets),
      reference_types: normalizeFacetCountItems(facetSuggestions.reference_types),
      link_types: normalizeFacetCountItems(facetSuggestions.link_types),
      metadata_terms: normalizeFacetCountItems(facetSuggestions.metadata_terms),
    } : undefined,
    facet_next_moves: facetNextMoves ? {
      kinds: normalizeFacetMoveItems(facetNextMoves.kinds),
      tags: normalizeFacetMoveItems(facetNextMoves.tags),
      reference_targets: normalizeFacetMoveItems(facetNextMoves.reference_targets),
      reference_types: normalizeFacetMoveItems(facetNextMoves.reference_types),
      link_types: normalizeFacetMoveItems(facetNextMoves.link_types),
      metadata_terms: normalizeFacetMoveItems(facetNextMoves.metadata_terms),
    } : undefined,
    retrieval_state: normalizeRetrievalState(record.retrieval_state),
    count: apiNumber(record.count) ?? 0,
    messages: Array.isArray(record.messages)
      ? record.messages.flatMap((message): AfpMessage[] => {
          const normalized = normalizeAfpMessage(message);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeThreadSummariesResponse(value: unknown): ThreadSummariesResponse {
  const record = isRecord(value) ? value : {};
  const facetSuggestions = isRecord(record.facet_suggestions) ? record.facet_suggestions : null;
  const facetNextMoves = isRecord(record.facet_next_moves) ? record.facet_next_moves : null;
  return {
    query: typeof record.query === "string" ? record.query : undefined,
    tags: apiStringList(record.tags),
    thread_ids: apiStringList(record.thread_ids),
    from_agents: apiStringList(record.from_agents),
    time_from: typeof record.time_from === "string" ? record.time_from : undefined,
    time_to: typeof record.time_to === "string" ? record.time_to : undefined,
    reference_targets: apiStringList(record.reference_targets),
    metadata_values: apiStringList(record.metadata_values),
    metadata_terms: apiStringList(record.metadata_terms),
    kind: typeof record.kind === "string" ? record.kind : undefined,
    match: record.match === "all" || record.match === "any" ? record.match : undefined,
    facet_suggestions: facetSuggestions ? {
      kinds: normalizeFacetCountItems(facetSuggestions.kinds),
      tags: normalizeFacetCountItems(facetSuggestions.tags),
      metadata_terms: normalizeFacetCountItems(facetSuggestions.metadata_terms),
    } : undefined,
    facet_next_moves: facetNextMoves ? {
      kinds: normalizeFacetMoveItems(facetNextMoves.kinds),
      tags: normalizeFacetMoveItems(facetNextMoves.tags),
      metadata_terms: normalizeFacetMoveItems(facetNextMoves.metadata_terms),
    } : undefined,
    retrieval_state: normalizeRetrievalState(record.retrieval_state),
    count: apiNumber(record.count) ?? 0,
    thread_summaries: Array.isArray(record.thread_summaries)
      ? record.thread_summaries.flatMap((summary): ThreadSummary[] => {
          const normalized = normalizeThreadSummary(summary);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export const fetchTopSupertags = (limit = 20) =>
  apiFetch<unknown>(`/notes/supertags?limit=${encodeURIComponent(String(limit))}`).then(normalizeTopSupertagsResponse);

export const fetchSupertagDefinitions = () =>
  apiFetch<unknown>("/notes/supertag-definitions").then(normalizeSupertagDefinitionsResponse);

export const fetchMessagesBySupertags = (
  tags: string[],
  opts?: { kind?: string; match?: "all" | "any"; limit?: number; offset?: number; expandHierarchy?: boolean },
) => {
  const query = new URLSearchParams();
  query.set("tags", tags.join(","));
  if (opts?.kind?.trim()) query.set("kind", opts.kind.trim());
  if (opts?.match) query.set("match", opts.match);
  if (opts?.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts?.offset !== undefined) query.set("offset", String(opts.offset));
  if (opts?.expandHierarchy) query.set("expand_hierarchy", "true");
  return apiFetch<unknown>(`/notes/supertag-messages?${query.toString()}`).then(normalizeSupertagMessagesResponse);
};

export const fetchMessagesByReferences = (opts: {
  targets: string[];
  referenceType?: string;
  linkType?: string;
  kind?: string;
  limit?: number;
}) => {
  const query = new URLSearchParams();
  query.set("targets", opts.targets.join(","));
  if (opts.referenceType?.trim()) query.set("type", opts.referenceType.trim());
  if (opts.linkType?.trim()) query.set("linkType", opts.linkType.trim());
  if (opts.kind?.trim()) query.set("kind", opts.kind.trim());
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  return apiFetch<unknown>(`/notes/reference-messages?${query.toString()}`).then(normalizeReferenceMessagesResponse);
};

export const fetchObjectMessages = (opts: {
  query?: string;
  focusThreadId?: string;
  focusObjectId?: string;
  kind?: string;
  tags?: string[];
  referenceTargets?: string[];
  referenceType?: string;
  linkType?: string;
  metadataKeys?: string[];
  metadataValues?: string[];
  match?: "all" | "any";
  limit?: number;
}) => {
  const query = new URLSearchParams();
  if (opts.query?.trim()) query.set("query", opts.query.trim());
  if (opts.focusThreadId?.trim()) query.set("focus_thread_id", opts.focusThreadId.trim());
  if (opts.focusObjectId?.trim()) query.set("focus_object_id", opts.focusObjectId.trim());
  if (opts.kind?.trim()) query.set("kind", opts.kind.trim());
  if (opts.tags?.length) query.set("tags", opts.tags.join(","));
  if (opts.referenceTargets?.length) query.set("targets", opts.referenceTargets.join(","));
  if (opts.referenceType?.trim()) query.set("reference_type", opts.referenceType.trim());
  if (opts.linkType?.trim()) query.set("linkType", opts.linkType.trim());
  if (opts.metadataKeys?.length) query.set("metadataKeys", opts.metadataKeys.join(","));
  if (opts.metadataValues?.length) query.set("metadataValues", opts.metadataValues.join(","));
  if (opts.match) query.set("match", opts.match);
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  return apiFetch<unknown>(`/notes/object-messages?${query.toString()}`).then(normalizeObjectMessagesResponse);
};

export const fetchFileLibrary = (opts?: {
  query?: string;
  tag?: string;
  category?: string;
  sourceKind?: string;
  availability?: string;
  knowledgeMode?: string;
  retentionMode?: string;
  academicKind?: string;
  courseTag?: string;
  unitTag?: string;
  chapterTag?: string;
  weekTag?: string;
  lectureTag?: string;
  zettelkastenStage?: string;
  sort?: string;
  limit?: number;
}): Promise<FileLibraryResponse> => {
  const query = new URLSearchParams();
  if (opts?.query?.trim()) query.set("q", opts.query.trim());
  if (opts?.tag?.trim()) query.set("tag", opts.tag.trim());
  if (opts?.category?.trim()) query.set("category", opts.category.trim());
  if (opts?.sourceKind?.trim()) query.set("source_kind", opts.sourceKind.trim());
  if (opts?.availability?.trim()) query.set("availability", opts.availability.trim());
  if (opts?.knowledgeMode?.trim()) query.set("knowledge_mode", opts.knowledgeMode.trim());
  if (opts?.retentionMode?.trim()) query.set("retention_mode", opts.retentionMode.trim());
  if (opts?.academicKind?.trim()) query.set("academic_kind", opts.academicKind.trim());
  if (opts?.courseTag?.trim()) query.set("course_tag", opts.courseTag.trim());
  if (opts?.unitTag?.trim()) query.set("unit_tag", opts.unitTag.trim());
  if (opts?.chapterTag?.trim()) query.set("chapter_tag", opts.chapterTag.trim());
  if (opts?.weekTag?.trim()) query.set("week_tag", opts.weekTag.trim());
  if (opts?.lectureTag?.trim()) query.set("lecture_tag", opts.lectureTag.trim());
  if (opts?.zettelkastenStage?.trim()) query.set("zettelkasten_stage", opts.zettelkastenStage.trim());
  if (opts?.sort?.trim()) query.set("sort", opts.sort.trim());
  if (opts?.limit !== undefined) query.set("limit", String(opts.limit));
  const suffix = query.toString();
  return apiFetch<unknown>(`/api/files/library${suffix ? `?${suffix}` : ""}`).then(normalizeFileLibraryResponse);
};

export const fetchThreadSummaries = (opts?: {
  query?: string;
  tags?: string[];
  kind?: string;
  threadIds?: string[];
  fromAgents?: string[];
  timeFrom?: string;
  timeTo?: string;
  match?: "all" | "any";
  limit?: number;
}) => {
  const query = new URLSearchParams();
  if (opts?.query?.trim()) query.set("query", opts.query.trim());
  if (opts?.tags?.length) query.set("tags", opts.tags.join(","));
  if (opts?.kind?.trim()) query.set("kind", opts.kind.trim());
  if (opts?.threadIds?.length) query.set("thread_ids", opts.threadIds.join(","));
  if (opts?.fromAgents?.length) query.set("from_agents", opts.fromAgents.join(","));
  if (opts?.timeFrom?.trim()) query.set("time_from", opts.timeFrom.trim());
  if (opts?.timeTo?.trim()) query.set("time_to", opts.timeTo.trim());
  if (opts?.match) query.set("match", opts.match);
  if (opts?.limit !== undefined) query.set("limit", String(opts.limit));
  return apiFetch<unknown>(`/threads/summaries?${query.toString()}`).then(normalizeThreadSummariesResponse);
};

export const installDefaultSupertags = () =>
  apiFetch<unknown>("/notes/supertags/install-defaults", {
    method: "POST",
  }).then((value) => ({
    installed: isRecord(value) ? apiStringList(value.installed) : [],
    count: isRecord(value) ? apiNumber(value.count) ?? 0 : 0,
  }));

// ── Agent Alias Registry ──────────────────────────────────────────────────────

export type AliasCheckResult = {
  available: boolean;
  valid: boolean;
  reason: string;
};

export type AliasRecord = {
  alias: string | null;
  agent_id?: string;
  display_address?: string;
  created_at?: string;
  last_changed_at?: string;
  next_change_at?: string;
};

export function normalizeAliasCheckResult(value: unknown): AliasCheckResult {
  if (!isRecord(value)) return { available: false, valid: false, reason: "" };
  return {
    available: apiBoolean(value.available),
    valid: apiBoolean(value.valid),
    reason: apiString(value.reason),
  };
}

export function normalizeAliasRecord(value: unknown): AliasRecord {
  if (!isRecord(value)) return { alias: null };
  return {
    alias: typeof value.alias === "string" || value.alias === null ? value.alias : null,
    agent_id: typeof value.agent_id === "string" ? value.agent_id : undefined,
    display_address: typeof value.display_address === "string" ? value.display_address : undefined,
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    last_changed_at: typeof value.last_changed_at === "string" ? value.last_changed_at : undefined,
    next_change_at: typeof value.next_change_at === "string" ? value.next_change_at : undefined,
  };
}

export const checkAlias = (alias: string) =>
  apiFetch<unknown>(`/api/alias/check?alias=${encodeURIComponent(alias)}`).then(normalizeAliasCheckResult);

export const getMyAlias = () =>
  apiFetch<unknown>("/api/alias/mine").then(normalizeAliasRecord);

export const claimAlias = (alias: string, agent_id?: string) =>
  apiFetch<unknown>("/api/alias/claim", { method: "POST", bodyJson: { alias, agent_id } }).then(normalizeAliasRecord);

export const changeAlias = (alias: string) =>
  apiFetch<unknown>("/api/alias/change", { method: "POST", bodyJson: { alias } }).then(normalizeAliasRecord);

// ── Agent preferences ─────────────────────────────────────────────────────────

export type AgentPreferences = {
  optimization_mode: "speed" | "cost" | "balanced";
  auto_confirm_threshold_cents: number;
  show_cost_estimates: boolean;
  default_store_in_history: boolean;
  response_queue_policy?: {
    supplier_due_hours: number;
    friend_due_hours: number;
    general_due_hours: number;
    prioritize_with_local_llm: boolean;
    allow_remote_fallback: boolean;
  };
};

function normalizeOptimizationMode(value: unknown): AgentPreferences["optimization_mode"] {
  return value === "speed" || value === "cost" ? value : "balanced";
}

function normalizeResponseQueuePolicy(value: unknown): AgentPreferences["response_queue_policy"] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    supplier_due_hours: apiNumber(value.supplier_due_hours) ?? 24,
    friend_due_hours: apiNumber(value.friend_due_hours) ?? 48,
    general_due_hours: apiNumber(value.general_due_hours) ?? 36,
    prioritize_with_local_llm: apiBoolean(value.prioritize_with_local_llm, true),
    allow_remote_fallback: apiBoolean(value.allow_remote_fallback, true),
  };
}

export function normalizeAgentPreferences(value: unknown): AgentPreferences {
  if (!isRecord(value)) {
    return {
      optimization_mode: "balanced",
      auto_confirm_threshold_cents: 0,
      show_cost_estimates: false,
      default_store_in_history: false,
    };
  }
  return {
    optimization_mode: normalizeOptimizationMode(value.optimization_mode),
    auto_confirm_threshold_cents: apiNumber(value.auto_confirm_threshold_cents) ?? 0,
    show_cost_estimates: apiBoolean(value.show_cost_estimates),
    default_store_in_history: apiBoolean(value.default_store_in_history),
    response_queue_policy: normalizeResponseQueuePolicy(value.response_queue_policy),
  };
}

export function dispatchSessionChangedEvent(
  detail: SessionChangedEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail }));
}

export function readSessionChangedEventDetail(
  event: Event,
): SessionChangedEventDetail {
  return normalizeSessionChangedDetail<Session>(customEventDetail(event));
}

export function subscribeSessionChangedEvent(
  callback: (detail: SessionChangedEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    callback(readSessionChangedEventDetail(event));
  };
  target.addEventListener(SESSION_CHANGED_EVENT, handler);
  return () => target.removeEventListener(SESSION_CHANGED_EVENT, handler);
}

export type UndoActionResponse = {
  status: string;
  thread_id: string;
  checkpoint_message_id: string;
  revert_request_message_id: string;
  revert_result_message_id: string;
  target_message_id: string;
  summary: string;
};

export function normalizeUndoActionResponse(value: unknown): UndoActionResponse {
  if (!isRecord(value) || typeof value.thread_id !== "string" || typeof value.checkpoint_message_id !== "string") {
    throw new Error("Server response did not include undo action ids.");
  }
  return {
    status: apiString(value.status),
    thread_id: value.thread_id,
    checkpoint_message_id: value.checkpoint_message_id,
    revert_request_message_id: apiString(value.revert_request_message_id),
    revert_result_message_id: apiString(value.revert_result_message_id),
    target_message_id: apiString(value.target_message_id),
    summary: apiString(value.summary),
  };
}

export const getAgentPreferences = () =>
  apiFetch<unknown>("/user/agent-preferences").then(normalizeAgentPreferences);

export const setAgentPreferences = (prefs: AgentPreferences) =>
  apiFetch<unknown>("/user/agent-preferences", { method: "POST", bodyJson: prefs })
    .then((value) => ({ updated: isRecord(value) ? apiBoolean(value.updated) : false }));

export type McpToolConnection = {
  id: string;
  tool_slug: string;
  tool_name: string;
  mcp_server_url: string;
  connected_at: string;
  connection_provider?: string;
  tool_descriptor?: Record<string, unknown> | null;
};

export type ToolConnectionDisconnectResponse = {
  ok: boolean;
  disconnected: boolean;
  revoke_attempted: boolean;
  upstream_revocation_supported: boolean;
  capability_registry_refreshed: boolean;
  cleared_capability_count: number;
  invalidate_local_cache_keys: string[];
  session_cleanup_recommended: boolean;
  connection_provider?: string;
};

export type DisconnectReceipt = ToolConnectionDisconnectResponse;

export function normalizeMcpToolConnection(value: unknown): McpToolConnection | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const connection: McpToolConnection = {
    id: value.id,
    tool_slug: apiString(value.tool_slug),
    tool_name: apiString(value.tool_name, value.id),
    mcp_server_url: apiString(value.mcp_server_url),
    connected_at: apiString(value.connected_at),
  };
  if (typeof value.connection_provider === "string") {
    connection.connection_provider = value.connection_provider;
  }
  if (isRecord(value.tool_descriptor) || value.tool_descriptor === null) {
    connection.tool_descriptor = value.tool_descriptor as Record<string, unknown> | null;
  }
  return connection;
}

export function normalizeToolConnectionsResponse(value: unknown): { connections: McpToolConnection[] } {
  if (!isRecord(value) || !Array.isArray(value.connections)) return { connections: [] };
  return {
    connections: value.connections.flatMap((connection): McpToolConnection[] => {
      const normalized = normalizeMcpToolConnection(connection);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizeToolConnectionResponse(value: unknown): { ok: boolean; connection: McpToolConnection } {
  const connection = isRecord(value) ? normalizeMcpToolConnection(value.connection) : null;
  if (!connection) throw new Error("Server response did not include a tool connection.");
  return {
    ok: isRecord(value) ? apiBoolean(value.ok, true) : true,
    connection,
  };
}

export function normalizeToolConnectionDisconnectResponse(value: unknown): ToolConnectionDisconnectResponse {
  return {
    ok: isRecord(value) ? apiBoolean(value.ok) : false,
    disconnected: isRecord(value) ? apiBoolean(value.disconnected, apiBoolean(value.ok)) : false,
    revoke_attempted: isRecord(value) ? apiBoolean(value.revoke_attempted) : false,
    upstream_revocation_supported: isRecord(value) ? apiBoolean(value.upstream_revocation_supported) : false,
    capability_registry_refreshed: isRecord(value) ? apiBoolean(value.capability_registry_refreshed) : false,
    cleared_capability_count: isRecord(value) ? apiNumber(value.cleared_capability_count) ?? 0 : 0,
    invalidate_local_cache_keys: isRecord(value) ? apiStringList(value.invalidate_local_cache_keys) : [],
    session_cleanup_recommended: isRecord(value) ? apiBoolean(value.session_cleanup_recommended) : false,
    connection_provider: isRecord(value) && typeof value.connection_provider === "string"
      ? value.connection_provider
      : undefined,
  };
}

export function normalizeDisconnectReceipt(value: unknown): DisconnectReceipt {
  return normalizeToolConnectionDisconnectResponse(value);
}

export type ComposioStatusResponse = {
  configured: boolean;
  usable: boolean;
  http_status?: number;
  failure_reason?: string;
};

export function normalizeComposioStatusResponse(value: unknown): ComposioStatusResponse {
  return {
    configured: isRecord(value) ? apiBoolean(value.configured) : false,
    usable: isRecord(value) ? apiBoolean(value.usable) : false,
    http_status: isRecord(value) ? apiNumber(value.http_status) : undefined,
    failure_reason: isRecord(value) && typeof value.failure_reason === "string" ? value.failure_reason : undefined,
  };
}

export type ComposioLinkResponse = {
  ok: boolean;
  redirect_url: string;
  tool_slug: string;
  toolkit_slug: string;
};

export function normalizeComposioLinkResponse(value: unknown): ComposioLinkResponse {
  if (!isRecord(value) || typeof value.redirect_url !== "string") {
    throw new Error("Server response did not include a Composio redirect URL.");
  }
  const normalized: ComposioLinkResponse = {
    ok: apiBoolean(value.ok, true),
    redirect_url: value.redirect_url,
    tool_slug: apiString(value.tool_slug),
    toolkit_slug: apiString(value.toolkit_slug),
  };
  return normalized;
}

export type SkillCapsuleCatalogEntry = {
  id: string;
  title: string;
  category: string;
  description: string;
  integration_mode: string;
  surfaces: string[];
  existing_runtime_fit: string;
  compose_scaffold?: string;
  compose_placeholder?: string;
  capsule_kind?: string;
  tags?: string[];
};

export type WorkspaceSkillSummary = {
  id: string;
  title: string;
  category: string;
  capsule_kind: string;
  integration_mode: string;
  surfaces: string[];
};

export type SkillCapsuleCatalogResponse = {
  available: boolean;
  configured?: boolean;
  catalog: SkillCapsuleCatalogEntry[];
  warnings: string[];
  workspace: {
    selected_skill_ids: string[];
    reasoning_guidance?: string[];
    selected_skill_summaries?: WorkspaceSkillSummary[];
  };
};

export type WorkspaceSkillSelectionResponse = {
  selected_skill_ids: string[];
  reasoning_guidance?: string[];
  selected_skill_summaries?: WorkspaceSkillSummary[];
  warnings?: string[];
};

export function normalizeSkillCapsuleCatalogEntry(value: unknown): SkillCapsuleCatalogEntry | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    title: apiString(value.title, value.id),
    category: apiString(value.category),
    description: apiString(value.description),
    integration_mode: apiString(value.integration_mode),
    surfaces: apiStringList(value.surfaces),
    existing_runtime_fit: apiString(value.existing_runtime_fit),
    compose_scaffold: typeof value.compose_scaffold === "string" ? value.compose_scaffold : undefined,
    compose_placeholder: typeof value.compose_placeholder === "string" ? value.compose_placeholder : undefined,
    capsule_kind: typeof value.capsule_kind === "string" ? value.capsule_kind : undefined,
    tags: Array.isArray(value.tags) ? apiStringList(value.tags) : undefined,
  };
}

export function normalizeWorkspaceSkillSummary(value: unknown): WorkspaceSkillSummary | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    title: apiString(value.title, value.id),
    category: apiString(value.category),
    capsule_kind: apiString(value.capsule_kind),
    integration_mode: apiString(value.integration_mode),
    surfaces: apiStringList(value.surfaces),
  };
}

function normalizeWorkspaceSkillSummaries(value: unknown): WorkspaceSkillSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((summary): WorkspaceSkillSummary[] => {
    const normalized = normalizeWorkspaceSkillSummary(summary);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSkillCapsuleCatalogResponse(value: unknown): SkillCapsuleCatalogResponse {
  const workspace = isRecord(value) && isRecord(value.workspace) ? value.workspace : {};
  return {
    available: isRecord(value) ? apiBoolean(value.available) : false,
    configured: isRecord(value) && typeof value.configured === "boolean" ? value.configured : undefined,
    catalog: isRecord(value) && Array.isArray(value.catalog)
      ? value.catalog.flatMap((entry): SkillCapsuleCatalogEntry[] => {
          const normalized = normalizeSkillCapsuleCatalogEntry(entry);
          return normalized ? [normalized] : [];
        })
      : [],
    warnings: isRecord(value) ? apiStringList(value.warnings) : [],
    workspace: {
      selected_skill_ids: apiStringList(workspace.selected_skill_ids),
      reasoning_guidance: Array.isArray(workspace.reasoning_guidance) ? apiStringList(workspace.reasoning_guidance) : undefined,
      selected_skill_summaries: Array.isArray(workspace.selected_skill_summaries)
        ? normalizeWorkspaceSkillSummaries(workspace.selected_skill_summaries)
        : undefined,
    },
  };
}

export function normalizeSkillCapsuleGenerateResponse(value: unknown): { entry: SkillCapsuleCatalogEntry } {
  const entry = isRecord(value) ? normalizeSkillCapsuleCatalogEntry(value.entry) : null;
  if (!entry) throw new Error("Server response did not include a generated skill capsule.");
  return { entry };
}

export function normalizeWorkspaceSkillSelectionResponse(value: unknown): WorkspaceSkillSelectionResponse {
  if (!isRecord(value)) return { selected_skill_ids: [] };
  return {
    selected_skill_ids: apiStringList(value.selected_skill_ids),
    reasoning_guidance: Array.isArray(value.reasoning_guidance) ? apiStringList(value.reasoning_guidance) : undefined,
    selected_skill_summaries: Array.isArray(value.selected_skill_summaries)
      ? normalizeWorkspaceSkillSummaries(value.selected_skill_summaries)
      : undefined,
    warnings: Array.isArray(value.warnings) ? apiStringList(value.warnings) : undefined,
  };
}

export const fetchToolConnections = () =>
  apiFetch<unknown>("/tools/connections").then(normalizeToolConnectionsResponse);

export const connectTool = (body: Record<string, unknown>) =>
  apiFetch<unknown>("/tools/connections", { method: "POST", bodyJson: body }).then(normalizeToolConnectionResponse);

export const recordExternalToolUsage = (body: Record<string, unknown>) =>
  apiFetch<unknown>("/billing/tool-usage", { method: "POST", bodyJson: body });

export const disconnectTool = (slug: string) =>
  apiFetch<unknown>(`/tools/connections/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  }).then(normalizeDisconnectReceipt);

export const fetchComposioStatus = () =>
  apiFetch<unknown>("/tools/composio/status").then(normalizeComposioStatusResponse);

export const beginComposioLink = (body: Record<string, unknown>) =>
  apiFetch<unknown>("/tools/composio/link", { method: "POST", bodyJson: body }).then(normalizeComposioLinkResponse);

export const completeComposioLink = (body: Record<string, unknown>) =>
  apiFetch<unknown>("/tools/composio/complete", { method: "POST", bodyJson: body }).then(normalizeToolConnectionResponse);

export const disconnectGmail = () =>
  apiFetch<unknown>("/gmail/disconnect", {
    method: "POST",
  }).then(normalizeDisconnectReceipt);

export const fetchSkillCapsuleCatalog = () =>
  apiFetch<unknown>("/skill-capsule/catalog").then(normalizeSkillCapsuleCatalogResponse);

export const generateSkillCapsule = (description: string) =>
  apiFetch<unknown>("/skill-capsule/generate", {
    method: "POST",
    bodyJson: { description },
  }).then(normalizeSkillCapsuleGenerateResponse);

export const saveWorkspaceSkillSelection = (selected_skill_ids: string[]) =>
  apiFetch<unknown>("/skill-capsule/workspace", {
    method: "POST",
    bodyJson: { selected_skill_ids },
  }).then(normalizeWorkspaceSkillSelectionResponse);

// ── Generative card decisions ─────────────────────────────────────────────────

export type UiDecisionRequest = {
  card_id: string;
  decision_point_id: string;
  selected_option_id: string;
  thread_id: string;
  agent_id?: string;
  memory_scope?: MemoryWorkspaceScopeInput | null;
};

export const submitDecision = (req: UiDecisionRequest) =>
  apiFetch<unknown>("/ui/decision", {
    method: "POST",
    bodyJson: {
      card_id: req.card_id,
      decision_point_id: req.decision_point_id,
      selected_option_id: req.selected_option_id,
      thread_id: req.thread_id,
      agent_id: req.agent_id,
      memory_space: req.memory_scope?.memory_space ?? null,
      author_mask: req.memory_scope?.author_mask ?? null,
      author_type: req.memory_scope?.author_type ?? null,
      author_id: req.memory_scope?.author_id ?? null,
      is_human_authored: req.memory_scope?.is_human_authored ?? null,
      human_only: req.memory_scope?.human_only ?? null,
    },
  }).then((value) => ({ success: true, message_id: messageIdFromResponse(value) }));

/**
 * Sanitize a URL coming from agent/server data before placing it in an href.
 * Only http: and https: are permitted. Any other scheme (javascript:, data:, etc.)
 * returns "#" so the link is inert rather than executable.
 */
export function safeHref(url: unknown): string {
  if (typeof url !== "string" || !url.trim()) return "#";
  try {
    const u = new URL(url.trim());
    if (u.protocol === "https:" || u.protocol === "http:") return url.trim();
  } catch { /* relative URL — check it's not a protocol-less attack vector */ }
  // Accept relative paths only — block protocol-relative URLs (//host) (GAP-103).
  const trimmed = url.trim();
  if (/^\.\//.test(trimmed) || /^\/[^/]/.test(trimmed)) return trimmed;
  return "#";
}

export const updateAgentSettings = (settings: { auto_approve_workflows?: boolean }) =>
  apiFetch<unknown>("/agent/settings", { method: "PATCH", bodyJson: settings }).then(normalizeOkResponse);

/** Opens a native EventSource for the run SSE stream. Caller is responsible for closing it. */
export function openRunStream(workflowId: string, runId: string): EventSource {
  return new EventSource(`${API_BASE}/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/stream`);
}

// ── Token budget / LLM provider management ──────────────────────────────────

export type TokenBudgetStatus = {
  status: "ok" | "warning" | "exceeded";
  budget_cents: number;
  used_cents: number;
  remaining_cents: number;
  reset_at: string;
  daily_used_tokens: number;
  daily_limit_tokens: number;
  usage_pct: number;
  escalation_enabled: boolean;
};

function normalizeTokenBudgetStatusValue(value: unknown): TokenBudgetStatus["status"] {
  return value === "warning" || value === "exceeded" ? value : "ok";
}

export function normalizeTokenBudgetStatus(value: unknown): TokenBudgetStatus {
  const record = isRecord(value) ? value : {};
  return {
    status: normalizeTokenBudgetStatusValue(record.status),
    budget_cents: apiNumber(record.budget_cents) ?? 0,
    used_cents: apiNumber(record.used_cents) ?? 0,
    remaining_cents: apiNumber(record.remaining_cents) ?? 0,
    reset_at: apiString(record.reset_at),
    daily_used_tokens: apiNumber(record.daily_used_tokens) ?? 0,
    daily_limit_tokens: apiNumber(record.daily_limit_tokens) ?? 0,
    usage_pct: apiNumber(record.usage_pct) ?? 0,
    escalation_enabled: apiBoolean(record.escalation_enabled),
  };
}

export type UserLlmProvider = {
  id: string;
  name: string;
  provider: string;
  display_name: string;
  backend: string;
  model: string;
  model_id: string;
  is_default: boolean;
  priority: number;
  has_api_key: boolean;
  consent_given: boolean;
};

export function normalizeUserLlmProvider(value: unknown): UserLlmProvider | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: apiString(value.name, value.id),
    provider: apiString(value.provider),
    display_name: apiString(value.display_name),
    backend: apiString(value.backend),
    model: apiString(value.model),
    model_id: apiString(value.model_id),
    is_default: apiBoolean(value.is_default),
    priority: apiNumber(value.priority) ?? 0,
    has_api_key: apiBoolean(value.has_api_key),
    consent_given: apiBoolean(value.consent_given),
  };
}

export function normalizeLlmProvidersResponse(value: unknown): { providers: UserLlmProvider[] } {
  if (!isRecord(value) || !Array.isArray(value.providers)) return { providers: [] };
  return {
    providers: value.providers.flatMap((provider): UserLlmProvider[] => {
      const normalized = normalizeUserLlmProvider(provider);
      return normalized ? [normalized] : [];
    }),
  };
}

export type UpsertLlmProviderInput = {
  provider?: string;
  display_name?: string;
  model_id?: string;
  api_key?: string;
  base_url?: string;
  consent?: boolean;
  backend?: string;
  model?: string;
  is_default?: boolean;
};

export const getTokenBudget = () =>
  apiFetch<unknown>("/api/cost/budget").then(normalizeTokenBudgetStatus);

export const updateTokenBudget = (patch: { escalation_enabled?: boolean; budget_cents?: number }) =>
  apiFetch<unknown>("/api/cost/budget", { method: "POST", bodyJson: patch }).then(normalizeOkResponse);

export const listLlmProviders = () =>
  apiFetch<unknown>("/user/llm-providers").then(normalizeLlmProvidersResponse);

export const upsertLlmProvider = (input: UpsertLlmProviderInput) =>
  apiFetch<unknown>("/user/llm-providers", { method: "POST", bodyJson: input }).then((value) => {
    const provider = normalizeUserLlmProvider(value);
    if (!provider) throw new Error("Server response did not include an LLM provider.");
    return provider;
  });

export const deleteLlmProvider = (id: string) =>
  apiFetch<unknown>(`/user/llm-providers/${encodeURIComponent(id)}`, { method: "DELETE" }).then(normalizeOkResponse);

// ── Continuity / briefing / behavioural synthesis ────────────────────────────

export type ContinuityMessage = {
  id: string;
  type: string;
  content: Record<string, unknown>;
  timestamp: string;
};

export function normalizeContinuityMessage(value: unknown): ContinuityMessage | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    type: apiString(value.type, "continuity"),
    content: isRecord(value.content) ? value.content : {},
    timestamp: apiString(value.timestamp),
  };
}

export function normalizeContinuitySummaryResponse(value: unknown): { messages: ContinuityMessage[] } {
  if (!isRecord(value) || !Array.isArray(value.messages)) return { messages: [] };
  return {
    messages: value.messages.flatMap((message): ContinuityMessage[] => {
      const normalized = normalizeContinuityMessage(message);
      return normalized ? [normalized] : [];
    }),
  };
}

export const getContinuitySummary = () =>
  apiFetch<unknown>("/dashboard/continuity").then(normalizeContinuitySummaryResponse);

export const generateProjections = () =>
  apiFetch<unknown>("/dashboard/projections", { method: "POST" }).then(normalizeOkResponse);

export const generateTemporalProjection = (opts: number | Record<string, unknown>) =>
  apiFetch<unknown>("/dashboard/temporal-projection", {
    method: "POST",
    bodyJson: typeof opts === "number" ? { days: opts } : opts,
  }).then(normalizeOkResponse);

export const synthesizeBehaviorPatterns = () =>
  apiFetch<unknown>("/dashboard/behavior-patterns", { method: "POST" }).then(normalizeOkResponse);

export const synthesizeState = () =>
  apiFetch<unknown>("/dashboard/state-synthesis", { method: "POST" }).then(normalizeOkResponse);

// ── Agent memory ─────────────────────────────────────────────────────────────

export type AgentMemoryPointerBundle = {
  items: unknown[];
  token_estimate: number;
  pointers_text: string;
  harness?: string;
};

export type AgentMemoryItem = {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  tier?: string;
  type?: string;
  status?: string;
  confidence?: number;
  namespace?: string | null;
  role?: string | null;
  repo_state_hash?: string | null;
  citations?: string[];
};

export type AgentMemoryWarning = {
  code: string;
  message: string;
  memory_id?: string | null;
};

export type AgentMemoryResponse = {
  configured?: boolean;
  available?: boolean;
  source?: string;
  agent_id?: string;
  query?: Record<string, unknown>;
  memories?: AgentMemoryItem[];
  items?: AgentMemoryItem[];
  evidence?: unknown[];
  warnings?: AgentMemoryWarning[];
  pointer_bundle?: AgentMemoryPointerBundle | null;
  message?: string;
};

export function normalizeAgentMemoryItem(value: unknown): AgentMemoryItem | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    content: apiString(value.content),
    created_at: apiString(value.created_at),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    tier: typeof value.tier === "string" ? value.tier : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    confidence: apiNumber(value.confidence),
    namespace: typeof value.namespace === "string" || value.namespace === null ? value.namespace : undefined,
    role: typeof value.role === "string" || value.role === null ? value.role : undefined,
    repo_state_hash: typeof value.repo_state_hash === "string" || value.repo_state_hash === null ? value.repo_state_hash : undefined,
    citations: Array.isArray(value.citations) ? apiStringList(value.citations) : undefined,
  };
}

export function normalizeAgentMemoryWarning(value: unknown): AgentMemoryWarning | null {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") return null;
  return {
    code: value.code,
    message: value.message,
    memory_id: typeof value.memory_id === "string" || value.memory_id === null ? value.memory_id : undefined,
  };
}

export function normalizeAgentMemoryPointerBundle(value: unknown): AgentMemoryPointerBundle | null {
  if (!isRecord(value)) return null;
  return {
    items: Array.isArray(value.items) ? value.items : [],
    token_estimate: apiNumber(value.token_estimate) ?? 0,
    pointers_text: apiString(value.pointers_text),
    harness: typeof value.harness === "string" ? value.harness : undefined,
  };
}

function normalizeAgentMemoryItems(value: unknown): AgentMemoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item): AgentMemoryItem[] => {
    const normalized = normalizeAgentMemoryItem(item);
    return normalized ? [normalized] : [];
  });
}

export function normalizeAgentMemoryResponse(value: unknown): AgentMemoryResponse {
  if (!isRecord(value)) return {};
  const pointerBundle = value.pointer_bundle === null ? null : normalizeAgentMemoryPointerBundle(value.pointer_bundle);
  return {
    configured: typeof value.configured === "boolean" ? value.configured : undefined,
    available: typeof value.available === "boolean" ? value.available : undefined,
    source: typeof value.source === "string" ? value.source : undefined,
    agent_id: typeof value.agent_id === "string" ? value.agent_id : undefined,
    query: isRecord(value.query) ? value.query : undefined,
    memories: normalizeAgentMemoryItems(value.memories),
    items: normalizeAgentMemoryItems(value.items),
    evidence: Array.isArray(value.evidence) ? value.evidence : undefined,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.flatMap((warning): AgentMemoryWarning[] => {
          const normalized = normalizeAgentMemoryWarning(warning);
          return normalized ? [normalized] : [];
        })
      : undefined,
    pointer_bundle: value.pointer_bundle === null ? null : pointerBundle ?? undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

export const fetchAgentMemory = (agentId: string, opts?: Record<string, unknown>) =>
  apiFetch<unknown>(`/agent/${encodeURIComponent(agentId)}/memory`, {
    method: "POST",
    bodyJson: opts ?? {},
  }).then(normalizeAgentMemoryResponse);

export const setCapabilityEnabled = (id: string, enabled: boolean) =>
  apiFetch<unknown>(`/agent/capability/${encodeURIComponent(id)}/enabled`, {
    method: "PATCH",
    bodyJson: { enabled },
  }).then(normalizeCapabilityDescriptorResponse);

export function normalizeExtractDocumentResponse(value: unknown): { row_count: number; column_count: number; quality_status: string } {
  return {
    row_count: isRecord(value) ? apiNumber(value.row_count) ?? 0 : 0,
    column_count: isRecord(value) ? apiNumber(value.column_count) ?? 0 : 0,
    quality_status: isRecord(value) ? apiString(value.quality_status) : "",
  };
}

export const extractDocument = (
  threadId: string,
  messageId: string,
  opts: { title?: string },
) =>
  apiFetch<unknown>(
    `/thread/${encodeURIComponent(threadId)}/message/${encodeURIComponent(messageId)}/extract-document`,
    { method: "POST", bodyJson: opts },
  ).then(normalizeExtractDocumentResponse);

// ── Planning ──────────────────────────────────────────────────────────────────

export type PlanAssumption = {
  key: string;
  value: string;
  label?: string;
  editable?: boolean;
};

export type PlanOption = {
  id?: string;
  title: string;
  description: string;
  rationale: string;
  metric_label?: string;
  metric_value?: string;
  confidence?: string;
  risk_flags: string[];
  follow_up_chips?: string[];
};

export type PlanningQueryResponse = {
  thread_id?: string;
  correlation_id?: string;
  goal?: string;
  summary?: string;
  options?: PlanOption[];
  assumptions: PlanAssumption[];
  unresolved?: string[];
  comparison_headers?: string[];
  comparison_rows?: Array<{ label: string; values: string[] }>;
};

export function normalizePlanAssumption(value: unknown): PlanAssumption | null {
  if (!isRecord(value) || typeof value.key !== "string") return null;
  return {
    key: value.key,
    value: apiString(value.value),
    label: typeof value.label === "string" ? value.label : undefined,
    editable: typeof value.editable === "boolean" ? value.editable : undefined,
  };
}

export function normalizePlanOption(value: unknown): PlanOption | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    title: value.title,
    description: apiString(value.description),
    rationale: apiString(value.rationale),
    metric_label: typeof value.metric_label === "string" ? value.metric_label : undefined,
    metric_value: typeof value.metric_value === "string" ? value.metric_value : undefined,
    confidence: typeof value.confidence === "string" ? value.confidence : undefined,
    risk_flags: apiStringList(value.risk_flags),
    follow_up_chips: Array.isArray(value.follow_up_chips) ? apiStringList(value.follow_up_chips) : undefined,
  };
}

function normalizeComparisonRows(value: unknown): Array<{ label: string; values: string[] }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((row): Array<{ label: string; values: string[] }> => (
    isRecord(row) && typeof row.label === "string"
      ? [{ label: row.label, values: apiStringList(row.values) }]
      : []
  ));
}

export function normalizePlanningQueryResponse(value: unknown): PlanningQueryResponse {
  if (!isRecord(value)) return { assumptions: [] };
  return {
    thread_id: typeof value.thread_id === "string" ? value.thread_id : undefined,
    correlation_id: typeof value.correlation_id === "string" ? value.correlation_id : undefined,
    goal: typeof value.goal === "string" ? value.goal : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    options: Array.isArray(value.options)
      ? value.options.flatMap((option): PlanOption[] => {
          const normalized = normalizePlanOption(option);
          return normalized ? [normalized] : [];
        })
      : undefined,
    assumptions: Array.isArray(value.assumptions)
      ? value.assumptions.flatMap((assumption): PlanAssumption[] => {
          const normalized = normalizePlanAssumption(assumption);
          return normalized ? [normalized] : [];
        })
      : [],
    unresolved: Array.isArray(value.unresolved) ? apiStringList(value.unresolved) : undefined,
    comparison_headers: Array.isArray(value.comparison_headers) ? apiStringList(value.comparison_headers) : undefined,
    comparison_rows: normalizeComparisonRows(value.comparison_rows),
  };
}

export const submitPlanningQuery = (body: {
  query: string;
  session_state?: Record<string, unknown>;
  thread_id?: string;
  assumption_delta?: { key: string; value: string };
}) =>
  apiFetch<unknown>("/ui/planning", { method: "POST", bodyJson: body }).then(normalizePlanningQueryResponse);

// ── Claim neighborhood ────────────────────────────────────────────────────────

export type ClaimNeighborhoodResponse = {
  a2ui?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  groups?: unknown[];
  message_id?: string;
};

export function normalizeClaimNeighborhoodResponse(value: unknown): ClaimNeighborhoodResponse {
  if (!isRecord(value)) return {};
  return {
    a2ui: isRecord(value.a2ui) ? value.a2ui : undefined,
    filters: isRecord(value.filters) ? value.filters : undefined,
    groups: Array.isArray(value.groups) ? value.groups : undefined,
    message_id: typeof value.message_id === "string" ? value.message_id : undefined,
  };
}

export const fetchClaimNeighborhood = (
  messageId: string,
  opts: { stance?: string; depth?: number; limit_per_group?: number },
) =>
  apiFetch<unknown>(
    `/knowledge/claim-neighborhood/${encodeURIComponent(messageId)}`,
    { method: "POST", bodyJson: opts },
  ).then(normalizeClaimNeighborhoodResponse);

// ── PARA ─────────────────────────────────────────────────────────────────────
//
// PARA classification overlay — original AFP messages are never mutated.
// para_tags format: ["project:wellness_routine", "area:health"]
// One item can belong to multiple categories simultaneously.

export type ParaSectionKind = "project" | "area" | "resource" | "archive";

// Maps UI section to its tag prefix for querying
export const PARA_PREFIX: Record<Exclude<ParaSectionKind, "archive">, string> = {
  project:  "project:",
  area:     "area:",
  resource: "resource:",
};

export type ParaClassification = {
  id:         string;   // classification record id
  target_id:  string;   // original AFP message id (never mutated)
  para_tags:  string[]; // ["project:wellness", "area:health"]
  status:     "active" | "archived";
  reason?:    string;
  context?:   string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
};

export type ArchiveRow = {
  id:          string;
  target_id:   string;
  para_tags:   string[];
  reason?:     string;
  context?:    string;
  archived_at?: string;
  updated_at:  string;
};

export type AutoArchiveCandidate = {
  id:         string;
  target_id:  string;
  para_tags:  string[];
  created_at: string;
};

function normalizeParaStatus(value: unknown): "active" | "archived" {
  return value === "archived" ? "archived" : "active";
}

export function normalizeParaClassification(value: unknown): ParaClassification | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.target_id !== "string") return null;
  return {
    id: value.id,
    target_id: value.target_id,
    para_tags: apiStringList(value.para_tags),
    status: normalizeParaStatus(value.status),
    reason: typeof value.reason === "string" ? value.reason : undefined,
    context: typeof value.context === "string" ? value.context : undefined,
    archived_at: typeof value.archived_at === "string" ? value.archived_at : undefined,
    created_at: apiString(value.created_at),
    updated_at: apiString(value.updated_at),
  };
}

export function normalizeArchiveRow(value: unknown): ArchiveRow | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.target_id !== "string") return null;
  return {
    id: value.id,
    target_id: value.target_id,
    para_tags: apiStringList(value.para_tags),
    reason: typeof value.reason === "string" ? value.reason : undefined,
    context: typeof value.context === "string" ? value.context : undefined,
    archived_at: typeof value.archived_at === "string" ? value.archived_at : undefined,
    updated_at: apiString(value.updated_at),
  };
}

export function normalizeAutoArchiveCandidate(value: unknown): AutoArchiveCandidate | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.target_id !== "string") return null;
  return {
    id: value.id,
    target_id: value.target_id,
    para_tags: apiStringList(value.para_tags),
    created_at: apiString(value.created_at),
  };
}

export function normalizeParaItemsResponse(value: unknown): { items: ParaClassification[] } {
  if (!isRecord(value) || !Array.isArray(value.items)) return { items: [] };
  return {
    items: value.items.flatMap((item): ParaClassification[] => {
      const normalized = normalizeParaClassification(item);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizeParaArchivedResponse(value: unknown): { archive: ArchiveRow[] } {
  if (!isRecord(value) || !Array.isArray(value.archive)) return { archive: [] };
  return {
    archive: value.archive.flatMap((item): ArchiveRow[] => {
      const normalized = normalizeArchiveRow(item);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizeAutoArchiveCandidatesResponse(value: unknown): { candidates: AutoArchiveCandidate[] } {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return { candidates: [] };
  return {
    candidates: value.candidates.flatMap((candidate): AutoArchiveCandidate[] => {
      const normalized = normalizeAutoArchiveCandidate(candidate);
      return normalized ? [normalized] : [];
    }),
  };
}

export function normalizeParaClassifyResponse(value: unknown): { id: string; target_id: string } {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.target_id !== "string") {
    throw new Error("Server response did not include a PARA classification id.");
  }
  return { id: value.id, target_id: value.target_id };
}

export function normalizeParaArchiveResponse(value: unknown): { archived: boolean; target_id: string } {
  if (!isRecord(value) || typeof value.target_id !== "string") {
    throw new Error("Server response did not include an archived PARA target id.");
  }
  return { archived: apiBoolean(value.archived), target_id: value.target_id };
}

export function normalizeAutoArchiveApproveResponse(value: unknown): { archived: number } {
  return { archived: isRecord(value) ? apiNumber(value.archived) ?? 0 : 0 };
}

/** Fetch active classifications by tag prefix (e.g. "project:", "area:"). */
export const fetchParaItems = (prefix: string, limit = 50) =>
  apiFetch<unknown>(
    `/api/para/items?prefix=${encodeURIComponent(prefix)}&limit=${limit}`,
  ).then(normalizeParaItemsResponse);

/** Fetch archived classifications. */
export const fetchParaArchived = (limit = 50) =>
  apiFetch<unknown>(`/api/para/archived?limit=${limit}`).then(normalizeParaArchivedResponse);

/**
 * Classify (or re-classify) a message.
 * para_tags replaces the existing set — pass all desired tags, not just new ones.
 * To move from project to area: pass ["area:my-label"], drop "project:my-label".
 */
export const classifyParaItem = (targetId: string, paraTags: string[], context?: string) =>
  apiFetch<unknown>("/api/para/classify", {
    method: "POST",
    bodyJson: { target_id: targetId, para_tags: paraTags, context },
  }).then(normalizeParaClassifyResponse);

/** Archive a classified item (sets status = "archived"). */
export const archiveParaItem = (targetId: string, reason: string, context?: string) =>
  apiFetch<unknown>("/api/para/archive", {
    method: "POST",
    bodyJson: { target_id: targetId, reason, context },
  }).then(normalizeParaArchiveResponse);

/** Export a PARA section as a markdown blob. */
export const exportParaSection = async (prefix: string): Promise<Blob> => {
  const res = await fetch(
    `${API_BASE}/api/para/export?prefix=${encodeURIComponent(prefix)}&format=md`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
};

export const fetchAutoArchiveCandidates = () =>
  apiFetch<unknown>("/api/para/auto-archive-candidates").then(normalizeAutoArchiveCandidatesResponse);

export const approveAutoArchive = (targetIds: string[], reason?: string) =>
  apiFetch<unknown>("/api/para/auto-archive-approve", {
    method: "POST",
    bodyJson: { target_ids: targetIds, reason },
  }).then(normalizeAutoArchiveApproveResponse);

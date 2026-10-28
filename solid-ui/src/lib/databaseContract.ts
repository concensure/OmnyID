// @locs-version: 1.0
export const DATABASE_CONTRACT_VERSION = 1 as const;
export const LEGACY_DATABASE_ID = "database:legacy";
export const DEFAULT_DATABASE_TABLE = "default";

export type DatabaseSourceReference = {
  message_id: string;
  kind: string;
};

export type CanonicalDatabaseRecordContent = {
  kind: "database_record";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  record_id: string;
  revision: number;
  table: string;
  data: Record<string, unknown>;
  source_refs: DatabaseSourceReference[];
  idempotency_key: string;
};

export type CanonicalDatabaseRevisionContent = {
  kind: "database_record_update";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  target_record_id: string;
  base_revision: number;
  revision: number;
  table: string;
  patch: Record<string, unknown>;
  operation: "upsert" | "tombstone";
  source_refs: DatabaseSourceReference[];
  idempotency_key: string;
};

export type CanonicalDatabaseSchemaContent = {
  kind: "database_schema_update";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  table: string;
  column: { key: string; label: string };
  idempotency_key: string;
};

export type DatabaseDefinitionContent = {
  kind: "database_definition";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  name: string;
  default_table: string;
  profile_id?: string;
  scope: { account_id: string; wedding_plan_id?: string };
  revision: number;
  idempotency_key: string;
};

export type DatabaseProfileContent = {
  kind: "database_profile";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  profile_id: string;
  profile_version: number;
  label: string;
  required_fields: string[];
  optional_fields: string[];
};

export type DatabaseSavedViewContent = {
  kind: "database_saved_view";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  view_id: string;
  name: string;
  revision: number;
  columns: string[];
  sort: Array<{ field: string; direction: "ascending" | "descending" }>;
  filters: Array<{
    field: string;
    operator: "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty" | "before" | "after";
    value: unknown;
  }>;
  idempotency_key: string;
};

export type DatabaseArchiveContent = {
  kind: "database_archive";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  archived: boolean;
  revision: number;
  idempotency_key: string;
};

export type DatabaseProjectionReceiptContent = {
  kind: "database_projection_receipt";
  contract_version: typeof DATABASE_CONTRACT_VERSION;
  database_id: string;
  projector_id: string;
  projector_version: number;
  source_cursor: string;
  source_fingerprint: string;
  affected_record_ids: string[];
  idempotency_key: string;
};

export type DatabaseContractContent =
  | CanonicalDatabaseRecordContent
  | CanonicalDatabaseRevisionContent
  | CanonicalDatabaseSchemaContent
  | DatabaseDefinitionContent
  | DatabaseProfileContent
  | DatabaseSavedViewContent
  | DatabaseArchiveContent
  | DatabaseProjectionReceiptContent;

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || !/^[A-Za-z0-9_:./-]+$/.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function requireTable(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Invalid database table");
  }
  return normalized;
}

function requireRevision(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
  return value;
}

function randomContractId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

export function createDatabaseId(): string {
  return randomContractId("database");
}

export function buildCanonicalDatabaseDefinition(input: {
  databaseId?: string;
  accountId: string;
  name: string;
  defaultTable?: string;
  profileId?: string | null;
  weddingPlanId?: string | null;
  revision?: number;
  idempotencyKey?: string;
}): DatabaseDefinitionContent {
  const databaseId = requireIdentifier(input.databaseId ?? createDatabaseId(), "database ID");
  const accountId = requireIdentifier(input.accountId, "account ID");
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("Invalid database name");
  const profileId = input.profileId ? requireIdentifier(input.profileId, "profile ID") : undefined;
  const weddingPlanId = input.weddingPlanId
    ? requireIdentifier(input.weddingPlanId, "wedding plan ID")
    : undefined;
  const revision = requireRevision(input.revision ?? 1, "definition revision");
  return {
    kind: "database_definition",
    contract_version: DATABASE_CONTRACT_VERSION,
    database_id: databaseId,
    name,
    default_table: requireTable(input.defaultTable ?? DEFAULT_DATABASE_TABLE),
    ...(profileId ? { profile_id: profileId } : {}),
    scope: { account_id: accountId, ...(weddingPlanId ? { wedding_plan_id: weddingPlanId } : {}) },
    revision,
    idempotency_key: requireIdentifier(
      input.idempotencyKey ?? `database-definition:${databaseId}:revision:${revision}`,
      "idempotency key",
    ),
  };
}

export function buildCanonicalDatabaseArchive(input: {
  databaseId: string;
  archived: boolean;
  revision: number;
  idempotencyKey?: string;
}): DatabaseArchiveContent {
  const databaseId = requireIdentifier(input.databaseId, "database ID");
  const revision = requireRevision(input.revision, "archive revision");
  return {
    kind: "database_archive",
    contract_version: DATABASE_CONTRACT_VERSION,
    database_id: databaseId,
    archived: input.archived,
    revision,
    idempotency_key: requireIdentifier(
      input.idempotencyKey ?? `database-archive:${databaseId}:revision:${revision}`,
      "idempotency key",
    ),
  };
}

export function buildCanonicalDatabaseProjectionReceipt(input: {
  databaseId: string;
  projectorId: string;
  projectorVersion: number;
  sourceCursor: string;
  sourceFingerprint: string;
  affectedRecordIds: string[];
  idempotencyKey?: string;
}): DatabaseProjectionReceiptContent {
  const databaseId = requireIdentifier(input.databaseId, "database ID");
  const projectorId = requireIdentifier(input.projectorId, "projector ID");
  const projectorVersion = requireRevision(input.projectorVersion, "projector version");
  const sourceCursor = requireIdentifier(input.sourceCursor, "source cursor");
  const sourceFingerprint = requireIdentifier(input.sourceFingerprint, "source fingerprint");
  const affectedRecordIds = Array.from(new Set(input.affectedRecordIds.map((id) => requireIdentifier(id, "record ID"))));
  if (affectedRecordIds.length > 500) throw new Error("Too many affected database records");
  return {
    kind: "database_projection_receipt",
    contract_version: DATABASE_CONTRACT_VERSION,
    database_id: databaseId,
    projector_id: projectorId,
    projector_version: projectorVersion,
    source_cursor: sourceCursor,
    source_fingerprint: sourceFingerprint,
    affected_record_ids: affectedRecordIds,
    idempotency_key: requireIdentifier(
      input.idempotencyKey ?? `database-projection:${databaseId}:${projectorId}:${sourceCursor}:${sourceFingerprint}`,
      "idempotency key",
    ),
  };
}

export function buildCanonicalDatabaseRecord(input: {
  databaseId?: string;
  recordId?: string;
  table: string;
  data: Record<string, unknown>;
  sourceRefs?: DatabaseSourceReference[];
  idempotencyKey?: string;
}): CanonicalDatabaseRecordContent {
  const databaseId = requireIdentifier(input.databaseId ?? LEGACY_DATABASE_ID, "database ID");
  const recordId = requireIdentifier(input.recordId ?? randomContractId("record"), "record ID");
  return {
    kind: "database_record",
    contract_version: DATABASE_CONTRACT_VERSION,
    database_id: databaseId,
    record_id: recordId,
    revision: 1,
    table: requireTable(input.table),
    data: { ...input.data },
    source_refs: input.sourceRefs ?? [],
    idempotency_key: requireIdentifier(
      input.idempotencyKey ?? `database-record:${recordId}:create`,
      "idempotency key",
    ),
  };
}

export function buildCanonicalDatabaseRevision(input: {
  databaseId: string;
  targetRecordId: string;
  baseRevision: number;
  table: string;
  patch?: Record<string, unknown>;
  operation?: "upsert" | "tombstone";
  sourceRefs?: DatabaseSourceReference[];
  idempotencyKey?: string;
}): CanonicalDatabaseRevisionContent {
  const databaseId = requireIdentifier(input.databaseId, "database ID");
  const targetRecordId = requireIdentifier(input.targetRecordId, "record ID");
  const baseRevision = requireRevision(input.baseRevision, "base revision");
  const revision = baseRevision + 1;
  const operation = input.operation ?? "upsert";
  const patch = input.patch ?? {};
  if (operation === "upsert" && Object.keys(patch).length === 0) {
    throw new Error("A database revision must change at least one field");
  }
  return {
    kind: "database_record_update",
    contract_version: DATABASE_CONTRACT_VERSION,
    database_id: databaseId,
    target_record_id: targetRecordId,
    base_revision: baseRevision,
    revision,
    table: requireTable(input.table),
    patch: { ...patch },
    operation,
    source_refs: input.sourceRefs ?? [],
    idempotency_key: requireIdentifier(
      input.idempotencyKey
        ?? randomContractId("database-revision"),
      "idempotency key",
    ),
  };
}

export function buildCanonicalDatabaseSchema(input: {
  databaseId?: string;
  table: string;
  column: { key: string; label: string };
  idempotencyKey?: string;
}): CanonicalDatabaseSchemaContent {
  const databaseId = requireIdentifier(input.databaseId ?? LEGACY_DATABASE_ID, "database ID");
  const key = requireIdentifier(input.column.key, "column key");
  const label = input.column.label.trim();
  if (!label || label.length > 120) throw new Error("Invalid column label");
  return {
    kind: "database_schema_update",
    contract_version: DATABASE_CONTRACT_VERSION,
    database_id: databaseId,
    table: requireTable(input.table),
    column: { key, label },
    idempotency_key: requireIdentifier(
      input.idempotencyKey ?? randomContractId("database-schema"),
      "idempotency key",
    ),
  };
}

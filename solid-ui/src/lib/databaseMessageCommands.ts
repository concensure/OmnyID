// @locs-version: 1.0
import { sendAfpMessage } from "@/lib/api";
import {
  LEGACY_DATABASE_ID,
  buildCanonicalDatabaseArchive,
  buildCanonicalDatabaseDefinition,
  buildCanonicalDatabaseRecord,
  buildCanonicalDatabaseRevision,
  buildCanonicalDatabaseSchema,
  type CanonicalDatabaseRecordContent,
  type CanonicalDatabaseRevisionContent,
  type CanonicalDatabaseSchemaContent,
  type DatabaseArchiveContent,
  type DatabaseDefinitionContent,
} from "@/lib/databaseContract";

type SendResult<T> = {
  success: boolean;
  message_id: string;
  content: T;
};

const privateDatabaseMemoryScope = {
  memory_space: "personal",
  author_mask: "private",
  author_type: "human",
  human_only: true,
} as const;

export async function sendDatabaseDefinition(input: {
  accountId: string;
  name: string;
  defaultTable?: string;
  databaseId?: string;
  profileId?: string | null;
  weddingPlanId?: string | null;
  revision?: number;
}): Promise<SendResult<DatabaseDefinitionContent>> {
  const content = buildCanonicalDatabaseDefinition(input);
  const result = await sendAfpMessage({
    thread_id: `db_${content.database_id}_definition`,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "database_definition",
    content,
    metadata: {
      origin: "database_view",
      database_id: content.database_id,
      database_profile_id: content.profile_id ?? null,
      idempotency_key: content.idempotency_key,
    },
    memory_scope: privateDatabaseMemoryScope,
  });
  return { ...result, content };
}

export async function sendDatabaseArchive(input: {
  databaseId: string;
  archived: boolean;
  revision: number;
}): Promise<SendResult<DatabaseArchiveContent>> {
  const content = buildCanonicalDatabaseArchive(input);
  const result = await sendAfpMessage({
    thread_id: `db_${content.database_id}_definition`,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "database_archive",
    content,
    metadata: {
      origin: "database_view",
      database_id: content.database_id,
      idempotency_key: content.idempotency_key,
    },
    memory_scope: privateDatabaseMemoryScope,
  });
  return { ...result, content };
}

export async function sendDatabaseRecord(
  table: string,
  data: unknown,
  databaseId = LEGACY_DATABASE_ID,
  origin = "database_view",
): Promise<SendResult<CanonicalDatabaseRecordContent>> {
  const recordData = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : { value: data };
  const content = buildCanonicalDatabaseRecord({ databaseId, table, data: recordData });
  const result = await sendAfpMessage({
    thread_id: `db_${databaseId}_${content.record_id}`,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "database_record",
    content,
    metadata: {
      origin,
      database_id: databaseId,
      database_table: table,
      record_id: content.record_id,
      idempotency_key: content.idempotency_key,
    },
    memory_scope: privateDatabaseMemoryScope,
  });
  return { ...result, content };
}

export async function sendDatabaseRecordRevision(input: {
  table: string;
  targetRecordId: string;
  baseRevision: number;
  patch: Record<string, unknown>;
  databaseId?: string;
}): Promise<SendResult<CanonicalDatabaseRevisionContent>> {
  const databaseId = input.databaseId ?? LEGACY_DATABASE_ID;
  const content = buildCanonicalDatabaseRevision({
    databaseId,
    targetRecordId: input.targetRecordId,
    baseRevision: input.baseRevision,
    table: input.table,
    patch: input.patch,
  });
  const result = await sendAfpMessage({
    thread_id: `db_${databaseId}_${input.targetRecordId}`,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "note:ledger_update",
    content,
    metadata: {
      origin: "database_view",
      database_id: databaseId,
      database_table: input.table,
      target_record_id: input.targetRecordId,
      idempotency_key: content.idempotency_key,
    },
    memory_scope: privateDatabaseMemoryScope,
  });
  return { ...result, content };
}

export async function sendDatabaseSchema(
  table: string,
  column: { key: string; label: string },
  databaseId = LEGACY_DATABASE_ID,
): Promise<SendResult<CanonicalDatabaseSchemaContent>> {
  const content = buildCanonicalDatabaseSchema({ databaseId, table, column });
  const result = await sendAfpMessage({
    thread_id: `db_${databaseId}_${table}_schema`,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "database_schema_update",
    content,
    metadata: {
      origin: "database_view",
      database_id: databaseId,
      database_table: table,
      idempotency_key: content.idempotency_key,
    },
    memory_scope: privateDatabaseMemoryScope,
  });
  return { ...result, content };
}

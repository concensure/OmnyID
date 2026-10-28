// @locs-version: 1.0
import {
  DATABASE_CONTRACT_VERSION,
  DEFAULT_DATABASE_TABLE,
  LEGACY_DATABASE_ID,
  type DatabaseArchiveContent,
  type DatabaseDefinitionContent,
  type DatabaseProfileContent,
} from "@/lib/databaseContract";
import type { CompatibleDatabaseMessage } from "@/lib/databaseMessageCompatibility";

export type DatabaseDefinitionProjection = {
  databaseId: string;
  name: string;
  defaultTable: string;
  profileId: string | null;
  weddingPlanId: string | null;
  revision: number;
  archived: boolean;
  archiveRevision: number;
  legacy: boolean;
};

export type RegisteredDatabaseProfile = {
  profileId: string;
  label: string;
  description: string;
  defaultName: string;
  defaultTable: string;
  weddingPlanId: string | null;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function revision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function definitionFromMessage(
  message: CompatibleDatabaseMessage,
  accountId: string,
): DatabaseDefinitionContent | null {
  const content = objectValue(message.content);
  const scope = objectValue(content?.scope);
  const databaseId = clean(content?.database_id);
  const name = clean(content?.name);
  const defaultTable = clean(content?.default_table);
  const definitionRevision = revision(content?.revision);
  if (
    content?.kind !== "database_definition"
    || content.contract_version !== DATABASE_CONTRACT_VERSION
    || clean(scope?.account_id) !== accountId
    || !databaseId
    || !name
    || !defaultTable
    || !definitionRevision
    || !clean(content.idempotency_key)
  ) return null;
  return content as DatabaseDefinitionContent;
}

function archiveFromMessage(message: CompatibleDatabaseMessage): DatabaseArchiveContent | null {
  const content = objectValue(message.content);
  if (
    content?.kind !== "database_archive"
    || content.contract_version !== DATABASE_CONTRACT_VERSION
    || !clean(content.database_id)
    || typeof content.archived !== "boolean"
    || !revision(content.revision)
    || !clean(content.idempotency_key)
  ) return null;
  return content as DatabaseArchiveContent;
}

function compareMessages(left: CompatibleDatabaseMessage, right: CompatibleDatabaseMessage): number {
  return (left.timestamp ?? "").localeCompare(right.timestamp ?? "") || left.id.localeCompare(right.id);
}

export function discoverWeddingPlanId(messages: CompatibleDatabaseMessage[]): string | null {
  for (const message of messages.slice().sort(compareMessages).reverse()) {
    const content = objectValue(message.content);
    const metadata = objectValue(message.metadata);
    const scope = objectValue(content?.scope);
    const planId = clean(content?.wedding_plan_id)
      || clean(content?.weddingPlanId)
      || clean(scope?.wedding_plan_id)
      || clean(metadata?.wedding_plan_id)
      || clean(metadata?.weddingPlanId);
    if (planId) return planId;
  }
  return null;
}

export function registeredDatabaseProfiles(
  messages: CompatibleDatabaseMessage[],
): RegisteredDatabaseProfile[] {
  const profiles = new Map<string, RegisteredDatabaseProfile>();
  const weddingPlanId = discoverWeddingPlanId(messages);
  if (weddingPlanId) {
    profiles.set("wedding_runsheet.v1", {
      profileId: "wedding_runsheet.v1",
      label: "Wedding run sheet",
      description: "Prepare the database for a ledger-backed wedding run sheet. Automatic population arrives in the next implementation slice.",
      defaultName: "Wedding run sheet",
      defaultTable: "run_sheet",
      weddingPlanId,
    });
  }
  for (const message of messages.slice().sort(compareMessages)) {
    const content = objectValue(message.content);
    if (
      content?.kind !== "database_profile"
      || content.contract_version !== DATABASE_CONTRACT_VERSION
      || !clean(content.profile_id)
      || !clean(content.label)
      || !revision(content.profile_version)
    ) continue;
    const profile = content as DatabaseProfileContent;
    if (!profiles.has(profile.profile_id)) {
      profiles.set(profile.profile_id, {
        profileId: profile.profile_id,
        label: profile.label,
        description: `Create a ${profile.label} database using its registered fields.`,
        defaultName: profile.label,
        defaultTable: DEFAULT_DATABASE_TABLE,
        weddingPlanId: null,
      });
    }
  }
  return Array.from(profiles.values());
}

export function projectDatabaseDefinitions(input: {
  messages: CompatibleDatabaseMessage[];
  accountId: string;
  hasLegacyRecords: boolean;
}): DatabaseDefinitionProjection[] {
  const definitions = new Map<string, DatabaseDefinitionProjection>();
  const definitionKeys = new Set<string>();
  const archiveKeys = new Set<string>();
  const ordered = input.messages.slice().sort(compareMessages);

  for (const message of ordered) {
    const definition = definitionFromMessage(message, input.accountId);
    if (!definition || definitionKeys.has(definition.idempotency_key)) continue;
    definitionKeys.add(definition.idempotency_key);
    const current = definitions.get(definition.database_id);
    if ((!current && definition.revision !== 1) || (current && definition.revision !== current.revision + 1)) continue;
    definitions.set(definition.database_id, {
      databaseId: definition.database_id,
      name: definition.name,
      defaultTable: definition.default_table,
      profileId: definition.profile_id ?? null,
      weddingPlanId: definition.scope.wedding_plan_id ?? null,
      revision: definition.revision,
      archived: current?.archived ?? false,
      archiveRevision: current?.archiveRevision ?? 0,
      legacy: false,
    });
  }

  if (input.hasLegacyRecords || definitions.size === 0) {
    definitions.set(LEGACY_DATABASE_ID, {
      databaseId: LEGACY_DATABASE_ID,
      name: "Legacy database",
      defaultTable: DEFAULT_DATABASE_TABLE,
      profileId: null,
      weddingPlanId: null,
      revision: 1,
      archived: false,
      archiveRevision: 0,
      legacy: true,
    });
  }

  for (const message of ordered) {
    const archive = archiveFromMessage(message);
    if (!archive || archiveKeys.has(archive.idempotency_key)) continue;
    archiveKeys.add(archive.idempotency_key);
    const current = definitions.get(archive.database_id);
    if (!current || current.legacy || archive.revision !== current.archiveRevision + 1) continue;
    definitions.set(archive.database_id, {
      ...current,
      archived: archive.archived,
      archiveRevision: archive.revision,
    });
  }

  return Array.from(definitions.values()).sort((left, right) =>
    Number(left.archived) - Number(right.archived)
    || Number(left.legacy) - Number(right.legacy)
    || left.name.localeCompare(right.name),
  );
}

export function reconcileSelectedDatabaseId(
  definitions: DatabaseDefinitionProjection[],
  selectedDatabaseId: string | null,
): string | null {
  const current = definitions.find((definition) => definition.databaseId === selectedDatabaseId);
  if (current) return current.databaseId;
  return definitions.find((definition) => !definition.archived)?.databaseId
    ?? definitions[0]?.databaseId
    ?? null;
}

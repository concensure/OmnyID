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
  responseWorkspaceId: string | null;
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

const WEDDING_PROJECTION_PROFILES = [
  ["wedding_budget.v1", "Wedding budget", "A focused, read-only view of the canonical Wedding budget.", "Budget", "budget"],
  ["wedding_timeline.v1", "Wedding timeline", "A focused, read-only view of canonical tasks and dated events.", "Timeline", "timeline"],
  ["wedding_guest_list.v1", "Wedding guest list", "A focused, read-only view of guests, RSVP state, meals and access needs.", "Guest list", "guest_list"],
  ["wedding_seating.v1", "Wedding seating", "A focused, read-only view of the current seating plan.", "Seating", "seating"],
] as const;

export function weddingProjectionTableForProfile(profileId: string | null | undefined): string | null {
  return WEDDING_PROJECTION_PROFILES.find(([id]) => id === profileId)?.[4] ?? null;
}

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

export function discoverWeddingResponseWorkspaceId(
  messages: CompatibleDatabaseMessage[],
  weddingPlanId: string,
): string | null {
  for (const message of messages.slice().sort(compareMessages).reverse()) {
    const content = objectValue(message.content);
    const metadata = objectValue(message.metadata);
    const scope = objectValue(content?.scope);
    const planId = clean(content?.wedding_plan_id)
      || clean(content?.weddingPlanId)
      || clean(scope?.wedding_plan_id)
      || clean(metadata?.wedding_plan_id)
      || clean(metadata?.weddingPlanId);
    const workspaceId = clean(content?.response_workspace_id)
      || clean(content?.responseWorkspaceId)
      || clean(scope?.response_workspace_id)
      || clean(metadata?.response_workspace_id)
      || clean(metadata?.responseWorkspaceId);
    if (planId === weddingPlanId && workspaceId) return workspaceId;
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
      description: "A source-linked day-of sequence projected from the canonical Wedding plan, with reviewed manual overrides.",
      defaultName: "Run sheet",
      defaultTable: "run_sheet",
      weddingPlanId,
    });
    for (const [profileId, label, description, defaultName, defaultTable] of WEDDING_PROJECTION_PROFILES) {
      profiles.set(profileId, { profileId, label, description, defaultName, defaultTable, weddingPlanId });
    }
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
      responseWorkspaceId: definition.scope.wedding_plan_id
        ? discoverWeddingResponseWorkspaceId(input.messages, definition.scope.wedding_plan_id)
        : null,
      revision: definition.revision,
      archived: current?.archived ?? false,
      archiveRevision: current?.archiveRevision ?? 0,
      legacy: false,
    });
  }

  const weddingPlanId = discoverWeddingPlanId(input.messages);
  if (weddingPlanId) {
    const databaseId = `database:wedding-plan:${weddingPlanId}`;
    definitions.set(databaseId, {
      databaseId,
      name: "Wedding plan",
      defaultTable: "budget",
      profileId: "wedding_plan_projection.v1",
      weddingPlanId,
      responseWorkspaceId: discoverWeddingResponseWorkspaceId(input.messages, weddingPlanId),
      revision: 1,
      archived: false,
      archiveRevision: 0,
      legacy: false,
    });
    const hasRunSheet = Array.from(definitions.values()).some((definition) => (
      definition.profileId === "wedding_runsheet.v1" && definition.weddingPlanId === weddingPlanId
    ));
    if (!hasRunSheet) {
      const runSheetDatabaseId = `database:wedding-run-sheet:${weddingPlanId}`;
      definitions.set(runSheetDatabaseId, {
        databaseId: runSheetDatabaseId,
        name: "Run sheet",
        defaultTable: "run_sheet",
        profileId: "wedding_runsheet.v1",
        weddingPlanId,
        responseWorkspaceId: discoverWeddingResponseWorkspaceId(input.messages, weddingPlanId),
        revision: 1,
        archived: false,
        archiveRevision: 0,
        legacy: false,
      });
    }
  }

  if (input.hasLegacyRecords || definitions.size === 0) {
    definitions.set(LEGACY_DATABASE_ID, {
      databaseId: LEGACY_DATABASE_ID,
      name: "Legacy database",
      defaultTable: DEFAULT_DATABASE_TABLE,
      profileId: null,
      weddingPlanId: null,
      responseWorkspaceId: null,
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
  const weddingProjection = definitions.find((definition) => definition.profileId === "wedding_plan_projection.v1" && !definition.archived);
  if (weddingProjection) return weddingProjection.databaseId;
  return definitions.find((definition) => !definition.archived)?.databaseId
    ?? definitions[0]?.databaseId
    ?? null;
}

export function existingDatabaseDefinitionForProfile(
  definitions: DatabaseDefinitionProjection[],
  profileId: string | null | undefined,
  weddingPlanId: string | null | undefined,
): DatabaseDefinitionProjection | null {
  if (!profileId) return null;
  return definitions.find((definition) => (
    definition.profileId === profileId
    && definition.weddingPlanId === (weddingPlanId ?? null)
  )) ?? null;
}

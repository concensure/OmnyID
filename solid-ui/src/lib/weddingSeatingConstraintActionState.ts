// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import {
  buildWeddingSeatingOptimizationResult,
  type WeddingSeatingOptimizationResult,
  type WeddingSeatingPersonNode,
  type WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingSeatingConstraintKind =
  | "keep_apart"
  | "prefer_together"
  | "prefer_quiet"
  | "social_group_together";

export type WeddingSeatingConstraintAction = {
  id: string;
  kind: WeddingSeatingConstraintKind;
  instruction: string;
  primaryPersonId?: string | null;
  relatedPersonId?: string | null;
  socialGroup?: string | null;
  confidence: "high" | "medium" | "low";
  statusLabel: string;
};

export type WeddingSeatingConstraintRunResult = {
  action: WeddingSeatingConstraintAction | null;
  people: WeddingSeatingPersonNode[];
  optimization: WeddingSeatingOptimizationResult;
  statusLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function normalized(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function personByLabel(people: readonly WeddingSeatingPersonNode[], label: string): WeddingSeatingPersonNode | null {
  const target = normalized(label);
  if (!target) return null;
  return people
    .slice()
    .sort((left, right) => right.label.length - left.label.length)
    .find((person) => {
      const personLabel = normalized(person.label);
      return personLabel === target || personLabel.includes(target) || target.includes(personLabel);
    }) ?? null;
}

function socialGroupByInstruction(people: readonly WeddingSeatingPersonNode[], instruction: string): string | null {
  const text = normalized(instruction);
  const groups = uniqueStrings(people.flatMap((person) => person.socialGroups ?? []));
  return groups
    .slice()
    .sort((left, right) => right.length - left.length)
    .find((group) => text.includes(normalized(group))) ?? null;
}

function actionId(input: {
  kind: WeddingSeatingConstraintKind;
  instruction: string;
  primaryPersonId?: string | null;
  relatedPersonId?: string | null;
  socialGroup?: string | null;
}): string {
  return `wedding_seating_constraint:${safeWeddingLabel([
    input.kind,
    input.primaryPersonId,
    input.relatedPersonId,
    input.socialGroup,
    input.instruction,
  ].filter(Boolean).join(":")).slice(0, 120)}`;
}

export function buildWeddingSeatingConstraintActionFromInstruction(input: {
  instruction: string;
  people?: readonly WeddingSeatingPersonNode[] | null;
}): WeddingSeatingConstraintAction | null {
  const instruction = clean(input.instruction);
  const people = input.people ?? [];
  if (!instruction || people.length === 0) return null;
  const awayMatch = instruction.match(/(?:move|keep|seat|put)?\s*(.+?)\s+(?:away from|apart from|not with|separate from|do not seat with|don't seat with)\s+([^.;]+)/i);
  if (awayMatch) {
    const primary = personByLabel(people, awayMatch[1] ?? "");
    const related = personByLabel(people, awayMatch[2] ?? "");
    if (primary && related) {
      const action = {
        kind: "keep_apart" as const,
        instruction,
        primaryPersonId: primary.id,
        relatedPersonId: related.id,
        confidence: "high" as const,
        statusLabel: `${primary.label} and ${related.label} will be kept apart in the next seating draft.`,
      };
      return { ...action, id: actionId(action) };
    }
  }

  const togetherMatch = instruction.match(/(?:keep|seat|put|place)\s+(.+?)\s+(?:with|together with|near)\s+([^.;]+)/i);
  if (togetherMatch) {
    const primary = personByLabel(people, togetherMatch[1] ?? "");
    const related = personByLabel(people, togetherMatch[2] ?? "");
    if (primary && related) {
      const action = {
        kind: "prefer_together" as const,
        instruction,
        primaryPersonId: primary.id,
        relatedPersonId: related.id,
        confidence: "high" as const,
        statusLabel: `${primary.label} and ${related.label} will be kept together where possible.`,
      };
      return { ...action, id: actionId(action) };
    }
  }

  if (/\bkeep\b.+\b(friends|group|family|colleagues|work|university|uni)\b.+\btogether\b/i.test(instruction)) {
    const socialGroup = socialGroupByInstruction(people, instruction);
    if (socialGroup) {
      const action = {
        kind: "social_group_together" as const,
        instruction,
        socialGroup,
        confidence: "medium" as const,
        statusLabel: `${socialGroup} guests will be kept together where table sizes allow.`,
      };
      return { ...action, id: actionId(action) };
    }
  }

  const quietMatch = instruction.match(/(?:move|seat|put|place)?\s*(.+?)\s+(?:somewhere quiet|away from speakers|near a quiet table|in a quiet spot)/i);
  if (quietMatch) {
    const primary = personByLabel(people, quietMatch[1] ?? "");
    if (primary) {
      const action = {
        kind: "prefer_quiet" as const,
        instruction,
        primaryPersonId: primary.id,
        confidence: "medium" as const,
        statusLabel: `${primary.label} will be placed away from loud tables where possible.`,
      };
      return { ...action, id: actionId(action) };
    }
  }

  return null;
}

function withUnique(values: readonly string[] | null | undefined, next: string): string[] {
  return uniqueStrings([...(values ?? []), next]);
}

export function applyWeddingSeatingConstraintAction(
  people: readonly WeddingSeatingPersonNode[],
  action: WeddingSeatingConstraintAction | null,
): WeddingSeatingPersonNode[] {
  if (!action) return people.slice();
  return people.map((person) => {
    if (action.kind === "keep_apart") {
      if (person.id === action.primaryPersonId && action.relatedPersonId) {
        return { ...person, conflictPersonIds: withUnique(person.conflictPersonIds, action.relatedPersonId) };
      }
      if (person.id === action.relatedPersonId && action.primaryPersonId) {
        return { ...person, conflictPersonIds: withUnique(person.conflictPersonIds, action.primaryPersonId) };
      }
    }
    if (action.kind === "prefer_together") {
      if (person.id === action.primaryPersonId && action.relatedPersonId) {
        return { ...person, preferTogetherWithIds: withUnique(person.preferTogetherWithIds, action.relatedPersonId) };
      }
      if (person.id === action.relatedPersonId && action.primaryPersonId) {
        return { ...person, preferTogetherWithIds: withUnique(person.preferTogetherWithIds, action.primaryPersonId) };
      }
    }
    if (action.kind === "prefer_quiet" && person.id === action.primaryPersonId) {
      return { ...person, preferences: withUnique(person.preferences, "quiet") };
    }
    if (action.kind === "social_group_together" && action.socialGroup && (person.socialGroups ?? []).includes(action.socialGroup)) {
      const peers = people
        .filter((other) => other.id !== person.id && (other.socialGroups ?? []).includes(action.socialGroup ?? ""))
        .map((other) => other.id);
      return { ...person, preferTogetherWithIds: uniqueStrings([...(person.preferTogetherWithIds ?? []), ...peers]) };
    }
    return person;
  });
}

export function runWeddingSeatingConstraintInstruction(input: {
  instruction: string;
  people?: readonly WeddingSeatingPersonNode[] | null;
  tables?: readonly WeddingSeatingTableNode[] | null;
}): WeddingSeatingConstraintRunResult {
  const action = buildWeddingSeatingConstraintActionFromInstruction({
    instruction: input.instruction,
    people: input.people,
  });
  const people = applyWeddingSeatingConstraintAction(input.people ?? [], action);
  const optimization = buildWeddingSeatingOptimizationResult({ people, tables: input.tables });
  return {
    action,
    people,
    optimization,
    statusLabel: action?.statusLabel ?? "I could not match that seating instruction to saved guests yet.",
  };
}

function afpRef(type: string, target: unknown, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, ...(metadata ? { metadata } : {}) };
}

export function weddingSeatingConstraintActionToAfpMessage(input: {
  action: WeddingSeatingConstraintAction;
  metadata?: unknown;
  createdAt?: string;
}): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const references = [
    afpRef("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    afpRef("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
    afpRef("seating_constraint_primary_person", input.action.primaryPersonId, "Primary guest"),
    afpRef("seating_constraint_related_person", input.action.relatedPersonId, "Related guest"),
    afpRef("seating_constraint_social_group", input.action.socialGroup, "Social group"),
  ].filter((item): item is AfpReference => item !== null);
  return {
    id: `afp-${safeWeddingLabel(input.action.id)}`,
    thread_id: `wedding_seating:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://topology", "agent://decision-queue"],
    timestamp,
    type: "ledger",
    kind: "wedding_seating_constraint",
    subtype: "wedding_seating_constraint",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_seating",
      "wedding_seating:constraint",
      `wedding_seating_constraint:${input.action.kind}`,
      "topology:wedding_guest_graph",
      "decisionos:wedding_seating",
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    ]),
    content: {
      ledger_kind: "wedding_seating_constraint",
      constraint_id: input.action.id,
      constraint_kind: input.action.kind,
      instruction: input.action.instruction,
      confidence: input.action.confidence,
      status_label: input.action.statusLabel,
      markdown: ["# Seating instruction", "", input.action.statusLabel].join("\n"),
    },
    metadata: {
      ...metadata,
      seating_constraint: true,
      seating_constraint_kind: input.action.kind,
      e2ee_required: true,
      searchable_terms: uniqueStrings([
        input.action.instruction,
        input.action.kind,
        "wedding seating",
        "seating constraint",
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_seating_constraint",
        title: "Seating instruction saved",
        summary: input.action.statusLabel,
        primary_action: "Review seating draft",
      },
    }],
    attachments: [],
    references,
  };
}

export function weddingSeatingConstraintActionToAfpSendInput(input: {
  action: WeddingSeatingConstraintAction;
  metadata?: unknown;
  createdAt?: string;
}): SendAfpMessageInput {
  const message = weddingSeatingConstraintActionToAfpMessage(input);
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}
